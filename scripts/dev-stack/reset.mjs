#!/usr/bin/env node
// Stops the local dev database and deletes it, so the next `pnpm dev-stack` starts from a fresh seed.
import { rmSync } from 'node:fs';

import { DATA_DIR, stopPostgres } from './postgres.mjs';

try {
  stopPostgres();
} catch {
  /* not running */
}
rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Removed ${DATA_DIR}. Run pnpm dev-stack to start again with fresh demo data.`);
