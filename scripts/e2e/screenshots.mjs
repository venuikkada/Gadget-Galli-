#!/usr/bin/env node
// Captures a curated set of screenshots of all three apps, for previews, pitching shops and marketing:
// one order from search to review (customer and shop screens in turn), then a tour of the customer app,
// the Shop Partner app and the admin panel. Writes JPEGs, manifest.json and a gallery page (index.html)
// to test-results/screenshots/.
//
// Needs the local dev stack with both apps served, on fresh demo data:
//   GG_SHARE_BASE_URL=https://gadgetgalli.in pnpm e2e:prepare   # builds both apps; share links show the real domain
//   pnpm dev-stack:reset && pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist
//   pnpm screenshots
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'test-results', 'screenshots');
const MOBILE = process.env.GG_MOBILE_URL ?? 'http://localhost:8081';
const ADMIN = process.env.GG_ADMIN_URL ?? 'http://localhost:4173';
const PHOTO = join(ROOT, 'apps', 'mobile', 'assets', 'images', 'icon.png');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// The story: Ravi (Kukatpally) orders an iPhone 15 from Miyapur Mobile Bazaar.
const PRODUCT = 'Apple iPhone 15 (128 GB, Black)';
const SHOP = 'Miyapur Mobile Bazaar';
const SHOP_PHONE = '9000010006';

const shots = [];
const problems = [];

/** Runs one step; a failure is logged with a screenshot and the capture carries on. */
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${e.message.split('\n')[0]}`);
    console.log(`✘ ${name}: ${e.message.split('\n')[0]}`);
    for (const [i, p] of browser.contexts().flatMap((c) => c.pages()).entries()) {
      await p.screenshot({ path: join(OUT, `FAILED-${shots.length}-${i}.png`) }).catch(() => undefined);
    }
  }
}

/** Saves a screenshot and its caption for the gallery. */
async function shot(page, section, file, title, caption, who) {
  await page.mouse.move(1, 1).catch(() => undefined); // no hover tooltips
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${file}.jpg`), type: 'jpeg', quality: 82 });
  const { width, height } = page.viewportSize();
  shots.push({ section, file: `${file}.jpg`, title, caption, who, width, height });
  console.log(`✔ ${file}`);
}

