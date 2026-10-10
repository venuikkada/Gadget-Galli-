#!/usr/bin/env node
// Renders every Gadget Galli icon and logo from brand/mark.svg (pnpm brand:assets), using the Chromium that
// Playwright already has, so it works offline:
//   apps/mobile/assets/images/   icon, Android adaptive layers (foreground, background, monochrome), splash,
//                                notification icon, favicon
//   apps/admin/public/           favicon, logo.png, logo.svg, og-image.png (WhatsApp/link previews)
//   apps/mobile/src/shared/ui/brandMark.ts   the mark's paths, for the in-app BrandMark component
// Edit brand/mark.svg, then run this script.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOBILE = join(ROOT, 'apps', 'mobile', 'assets', 'images');
const ADMIN = join(ROOT, 'apps', 'admin', 'public');
const source = readFileSync(join(ROOT, 'brand', 'mark.svg'), 'utf8');

/** Reads an attribute of the element with the given id in mark.svg. */
function attr(id, name) {
  const el = source.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0];
  const value = el?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  if (!value) throw new Error(`brand/mark.svg: #${id} has no ${name}`);
  return value;
}

const mark = {
  handle: attr('handle', 'd'),
  handleWidth: Number(attr('handle', 'stroke-width')),
  bag: attr('bag', 'd'),
  bolt: attr('bolt', 'd'),
};
const defs = source.match(/<defs>[\s\S]*<\/defs>/)[0];
const background = `<rect width="1024" height="1024" fill="url(#bg-fill)"/><rect width="1024" height="1024" fill="url(#glow-fill)"/>`;
const TEAL_DEEP = '#064F55';

/** The bag, handle and bolt in brand colours. */
const colourMark = `
  <path d="${mark.handle}" fill="none" stroke="#E89E00" stroke-width="${mark.handleWidth}" stroke-linecap="round"/>
  <path d="${mark.bag}" fill="url(#bag-fill)"/>
  <path d="${mark.bolt}" fill="${TEAL_DEEP}" stroke="${TEAL_DEEP}" stroke-width="10" stroke-linejoin="round"/>`;

/** One-colour silhouette with the bolt cut out (Android monochrome and notification icons). */
const silhouette = (color = '#FFFFFF') => `
  <mask id="cut"><rect width="1024" height="1024" fill="#fff"/><path d="${mark.bolt}" fill="#000" stroke="#000" stroke-width="10" stroke-linejoin="round"/></mask>
  <g mask="url(#cut)">
    <path d="${mark.handle}" fill="none" stroke="${color}" stroke-width="${mark.handleWidth}" stroke-linecap="round"/>
    <path d="${mark.bag}" fill="${color}"/>
  </g>`;

/** Scales the mark around its visual centre (512, 525) and centres it at (cx, cy). */
const place = (inner, scale, cx = 512, cy = 512) => `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-512 -525)">${inner}</g>`;

