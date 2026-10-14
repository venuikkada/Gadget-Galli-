// Security headers for the three websites (docs/SECURITY.md). One list, used by the Hostinger .htaccess
// (scripts/deploy/hostinger.mjs) and by the dev stack's static server, so the browser tests run under the same rules.
//
// script-src keeps 'unsafe-inline' only because the Leaflet map page runs inside an iframe srcdoc, which inherits
// this policy; there are no inline scripts in the pages themselves.

/** @param {{ dev?: boolean }} [opts] dev adds the local Supabase gateway (http://localhost) and drops HSTS. */
export function securityHeaders({ dev = false } = {}) {
  const local = dev ? ' http://localhost:* ws://localhost:*' : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${local}`,
    "font-src 'self' data:",
    `connect-src 'self' https: wss: data: blob:${local}`,
    `media-src 'self' data: blob:${local}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    ...(dev ? {} : { 'Strict-Transport-Security': 'max-age=31536000' }),
  };
}

/** The same headers as Apache / LiteSpeed directives. */
export function htaccessHeaders() {
  return Object.entries(securityHeaders())
    .map(([k, v]) => `  Header always set ${k} "${v.replace(/"/g, '\\"')}"`)
    .join('\n');
}
