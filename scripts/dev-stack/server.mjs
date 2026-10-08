#!/usr/bin/env node
// Gadget Galli local dev stack: a small stand-in for the parts of Supabase the apps use,
// running on a local PostgreSQL with the real migrations and demo seed. No Docker needed.
//
//   pnpm dev-stack                       # API on http://localhost:54321
//   pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist
//
// Implements: phone OTP (test code 123456) and email/password auth, PostgREST-style
// /rest/v1 (rpc + simple table CRUD with filters), /storage/v1 (upload, public and signed
// URLs), and a no-op realtime socket. Local development and testing ONLY; never deploy it.
import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { WebSocketServer } from 'ws';

import { ANON_KEY, SERVICE_KEY, sign, verify } from './jwt.mjs';
import { DATA_DIR, startPostgres, stopPostgres } from './postgres.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const API_PORT = Number(process.env.GG_DEV_API_PORT ?? 54321);
const TEST_OTP = process.env.GG_DEV_OTP ?? '123456';
const STORAGE_DIR = join(DATA_DIR, 'storage');
const SESSION_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const conn = startPostgres();
const pool = new pg.Pool({ ...conn, max: 12 });

/** Runs fn inside a transaction as the caller's Postgres role with their JWT claims (like PostgREST). */
async function asCaller(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const role = ['anon', 'authenticated', 'service_role'].includes(claims?.role) ? claims.role : 'anon';
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)", [JSON.stringify(claims ?? { role: 'anon' }), role]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, x-upsert, range, cache-control, x-supabase-api-version',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
  'access-control-max-age': '86400',
};

function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  if (body === undefined || status === 204) {
    res.writeHead(status, { ...CORS, ...headers });
    res.end();
    return;
  }
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return {};
  }
}

function claimsFrom(req) {
  const auth = req.headers.authorization ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : req.headers.apikey;
  return verify(token) ?? verify(req.headers.apikey) ?? { role: 'anon' };
}

/** PostgREST-like error body + status from a Postgres error. */
function pgError(res, e, claims) {
  const code = e.code ?? 'PGRST000';
  let status = 400;
  if (code === '42501') status = claims?.role === 'anon' ? 401 : 403;
  else if (code === '42883' || code === '42P01') status = 404;
  else if (code === '23505' || code === '23503') status = 409;
  else if (code === 'P0002') status = 404;
  else if (!/^[0-9A-Z]{5}$/.test(code)) status = 500;
  send(res, status, { code, details: e.detail ?? null, hint: e.hint ?? null, message: e.message });
}

// ---------------------------------------------------------------------------
// Auth (/auth/v1)
// ---------------------------------------------------------------------------
const refreshTokens = new Map(); // refresh token -> user id

async function authUser(id) {
  const { rows } = await pool.query(
    'select id, email, phone, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, phone_confirmed_at, created_at, updated_at, last_sign_in_at from auth.users where id = $1',
    [id],
  );
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email ?? '',
    phone: u.phone ?? '',
    email_confirmed_at: u.email_confirmed_at,
    phone_confirmed_at: u.phone_confirmed_at,
    confirmed_at: u.email_confirmed_at ?? u.phone_confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    app_metadata: u.raw_app_meta_data ?? {},
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [],
    created_at: u.created_at,
    updated_at: u.updated_at,
    is_anonymous: false,
  };
}

async function issueSession(userId) {
  await pool.query('update auth.users set last_sign_in_at = now() where id = $1', [userId]);
  const user = await authUser(userId);
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({
    aud: 'authenticated',
    exp: now + SESSION_SECONDS,
    iat: now,
    iss: `http://localhost:${API_PORT}/auth/v1`,
    sub: userId,
    email: user.email,
    phone: user.phone,
    role: 'authenticated',
    session_id: randomUUID(),
    is_anonymous: false,
  });
  const refresh_token = randomBytes(24).toString('hex');
  refreshTokens.set(refresh_token, userId);
  return { access_token, token_type: 'bearer', expires_in: SESSION_SECONDS, expires_at: now + SESSION_SECONDS, refresh_token, user };
}