const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const india = { locale: 'en-IN', timezoneId: 'Asia/Kolkata' };
const phone = { ...india, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function newPhonePage() {
  const page = await (await browser.newContext(phone)).newPage();
  // WhatsApp / tel: / UPI links open popups or external handlers; close them so the app carries on.
  page.on('popup', (p) => p.close().catch(() => undefined));
  return page;
}

async function phoneLogin(page, digits) {
  await page.goto(MOBILE);
  await page.getByTestId('phone-input').fill(digits);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456'); // auto-submits at 6 digits
}

async function visit(page, path, waitForText) {
  await page.goto(`${MOBILE}${path}`);
  if (waitForText) await page.getByText(waitForText, { exact: false }).first().waitFor({ timeout: 15000 });
}

/** Dismisses the shop's loud new-order alerts ("Later"). */
async function dismissAlerts(page) {
  const later = page.getByText('Later', { exact: true });
  for (let i = 0; i < 10 && (await later.isVisible()); i++) {
    await later.click();
    await page.waitForTimeout(300);
  }
}

async function addPhoto(page, nth = 0) {
  await page.getByTestId('add-photo').nth(nth).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Gallery', { exact: true }).click()]);
  await chooser.setFiles(PHOTO);
  await page.waitForFunction(() => !document.body.innerText.includes('Uploading'), null, { timeout: 20000 });
}

/** Scrolls an element to the top of its scroll container. */
const scrollToTop = (locator) => locator.evaluate((el) => el.scrollIntoView({ block: 'start' }));

let orderId = '';
let orderNo = '';
let productId = '';

const customer = await newPhonePage();
const shop = await newPhonePage();

// ---------------------------------------------------------------------------
// One order, start to finish
// ---------------------------------------------------------------------------
await step('customer login', async () => {
  await customer.goto(MOBILE);
  await customer.getByTestId('phone-input').waitFor({ timeout: 20000 });
  await shot(customer, 'customer', 'c-login', 'Log in with a phone number', 'Customers and shop owners log in with their mobile number and a one-time SMS code.');
  await phoneLogin(customer, '9000000001');
  await customer.waitForURL(/\/(location|home)/, { timeout: 20000 });
  if (customer.url().includes('/location')) await customer.getByText('Flat 302, Sai Residency').click();
  await customer.waitForURL('**/home', { timeout: 20000 });
  await customer.getByText('Shops near you').waitFor();
  await shot(customer, 'order', 'o-01-home', 'Home', 'Ravi opens the app at home in Kukatpally. He sees offers, categories and the shops that deliver to him.', 'Customer');
});

await step('search with a typo', async () => {
  await visit(customer, '/search');
  await customer.getByTestId('search-input').fill('iphon 15');
  await customer.keyboard.press('Enter');
  await customer.getByText(PRODUCT).first().waitFor({ timeout: 15000 });
  await shot(customer, 'order', 'o-02-search', 'Search that forgives typos', 'He types “iphon 15”. The app still finds the iPhone 15 and shows only shops that deliver to his area.', 'Customer');
});

await step('compare shops', async () => {
  await customer.getByText(PRODUCT).first().click();
  await customer.getByTestId('product-title').waitFor({ timeout: 15000 });
  productId = customer.url().match(/product\/([0-9a-f-]{36})/)?.[1] ?? '';
  await customer.locator('[data-testid^="offer-"]').filter({ hasText: SHOP }).waitFor();
  await scrollToTop(customer.getByText('Available at these shops').first());
  await shot(customer, 'order', 'o-03-compare', 'Compare nearby shops', `Three nearby shops have it in stock. He compares price, distance, delivery time and rating, and adds it from ${SHOP}, 3.8 km away.`, 'Customer');
  await customer.locator('[data-testid^="offer-"]').filter({ hasText: SHOP }).getByText('Add', { exact: true }).click();
  const replace = customer.getByText('Start new cart', { exact: true });
  if (await replace.waitFor({ timeout: 1500 }).then(() => true, () => false)) await replace.click();
  await customer.waitForTimeout(1200);
});

await step('cart and WhatsApp order', async () => {
  await visit(customer, '/cart');
  await customer.getByTestId('grand-total').waitFor({ timeout: 15000 });
  await shot(customer, 'order', 'o-04-cart', 'One-shop cart', 'He sees the delivery charge and the total, then orders with one of two big buttons: call the shop or WhatsApp it.', 'Customer');
  await customer.getByTestId('whatsapp-order').click();
  await customer.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 20000 });
  orderId = customer.url().match(/order\/([0-9a-f-]{36})/)[1];
  await customer.getByText('Requested').first().waitFor();
  orderNo = (await customer.getByText(/GG-\d{2}-\d{6}/).first().innerText()).match(/GG-\d{2}-\d{6}/)[0];
  await shot(customer, 'order', 'o-05-requested', 'Order requested', 'Tapping WhatsApp creates the order and opens a WhatsApp message to the shop with the order number, items, total and address.', 'Customer');
});

await step('shop gets the alarm', async () => {
  await phoneLogin(shop, SHOP_PHONE);
  await shop.waitForURL(/\/partner/, { timeout: 20000 });
  const later = shop.getByText('Later', { exact: true });
  await later.waitFor({ timeout: 10000 });
  await shot(shop, 'order', 'o-06-alarm', 'New-order alarm', 'The shop owner’s phone rings loudly with a full-screen alert, so no order is missed.', 'Shop');
  await dismissAlerts(shop);
});

await step('shop opens and accepts the order', async () => {
  await visit(shop, `/partner/order/${orderId}`, orderNo);
  await dismissAlerts(shop);
  await shot(shop, 'order', 'o-07-shop-order', 'Order details', 'The owner sees the items, the customer, the address and the distance, with one big button for the next step.', 'Shop');
  await shop.getByTestId('step-accept').click();
  await shop.getByTestId('confirm-order').waitFor();
  await shot(shop, 'order', 'o-08-accept', 'Accept the order', 'He accepts it. If they agreed a different price on the call, he can change the price or quantity first.', 'Shop');
  await shop.getByTestId('confirm-order').click();
  await shop.getByTestId('step-paid').waitFor({ timeout: 15000 });
});

