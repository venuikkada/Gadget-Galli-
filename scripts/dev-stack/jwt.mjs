// Minimal HS256 JWT helpers (no dependencies). Local development only.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const JWT_SECRET = process.env.GG_DEV_JWT_SECRET ?? 'gadget-galli-local-dev-secret-change-me-0123456789';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function sign(payload, secret = JWT_SECRET) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

/** Returns the claims, or null when the token is invalid or expired. */
export function verify(token, secret = JWT_SECRET) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = fromB64url(parts[2]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

// Long-lived keys in the same shape as Supabase's local anon / service_role keys.
const TEN_YEARS = 10 * 365 * 24 * 3600;
const iat = 1791417600; // fixed so the keys stay the same between runs
export const ANON_KEY = sign({ iss: 'gadget-galli-dev', role: 'anon', iat, exp: iat + TEN_YEARS });
export const SERVICE_KEY = sign({ iss: 'gadget-galli-dev', role: 'service_role', iat, exp: iat + TEN_YEARS });