const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, error: code, error_description: msg });

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  if (path === '/token' && req.method === 'POST') {
    const body = await readJson(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const { rows } = await pool.query(
        "select id from auth.users where lower(email) = lower($1) and encrypted_password <> '' and encrypted_password = extensions.crypt($2, encrypted_password)",
        [body.email ?? '', body.password ?? ''],
      );
      if (!rows[0]) return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, await issueSession(rows[0].id));
    }
    if (grant === 'refresh_token') {
      const userId = refreshTokens.get(body.refresh_token);
      if (!userId) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(body.refresh_token);
      return send(res, 200, await issueSession(userId));
    }
    return authError(res, 400, 'unsupported_grant_type', 'Unsupported grant type');
  }
  if (path === '/otp' && req.method === 'POST') {
    const body = await readJson(req);
    if (!body.phone) return authError(res, 400, 'validation_failed', 'Phone is required');
    // No SMS locally: every number accepts the test code.
    return send(res, 200, { message_id: `local-${Date.now()}` });
  }
  if (path === '/verify' && req.method === 'POST') {
    const body = await readJson(req);
    const phone = String(body.phone ?? '').replace(/\D/g, '');
    if (!phone) return authError(res, 400, 'validation_failed', 'Phone is required');
    if (String(body.token) !== TEST_OTP) return authError(res, 403, 'otp_expired', 'Token has expired or is invalid');
    let { rows } = await pool.query('select id from auth.users where phone = $1', [phone]);
    if (!rows[0]) {
      const id = randomUUID();
      await pool.query(
        `insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now())`,
        [id, phone],
      );
      rows = [{ id }];
    }
    return send(res, 200, await issueSession(rows[0].id));
  }
  if (path === '/user') {
    const claims = claimsFrom(req);
    if (!claims.sub) return authError(res, 401, 'no_authorization', 'This endpoint requires a valid Bearer token');
    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (body.data) await pool.query("update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || $2::jsonb, updated_at = now() where id = $1", [claims.sub, JSON.stringify(body.data)]);
    }
    const user = await authUser(claims.sub);
    return user ? send(res, 200, user) : authError(res, 404, 'user_not_found', 'User not found');
  }
  if (path === '/logout') return send(res, 204);
  if (path === '/settings') return send(res, 200, { external: { email: true, phone: true }, disable_signup: false, mailer_autoconfirm: true, phone_autoconfirm: false, sms_provider: 'local' });
  if (path === '/health') return send(res, 200, { name: 'GoTrue (local stand-in)' });
  return authError(res, 404, 'not_found', `Unsupported auth endpoint ${req.method} ${path}`);
}

// ---------------------------------------------------------------------------
// REST: functions (/rest/v1/rpc/:fn)
// ---------------------------------------------------------------------------
const fnCache = new Map();

async function functionSignatures(name) {
  if (fnCache.has(name)) return fnCache.get(name);
  const { rows } = await pool.query(
    `select coalesce(p.proargnames, '{}') as names,
            array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) as types,
            p.pronargs as nargs, p.pronargdefaults as ndefaults, format_type(p.prorettype, null) as rettype, p.proretset as retset
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  fnCache.set(name, rows);
  return rows;
}

function toParam(type, value) {
  if (value === null || value === undefined) return null;
  if (type === 'jsonb' || type === 'json') return JSON.stringify(value);
  if (type.endsWith('[]')) return Array.isArray(value) ? value : [value];
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function handleRpc(req, res, name) {
  const claims = claimsFrom(req);
  const args = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://x').searchParams) : await readJson(req);
  const sigs = await functionSignatures(name);
  const keys = Object.keys(args);
  const sig = sigs.find((s) => keys.every((k) => s.names.slice(0, s.nargs).includes(k)) && s.names.slice(0, s.nargs - s.ndefaults).every((n) => keys.includes(n)));
  if (!sig) {
    return send(res, 404, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${name}(${keys.join(', ')}) in the schema cache` });
  }
  const params = [];
  const named = keys.map((k) => {
    const type = sig.types[sig.names.indexOf(k)];
    params.push(toParam(type, args[k]));
    return `"${k}" => $${params.length}::${type}`;
  });
  const call = `public."${name}"(${named.join(', ')})`;
  try {
    const out = await asCaller(claims, async (c) => {
      if (sig.rettype === 'void') return void (await c.query(`select ${call}`, params));
      if (sig.retset) return (await c.query(`select coalesce(jsonb_agg(to_jsonb(r)), '[]') as r from ${call} r`, params)).rows[0].r;
      const { rows } = await c.query(`select to_jsonb(${call}) as r`, params);
      return rows[0].r;
    });
    if (sig.rettype === 'void') return send(res, 204);
    return send(res, 200, out === null ? 'null' : out);
  } catch (e) {
    return pgError(res, e, claims);
  }
}

