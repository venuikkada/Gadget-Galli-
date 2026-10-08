// Starts a local PostgreSQL 15+ for development and loads the Gadget Galli schema + demo seed.
// Data lives in scripts/dev-stack/.data (git-ignored). Delete that folder to start fresh.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, chownSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SUPA = join(ROOT, 'supabase');
export const DATA_DIR = process.env.GG_DEV_DATA ?? join(HERE, '.data');
export const PG_PORT = Number(process.env.GG_DEV_PGPORT ?? 54322);

function findPgBin() {
  if (process.env.PGBIN) return process.env.PGBIN;
  for (const d of ['/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/opt/homebrew/opt/postgresql@16/bin', '/usr/local/opt/postgresql@16/bin']) {
    if (existsSync(join(d, 'initdb'))) return d;
  }
  const which = spawnSync('which', ['initdb'], { encoding: 'utf8' });
  if (which.status === 0) return dirname(which.stdout.trim());
  throw new Error('initdb not found. Install PostgreSQL 15+ or set PGBIN.');
}

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const PGBIN = findPgBin();

function pgCmd(bin, args, opts = {}) {
  const cmd = join(PGBIN, bin);
  // Postgres refuses to run as root, so use the postgres OS user when we are root.
  if (isRoot) return execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe', ...opts });
  return execFileSync(cmd, args, { stdio: 'pipe', ...opts });
}

function psql(args, input) {
  const base = ['-h', join(DATA_DIR, 'sock'), '-p', String(PG_PORT), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X'];
  return execFileSync(join(PGBIN, 'psql'), [...base, ...args], { stdio: ['pipe', 'pipe', 'pipe'], input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function running() {
  try {
    pgCmd('pg_ctl', ['-D', join(DATA_DIR, 'pg'), 'status']);
    return true;
  } catch {
    return false;
  }
}

/** Starts Postgres (initialising and seeding it on first run). Returns connection info. */
export function startPostgres({ log = console.log } = {}) {
  const fresh = !existsSync(join(DATA_DIR, 'pg', 'PG_VERSION'));
  mkdirSync(join(DATA_DIR, 'sock'), { recursive: true });
  if (isRoot) {
    const pw = spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' });
    const uid = Number(pw.stdout.trim());
    if (uid) {
      chownSync(DATA_DIR, uid, uid);
      chownSync(join(DATA_DIR, 'sock'), uid, uid);
    }
  }
  if (fresh) {
    log('▸ initdb');
    mkdirSync(join(DATA_DIR, 'pg'), { recursive: true });
    if (isRoot) spawnSync('chown', ['-R', 'postgres', DATA_DIR]);
    pgCmd('initdb', ['-D', join(DATA_DIR, 'pg'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  }
  if (!running()) {
    log(`▸ starting postgres on port ${PG_PORT}`);
    pgCmd('pg_ctl', [
      '-D', join(DATA_DIR, 'pg'),
      '-o', `-p ${PG_PORT} -k ${join(DATA_DIR, 'sock')} -c listen_addresses=localhost -c timezone=UTC`,
      '-l', join(DATA_DIR, 'postgres.log'),
      '-w', 'start',
    ]);
  }
  if (fresh) {
    psql(['-d', 'postgres', '-c', 'create database gg']);
    log('▸ shim (local stand-ins for Supabase auth/storage)');
    psql(['-d', 'gg', '-f', join(SUPA, 'tests', 'shim.sql')]);
    for (const f of readdirSync(join(SUPA, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
      log(`▸ migration ${f}`);
      psql(['-d', 'gg', '-f', join(SUPA, 'migrations', f)]);
    }
    log('▸ seed');
    psql(['-d', 'gg', '-f', join(SUPA, 'seed.sql')]);
    // The gateway connects as postgres and switches to anon/authenticated per request.
    psql(['-d', 'gg', '-c', 'grant anon, authenticated, service_role to postgres']);
    writeFileSync(join(DATA_DIR, 'seeded-at.txt'), new Date().toISOString());
  }
  return { host: join(DATA_DIR, 'sock'), port: PG_PORT, user: 'postgres', database: 'gg' };
}

export function stopPostgres() {
  if (running()) pgCmd('pg_ctl', ['-D', join(DATA_DIR, 'pg'), 'stop', '-m', 'fast']);
}
