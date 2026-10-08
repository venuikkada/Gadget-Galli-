#!/usr/bin/env node
// End-to-end smoke test of the whole marketplace in a real browser (Chromium via Playwright):
// customer orders an RTX 4060 near Kukatpally on WhatsApp → shop accepts, records UPI payment
// (with a proof photo), packs and sends it with Rapido → customer confirms delivery and rates →
// admin sees the delivered order, approves the pending shop and the pending custom product.
//
// Needs the local dev stack with both apps served:
//   pnpm e2e:prepare                      # builds admin + mobile web against the dev stack
//   pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist
//   pnpm e2e                              # this script
// Screenshots go to test-results/smoke/. Run on a fresh seed (delete scripts/dev-stack/.data to reset).
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'test-results', 'smoke');
const MOBILE = process.env.GG_MOBILE_URL ?? 'http://localhost:8081';
const ADMIN = process.env.GG_ADMIN_URL ?? 'http://localhost:4173';
const PHOTO = join(ROOT, 'apps', 'mobile', 'assets', 'images', 'icon.png');
mkdirSync(OUT, { recursive: true });

const results = [];
let failed = false;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✔ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(results.at(-1));
  } catch (e) {
    failed = true;
    results.push(`✘ ${name}: ${e.message.split('\n')[0]}`);
    console.log(results.at(-1));
    // Screenshot every open page to see where it stopped
    for (const [i, p] of browser.contexts().flatMap((c) => c.pages()).entries()) {
      await p.screenshot({ path: join(OUT, `FAILED-${i}.png`) }).catch(() => undefined);
      console.log(`   page ${i}: ${p.url()}`);
    }
    throw e;
  }
}

const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const pageErrors = [];