// ---------------------------------------------------------------------------
// REST: tables (/rest/v1/:table) with a small subset of PostgREST query syntax
// ---------------------------------------------------------------------------
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`Invalid identifier ${s}`), { code: 'PGRST100' });
  return `"${s}"`;
};

function buildWhere(params, values) {
  const parts = [];
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    const col = `t.${ident(key)}`;
    const neg = raw.startsWith('not.');
    const expr = neg ? raw.slice(4) : raw;
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot);
    const val = expr.slice(dot + 1);
    let sql;
    const add = (v) => (values.push(v), `$${values.length}`);
    switch (op) {
      case 'eq': sql = `${col} = ${add(val)}`; break;
      case 'neq': sql = `${col} <> ${add(val)}`; break;
      case 'gt': sql = `${col} > ${add(val)}`; break;
      case 'gte': sql = `${col} >= ${add(val)}`; break;
      case 'lt': sql = `${col} < ${add(val)}`; break;
      case 'lte': sql = `${col} <= ${add(val)}`; break;
      case 'like': sql = `${col}::text like ${add(val.replace(/\*/g, '%'))}`; break;
      case 'ilike': sql = `${col}::text ilike ${add(val.replace(/\*/g, '%'))}`; break;
      case 'is': sql = `${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : val === 'false' ? 'false' : 'unknown'}`; break;
      case 'in': {
        const items = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        sql = `${col}::text = any(${add(items)}::text[])`;
        break;
      }
      default:
        throw Object.assign(new Error(`Unsupported filter ${op}`), { code: 'PGRST100' });
    }
    parts.push(neg ? `not (${sql})` : sql);
  }
  return parts.length ? `where ${parts.join(' and ')}` : '';
}

function buildOrder(order) {
  if (!order) return '';
  return `order by ${order
    .split(',')
    .map((o) => {
      const [col, ...mods] = o.split('.');
      return `t.${ident(col)}${mods.includes('desc') ? ' desc' : ' asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}`;
    })
    .join(', ')}`;
}

function projection(select) {
  if (!select || select === '*') return 'to_jsonb(t)';
  const cols = select.split(',').map((c) => c.trim()).filter(Boolean);
  return `jsonb_build_object(${cols.map((c) => `'${c}', t.${ident(c)}`).join(', ')})`;
}

const pkCache = new Map();
async function primaryKey(table) {
  if (pkCache.has(table)) return pkCache.get(table);
  const { rows } = await pool.query(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary`,
    [table],
  );
  const pk = rows.map((r) => r.attname);
  pkCache.set(table, pk);
  return pk;
}

function wantsObject(req) {
  return (req.headers.accept ?? '').includes('application/vnd.pgrst.object');
}

function respondRows(req, res, status, rows, prefer) {
  if (prefer.includes('return=minimal') && status !== 200) return send(res, status === 201 ? 201 : 204);
  if (wantsObject(req)) {
    if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
    return send(res, status, rows[0]);
  }
  return send(res, status, rows, { 'content-range': rows.length ? `0-${rows.length - 1}/*` : '*/0' });
}

