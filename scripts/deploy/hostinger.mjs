#!/usr/bin/env node
// Builds Gadget Galli as three websites for Hostinger (or any Apache / LiteSpeed static host), plus the
// Supabase SQL to run once. Step-by-step guide: docs/DEPLOY-HOSTINGER.md.
//
//   pnpm deploy:hostinger
//
// Optional settings. Without them, config.js in each site is left for you to fill in after uploading:
//   SUPABASE_URL, SUPABASE_ANON_KEY        Supabase → Project Settings → API
//   CUSTOMER_URL, PARTNER_URL, ADMIN_URL   the three website addresses, e.g. https://xyz.hostingersite.com
//   DEMO=0                                 hide the demo phone numbers on the login screens (real launch)
//
// Output in deploy/hostinger/ (not committed):
//   gadget-galli-customer.zip   customer app                → the customer website's public_html
//   gadget-galli-partner.zip    Shop Partner app            → the partner website's public_html
//   gadget-galli-admin.zip      admin panel and share pages → the admin website's public_html
//   gadget-galli-supabase.zip   SQL to run once in Supabase, the test phone numbers, admin password SQL
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'deploy', 'hostinger');
const BUILD = join(OUT, '.build');
const url = (name) => (process.env[name] ?? '').trim().replace(/\/+$/, '');
const settings = {
  supabaseUrl: url('SUPABASE_URL'),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY ?? '').trim(),
  customerAppUrl: url('CUSTOMER_URL'),
  partnerAppUrl: url('PARTNER_URL'),
  adminUrl: url('ADMIN_URL'),
  demo: process.env.DEMO !== '0',
};
const run = (cwd, cmd, args, env) => execFileSync(cmd, args, { cwd: join(ROOT, cwd), stdio: 'inherit', env: { ...process.env, ...env } });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// Empty build-time values: these builds take their server settings from config.js only.
console.log('▸ admin panel');
run('apps/admin', 'npx', ['vite', 'build', '--outDir', join(BUILD, 'admin'), '--emptyOutDir'], {
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  VITE_CUSTOMER_APP_URL: '',
});
console.log('▸ customer and Shop Partner app (one web build, two websites)');
run('apps/mobile', 'npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', join(BUILD, 'mobile')], {
  CI: '1',
  EXPO_PUBLIC_SUPABASE_URL: '',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
  EXPO_PUBLIC_SHARE_BASE_URL: '',
  EXPO_PUBLIC_APP: 'all',
  EXPO_PUBLIC_DEMO: '0',
});

// Apache / LiteSpeed: send every address that isn't a real file to index.html (single-page app),
// and make browsers check for a new index.html and config.js on every visit.
const HTACCESS = `# Gadget Galli: single-page app routing for Apache / LiteSpeed (Hostinger).
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "^(index\\.html|config\\.js)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
`;

const q = (v) => JSON.stringify(v);
function configJs(label, app) {
  return `// Gadget Galli ${label}: settings for this website.
// Edit the values in quotes and save. The website picks them up on the next page load; no rebuild needed.
window.GG_CONFIG = {
  // Supabase → Project Settings → API: the "Project URL" and the "anon public" key
  supabaseUrl: ${q(settings.supabaseUrl)},
  supabaseAnonKey: ${q(settings.supabaseAnonKey)},

  // Your three website addresses, starting with https:// and without a slash at the end
  customerAppUrl: ${q(settings.customerAppUrl)},
  partnerAppUrl: ${q(settings.partnerAppUrl)},
  adminUrl: ${q(settings.adminUrl)},
${
  app
    ? `
  // Which app this website shows. Leave it as it is.
  app: ${q(app)},
  // true shows the demo phone numbers on the login screen. Set it to false for a real launch.
  demo: ${settings.demo},
`
    : ''
}};
`;
}