await step('customer pays by UPI', async () => {
  await visit(customer, `/order/${orderId}`);
  await customer.getByTestId('pay-upi').waitFor({ timeout: 15000 });
  await shot(customer, 'order', 'o-09-pay', 'Pay the shop by UPI', 'Ravi pays the shop directly: one tap opens any UPI app, or he scans the shop’s QR code. Gadget Galli never holds the money.', 'Customer');
});

await step('shop records payment and sends the order', async () => {
  await dismissAlerts(shop);
  await shop.getByTestId('step-paid').click();
  await addPhoto(shop, 0);
  await shot(shop, 'order', 'o-10-paid', 'Payment received', 'The owner marks the payment as received (UPI, bank transfer or cash) and attaches the payment screenshot.', 'Shop');
  await shop.getByTestId('mark-paid').click();
  await shop.getByTestId('step-packed').waitFor({ timeout: 15000 });
  await dismissAlerts(shop);
  await shop.getByTestId('step-packed').click();
  await shop.getByTestId('mark-packed').click();
  await shop.getByTestId('step-send').waitFor({ timeout: 15000 });
  await shop.getByTestId('step-send').click();
  await shop.getByTestId('service-rapido').click();
  await shop.getByTestId('rider-name').fill('Ramesh');
  await shot(shop, 'order', 'o-11-send', 'Send it', 'He packs the phone and sends it with Porter, Rapido, Uber or his own rider. The app opens those apps for him.', 'Shop');
  await shop.getByTestId('dispatch-order').click();
  await shop.getByText('Dispatched').first().waitFor({ timeout: 15000 });
});

await step('customer receives and reviews', async () => {
  await visit(customer, `/order/${orderId}`, 'Rapido');
  await shot(customer, 'order', 'o-12-on-the-way', 'On the way', 'Ravi sees the rider’s details and the full timeline of his order.', 'Customer');
  await customer.getByTestId('received').click();
  await customer.getByText('Yes, received', { exact: true }).click();
  await customer.getByTestId('rate-order').waitFor({ timeout: 15000 });
  await shot(customer, 'order', 'o-13-delivered', 'Delivered', 'When the phone arrives, he taps “I received my order”.', 'Customer');
  await customer.getByTestId('rate-order').click();
  await customer.getByLabel('5 stars').click();
  await customer.locator('textarea').first().fill('Sealed box with GST bill, delivered in about an hour. Good price.');
  await shot(customer, 'order', 'o-14-review', 'Rate the shop', 'Then he rates the shop. Only customers with delivered orders can review, so ratings are real.', 'Customer');
  await customer.getByText('Submit review', { exact: true }).click();
  await customer.waitForTimeout(1500);
});

// ---------------------------------------------------------------------------
// Customer app tour
// ---------------------------------------------------------------------------
await step('customer tour', async () => {
  await visit(customer, '/shops', 'KPHB Computer World');
  await shot(customer, 'customer', 'c-shops', 'Shops near you', 'Every shop that delivers to the customer, with distance, rating and usual delivery time.');
  await customer.getByText('KPHB Computer World').first().click();
  await customer.getByTestId('shop-name').waitFor({ timeout: 15000 });
  await shot(customer, 'customer', 'c-shop', 'Shop page', 'Verified badge, photos, opening hours, directions, search inside the shop and real reviews.');
  await visit(customer, '/search');
  await customer.getByTestId('search-input').fill('laptop');
  await customer.keyboard.press('Enter');
  await customer.locator('[data-testid^="product-"]').first().waitFor({ timeout: 15000 });
  await customer.getByTestId('open-filters').click();
  await customer.getByText('Condition', { exact: false }).first().waitFor();
  await shot(customer, 'customer', 'c-filters', 'Filters', 'Filter by category, brand, price, condition, delivery time and rating; sort by price, distance or speed.');
  await visit(customer, '/orders', 'Past');
  const anyOrder = customer.getByText(/GG-\d{2}-\d{6}/).first();
  if (!(await anyOrder.waitFor({ timeout: 4000 }).then(() => true, () => false))) await customer.getByText('Past', { exact: true }).click();
  await anyOrder.waitFor({ timeout: 10000 });
  await shot(customer, 'customer', 'c-orders', 'My orders', 'Active and past orders, each with a live status.');
  await visit(customer, '/profile', 'Ravi');
  await shot(customer, 'customer', 'c-profile', 'Profile', 'Addresses, favourite shops, reviews, invite friends, language, help and account settings.');
  await visit(customer, '/settings');
  await customer.getByTestId('lang-te').click();
  await visit(customer, '/home', 'హోమ్');
  await shot(customer, 'customer', 'c-telugu', 'Telugu and Hindi', 'Every screen is available in English, Telugu and Hindi.');
  await visit(customer, '/settings');
  await customer.getByTestId('lang-en').click();
  await customer.getByTestId('theme-dark').click();
  await visit(customer, '/home', 'Shops near you');
  await shot(customer, 'customer', 'c-dark', 'Dark mode', 'Light and dark themes, following the phone’s setting by default.');
  await visit(customer, '/settings');
  await customer.getByTestId('theme-system').click();
  await visit(customer, '/not-served');
  await customer.getByTestId('notify-me').waitFor();
  await shot(customer, 'customer', 'c-not-served', 'Hyderabad only, for now', 'People outside Hyderabad can join a waitlist, which helps choose the next city.');
});