async function handleTable(req, res, table, url) {
  const claims = claimsFrom(req);
  const prefer = req.headers.prefer ?? '';
  const params = [...url.searchParams.entries()];
  const t = `public.${ident(table)}`;
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const values = [];
      const where = buildWhere(params, values);
      const limit = url.searchParams.get('limit');
      const offset = url.searchParams.get('offset');
      const sql = `select ${projection(url.searchParams.get('select'))} as r from ${t} t ${where} ${buildOrder(url.searchParams.get('order'))}
                   ${limit ? `limit ${Number(limit) | 0}` : ''} ${offset ? `offset ${Number(offset) | 0}` : ''}`;
      const rows = await asCaller(claims, async (c) => (await c.query(sql, values)).rows.map((r) => r.r));
      return respondRows(req, res, 200, rows, '');
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const list = Array.isArray(body) ? body : [body];
      if (!list.length) return send(res, 201, []);
      const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
      const colSql = cols.map(ident).join(', ');
      const conflictCols = url.searchParams.get('on_conflict')?.split(',') ?? (await primaryKey(table));
      let onConflict = '';
      if (prefer.includes('resolution=merge-duplicates')) {
        const updates = cols.filter((c) => !conflictCols.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
        onConflict = `on conflict (${conflictCols.map(ident).join(', ')}) do ${updates.length ? `update set ${updates.join(', ')}` : 'nothing'}`;
      } else if (prefer.includes('resolution=ignore-duplicates')) {
        onConflict = `on conflict (${conflictCols.map(ident).join(', ')}) do nothing`;
      }
      const sql = `insert into ${t} as t (${colSql}) select ${colSql} from jsonb_populate_recordset(null::${t}, $1::jsonb) ${onConflict} returning to_jsonb(t) as r`;
      const rows = await asCaller(claims, async (c) => (await c.query(sql, [JSON.stringify(list)])).rows.map((r) => r.r));
      return respondRows(req, res, 201, rows, prefer.includes('return=representation') ? '' : 'return=minimal');
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const cols = Object.keys(body);
      const values = [JSON.stringify(body)];
      const where = buildWhere(params, values);
      const sql = `update ${t} as t set (${cols.map(ident).join(', ')}) = (select ${cols.map(ident).join(', ')} from jsonb_populate_record(null::${t}, $1::jsonb)) ${where} returning to_jsonb(t) as r`;
      const rows = await asCaller(claims, async (c) => (await c.query(sql, values)).rows.map((r) => r.r));
      return respondRows(req, res, 200, rows, prefer.includes('return=representation') ? '' : 'return=minimal');
    }
    if (req.method === 'DELETE') {
      const values = [];
      const where = buildWhere(params, values);
      const sql = `delete from ${t} as t ${where} returning to_jsonb(t) as r`;
      const rows = await asCaller(claims, async (c) => (await c.query(sql, values)).rows.map((r) => r.r));
      return respondRows(req, res, 200, rows, prefer.includes('return=representation') ? '' : 'return=minimal');
    }
    return send(res, 405, { message: 'Method not allowed' });
  } catch (e) {
    return pgError(res, e, claims);
  }
}

// ---------------------------------------------------------------------------
// Storage (/storage/v1)
// ---------------------------------------------------------------------------
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

function filePath(bucket, name) {
  const p = normalize(join(STORAGE_DIR, bucket, name));
  if (!p.startsWith(STORAGE_DIR)) throw new Error('Invalid path');
  return p;
}

/** Extracts the file from a multipart body (storage-js sends Blob/File uploads as form data). */
function fromMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return { data: buf, type: null };
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let start = buf.indexOf(boundary);
  while (start !== -1) {
    const next = buf.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(start + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, headerEnd).toString('utf8');
    if (/filename=|name=""/.test(head) || /content-type:\s*(image|application\/pdf|application\/octet)/i.test(head)) {
      const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? null;
      return { data: part.subarray(headerEnd + 4), type };
    }
    start = next;
  }
  return { data: buf, type: null };
}