function site(name, label, from, { title, app } = {}) {
  const dir = join(OUT, name);
  cpSync(from, dir, { recursive: true });
  rmSync(join(dir, '_redirects'), { force: true }); // Netlify-style rules; .htaccess does this on Hostinger
  let html = readFileSync(join(dir, 'index.html'), 'utf8');
  if (title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace('</head>', '<meta name="theme-color" content="#064F55" /><script src="/config.js"></script></head>');
  writeFileSync(join(dir, 'index.html'), html);
  writeFileSync(join(dir, 'config.js'), configJs(label, app));
  writeFileSync(join(dir, '.htaccess'), HTACCESS);
  execFileSync('zip', ['-qr', join(OUT, `gadget-galli-${name}.zip`), '.'], { cwd: dir });
  console.log(`✔ ${name}: deploy/hostinger/gadget-galli-${name}.zip`);
}

site('customer', 'customer app', join(BUILD, 'mobile'), { title: 'Gadget Galli', app: 'customer' });
site('partner', 'Shop Partner app', join(BUILD, 'mobile'), { title: 'Gadget Galli Partner', app: 'partner' });
site('admin', 'admin panel', join(BUILD, 'admin'));

// Supabase: schema (all migrations in order), demo or launch data, test phone numbers, admin passwords.
const sql = join(OUT, 'supabase');
mkdirSync(sql);
const migrations = readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
writeFileSync(
  join(sql, '1-schema.sql'),
  `-- Gadget Galli database: every migration in order. Run once in Supabase → SQL Editor on a new project.\n\n` +
    migrations.map((f) => `-- ===== ${f} =====\n${readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8')}`).join('\n\n'),
);
cpSync(join(ROOT, 'supabase', 'seed.sql'), join(sql, '2-demo-data.sql'));
cpSync(join(ROOT, 'supabase', 'seed-reference.sql'), join(sql, '2-launch-data.sql'));
writeFileSync(
  join(sql, '3-change-admin-passwords.sql'),
  `-- The demo admin logins (admin@ and support@gadgetgalli.in) use a password published in the README.
-- Run this right after 2-demo-data.sql. First put your email and two strong passwords in the quotes below.
do $$
declare
  v_email text := 'YOUR-EMAIL@example.com';            -- your email: the new admin login
  v_password text := 'CHOOSE-A-STRONG-PASSWORD';       -- 12 characters or more
  v_support_password text := 'ANOTHER-STRONG-PASSWORD'; -- for support@gadgetgalli.in, 12 or more
begin
  if v_email like 'YOUR-EMAIL%' or v_password like 'CHOOSE-%' or v_support_password like 'ANOTHER-%'
     or length(v_password) < 12 or length(v_support_password) < 12 then
    raise exception 'Put your email and two strong passwords (12+ characters) in the quotes at the top first.';
  end if;
  update auth.users
     set email = v_email, encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf'))
   where email = 'admin@gadgetgalli.in';
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_email)
   where provider = 'email' and user_id = (select id from auth.users where email = v_email);
  update public.users set email = v_email where email = 'admin@gadgetgalli.in';
  update auth.users set encrypted_password = extensions.crypt(v_support_password, extensions.gen_salt('bf'))
   where email = 'support@gadgetgalli.in';
end $$;
`,
);
const toml = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8');
const testSection = toml.split('[auth.sms.test_otp]')[1]?.split('\n[')[0] ?? '';
const testNumbers = [...testSection.matchAll(/^(\d+)\s*=\s*"(\d+)"/gm)].map((m) => `${m[1]}=${m[2]}`);
writeFileSync(
  join(sql, 'test-phone-numbers.txt'),
  `Paste this line into Supabase → Authentication → Sign In / Providers → Phone → "Test Phone Numbers and OTPs":\n\n${testNumbers.join(',')}\n`,
);
execFileSync('zip', ['-qr', join(OUT, 'gadget-galli-supabase.zip'), '.'], { cwd: sql });
console.log('✔ supabase: deploy/hostinger/gadget-galli-supabase.zip');

rmSync(BUILD, { recursive: true, force: true });
const missing = ['supabaseUrl', 'supabaseAnonKey', 'customerAppUrl', 'partnerAppUrl', 'adminUrl'].filter((k) => !settings[k]);
console.log(
  `\nDone. Upload each site ZIP to its website's public_html and extract it there (docs/DEPLOY-HOSTINGER.md).` +
    (missing.length ? `\nStill to fill in config.js after uploading: ${missing.join(', ')}.` : ''),
);
