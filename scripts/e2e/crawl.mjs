#!/usr/bin/env node
// Bug sweep: opens every screen of the customer app, the Shop Partner app and the admin panel, in light and dark
// mode (and the main customer screens in Telugu and Hindi), and reports:
//   - uncaught page errors and console errors
//   - failed requests and HTTP 4xx/5xx responses
//   - error screens ("Something went wrong"), raw translation keys, "NaN" / "undefined" / "[object Object]" on screen
//   - pages wider than the phone screen (horizontal scrolling)
// Screenshots go to test-results/crawl/. Exits 1 when anything is found. Run on a fresh dev stack:
//   pnpm e2e:prepare && pnpm dev-stack:reset && pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist
//   node scripts/e2e/crawl.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { chromium } from 'playwright';

import { DATA_DIR, PG_PORT } from '../dev-stack/postgres.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'test-results', 'crawl');
const MOBILE = process.env.GG_MOBILE_URL ?? 'http://localhost:8081';
const ADMIN = process.env.GG_ADMIN_URL ?? 'http://localhost:4173';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// IDs to visit, straight from the demo database
// ---------------------------------------------------------------------------
const db = new pg.Client({ host: join(DATA_DIR, 'sock'), port: PG_PORT, user: 'postgres', database: 'gg' });
await db.connect();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0] ?? null;
const all = async (sql, args = []) => (await db.query(sql, args)).rows;

const ravi = await one(`select id from public.users where phone = '+919000000001'`);
const kphb = await one(`select s.id, s.owner_id from public.shops s join public.users u on u.id = s.owner_id where u.phone = '+919000010002'`);
const ids = {
  customerOrders: await all(`select distinct on (status) id, status::text from public.orders where customer_id = $1 order by status, requested_at desc`, [ravi.id]),
  shopOrders: await all(`select distinct on (status) id, status::text from public.orders where shop_id = $1 order by status, requested_at desc`, [kphb.id]),
  product: (await one(`select p.id from public.catalog_products p join public.shop_products sp on sp.catalog_product_id = p.id
                         where p.status = 'approved' and sp.is_active group by p.id order by count(*) desc limit 1`)).id,
  shop: kphb.id,
  item: (await one(`select id from public.shop_products where shop_id = $1 and is_active order by created_at limit 1`, [kphb.id])).id,
  delivered: (await one(`select id from public.orders where customer_id = $1 and status = 'DELIVERED' order by delivered_at desc limit 1`, [ravi.id]))?.id,
  unreviewed: (await one(`select o.id from public.orders o where o.customer_id = $1 and o.status = 'DELIVERED'
                            and not exists (select 1 from public.reviews r where r.order_id = o.id) limit 1`, [ravi.id]))?.id,
  anyOrder: (await one(`select id from public.orders where status = 'DELIVERED' order by delivered_at desc limit 1`)).id,
  pendingShop: (await one(`select id from public.shops where status = 'under_review' limit 1`))?.id,
  issue: (await one(`select id from public.issues order by created_at desc limit 1`))?.id,
};
await db.end();

// ---------------------------------------------------------------------------
// Browser and checks
// ---------------------------------------------------------------------------
const findings = [];
const browser = await chromium.launch();
const TILE = readFileSync(join(ROOT, 'scripts', 'e2e', 'fixtures', 'map-tile.png'));
// A phone browser: the apps show UPI buttons only where a UPI app can open
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const phone = { userAgent: PHONE_UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 17.4948, longitude: 78.3996 } };
const desktop = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };

// Requests that fail on purpose or don't matter here
const IGNORE_URL = /tile\.openstreetmap|nominatim|\/realtime\/v1\/|favicon|expo-image|_thumb\./;