async function serveFile(res, bucket, name) {
  let p;
  try {
    p = filePath(bucket, name);
  } catch {
    return send(res, 400, { statusCode: '400', error: 'invalid', message: 'Invalid path' });
  }
  if (!existsSync(p) || !statSync(p).isFile()) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
  const { rows } = await pool.query("select metadata->>'mimetype' as type from storage.objects where bucket_id = $1 and name = $2 order by created_at desc limit 1", [bucket, name]);
  res.writeHead(200, { 'content-type': rows[0]?.type ?? MIME[extname(p).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'public, max-age=3600', ...CORS });
  createReadStream(p).pipe(res);
}

async function handleStorage(req, res, url) {
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ''));
  const claims = claimsFrom(req);
  let m;
  if ((m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(path)) && (req.method === 'GET' || req.method === 'HEAD')) {
    const { rows } = await pool.query('select public from storage.buckets where id = $1', [m[1]]);
    if (!rows[0]?.public) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Bucket not found or not public' });
    return serveFile(res, m[1], m[2]);
  }
  if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path))) {
    const [, bucket, name] = m;
    if (req.method === 'GET') {
      const tok = verify(url.searchParams.get('token'));
      if (!tok || tok.url !== `${bucket}/${name}`) return send(res, 400, { statusCode: '400', error: 'invalid_jwt', message: 'Invalid or expired signature' });
      return serveFile(res, bucket, name);
    }
    const body = await readJson(req);
    try {
      const visible = await asCaller(claims, async (c) => (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2 limit 1', [bucket, name])).rowCount > 0);
      if (!visible) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    } catch (e) {
      return pgError(res, e, claims);
    }
    const token = sign({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + Number(body.expiresIn ?? 3600) });
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
  }
  if ((m = /^\/object\/([^/]+)\/(.+)$/.exec(path)) && (req.method === 'POST' || req.method === 'PUT')) {
    const [, bucket, name] = m;
    const raw = await readBody(req);
    const ct = req.headers['content-type'] ?? '';
    const { data, type } = ct.startsWith('multipart/form-data') ? fromMultipart(raw, ct) : { data: raw, type: ct || null };
    const mimetype = type ?? MIME[extname(name).toLowerCase()] ?? 'application/octet-stream';
    try {
      const id = await asCaller(claims, async (c) => {
        const { rows: b } = await c.query('select file_size_limit, allowed_mime_types from storage.buckets where id = $1', [bucket]);
        if (!b[0]) throw Object.assign(new Error('Bucket not found'), { code: 'P0002' });
        if (b[0].file_size_limit && data.length > Number(b[0].file_size_limit)) throw Object.assign(new Error('The object exceeded the maximum allowed size'), { code: '22023' });
        if (b[0].allowed_mime_types?.length && !b[0].allowed_mime_types.includes(mimetype)) throw Object.assign(new Error(`mime type ${mimetype} is not supported`), { code: '22023' });
        if (req.method === 'PUT' || req.headers['x-upsert'] === 'true') await c.query('delete from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
        const { rows } = await c.query('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4) returning id', [bucket, name, claims.sub ?? null, { mimetype, size: data.length }]);
        return rows[0].id;
      });
      const p = filePath(bucket, name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, data);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: id });
    } catch (e) {
      if (e.code === '42501') return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      return send(res, 400, { statusCode: '400', error: 'invalid', message: e.message });
    }
  }
  if ((m = /^\/object\/([^/]+)\/(.+)$/.exec(path)) && req.method === 'GET') {
    const [, bucket, name] = m;
    const visible = await asCaller(claims, async (c) => (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount > 0).catch(() => false);
    if (!visible) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return serveFile(res, bucket, name);
  }
  if ((m = /^\/object\/([^/]+)$/.exec(path)) && req.method === 'DELETE') {
    const bucket = m[1];
    const body = await readJson(req);
    try {
      const removed = await asCaller(claims, async (c) => (await c.query('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [bucket, body.prefixes ?? []])).rows);
      for (const r of removed) rmSync(filePath(bucket, r.name), { force: true });
      return send(res, 200, removed.map((r) => ({ name: r.name, bucket_id: bucket })));
    } catch (e) {
      return send(res, 400, { statusCode: '400', error: 'invalid', message: e.message });
    }
  }
  return send(res, 404, { statusCode: '404', error: 'not_found', message: `Unsupported storage endpoint ${req.method} ${path}` });
}

// ---------------------------------------------------------------------------
// Static hosting for built apps (optional)
// ---------------------------------------------------------------------------
function staticServer(dir, port, label) {
  const root = resolve(ROOT, dir);
  if (!existsSync(join(root, 'index.html'))) {
    console.warn(`! ${label}: ${root}/index.html not found (build it first)`);
    return;
  }
  http
    .createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const candidates = [urlPath, `${urlPath}.html`, join(urlPath, 'index.html')];
      for (const c of candidates) {
        const p = normalize(join(root, c));
        if (p.startsWith(root) && existsSync(p) && statSync(p).isFile()) {
          res.writeHead(200, { 'content-type': MIME[extname(p)] ?? { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.wav': 'audio/wav' }[extname(p)] ?? 'application/octet-stream' });
          return createReadStream(p).pipe(res);
        }
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(root, 'index.html')));
    })
    .listen(port, () => console.log(`  ${label.padEnd(8)} http://localhost:${port}`));
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, `http://localhost:${API_PORT}`);
    const p = url.pathname;
    if (p.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (p.startsWith('/rest/v1/rpc/')) return await handleRpc(req, res, decodeURIComponent(p.slice('/rest/v1/rpc/'.length)));
    if (p.startsWith('/rest/v1/')) return await handleTable(req, res, decodeURIComponent(p.slice('/rest/v1/'.length)), url);
    if (p.startsWith('/storage/v1')) return await handleStorage(req, res, url);
    if (p.startsWith('/functions/v1/')) return send(res, 404, { error: 'not_found', message: 'Edge functions are not available in the local dev stack' });
    if (p === '/' || p === '/health') return send(res, 200, { ok: true, name: 'Gadget Galli local dev stack' });
    return send(res, 404, { message: 'Not found' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { message: e.message });
  }
});

// Realtime: accept the socket and answer joins/heartbeats so clients stay quiet.
// (Screens also poll, so data still refreshes without live events.)
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/realtime/v1/websocket')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'phx_join' || msg.event === 'heartbeat' || msg.event === 'access_token') {
          ws.send(JSON.stringify({ topic: msg.topic, event: 'phx_reply', payload: { status: 'ok', response: { postgres_changes: [] } }, ref: msg.ref, join_ref: msg.join_ref }));
        } else if (msg.event === 'phx_leave') {
          ws.send(JSON.stringify({ topic: msg.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: msg.ref }));
        }
      } catch {
        /* ignore */
      }
    });
  });
});

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