await step('share page', async () => {
  const anon = await newPhonePage();
  await anon.goto(`${ADMIN}/s/product/${productId}`);
  await anon.getByTestId('open-app').waitFor({ timeout: 15000 });
  await shot(anon, 'customer', 'c-share', 'Shared links', 'A product shared on WhatsApp opens this page, which opens the app or the Play Store.');
});

// ---------------------------------------------------------------------------
// Shop Partner app tour
// ---------------------------------------------------------------------------
await step('shop tour', async () => {
  await visit(shop, '/partner');
  await dismissAlerts(shop);
  await shop.getByText('Today', { exact: true }).first().waitFor({ timeout: 15000 });
  await shot(shop, 'partner', 'p-dashboard', 'Dashboard', 'Open/Closed switch, today’s requests, sales, shop views, and call and WhatsApp taps.');
  await visit(shop, '/partner/orders');
  await dismissAlerts(shop);
  await shop.getByText(/GG-\d{2}-\d{6}/).first().waitFor({ timeout: 15000 });
  await shot(shop, 'partner', 'p-orders', 'Orders', 'Every order by status, newest first, with what needs doing next.');
  await visit(shop, '/partner/products');
  await dismissAlerts(shop);
  await shop.getByText('iPhone', { exact: false }).first().waitFor({ timeout: 15000 });
  await shot(shop, 'partner', 'p-products', 'Products', 'Change a price or the stock in one tap. Duplicate a listing to add another colour or size.');
  await visit(shop, '/partner/product/add?q=iphone 16');
  await dismissAlerts(shop);
  await shop.getByText('iPhone 16', { exact: false }).first().waitFor({ timeout: 15000 });
  await shot(shop, 'partner', 'p-add', 'Add products fast', 'Pick from the master catalog and just set a price. Or add a custom product, or upload a whole Excel sheet as CSV.');
  await visit(shop, '/partner/insights', 'Demand near you');
  await dismissAlerts(shop);
  await shot(shop, 'partner', 'p-insights', 'Insights', 'Sales, top products and speed, plus “Demand near you”: what people nearby searched for that the shop doesn’t list yet.');
  await visit(shop, '/partner/reviews');
  await dismissAlerts(shop);
  await shop.getByText('Not replied', { exact: false }).first().waitFor({ timeout: 15000 });
  await shot(shop, 'partner', 'p-reviews', 'Reviews', 'Star summary and every review, with a public reply from the shop.');
  await visit(shop, '/partner/qr');
  await dismissAlerts(shop);
  await shop.getByTestId('shop-qr').waitFor({ timeout: 15000 });
  await shot(shop, 'partner', 'p-qr', 'Shop link and QR poster', 'Share the shop on WhatsApp, or print an A4 counter poster in English, Telugu and Hindi.');
});

