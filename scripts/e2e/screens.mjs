#!/usr/bin/env node
// Second browser test: opens every screen of the three apps and exercises the secondary actions
// (saved addresses, favourites, problem reports, shop rejects an order, custom product, CSV bulk
// upload, review replies, admin catalog/content/areas/customers/problems/orders/reports edits).
// Fails on any uncaught page error. Run after `pnpm e2e` or on a fresh seed:
//   pnpm e2e:prepare && pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist
//   node scripts/e2e/screens.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'test-results', 'screens');
const MOBILE = process.env.GG_MOBILE_URL ?? 'http://localhost:8081';
const ADMIN = process.env.GG_ADMIN_URL ?? 'http://localhost:4173';
mkdirSync(OUT, { recursive: true });

const CSV = join(OUT, 'bulk-test.csv');
writeFileSync(
  CSV,
  [
    'name,brand,model_number,category,condition,price,mrp,stock_qty,warranty_months',
    '"Apple iPhone 15 (128 GB, Black)",Apple,MTP03HN/A,smartphones,new,68900,79900,3,12',
    'Hikvision 2MP HD Dome Camera DS-2CE76D0T-ITPFS,Hikvision,DS-2CE76D0T-ITPFS,cctv-cameras,new,1150,,10,12',
    'Mystery Gadget Without Price,,,,new,,,,',
  ].join('\n'),
);

const results = [];
const pageErrors = [];
let failed = false;
const browser = await chromium.launch();
// Location is allowed and set to Kondapur, so "Use my current location" places the address pin.
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 17.4596, longitude: 78.3639 } };

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✔ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed = true;
    results.push(`✘ ${name}: ${e.message.split('\n')[0]}`);
    for (const [i, p] of browser.contexts().flatMap((c) => c.pages()).entries()) {
      await p.screenshot({ path: join(OUT, `FAILED-${i}.png`) }).catch(() => undefined);
    }
  }
  console.log(results.at(-1));
}

// Map tiles come from OpenStreetMap, which this machine may not reach; serve a plain stand-in tile instead.
const TILE = readFileSync(join(ROOT, 'scripts', 'e2e', 'fixtures', 'map-tile.png'));
async function mobilePage(label) {
  const ctx = await browser.newContext(phone);
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/png', body: TILE }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${label}: ${e.message}`));
  page.on('popup', (p) => p.close().catch(() => undefined));
  page.on('dialog', (d) => d.accept().catch(() => undefined));
  return page;
}
async function login(page, digits) {
  await page.goto(MOBILE);
  await page.getByTestId('phone-input').fill(digits);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456');
  await page.waitForURL(/\/(location|home|partner)/, { timeout: 20000 });
}
async function visit(page, path, name, waitFor) {
  await page.goto(`${MOBILE}${path}`);
  if (waitFor) await page.getByText(waitFor, { exact: false }).first().waitFor({ timeout: 15000 });
  else await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}
async function dismissAlerts(page) {
  const later = page.getByText('Later', { exact: true });
  await later.waitFor({ timeout: 4000 }).catch(() => undefined);
  for (let i = 0; i < 15 && (await later.isVisible()); i++) {
    await later.click();
    await page.waitForTimeout(300);
  }
}

