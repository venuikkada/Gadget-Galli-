#!/usr/bin/env node
// Checks the website packages from `pnpm deploy:hostinger` before you upload them. It serves the customer,
// Shop Partner and admin sites on three local ports, with the same rewrite rule as their .htaccess, points
// their config.js at the local dev stack, and checks each site in a browser (Playwright).
//
//   pnpm deploy:hostinger
//   pnpm dev-stack:reset && pnpm dev-stack       # in another terminal; fresh demo data
//   pnpm deploy:check
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ANON_KEY } from '../dev-stack/jwt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = join(ROOT, 'deploy', 'hostinger');
const API = process.env.GG_API_URL ?? 'http://localhost:54321';
const PORTS = { customer: 8091, partner: 8092, admin: 8093 };
const URLS = Object.fromEntries(Object.entries(PORTS).map(([k, p]) => [k, `http://localhost:${p}`]));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

if (!existsSync(join(PKG, 'customer', 'index.html'))) {
  console.error('No packages found. Run pnpm deploy:hostinger first.');
  process.exit(1);
}

// Copies of the sites with config.js pointing at the dev stack (the packages themselves stay untouched).
const work = mkdtempSync(join(tmpdir(), 'gg-sites-'));
const servers = [];
for (const [name, port] of Object.entries(PORTS)) {
  const dir = join(work, name);
  cpSync(join(PKG, name), dir, { recursive: true });
  const app = name === 'admin' ? '' : `app: '${name}', demo: true,`;
  writeFileSync(
    join(dir, 'config.js'),
    `window.GG_CONFIG = { supabaseUrl: '${API}', supabaseAnonKey: '${ANON_KEY}', customerAppUrl: '${URLS.customer}', partnerAppUrl: '${URLS.partner}', adminUrl: '${URLS.admin}', ${app} };\n`,
  );
  const server = createServer((req, res) => {
    // Same rule as .htaccess: real files as they are, every other address gets index.html.
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((ok) => server.listen(port, ok));
  servers.push(server);
}

const results = [];
let failed = false;
async function check(name, fn) {
  try {
    await fn();
    results.push(`✔ ${name}`);
  } catch (e) {
    failed = true;
    results.push(`✘ ${name}: ${e.message.split('\n')[0]}`);
  }
  console.log(results.at(-1));
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const pageErrors = [];
async function newPage(label, options = phone) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${label}: ${e.message}`));
  return page;
}
async function login(page, base, digits) {
  await page.goto(base);
  await page.getByTestId('phone-input').fill(digits);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456');
}
async function dismissAlerts(page) {
  const later = page.getByText('Later', { exact: true });
  for (let i = 0; i < 10 && (await later.isVisible()); i++) {
    await later.click();
    await page.waitForTimeout(300);
  }
}
/** Clicks something that opens another website and returns that website's address. */
async function opensSite(page, testId) {
  const [other] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId(testId).click()]);
  const url = other.url();
  await other.close();
  return url;
}

let productPath = '';
try {
  const c = await newPage('customer');
  await check('customer site: own title and customer demo number, no Partner branding', async () => {
    await c.goto(URLS.customer);
    await c.getByTestId('demo-hint').waitFor({ timeout: 20000 });
    expect((await c.title()) === 'Gadget Galli', `title is "${await c.title()}"`);
    expect((await c.getByTestId('demo-hint').innerText()).includes('+91 90000 00001'), 'customer demo number missing');
    expect(!(await c.getByText('Gadget Galli Partner').isVisible()), 'Partner branding on the customer site');
  });
  await check('customer site: log in, search and open a product; the product address works on reload', async () => {
    await login(c, URLS.customer, '9000000001');
    await c.waitForURL(/\/(location|home)/, { timeout: 20000 });
    if (c.url().includes('/location')) await c.getByText('Flat 302, Sai Residency').click();
    await c.getByText('Shops near you').waitFor({ timeout: 20000 });
    await c.goto(`${URLS.customer}/search`);
    await c.getByTestId('search-input').fill('iphone 15');
    await c.keyboard.press('Enter');
    await c.getByText('Apple iPhone 15 (128 GB, Black)').first().click();
    await c.getByTestId('product-title').waitFor({ timeout: 15000 });
    productPath = new URL(c.url()).pathname;
    await c.reload();
    await c.getByTestId('product-title').waitFor({ timeout: 15000 });
  });
  await check('customer site: "Switch to Shop Partner" opens the Partner website', async () => {
    await c.goto(`${URLS.customer}/profile`);
    const url = await opensSite(c, 'switch-to-shop');
    expect(url.startsWith(URLS.partner), `opened ${url}`);
  });
  await check('customer site: Shop Partner pages are not served here', async () => {
    await c.goto(`${URLS.customer}/partner/dashboard`);
    await c.waitForURL(/\/home/, { timeout: 15000 });
  });

  const p = await newPage('partner');
  await check('partner site: Partner title, shop demo number', async () => {
    await p.goto(URLS.partner);
    await p.getByTestId('demo-hint').waitFor({ timeout: 20000 });
    expect((await p.title()) === 'Gadget Galli Partner', `title is "${await p.title()}"`);
    await p.getByText('Gadget Galli Partner').first().waitFor();
    expect((await p.getByTestId('demo-hint').innerText()).includes('+91 90000 10002'), 'shop demo number missing');
  });
  await check('partner site: shop owner lands on the dashboard; customer pages redirect to it', async () => {
    await login(p, URLS.partner, '9000010002');
    await p.waitForURL(/\/partner/, { timeout: 20000 });
    await dismissAlerts(p);
    await p.getByText('KPHB Computer World').first().waitFor({ timeout: 15000 });
    await p.goto(`${URLS.partner}/home`);
    await p.waitForURL(/\/partner/, { timeout: 15000 });
  });
  await check('partner site: "Switch to buying" opens the customer website', async () => {
    await p.goto(`${URLS.partner}/partner/more`);
    await dismissAlerts(p);
    const url = await opensSite(p, 'switch-to-buying');
    expect(url.startsWith(URLS.customer), `opened ${url}`);
  });
  await check('partner site: a new number skips the buy/sell question and goes to shop registration', async () => {
    const n = await newPage('partner-new');
    await login(n, URLS.partner, '9000018888');
    await n.waitForURL(/\/onboarding/, { timeout: 20000 });
    await n.getByTestId('name-input').waitFor();
    expect(!(await n.getByTestId('role-customer').isVisible()), 'role question shown on the partner site');
    await n.getByTestId('name-input').fill('Test Owner');
    await n.getByTestId('onboarding-continue').click();
    await n.waitForURL(/\/partner\/register/, { timeout: 20000 });
  });

  const a = await newPage('admin', { viewport: { width: 1280, height: 860 } });
  await check('admin site: logs in with the server from config.js; deep links work on reload', async () => {
    await a.goto(`${URLS.admin}/login`);
    await a.getByTestId('login-email').fill('admin@gadgetgalli.in');
    await a.getByTestId('login-password').fill('GadgetGalli@2026');
    await a.getByTestId('login-submit').click();
    await a.getByText('Orders today').waitFor({ timeout: 20000 });
    await a.goto(`${URLS.admin}/orders`);
    await a.reload();
    await a.getByText('Stuck only').waitFor({ timeout: 15000 });
  });
  await check('admin site: share page offers "Open in your browser" on the customer website', async () => {
    const id = productPath.split('/').pop();
    expect(id, 'no product id from the customer check');
    const s = await newPage('share');
    await s.goto(`${URLS.admin}/s/product/${id}`);
    await s.getByTestId('open-web').waitFor({ timeout: 15000 });
    const href = await s.getByTestId('open-web').getAttribute('href');
    expect(href === `${URLS.customer}/product/${id}`, `link is ${href}`);
  });
} finally {
  await browser.close();
  for (const s of servers) s.close();
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${results.length} checks, ${failed ? 'FAILED' : 'all passed'}.`);
if (pageErrors.length) console.log(`Uncaught page errors:\n  ${pageErrors.join('\n  ')}`);
process.exit(failed || pageErrors.length ? 1 : 0);