await step('new shop registration', async () => {
  const owner = await newPhonePage();
  await phoneLogin(owner, '9000019999');
  await owner.waitForURL(/\/(location|home)/, { timeout: 20000 });
  if (owner.url().includes('/location')) {
    await owner.getByTestId('area-search').fill('Nizam');
    await owner.getByTestId('area-Nizampet').click();
    await owner.waitForURL('**/home');
  }
  await visit(owner, '/profile');
  await owner.getByTestId('switch-to-shop').click();
  await owner.waitForURL('**/partner/register', { timeout: 15000 });
  await owner.getByTestId('shop-name').fill('Lakshmi Mobiles & CCTV');
  await owner.getByTestId('type-mobiles').click();
  await owner.getByTestId('type-cctv_security').click();
  await shot(owner, 'partner', 'p-register', 'Sign-up in 8 steps', 'A shop owner registers from their phone. Every step saves, so they can stop and continue later.');
  await owner.getByTestId('wizard-next').click();
  await owner.getByTestId('owner-name').waitFor();
  if (!(await owner.getByTestId('owner-name').inputValue())) await owner.getByTestId('owner-name').fill('Lakshmi Prasanna');
  if (!(await owner.getByTestId('contact-phone').inputValue())) await owner.getByTestId('contact-phone').fill('9000019999');
  await owner.getByTestId('wizard-next').click();
  await owner.getByTestId('shop-address').fill('Shop No. 4, Pragathi Nagar Road');
  await owner.getByTestId('shop-area').click();
  await owner.getByTestId('area-Nizampet').last().click();
  await owner.getByTestId('wizard-next').click();
  await owner.getByTestId('zone-1').click(); // West Hyderabad, whole zone
  await shot(owner, 'partner', 'p-delivery', 'Where the shop delivers', 'Whole zones, single areas or a radius, plus the delivery charge, free-delivery limit and store pickup.');
  await owner.getByTestId('wizard-next').click();
  await addPhoto(owner, 0);
  await owner.getByTestId('wizard-next').click();
  await owner.getByTestId('upi-id').fill('lakshmimobiles@ybl');
  await owner.getByTestId('wizard-next').click();
  for (const id of ['upload-licence', 'upload-id']) {
    const [chooser] = await Promise.all([owner.waitForEvent('filechooser'), owner.getByTestId(id).click()]);
    await chooser.setFiles(PHOTO);
    await owner.getByText('Saved', { exact: true }).nth(id === 'upload-licence' ? 0 : 1).waitFor({ timeout: 20000 });
  }
  await owner.getByTestId('wizard-next').click();
  await owner.getByTestId('wizard-submit').click();
  await owner.waitForURL('**/partner/status', { timeout: 15000 });
  await owner.getByText('Under review').first().waitFor();
  await shot(owner, 'partner', 'p-review-status', 'Waiting for approval', 'After submitting, the owner sees the review status. The Gadget Galli team checks the shop before it goes live.');
});