let kphbOrderId = '';

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
const c = await mobilePage('customer');
await step('customer: login and home', async () => {
  await login(c, '9000000001');
  if (c.url().includes('/location')) await c.getByText('Flat 302, Sai Residency').click();
  await c.waitForURL('**/home', { timeout: 20000 });
  await c.getByText('Shops near you').waitFor();
});
await step('customer: search screen, trending and synonym search ("cc camera" → CCTV)', async () => {
  await visit(c, '/search', 'c-01-search-empty');
  await c.getByTestId('search-input').fill('cc camera');
  await c.keyboard.press('Enter');
  await c.locator('[data-testid^="product-"]').first().waitFor({ timeout: 15000 });
  const names = (await c.locator('[data-testid^="product-"]').allInnerTexts()).join(' ');
  if (!/camera|cctv|hikvision|cp plus|dahua/i.test(names)) throw new Error('synonym search found no CCTV products');
  await c.screenshot({ path: join(OUT, 'c-02-search-cc-camera.png') });
});
await step('customer: shops list, shop page, favourite, item page, add to cart', async () => {
  await visit(c, '/shops', 'c-03-shops', 'KPHB Computer World');
  await c.getByText('KPHB Computer World').first().click();
  await c.getByTestId('shop-name').waitFor({ timeout: 15000 });
  const fav = c.getByTestId('favourite-shop');
  await fav.click();
  await c.waitForTimeout(600);
  await c.screenshot({ path: join(OUT, 'c-04-shop.png') });
  await c.locator('[data-testid^="listing-"]').first().click();
  await c.getByTestId('add-to-cart').waitFor({ timeout: 15000 });
  await c.screenshot({ path: join(OUT, 'c-05-item.png') });
  await c.getByTestId('add-to-cart').click();
  const replace = c.getByText('Start new cart', { exact: true });
  if (await replace.waitFor({ timeout: 1500 }).then(() => true, () => false)) await replace.click();
  await c.waitForTimeout(1000);
});
await step('customer: order from KPHB on WhatsApp (shop will reject it)', async () => {
  await visit(c, '/cart', 'c-06-cart');
  await c.getByTestId('whatsapp-order').click();
  await c.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 20000 });
  kphbOrderId = c.url().match(/order\/([0-9a-f-]{36})/)[1];
  await c.getByTestId('order-map').waitFor({ timeout: 15000 });
});
await step('customer: orders (active and past), favourites, reviews, referral, notifications', async () => {
  await visit(c, '/orders', 'c-07-orders-active');
  await c.getByText('Past', { exact: true }).click();
  await c.waitForTimeout(1200);
  await c.screenshot({ path: join(OUT, 'c-08-orders-past.png') });
  await visit(c, '/favourites', 'c-09-favourites', 'Favourite shops');
  await visit(c, '/my-reviews', 'c-10-my-reviews');
  await visit(c, '/referral', 'c-11-referral');
  await visit(c, '/notifications', 'c-12-notifications');
});
await step('customer: add a saved address with an exact GPS pin', async () => {
  await visit(c, '/addresses', 'c-13-addresses');
  await c.goto(`${MOBILE}/address`);
  await c.getByTestId('map-picker').waitFor({ timeout: 15000 });
  // Saving without placing the pin is refused
  await c.getByTestId('addr-house').fill('Flat 101, Green Meadows');
  await c.getByTestId('save-address').click();
  await c.getByText('Place the pin on your building').waitFor({ timeout: 5000 });
  await c.getByTestId('addr-gps').click();
  await c.getByText('Exact location set').waitFor({ timeout: 15000 });
  await c.getByTestId('addr-area').click();
  await c.getByTestId('area-Kondapur').last().click();
  await c.screenshot({ path: join(OUT, 'c-14-address-form.png') });
  await c.getByTestId('save-address').click();
  await c.waitForTimeout(1500);
  await visit(c, '/addresses', 'c-15-addresses-after', 'Green Meadows');
});
await step('customer: report a problem on a delivered order', async () => {
  await c.goto(`${MOBILE}/orders`);
  await c.getByText('Past', { exact: true }).click();
  await c.waitForTimeout(1200);
  const delivered = c.locator('[data-testid^="order-GG"]').filter({ hasText: 'Delivered' }).first();
  await delivered.click();
  const report = c.getByText('Report a problem', { exact: true });
  await report.waitFor({ timeout: 10000 });
  await report.click();
  await c.getByTestId('issue-damaged').click();
  await c.locator('textarea').first().fill('The box was dented and one corner of the item is scratched.');
  await c.screenshot({ path: join(OUT, 'c-16-report.png') });
  await c.getByTestId('submit-report').click();
  await c.waitForTimeout(1500);
});
await step('customer: profile, settings (dark mode), help, terms, privacy', async () => {
  await visit(c, '/profile', 'c-17-profile');
  await visit(c, '/settings', 'c-18-settings');
  await c.getByTestId('theme-dark').click();
  await visit(c, '/home', 'c-19-home-dark', 'Shops near you');
  await c.goto(`${MOBILE}/settings`);
  await c.getByTestId('theme-system').click();
  await visit(c, '/help', 'c-20-help');
  await visit(c, '/legal?doc=terms', 'c-21-terms');
  await visit(c, '/legal?doc=privacy', 'c-22-privacy');
});
await step('customer: outside Hyderabad → "Notify me" waitlist', async () => {
  await visit(c, '/not-served', 'c-23-not-served');
  await c.getByTestId('notify-me').click();
  await c.waitForTimeout(1200);
  await c.screenshot({ path: join(OUT, 'c-24-not-served-sent.png') });
});