async function newPage(app, theme, lang) {
  const ctx = await browser.newContext({ ...(app === 'admin' ? desktop : phone), colorScheme: theme });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/png', body: TILE }));
  await ctx.addInitScript(
    ([l, t]) => {
      try {
        if (l) localStorage.setItem('gg.lang', l);
        localStorage.setItem('gg.theme', t);
        localStorage.setItem('gg-admin-theme', t);
      } catch {
        /* storage blocked */
      }
    },
    [lang ?? null, theme],
  );
  const page = await ctx.newPage();
  page.on('popup', (p) => p.close().catch(() => undefined));
  page.on('dialog', (d) => d.dismiss().catch(() => undefined));
  page._gg = { app, theme, lang, events: [] };
  page.on('pageerror', (e) => page._gg.events.push(`page error: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE_URL.test(m.text())) page._gg.events.push(`console: ${m.text().slice(0, 240)}`);
  });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (!IGNORE_URL.test(r.url()) && !/ERR_ABORTED|NS_BINDING_ABORTED/.test(why)) page._gg.events.push(`request failed: ${r.method()} ${r.url().slice(0, 160)} ${why}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !IGNORE_URL.test(r.url())) page._gg.events.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url().slice(0, 160)}`);
  });
  return page;
}

const KEY_RE = /\b(?:common|auth|home|search|filter|product|shop|cart|order|orders|profile|address|location|review|report|notif|help|legal|settings|referral|reject|error|time|condition|status|map|p|sort|spec)\.[a-zA-Z][\w.]*[a-zA-Z]\b/g;

async function check(page, name) {
  const { app, theme, lang } = page._gg;
  const label = `${app}${lang ? `/${lang}` : ''}/${theme} ${name}`;
  await page.waitForTimeout(app === 'admin' ? 1800 : 2600);
  const info = await page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return {
      text,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const problems = [...page._gg.events];
  page._gg.events.length = 0;
  // The not-found routes are visited on purpose and must show the not-found screen
  if (name !== 'not-found' && /Something went wrong|Could not load|Unexpected Application Error|This page could not be found|Unmatched Route/i.test(info.text)) problems.push('error screen shown');
  const keys = [...new Set(info.text.match(KEY_RE) ?? [])].filter((k) => !/\.(com|in|png|jpg|js)$/.test(k) && !/^[a-z]+\.[a-z]+@/.test(k));
  if (keys.length) problems.push(`raw translation keys: ${keys.slice(0, 6).join(', ')}`);
  const junk = info.text.match(/₹\s?NaN|\bNaN\b|\bundefined\b|\[object Object\]|Invalid Date/g);
  if (junk) problems.push(`bad values on screen: ${[...new Set(junk)].join(', ')}`);
  if (app !== 'admin' && info.overflow > 2) problems.push(`page is ${info.overflow}px wider than the screen`);
  const file = `${app}${lang ? `-${lang}` : ''}-${theme}-${name}.png`.replace(/[^\w.-]+/g, '_');
  await page.screenshot({ path: join(OUT, file) }).catch(() => undefined);
  for (const p of problems) findings.push(`${label}: ${p}`);
  console.log(`${problems.length ? '✘' : '✔'} ${label}${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
}

async function go(page, base, path, name) {
  try {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    page._gg.events.push(`navigation failed: ${e.message.split('\n')[0]}`);
  }
  await check(page, name);
}

async function mobileLogin(page, digits, landing) {
  await page.goto(MOBILE);
  await page.getByTestId('phone-input').fill(digits);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456');
  await page.waitForURL(landing, { timeout: 30000 });
  if (page.url().includes('/location')) {
    await page.getByText('Flat 302, Sai Residency').click();
    await page.waitForURL('**/home', { timeout: 20000 });
  }
  page._gg.events.length = 0;
}

async function adminLogin(page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByTestId('login-email').fill('admin@gadgetgalli.in');
  await page.getByTestId('login-password').fill('GadgetGalli@2026');
  await page.getByTestId('login-submit').click();
  await page.getByText('Orders today').waitFor({ timeout: 20000 });
  page._gg.events.length = 0;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const customerRoutes = [
  ['/home', 'home'],
  ['/search', 'search'],
  ['/search?q=iphone%2015', 'search-results'],
  ['/search?q=playstation%205%20pro', 'search-none'],
  ['/shops', 'shops'],
  [`/product/${ids.product}`, 'product'],
  [`/shop/${ids.shop}`, 'shop'],
  [`/item/${ids.item}`, 'item'],
  ['/cart', 'cart'],
  ['/orders', 'orders'],
  ...ids.customerOrders.map((o) => [`/order/${o.id}`, `order-${o.status}`]),
  ...(ids.delivered ? [[`/report/${ids.delivered}`, 'report']] : []),
  ...(ids.unreviewed ? [[`/review/${ids.unreviewed}`, 'review']] : []),
  ['/profile', 'profile'],
  ['/favourites', 'favourites'],
  ['/notifications', 'notifications'],
  ['/referral', 'referral'],
  ['/addresses', 'addresses'],
  ['/address', 'address-new'],
  ['/my-reviews', 'my-reviews'],
  ['/settings', 'settings'],
  ['/help', 'help'],
  ['/terms', 'terms'],
  ['/privacy', 'privacy'],
  ['/delete-account', 'delete-account'],
  ['/location', 'location'],
  ['/not-served', 'not-served'],
  ['/no-such-page', 'not-found'],
];
const partnerRoutes = [
  ['/partner/dashboard', 'dashboard'],
  ['/partner/orders', 'orders'],
  ...ids.shopOrders.map((o) => [`/partner/order/${o.id}`, `order-${o.status}`]),
  ['/partner/products', 'products'],
  ['/partner/product/add', 'product-add'],
  ['/partner/product/custom', 'product-custom'],
  ['/partner/product/bulk', 'product-bulk'],
  [`/partner/product/edit?id=${ids.item}`, 'product-edit'],
  ['/partner/insights', 'insights'],
  ['/partner/payouts', 'payouts'],
  ['/partner/reviews', 'reviews'],
  ['/partner/qr', 'qr'],
  ['/partner/more', 'more'],
  ['/partner/status', 'status'],
  ['/partner/register?edit=1', 'register-edit'],
];
const adminRoutes = [
  ['/', 'dashboard'],
  ['/shops', 'shops'],
  ...(ids.pendingShop ? [[`/shops/${ids.pendingShop}`, 'shop-review']] : []),
  [`/shops/${ids.shop}`, 'shop'],
  ['/orders', 'orders'],
  [`/orders/${ids.anyOrder}`, 'order'],
  ['/payments', 'payments-commission'],
  ['/payments?tab=verify', 'payments-verify'],
  ['/payments?tab=due', 'payments-due'],
  ['/payments?tab=held', 'payments-held'],
  ['/payments?tab=paid', 'payments-paid'],
  ['/payments?tab=settings', 'payments-settings'],
  ['/problems', 'problems'],
  ...(ids.issue ? [[`/problems/${ids.issue}`, 'problem']] : []),
  ['/catalog', 'catalog'],
  ['/catalog?tab=categories', 'catalog-categories'],
  ['/catalog?tab=brands', 'catalog-brands'],
  ['/catalog?tab=synonyms', 'catalog-synonyms'],
  ['/customers', 'customers'],
  ['/customers?tab=admins', 'customers-admins'],
  ['/content', 'content'],
  ['/content?tab=featured', 'content-featured'],
  ['/content?tab=campaigns', 'content-campaigns'],
  ['/content?tab=referrals', 'content-referrals'],
  ['/areas', 'areas'],
  ['/areas?tab=waitlist', 'areas-waitlist'],
  ['/reports', 'reports'],
  ['/security', 'security'],
  [`/s/product/${ids.product}`, 'share-product'],
  [`/s/shop/${ids.shop}`, 'share-shop'],
  ['/no-such-page', 'not-found'],
];

for (const theme of ['light', 'dark']) {
  const c = await newPage('customer', theme);
  await mobileLogin(c, '9000000001', /\/(location|home)/);
  for (const [path, name] of customerRoutes) await go(c, MOBILE, path, name);
  await c.context().close();

  const p = await newPage('partner', theme);
  await mobileLogin(p, '9000010002', /\/partner/);
  for (const [path, name] of partnerRoutes) await go(p, MOBILE, path, name);
  await p.context().close();

  const a = await newPage('admin', theme);
  await adminLogin(a);
  for (const [path, name] of adminRoutes) await go(a, ADMIN, path, name);
  await a.context().close();
}

// Longer Telugu and Hindi words on the busiest customer screens
for (const lang of ['te', 'hi']) {
  const c = await newPage('customer', 'light', lang);
  await mobileLogin(c, '9000000001', /\/(location|home)/);
  for (const [path, name] of customerRoutes.filter(([, n]) => /^(home|search-results|product|shop|cart|orders|order-CONFIRMED|order-DELIVERED|profile)$/.test(n))) {
    await go(c, MOBILE, path, name);
  }
  await c.context().close();
}

// Logged-out screens
for (const theme of ['light', 'dark']) {
  const c = await newPage('customer', theme);
  await go(c, MOBILE, '/', 'login');
  await c.context().close();
  const a = await newPage('admin', theme);
  await go(a, ADMIN, '/login', 'login');
  await a.context().close();
}

await browser.close();
writeFileSync(join(OUT, 'findings.txt'), findings.join('\n') + '\n');
console.log(`\n${findings.length ? `${findings.length} problems` : 'No problems'} found. Screenshots: ${OUT}`);
process.exit(findings.length ? 1 : 0);