// ---------------------------------------------------------------------------
// Admin panel tour
// ---------------------------------------------------------------------------
await step('admin tour', async () => {
  const admin = await (await browser.newContext({ ...india, viewport: { width: 1440, height: 900 } })).newPage();
  const go = async (path, waitForText) => {
    await admin.goto(`${ADMIN}${path}`);
    if (waitForText) await admin.getByText(waitForText, { exact: false }).first().waitFor({ timeout: 15000 });
  };
  await go('/login');
  await admin.getByTestId('login-email').waitFor();
  await shot(admin, 'admin', 'a-login', 'Team login', 'The Gadget Galli team logs in with email and password. Support staff and super admins have different rights.');
  await admin.getByTestId('login-email').fill('admin@gadgetgalli.in');
  await admin.getByTestId('login-password').fill('GadgetGalli@2026');
  await admin.getByTestId('login-submit').click();
  await admin.getByText('Orders today').waitFor({ timeout: 15000 });
  await admin.waitForTimeout(2500); // let the chart finish drawing
  await shot(admin, 'admin', 'a-dashboard', 'Dashboard', 'Today’s orders and value, shops waiting for review, stuck orders and open problems at a glance.');
  await go('/shops?status=under_review', 'Lakshmi Mobiles & CCTV');
  await admin.getByText('Lakshmi Mobiles & CCTV').first().click();
  await admin.getByText('Documents (private)').waitFor({ timeout: 15000 });
  await shot(admin, 'admin', 'a-shop-review', 'Shop approval', 'Check a new shop’s details, photos and private documents, then approve it, ask for changes or reject it.');
  await go('/shops?status=approved', 'KPHB Computer World');
  await shot(admin, 'admin', 'a-shops', 'Shops', 'All shops with status, Verified badge, rating and orders. Warn or suspend a shop when needed.');
  await go('/orders', orderNo);
  await shot(admin, 'admin', 'a-orders', 'Orders', 'Every order with filters. Orders that are stuck are flagged automatically.');
  await go(`/orders/${orderId}`, 'Timeline');
  await shot(admin, 'admin', 'a-order', 'Order timeline', 'Each step with time and who did it, including payment and packing photos. Admins can step in with a note.');
  await go('/problems', 'GG-');
  await shot(admin, 'admin', 'a-problems', 'Problems', 'Customer complaints with notes. Resolve them, and warn or suspend the shop if needed.');
  await go('/catalog');
  await admin.waitForTimeout(1500);
  await shot(admin, 'admin', 'a-catalog', 'Catalog', 'Approve products that shops add, merge duplicates, and edit products, categories and brands.');
  await go('/catalog?tab=synonyms');
  await admin.waitForTimeout(1500);
  await shot(admin, 'admin', 'a-synonyms', 'Search words', 'Teach search local words (“cc camera” means CCTV, “gpu” means graphics card) and test results live.');
  await go('/content');
  await admin.waitForTimeout(1500);
  await shot(admin, 'admin', 'a-content', 'Banners and campaigns', 'Home banners, featured shops and products, push campaigns by area, and referral tracking.');
  await go('/areas');
  await admin.waitForTimeout(1500);
  await shot(admin, 'admin', 'a-areas', 'Areas', 'Zones, areas and pincodes across Hyderabad, plus the waitlist from other cities.');
  await go('/reports', 'recruit shops for these');
  await admin.waitForTimeout(2500);
  await shot(admin, 'admin', 'a-reports', 'Reports', 'Orders and value per day, top shops, top searches, and searches with no results: the list of shops to sign next.');
});

await browser.close();

// ---------------------------------------------------------------------------
// Gallery page
// ---------------------------------------------------------------------------
copyFileSync(join(ROOT, 'apps', 'admin', 'public', 'logo.png'), join(OUT, 'logo.png'));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(shots, null, 2));
writeFileSync(join(OUT, 'index.html'), gallery(shots));
console.log(`\n${shots.length} screenshots in ${OUT}${problems.length ? `\nProblems:\n  ${problems.join('\n  ')}` : ''}`);
process.exit(problems.length ? 1 : 0);