// ---------------------------------------------------------------------------
// Shop partner (KPHB Computer World)
// ---------------------------------------------------------------------------
const s = await mobilePage('partner');
await step('partner: login, dashboard, orders with filters', async () => {
  await login(s, '9000010002');
  await s.waitForURL('**/partner/**', { timeout: 20000 });
  await dismissAlerts(s);
  await s.screenshot({ path: join(OUT, 'p-01-dashboard.png') });
  await s.goto(`${MOBILE}/partner/orders`);
  await dismissAlerts(s);
  for (const f of ['new', 'delivered', 'all']) {
    const chip = s.getByTestId(`filter-${f}`);
    if (await chip.isVisible()) await chip.click();
    await s.waitForTimeout(500);
  }
  await s.screenshot({ path: join(OUT, 'p-02-orders.png') });
});
await step('partner: rejects the customer request (out of stock)', async () => {
  await s.goto(`${MOBILE}/partner/order/${kphbOrderId}`);
  await dismissAlerts(s);
  await s.getByTestId('customer-map').waitFor({ timeout: 15000 });
  await s.getByText('Reject', { exact: true }).first().click();
  await s.getByTestId('reject-order').click();
  await s.getByText('Rejected').first().waitFor({ timeout: 15000 });
  await s.screenshot({ path: join(OUT, 'p-03-rejected.png') });
});
await step('partner: custom product → price & stock → saved', async () => {
  await s.goto(`${MOBILE}/partner/product/add?q=Nothing Phone 3a`);
  await dismissAlerts(s);
  await s.getByText('Add a custom product').click();
  await s.getByTestId('custom-name').fill('Nothing Phone (3a) 8 GB 128 GB Black');
  await s.getByText('Mobiles', { exact: true }).first().click();
  await s.getByTestId('custom-cat-smartphones').click();
  await s.getByTestId('custom-next').click();
  await s.getByTestId('listing-price').fill('24999');
  await s.screenshot({ path: join(OUT, 'p-04-custom-price.png') });
  await s.getByTestId('save-product').click();
  await s.waitForTimeout(1500);
  await s.goto(`${MOBILE}/partner/products`);
  await s.getByTestId('search-input').or(s.getByPlaceholder('Search your products')).first().fill('Nothing Phone');
  await s.getByText('Nothing Phone (3a)', { exact: false }).first().waitFor({ timeout: 15000 });
  await s.screenshot({ path: join(OUT, 'p-05-products-custom.png') });
});
await step('partner: CSV bulk upload shows added/updated rows and the error row', async () => {
  await s.goto(`${MOBILE}/partner/product/bulk`);
  await dismissAlerts(s);
  const [chooser] = await Promise.all([s.waitForEvent('filechooser'), s.getByTestId('bulk-pick').click()]);
  await chooser.setFiles(CSV);
  await s.getByText('Price is missing', { exact: false }).first().waitFor({ timeout: 10000 });
  await s.getByTestId('bulk-upload').click();
  await s.getByTestId('bulk-result').waitFor({ timeout: 15000 });
  await s.screenshot({ path: join(OUT, 'p-06-bulk-result.png') });
});
await step('partner: reply to a review', async () => {
  await s.goto(`${MOBILE}/partner/reviews`);
  await dismissAlerts(s);
  const reply = s.locator('[data-testid^="reply-"]').first();
  if (await reply.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
    await reply.click();
    await s.getByTestId('reply-input').fill('Thank you for shopping with us! Visit again 🙏');
    await s.getByTestId('send-reply').click();
    await s.getByText('Your reply').first().waitFor({ timeout: 10000 });
  }
  await s.screenshot({ path: join(OUT, 'p-07-reviews.png') });
});
await step('partner: insights (month), QR page, more, status', async () => {
  await s.goto(`${MOBILE}/partner/insights`);
  await dismissAlerts(s);
  await s.getByText('Month', { exact: true }).click();
  await s.waitForTimeout(1500);
  await s.screenshot({ path: join(OUT, 'p-08-insights-month.png') });
  await s.goto(`${MOBILE}/partner/qr`);
  await s.getByTestId('shop-qr').waitFor();
  await s.goto(`${MOBILE}/partner/more`);
  await s.getByTestId('more-shop').waitFor();
  await s.goto(`${MOBILE}/partner/status`);
  await s.getByTestId('shop-status').waitFor();
  await s.screenshot({ path: join(OUT, 'p-09-status.png') });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const actx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const a = await actx.newPage();
a.on('pageerror', (e) => pageErrors.push(`admin: ${e.message}`));
a.on('dialog', (d) => d.accept().catch(() => undefined));
const ashot = (n) => a.screenshot({ path: join(OUT, `a-${n}.png`) });
await step('admin: login', async () => {
  await a.goto(`${ADMIN}/login`);
  await a.getByTestId('login-email').fill('admin@gadgetgalli.in');
  await a.getByTestId('login-password').fill('GadgetGalli@2026');
  await a.getByTestId('login-submit').click();
  await a.getByText('Orders today').waitFor({ timeout: 15000 });
});
await step('admin: catalog product edit, category edit, add brand, add synonym + live search', async () => {
  await a.goto(`${ADMIN}/catalog`);
  await a.getByText('Approved', { exact: true }).click();
  await a.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await a.getByText('Edit catalog product').waitFor();
  await ashot('01-catalog-edit');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByText('Product saved').waitFor({ timeout: 10000 });
  await a.goto(`${ADMIN}/catalog?tab=categories`);
  await a.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByText('Category saved').waitFor({ timeout: 10000 });
  await a.goto(`${ADMIN}/catalog?tab=brands`);
  await a.getByPlaceholder('New brand name').fill(`Test Brand ${Date.now().toString(36)}`);
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await a.getByText('Brand saved').waitFor({ timeout: 10000 });
  await a.goto(`${ADMIN}/catalog?tab=synonyms`);
  await a.getByPlaceholder('e.g. gpu, graphics card, video card').fill('ps5, playstation 5');
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await a.getByText('Synonyms added', { exact: false }).waitFor({ timeout: 10000 });
  await a.getByPlaceholder('e.g. cc camera, iphon 15, rtx4060').fill('iphon 15');
  await a.getByText('Apple iPhone 15', { exact: false }).first().waitFor({ timeout: 15000 });
  await ashot('02-synonyms');
});
await step('admin: content — new banner, featured shop, push campaign, referrals', async () => {
  await a.goto(`${ADMIN}/content`);
  await a.getByRole('button', { name: 'New banner' }).click();
  await a.getByPlaceholder('RTX 4060 in stock near you').fill('Diwali deals near you');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByText('Banner saved').waitFor({ timeout: 10000 });
  await ashot('03-banners');
  await a.goto(`${ADMIN}/content?tab=featured`);
  await a.locator('select').first().selectOption({ index: 1 });
  await a.getByText('Added to featured').waitFor({ timeout: 10000 });
  await a.goto(`${ADMIN}/content?tab=campaigns`);
  await a.getByPlaceholder('Diwali deals near you 🪔').fill('Diwali deals near you 🪔');
  await a.locator('textarea').first().fill('Phones, CCTV kits and GPUs from local shops, delivered today.');
  await a.getByRole('button', { name: 'Send now' }).click();
  await a.getByText(/Sent to \d+ people/).waitFor({ timeout: 10000 });
  await ashot('04-campaign');
  await a.goto(`${ADMIN}/content?tab=referrals`);
  await a.getByText('Joined with a code').waitFor();
});
await step('admin: areas — add an area; waitlist shows the notify-me request', async () => {
  await a.goto(`${ADMIN}/areas`);
  await a.getByRole('button', { name: 'New area' }).click();
  await a.getByPlaceholder('Kondapur').fill('Kokapet');
  await a.getByPlaceholder('500084').fill('500075');
  await a.locator('[role="dialog"] select').first().selectOption({ index: 1 });
  await a.getByPlaceholder('17.4613').fill('17.3950');
  await a.getByPlaceholder('78.3617').fill('78.3360');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByText('Area saved').waitFor({ timeout: 10000 });
  await a.goto(`${ADMIN}/areas?tab=waitlist`);
  await a.getByText('Notify-me requests', { exact: false }).waitFor();
  await ashot('05-waitlist');
});
await step('admin: customers — block and unblock', async () => {
  await a.goto(`${ADMIN}/customers`);
  await a.getByPlaceholder('Search by name or phone').fill('Meena');
  await a.getByRole('button', { name: 'Block', exact: true }).first().click();
  await a.getByText('Blocked', { exact: true }).first().waitFor({ timeout: 10000 });
  await a.getByRole('button', { name: 'Unblock', exact: true }).first().click();
  await a.getByText('Unblocked', { exact: true }).first().waitFor({ timeout: 10000 });
  await ashot('06-customers');
});
await step('admin: problems — note and resolve the new report', async () => {
  await a.goto(`${ADMIN}/problems`);
  await a.locator('tbody tr').first().click();
  await a.getByText('What the customer said').waitFor();
  await a.getByPlaceholder(/Called the shop/).fill('Called the shop: they will replace the item tomorrow.');
  await a.getByRole('button', { name: 'Add note' }).click();
  await a.getByText('Note added').waitFor({ timeout: 10000 });
  await a.getByPlaceholder(/The shop replaced/).fill('The shop replaced the item. Sorry for the trouble!');
  await a.getByRole('button', { name: 'Mark resolved' }).click();
  await a.getByText('Resolved. The customer was notified.').waitFor({ timeout: 10000 });
  await ashot('07-problem-resolved');
});
await step('admin: orders — stuck filter, change a status with a note', async () => {
  await a.goto(`${ADMIN}/orders?stuck=1`);
  await a.locator('tbody tr').first().click();
  await a.getByText('Timeline').waitFor();
  await a.getByRole('button', { name: 'Change status' }).click();
  await a.locator('[role="dialog"] select').selectOption('CANCELLED');
  await a.locator('[role="dialog"] textarea').fill('Customer asked on call to cancel; shop agreed.');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByText('Status changed', { exact: false }).waitFor({ timeout: 10000 });
  await ashot('08-order-status');
});
await step('admin: reports (7 days) and CSV export', async () => {
  await a.goto(`${ADMIN}/reports`);
  await a.getByRole('button', { name: '7 days' }).click();
  await a.getByText('recruit shops for these').waitFor();
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'CSV' }).first().click()]);
  if (!download.suggestedFilename().endsWith('.csv')) throw new Error('no CSV download');
  await ashot('09-reports');
});
await step('admin: shop page — verified badge toggle and notes', async () => {
  await a.goto(`${ADMIN}/shops?status=approved`);
  await a.getByText('KPHB Computer World').first().click();
  await a.getByText('Trust badges').waitFor();
  await a.getByRole('switch').first().click();
  await a.getByText(/Verified badge (added|removed)/).waitFor({ timeout: 10000 });
  await a.getByRole('switch').first().click();
  await a.getByPlaceholder(/Visit notes/).fill('Visited on launch week. Strong GPU stock, owner very responsive.');
  await a.getByRole('button', { name: 'Save notes' }).click();
  await a.getByText('Notes saved').waitFor({ timeout: 10000 });
  await ashot('10-shop-notes');
});

await browser.close();
console.log(`\n${results.length} steps, ${failed ? 'FAILED' : 'all passed'}. Screenshots: ${OUT}`);
if (pageErrors.length) {
  console.log('Uncaught page errors:');
  for (const e of pageErrors) console.log(`  ${e}`);
}
process.exit(failed || pageErrors.length ? 1 : 0);
