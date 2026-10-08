#!/usr/bin/env node
// Builds the admin panel and the mobile web app pointed at the local dev stack (http://localhost:54321).
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANON_KEY } from '../dev-stack/jwt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = process.env.GG_API_URL ?? 'http://localhost:54321';
const run = (cwd, cmd, args, env) => execFileSync(cmd, args, { cwd: join(ROOT, cwd), stdio: 'inherit', env: { ...process.env, ...env } });

console.log('▸ admin panel → apps/admin/dist');
run('apps/admin', 'npx', ['vite', 'build'], { VITE_SUPABASE_URL: API, VITE_SUPABASE_ANON_KEY: ANON_KEY });

console.log('▸ mobile app (web) → apps/mobile/dist');
// --clear: Expo inlines EXPO_PUBLIC_* at bundle time and would otherwise reuse cached modules.
run('apps/mobile', 'npx', ['expo', 'export', '--platform', 'web', '--clear'], {
  CI: '1',
  EXPO_PUBLIC_SUPABASE_URL: API,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  EXPO_PUBLIC_SHARE_BASE_URL: process.env.GG_ADMIN_URL ?? 'http://localhost:4173',
});
console.log('\nDone. Start the stack with: pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist');