async function newMobilePage(label) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${label}: ${e.message}`));
  // WhatsApp / tel: links open popups or external handlers; close them so the app carries on.
  page.on('popup', (p) => p.close().catch(() => undefined));
  return page;
}

async function phoneLogin(page, digits) {
  await page.goto(MOBILE);
  await page.getByTestId('phone-input').fill(digits);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456'); // auto-submits at 6 digits
}

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

/** Adds a photo through PhotoPicker (Add photo → Gallery → file chooser). */
async function addPhoto(page, nth = 0) {
  await page.getByTestId('add-photo').nth(nth).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Gallery', { exact: true }).click()]);
  await chooser.setFiles(PHOTO);
  await page.waitForFunction(() => !document.body.innerText.includes('Uploading'), null, { timeout: 20000 });
}

let orderId = '';
let orderNo = '';

try {
  // -------------------------------------------------------------------------
  // Customer: search → compare → cart → order on WhatsApp
  // -------------------------------------------------------------------------
  const customer = await newMobilePage('customer');
  await step('customer logs in with phone OTP', async () => {
    await phoneLogin(customer, '9000000001');
    await customer.waitForURL(/\/(location|home)/, { timeout: 20000 });
    if (customer.url().includes('/location')) await customer.getByText('Flat 302, Sai Residency').click();
    await customer.waitForURL('**/home', { timeout: 20000 });
    await customer.getByText('Shops near you').waitFor();
    await shot(customer, '01-customer-home');
  });

  await step('typo-tolerant search finds RTX 4060 cards that deliver to Kukatpally', async () => {
    await customer.goto(`${MOBILE}/search`);
    await customer.getByTestId('search-input').fill('rtx4060');
    await customer.keyboard.press('Enter');
    await customer.locator('[data-testid^="product-"]').first().waitFor({ timeout: 15000 });
    const names = await customer.locator('[data-testid^="product-"]').allInnerTexts();
    if (!names.some((n) => /RTX 4060/i.test(n))) throw new Error('no RTX 4060 in results');
    await shot(customer, '02-search-rtx4060');
  });

  await step('product page compares shops and adds to cart', async () => {
    await customer.getByText('ASUS Dual GeForce RTX 4060 OC Edition 8GB').first().click();
    await customer.getByTestId('product-title').waitFor();
    await customer.getByText('Available at these shops').waitFor();
    await shot(customer, '03-product');
    await customer.getByText('Add', { exact: true }).first().click();
    // A cart from another shop asks before replacing it
    const replace = customer.getByText('Start new cart', { exact: true });
    if (await replace.waitFor({ timeout: 1500 }).then(() => true, () => false)) await replace.click();
    await customer.waitForTimeout(1200);
  });

  await step('cart shows totals and orders on WhatsApp', async () => {
    await customer.goto(`${MOBILE}/cart`);
    await customer.getByTestId('grand-total').waitFor({ timeout: 15000 });
    await shot(customer, '04-cart');
    await customer.getByTestId('whatsapp-order').click();
    await customer.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 20000 });
    orderId = customer.url().match(/order\/([0-9a-f-]{36})/)[1];
    await customer.getByText('Requested').first().waitFor();
    orderNo = (await customer.getByText(/GG-\d{2}-\d{6}/).first().innerText()).match(/GG-\d{2}-\d{6}/)[0];
    await shot(customer, '05-order-requested');
  });

  // -------------------------------------------------------------------------
  // Shop owner: accept → payment received (+proof) → packed → send with Rapido
  // -------------------------------------------------------------------------
  const shop = await newMobilePage('shop');
  await step('shop owner logs in and sees the new order', async () => {
    await phoneLogin(shop, '9000010004'); // Cyber Zone Systems
    await shop.waitForURL(/\/partner/, { timeout: 20000 });
    // The loud new-order alert pops up for every waiting request; dismiss them all.
    const later = shop.getByText('Later', { exact: true });
    if (await later.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await shot(shop, '06-shop-new-order-alert');
      for (let i = 0; i < 10 && (await later.isVisible()); i++) {
        await later.click();
        await shop.waitForTimeout(400);
      }
    }
    await shop.goto(`${MOBILE}/partner/order/${orderId}`);
    await shop.getByText(orderNo).first().waitFor({ timeout: 15000 });
    await shot(shop, '07-shop-order');
  });

  await step('shop accepts the order', async () => {
    await shop.getByTestId('step-accept').click();
    await shop.getByTestId('confirm-order').click();
    await shop.getByTestId('step-paid').waitFor({ timeout: 15000 });
  });

  await step('shop records UPI payment with a proof photo', async () => {
    await shop.getByTestId('step-paid').click();
    await addPhoto(shop, 0);
    await shot(shop, '08-shop-payment-sheet');
    await shop.getByTestId('mark-paid').click();
    await shop.getByTestId('step-packed').waitFor({ timeout: 15000 });
  });

  await step('shop marks packed and sends with Rapido', async () => {
    await shop.getByTestId('step-packed').click();
    await shop.getByTestId('mark-packed').click();
    await shop.getByTestId('step-send').waitFor({ timeout: 15000 });
    await shop.getByTestId('step-send').click();
    await shop.getByTestId('service-rapido').click();
    await shop.getByTestId('rider-name').fill('Ramesh');
    await shot(shop, '09-shop-dispatch-sheet');
    await shop.getByTestId('dispatch-order').click();
    await shop.getByText('Dispatched').first().waitFor({ timeout: 15000 });
    await shot(shop, '10-shop-dispatched');
  });

  // -------------------------------------------------------------------------
  // Customer: live status → "I received my order" → review
  // -------------------------------------------------------------------------
  await step('customer sees it dispatched and confirms delivery', async () => {
    await customer.goto(`${MOBILE}/order/${orderId}`);
    await customer.getByText('Rapido').first().waitFor({ timeout: 15000 });
    await shot(customer, '11-customer-dispatched');
    await customer.getByTestId('received').click();
    await customer.getByText('Yes, received', { exact: true }).click();
    await customer.getByTestId('rate-order').waitFor({ timeout: 15000 });
    await shot(customer, '12-customer-delivered');
  });

  await step('customer rates the shop', async () => {
    await customer.getByTestId('rate-order').click();
    await customer.getByLabel('5 stars').click();
    await customer.locator('textarea').first().fill('Genuine card with bill, delivered in 2 hours. Good price.');
    await customer.getByText('Submit review', { exact: true }).click();
    await customer.waitForTimeout(1500);
    await shot(customer, '13-customer-reviewed');
  });

  // -------------------------------------------------------------------------
  // Admin: order is delivered, approve the pending shop and custom product
  // -------------------------------------------------------------------------
  const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const admin = await adminCtx.newPage();
  admin.on('pageerror', (e) => pageErrors.push(`admin: ${e.message}`));
  await step('admin logs in and sees the delivered order with its timeline', async () => {
    await admin.goto(`${ADMIN}/login`);
    await admin.getByTestId('login-email').fill('admin@gadgetgalli.in');
    await admin.getByTestId('login-password').fill('GadgetGalli@2026');
    await admin.getByTestId('login-submit').click();
    await admin.getByText('Orders today').waitFor({ timeout: 15000 });
    await shot(admin, '14-admin-dashboard');
    await admin.goto(`${ADMIN}/orders/${orderId}`);
    await admin.getByText('Timeline').waitFor();
    await admin.getByText('Delivered').first().waitFor();
    await shot(admin, '15-admin-order');
  });

  await step('admin approves the shop waiting for review', async () => {
    await admin.goto(`${ADMIN}/shops?status=under_review`);
    const row = admin.getByText('Sai Ganesh Electronics');
    if (await row.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await row.click();
      await admin.getByTestId('approve-shop').click();
      await admin.getByText('Shop approved').waitFor({ timeout: 10000 });
      await admin.getByText('Live', { exact: true }).first().waitFor();
    }
    await shot(admin, '16-admin-shop-approved');
  });

  await step('admin approves the pending custom product', async () => {
    await admin.goto(`${ADMIN}/catalog`);
    const approve = admin.getByRole('button', { name: 'Approve', exact: true }).first();
    if (await approve.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await approve.click();
      await admin.getByText('Approved. The shop was notified.').waitFor({ timeout: 10000 });
    }
    await shot(admin, '17-admin-catalog');
  });

  await step('public share page for the shop opens without login', async () => {
    const anon = await (await browser.newContext(phone)).newPage();
    await anon.goto(`${ADMIN}/s/product/33333333-0000-4000-8000-00000000006d`);
    await anon.getByTestId('open-app').waitFor({ timeout: 15000 });
    await shot(anon, '18-share-page');
  });
} catch {
  // reported below
} finally {
  await browser.close();
  console.log(`\n${results.length} steps, ${failed ? 'FAILED' : 'all passed'}. Screenshots: ${OUT}`);
  if (pageErrors.length) {
    console.log('Uncaught page errors:');
    for (const e of pageErrors) console.log(`  ${e}`);
  }
  process.exit(failed || pageErrors.length ? 1 : 0);
}