function gallery(list) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const figure = (s, i, n) => `
      <figure class="shot ${s.width < 600 ? 'phone' : 'desktop'}">
        <button type="button" class="frame" data-index="${i}" aria-label="Enlarge: ${esc(s.title)}">
          <img src="${s.file}" alt="${esc(s.title)}" width="${s.width}" height="${s.height}" loading="lazy">
        </button>
        <figcaption>
          ${n ? `<span class="meta"><span class="num">${n}</span>${s.who ? `<span class="who ${s.who === 'Shop' ? 'shop' : 'cust'}">${s.who}</span>` : ''}</span>` : ''}
          <strong>${esc(s.title)}</strong>
          <span>${esc(s.caption)}</span>
        </figcaption>
      </figure>`;
  const sections = [
    ['order', 'One order, start to finish', `Ravi in Kukatpally orders an iPhone 15 from ${SHOP}. The customer’s screens and the shop’s screens take turns.`],
    ['customer', 'Customer app', 'More of what customers see. The same app runs on Android and iPhone.'],
    ['partner', 'Shop Partner app', 'What a shop owner uses every day, inside the same app. Owners pick “I own a shop” when they sign up.'],
    ['admin', 'Admin panel', 'The web panel the Gadget Galli team uses to approve shops, watch orders and grow the marketplace.'],
  ];
  let index = 0;
  const body = sections
    .map(([key, title, intro]) => {
      const items = list.filter((s) => s.section === key);
      if (!items.length) return '';
      const figures = items.map((s, j) => figure(s, index++, key === 'order' ? j + 1 : 0)).join('');
      return `
    <section id="${key}" aria-labelledby="${key}-title">
      <header class="section-head">
        <h2 id="${key}-title">${title}</h2>
        <p>${intro}</p>
      </header>
      <div class="grid ${key === 'admin' ? 'desktops' : 'phones'}">${figures}
      </div>
    </section>`;
    })
    .join('');
  const ordered = sections.flatMap(([key]) => list.filter((s) => s.section === key));
  const data = JSON.stringify(ordered.map((s) => ({ src: s.file, title: s.title, caption: s.caption })));
  return `<title>Gadget Galli Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap">
<style>
/* Layout: one centred column; phone screens in a wrapping grid, admin screens two across. Colours and fonts are the app's own. */
:root {
  --bg: #F4F7F7; --surface: #FFFFFF; --text: #0E1B1D; --muted: #475A5D; --line: #DCE5E5; --frame: #0E1B1D;
  --primary: #0B7A80; --primary-soft: #E8F5F5; --action: #7A4E00; --action-soft: #FFF3D6;
  --shadow: 0 1px 2px rgb(10 46 49 / 0.06), 0 12px 28px rgb(10 46 49 / 0.08);
  --display: 'Poppins', 'Segoe UI', system-ui, sans-serif;
  --body: 'Inter', 'Segoe UI', system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #061314; --surface: #0C1D1F; --text: #E6F2F1; --muted: #A7BDBD; --line: #1F3B3F; --frame: #33464A; --primary: #5FC0C1; --primary-soft: #0E3236; --action: #FFCF5C; --action-soft: #3A2C06; --shadow: 0 1px 2px rgb(0 0 0 / 0.4); color-scheme: dark; }
}
:root[data-theme="dark"] { --bg: #061314; --surface: #0C1D1F; --text: #E6F2F1; --muted: #A7BDBD; --line: #1F3B3F; --frame: #33464A; --primary: #5FC0C1; --primary-soft: #0E3236; --action: #FFCF5C; --action-soft: #3A2C06; --shadow: 0 1px 2px rgb(0 0 0 / 0.4); color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font: 15px/1.55 var(--body); }
.wrap { max-width: 1160px; margin: 0 auto; padding-inline: 20px; padding-block: 28px 56px; }
.top { display: flex; align-items: center; gap: 14px; }
.top img { width: 52px; height: 52px; border-radius: 14px; }
h1 { font: 700 clamp(1.6rem, 4vw, 2.3rem)/1.15 var(--display); margin: 0; letter-spacing: -0.01em; }
.lede { color: var(--muted); max-width: 62ch; margin: 14px 0 0; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
nav a { text-decoration: none; color: var(--primary); background: var(--primary-soft); padding: 7px 14px; border-radius: 999px; font-weight: 600; font-size: 14px; }
nav a:focus-visible, .frame:focus-visible, .lb button:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
section { margin-top: 52px; scroll-margin-top: 16px; }
.section-head { border-top: 1px solid var(--line); padding-top: 22px; margin-bottom: 22px; }
h2 { font: 700 1.4rem/1.25 var(--display); margin: 0; text-wrap: balance; }
.section-head p { color: var(--muted); margin: 6px 0 0; max-width: 62ch; }
.grid { display: grid; gap: 30px 22px; }
.grid.phones { grid-template-columns: repeat(auto-fill, minmax(min(100%, 168px), 1fr)); }
.grid.desktops { grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); }
.shot { margin: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.frame { display: block; padding: 0; border: 0; background: none; cursor: zoom-in; border-radius: 22px; }
.frame img { display: block; width: 100%; height: auto; max-width: 100%; background: var(--surface); box-shadow: var(--shadow); }
.phone .frame img { border: 5px solid var(--frame); border-radius: 22px; }
.desktop .frame { border-radius: 12px; }
.desktop .frame img { border: 1px solid var(--line); border-radius: 12px; }
figcaption { display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; color: var(--muted); }
figcaption strong { color: var(--text); font-size: 14.5px; font-weight: 600; }
.meta { display: flex; align-items: center; gap: 8px; }
.num { font: 700 12px/1 var(--display); color: var(--muted); font-variant-numeric: tabular-nums; }
.who { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; }
.who.cust { color: var(--primary); background: var(--primary-soft); }
.who.shop { color: var(--action); background: var(--action-soft); }
footer { margin-top: 56px; border-top: 1px solid var(--line); padding-top: 18px; color: var(--muted); font-size: 13.5px; }
.lb { position: fixed; inset: 0; z-index: 10; background: rgb(2 6 23 / 0.92); display: flex; align-items: center; justify-content: center; padding: max(16px, env(safe-area-inset-top, 0px)) 64px max(16px, env(safe-area-inset-bottom, 0px)); }
.lb[hidden] { display: none; }
.lb figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; min-width: 0; max-width: 100%; }
.lb img { display: block; width: auto; height: auto; max-width: 100%; max-height: calc(100vh - 150px); max-height: calc(100dvh - 150px); border-radius: 12px; }
.lb figcaption { color: #CBD5E1; text-align: center; max-width: 60ch; }
.lb figcaption strong { color: #F8FAFC; }
.lb button { position: absolute; background: rgb(255 255 255 / 0.14); color: #F8FAFC; border: 0; border-radius: 999px; width: 44px; height: 44px; font-size: 22px; cursor: pointer; }
.lb .prev { left: 10px; top: 50%; transform: translateY(-50%); }
.lb .next { right: 10px; top: 50%; transform: translateY(-50%); }
.lb .close { top: max(14px, env(safe-area-inset-top, 0px)); right: 14px; }
@media (max-width: 560px) { .lb { padding-inline: 12px; } .lb .prev, .lb .next { display: none; } }
@media (prefers-reduced-motion: no-preference) { .frame img { transition: transform 0.2s ease; } .frame:hover img { transform: translateY(-3px); } }
</style>
<div class="wrap">
  <header>
    <div class="top">
      <img src="logo.png" alt="" width="52" height="52">
      <h1>Gadget Galli</h1>
    </div>
    <p class="lede">Real screens from the working apps, captured on demo data: the customer app, the Shop Partner app and the admin panel. Tap any screen to enlarge it.</p>
    <nav aria-label="Sections">
      <a href="#order">Order story</a>
      <a href="#customer">Customer app</a>
      <a href="#partner">Shop app</a>
      <a href="#admin">Admin panel</a>
    </nav>
  </header>${body}
  <footer>All shops, people, phone numbers and UPI IDs here are fictional demo data. Captured from the web build of the apps; the Android and iPhone apps use the same screens.</footer>
</div>
<div class="lb" id="lb" hidden role="dialog" aria-modal="true" aria-labelledby="lb-title">
  <button type="button" class="prev" id="lb-prev" aria-label="Previous screen">‹</button>
  <figure><img id="lb-img" alt=""><figcaption><strong id="lb-title"></strong><span id="lb-cap"></span></figcaption></figure>
  <button type="button" class="next" id="lb-next" aria-label="Next screen">›</button>
  <button type="button" class="close" id="lb-close" aria-label="Close">×</button>
</div>
<script>
(() => {
  const shots = ${data};
  const lb = document.getElementById('lb');
  const img = document.getElementById('lb-img');
  let at = 0;
  let opener = null;
  const show = (i) => {
    at = (i + shots.length) % shots.length;
    img.src = shots[at].src;
    img.alt = shots[at].title;
    document.getElementById('lb-title').textContent = shots[at].title;
    document.getElementById('lb-cap').textContent = shots[at].caption;
  };
  const close = () => { lb.hidden = true; if (opener) opener.focus(); };
  document.querySelectorAll('.frame').forEach((b) => b.addEventListener('click', () => {
    opener = b;
    show(Number(b.dataset.index));
    lb.hidden = false;
    document.getElementById('lb-close').focus();
  }));
  document.getElementById('lb-prev').addEventListener('click', () => show(at - 1));
  document.getElementById('lb-next').addEventListener('click', () => show(at + 1));
  document.getElementById('lb-close').addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.tagName === 'FIGURE') close(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });
  let x0 = null;
  lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();
</script>
`;
}
