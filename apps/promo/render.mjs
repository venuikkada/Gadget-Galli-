#!/usr/bin/env node
// Renders the launch promo videos and the Play Store feature graphic into apps/promo/out/.
//
//   pnpm --filter @gg/promo render            both videos + feature graphic
//   pnpm --filter @gg/promo render -- --stills  one still per scene, to check the layout quickly
//
// Uses the pre-installed Chromium when PLAYWRIGHT_BROWSERS_PATH is set (cloud sandbox), else Remotion's own.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

function browserExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return null;
  const dir = readdirSync(base).find((d) => d.startsWith('chromium_headless_shell-'));
  const exe = dir && join(base, dir, 'chrome-linux', 'headless_shell');
  return exe && existsSync(exe) ? exe : null;
}

const browser = browserExecutable();
const serveUrl = await bundle({ entryPoint: join(HERE, 'src', 'index.ts') });
const common = { serveUrl, browserExecutable: browser, chromiumOptions: { gl: 'swangle' } };

if (process.argv.includes('--stills')) {
  const frames = [60, 200, 340, 450, 620, 720, 860, 1000];
  for (const lang of ['en', 'te']) {
    const composition = await selectComposition({ ...common, id: `promo-${lang}` });
    for (const frame of frames) {
      const output = join(OUT, `still-${lang}-${frame}.png`);
      await renderStill({ ...common, composition, frame, output, scale: 0.5 });
      console.log('✔', output);
    }
  }
} else {
  for (const lang of ['en', 'te']) {
    const composition = await selectComposition({ ...common, id: `promo-${lang}` });
    const outputLocation = join(OUT, `gadget-galli-promo-${lang}.mp4`);
    await renderMedia({ ...common, composition, codec: 'h264', crf: 18, audioCodec: 'aac', outputLocation });
    console.log('✔', outputLocation);
  }
  const still = await selectComposition({ ...common, id: 'feature-graphic' });
  const output = join(OUT, 'play-feature-graphic-1024x500.png');
  await renderStill({ ...common, composition: still, output });
  console.log('✔', output);
}
