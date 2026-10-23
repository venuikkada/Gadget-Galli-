#!/usr/bin/env node
// Google Play store graphics (docs/PLAY-STORE.md), rendered with the Chromium that Playwright already has:
//   store/play/icon-512.png          the 512 × 512 app icon
//   store/play/feature-graphic.png   the 1024 × 500 banner at the top of the listing
//   store/play/screenshots/*.jpg     1080 × 1920 phone screenshots, picked from test-results/play
// Take the screenshots first: with the dev stack running, PLAY=1 node scripts/e2e/screenshots.mjs
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'store', 'play');
const SHOTS = join(ROOT, 'test-results', 'play');
const ICON = join(ROOT, 'apps', 'mobile', 'assets', 'images', 'icon.png');
const FONT = (weight) => join(ROOT, 'node_modules', '@expo-google-fonts', 'poppins', weight, `Poppins_${weight}.ttf`);

// Tour screenshot → listing order and name: the customer journey first, then the shop side.
const PICK = [
  ['o-01-home', '01-home'],
  ['o-03-compare', '02-compare-shops'],
  ['o-09-pay', '03-pay-the-shop'],
  ['o-12-on-the-way', '04-delivery-code'],
  ['o-06-alarm', '05-new-order-alarm'],
  ['p-dashboard', '06-shop-dashboard'],
  ['c-shop', '07-shop-page'],
  ['c-telugu', '08-telugu'],
];

const missing = PICK.filter(([from]) => !existsSync(join(SHOTS, `${from}.jpg`))).map(([from]) => from);
if (missing.length) {
  console.error(`Missing in test-results/play: ${missing.join(', ')}. Run the Play screenshot tour first (see the top of this file).`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
for (const [from, to] of PICK) copyFileSync(join(SHOTS, `${from}.jpg`), join(OUT, 'screenshots', `${to}.jpg`));

const url = (file) => pathToFileURL(file).href;
const featureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Poppins; font-weight: 600; src: url('${url(FONT('600SemiBold'))}'); }
@font-face { font-family: Poppins; font-weight: 700; src: url('${url(FONT('700Bold'))}'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1024px; height: 500px; overflow: hidden; font-family: Poppins, sans-serif; color: #fff;
  background: radial-gradient(circle at 92% 8%, rgba(255,179,0,.28), transparent 38%), linear-gradient(135deg, #0B7A80 0%, #064F55 55%, #03282C 100%); }
.copy { position: absolute; left: 56px; top: 58px; width: 520px; }
.brand { display: flex; align-items: center; gap: 18px; }
.brand img { width: 84px; height: 84px; border-radius: 22px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
.brand span { font-weight: 700; font-size: 46px; letter-spacing: -.5px; }
h1 { margin-top: 30px; font-weight: 700; font-size: 37px; line-height: 1.2; }
.tags { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 10px; }
.tags span { background: #FFB300; color: #3D2700; font-weight: 600; font-size: 17px; padding: 8px 16px; border-radius: 999px; }
.phone { position: absolute; width: 228px; height: 405px; border-radius: 30px; border: 7px solid #0D1B1D; overflow: hidden;
  background: #0D1B1D; box-shadow: 0 18px 40px rgba(0,0,0,.4); }
.phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.p1 { left: 600px; top: 70px; transform: rotate(-6deg); }
.p2 { left: 770px; top: 40px; transform: rotate(5deg); }
</style></head><body>
<div class="copy">
  <div class="brand"><img src="${url(ICON)}" alt=""><span>Gadget Galli</span></div>
  <h1>Hyderabad's electronics shops, delivered in hours</h1>
  <div class="tags"><span>Compare prices</span><span>Pay on delivery</span><span>Delivery code protection</span></div>
</div>
<div class="phone p1"><img src="${url(join(SHOTS, 'o-03-compare.jpg'))}" alt=""></div>
<div class="phone p2"><img src="${url(join(SHOTS, 'o-12-on-the-way.jpg'))}" alt=""></div>
</body></html>`;
const iconHtml = `<!doctype html><html><head><style>* { margin: 0; } body { width: 512px; height: 512px; }</style></head>
<body><img src="${url(ICON)}" width="512" height="512" alt=""></body></html>`;

const browser = await chromium.launch();
const render = async (html, width, height, file) => {
  const tmp = join(OUT, `.${file}.html`);
  writeFileSync(tmp, html);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url(tmp));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(OUT, file) });
  await page.close();
  rmSync(tmp);
  console.log(`✔ store/play/${file}`);
};
await render(featureHtml, 1024, 500, 'feature-graphic.png');
await render(iconHtml, 512, 512, 'icon-512.png');
await browser.close();
console.log(`✔ store/play/screenshots: ${PICK.length} phone screenshots`);