server.listen(API_PORT, () => {
  console.log('\nGadget Galli local dev stack');
  console.log(`  API      http://localhost:${API_PORT}`);
  const admin = argValue('--serve-admin');
  const mobile = argValue('--serve-mobile');
  if (admin) staticServer(admin, Number(process.env.GG_DEV_ADMIN_PORT ?? 4173), 'Admin');
  if (mobile) staticServer(mobile, Number(process.env.GG_DEV_MOBILE_PORT ?? 8081), 'Mobile');
  console.log(`\n  EXPO_PUBLIC_SUPABASE_URL=http://localhost:${API_PORT}`);
  console.log(`  EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`);
  console.log(`  VITE_SUPABASE_URL=http://localhost:${API_PORT}`);
  console.log(`  VITE_SUPABASE_ANON_KEY=${ANON_KEY}`);
  console.log(`  (service role key: ${SERVICE_KEY.slice(0, 24)}…)\n`);
  console.log('  Logins: admin@gadgetgalli.in / GadgetGalli@2026 · phones +91 90000 00001 (customer), +91 90000 10001 (shop) · OTP 123456\n');
});

const shutdown = () => {
  server.close();
  pool.end().catch(() => undefined);
  if (process.env.GG_DEV_STOP_PG !== '0') {
    try {
      stopPostgres();
    } catch {
      /* already stopped */
    }
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