const svg = (w, h, body, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${defs}${body}</svg>`;

/** A rounded app tile: brand gradient with the mark, transparent outside the corners. */
const tile = (scale) => svg(1024, 1024, `<clipPath id="round"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#round)">${background}${place(colourMark, scale)}</g>`);

const font = (pkg, file) => readFileSync(join(ROOT, 'node_modules', '@expo-google-fonts', pkg, file)).toString('base64');
const fontCss = `
  @font-face { font-family: Poppins; font-weight: 700; src: url(data:font/ttf;base64,${font('poppins', '700Bold/Poppins_700Bold.ttf')}); }
  @font-face { font-family: Inter; font-weight: 500; src: url(data:font/ttf;base64,${font('inter', '500Medium/Inter_500Medium.ttf')}); }`;

const wordmark = (x, y, size, anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Poppins" font-weight="700" font-size="${size}" letter-spacing="-0.5"><tspan fill="#FFFFFF">Gadget </tspan><tspan fill="#FFC026">Galli</tspan></text>`;

const outputs = [
  // App icon: full-bleed (the phone applies its own mask), and opaque for the stores.
  { file: join(MOBILE, 'icon.png'), w: 1024, h: 1024, svg: svg(1024, 1024, background + place(colourMark, 1)), opaque: true },
  // Android adaptive icon: the foreground must fit the 66% safe zone.
  { file: join(MOBILE, 'android-icon-background.png'), w: 1024, h: 1024, svg: svg(1024, 1024, background), opaque: true },
  { file: join(MOBILE, 'android-icon-foreground.png'), w: 1024, h: 1024, svg: svg(1024, 1024, place(colourMark, 0.72)) },
  { file: join(MOBILE, 'android-icon-monochrome.png'), w: 1024, h: 1024, svg: svg(1024, 1024, place(silhouette(), 0.72)) },
  { file: join(MOBILE, 'notification-icon.png'), w: 96, h: 96, svg: svg(96, 96, place(silhouette(), 1.42), '0 0 1024 1024') },
  // Splash: the mark over the wordmark, on the teal splash background set in app.config.ts.
  { file: join(MOBILE, 'splash-icon.png'), w: 600, h: 600, svg: svg(600, 600, `<g transform="scale(0.586)">${place(colourMark, 0.86, 512, 430)}</g>${wordmark(300, 520, 82)}`) },
  { file: join(MOBILE, 'favicon.png'), w: 48, h: 48, svg: tile(1.22).replace('width="1024" height="1024"', 'width="48" height="48"') },
  { file: join(ADMIN, 'favicon.png'), w: 64, h: 64, svg: tile(1.22).replace('width="1024" height="1024"', 'width="64" height="64"') },
  { file: join(ADMIN, 'logo.png'), w: 192, h: 192, svg: tile(1.1).replace('width="1024" height="1024"', 'width="192" height="192"') },
  // Link previews (WhatsApp, Facebook, X): 1200×630.
  {
    file: join(ADMIN, 'og-image.png'),
    w: 1200,
    h: 630,
    opaque: true,
    svg: svg(
      1200,
      630,
      `<rect width="1200" height="630" fill="url(#bg-fill)"/><rect width="1200" height="630" fill="url(#glow-fill)"/>
       <g transform="translate(64 115) scale(0.39)"><rect width="1024" height="1024" rx="230" fill="#FFFFFF" fill-opacity="0.1"/>${place(colourMark, 1)}</g>
       ${wordmark(500, 240, 92, 'start')}
       <text x="504" y="316" font-family="Inter" font-weight="500" font-size="40" fill="#FFFFFF" fill-opacity="0.94">Hyderabad electronics shops,</text>
       <text x="504" y="368" font-family="Inter" font-weight="500" font-size="40" fill="#FFFFFF" fill-opacity="0.94">delivered in hours</text>
       <text x="504" y="440" font-family="Inter" font-weight="500" font-size="27" fill="#FFDF8A">Compare prices · Call or WhatsApp · Pay by UPI</text>`,
    ),
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const o of outputs) {
  await page.setViewportSize({ width: o.w, height: o.h });
  await page.setContent(`<!doctype html><html><head><style>${fontCss} html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${o.svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: o.file, omitBackground: !o.opaque, clip: { x: 0, y: 0, width: o.w, height: o.h } });
  console.log(`✔ ${o.file.replace(`${ROOT}/`, '')} (${o.w}×${o.h})`);
}
await browser.close();

// Stores reject app icons with an alpha channel: flatten the opaque ones (Pillow ships with Python here).
const opaque = outputs.filter((o) => o.opaque).map((o) => o.file);
execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nfor p in sys.argv[1:]: Image.open(p).convert("RGB").save(p, optimize=True)', ...opaque]);

writeFileSync(join(ADMIN, 'logo.svg'), `${tile(1.1).replace('width="1024" height="1024"', 'width="192" height="192"')}\n`);
console.log('✔ apps/admin/public/logo.svg');

writeFileSync(
  join(ROOT, 'apps', 'mobile', 'src', 'shared', 'ui', 'brandMark.ts'),
  `// Generated by scripts/brand/render.mjs from brand/mark.svg. Don't edit; change mark.svg and run pnpm brand:assets.
export const BRAND_MARK = {
  viewBox: '0 0 1024 1024',
  handle: '${mark.handle}',
  handleWidth: ${mark.handleWidth},
  bag: '${mark.bag}',
  bolt: '${mark.bolt}',
} as const;
`,
);
console.log('✔ apps/mobile/src/shared/ui/brandMark.ts');
