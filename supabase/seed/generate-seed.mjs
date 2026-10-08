#!/usr/bin/env node
// Generates supabase/seed.sql: realistic demo data for Gadget Galli (all shops and people are fictional).
//   node supabase/seed/generate-seed.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, CATEGORIES, SYNONYMS, ZONES, areaByName, zoneByName } from './data-places.mjs';
import { PRODUCTS } from './data-products.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed.sql');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
let seed = 20261008;
function rnd() {
  // mulberry32 — deterministic so the seed is stable between runs
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const uuid = (kind, n) => `${kind}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? 'null' : String(v));
const js = (v) => `${q(JSON.stringify(v ?? {}))}::jsonb`;
const arr = (a) => (a && a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const ago = (mins) => `now() - interval '${Math.round(mins)} minutes'`;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const out = [];
const emit = (s) => out.push(s);

const ID = {
  user: (n) => uuid('11111111', n),
  shop: (n) => uuid('22222222', n),
  product: (n) => uuid('33333333', n),
  listing: (n) => uuid('44444444', n),
  order: (n) => uuid('55555555', n),
  address: (n) => uuid('66666666', n),
  review: (n) => uuid('77777777', n),
  issue: (n) => uuid('88888888', n),
};

// ---------------------------------------------------------------------------
// people (fictional). Phone logins use test OTP 123456 (see supabase/config.toml)
// ---------------------------------------------------------------------------
const CUSTOMERS = [
  { key: 'ravi', name: 'Ravi Kumar', phone: '919000000001', area: 'Kukatpally' },
  { key: 'priya', name: 'Priya Reddy', phone: '919000000002', area: 'Madhapur' },
  { key: 'arjun', name: 'Arjun Rao', phone: '919000000003', area: 'Dilsukhnagar' },
  { key: 'sneha', name: 'Sneha Varma', phone: '919000000004', area: 'Gachibowli' },
  { key: 'farhan', name: 'Farhan Siddiqui', phone: '919000000005', area: 'Mehdipatnam' },
  { key: 'kavya', name: 'Kavya Nair', phone: '919000000006', area: 'Secunderabad' },
  { key: 'rahul', name: 'Rahul Verma', phone: '919000000007', area: 'Kondapur' },
  { key: 'divya', name: 'Divya Lakshmi', phone: '919000000008', area: 'Uppal' },
  { key: 'suresh', name: 'Suresh Babu', phone: '919000000009', area: 'LB Nagar' },
  { key: 'ananya', name: 'Ananya Singh', phone: '919000000010', area: 'Banjara Hills' },
  { key: 'vikram', name: 'Vikram Teja', phone: '919000000011', area: 'Ameerpet' },
  { key: 'meena', name: 'Meena Kumari', phone: '919000000012', area: 'Miyapur' },
];

const H = (open, close, sunday = true) => {
  const day = { open, close };
  const h = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: sunday ? { open: '11:00', close: '20:00' } : { ...day, closed: true } };
  return h;
};
const ALL_DAY = H('00:00', '00:00');
ALL_DAY.sun = { open: '00:00', close: '00:00' };

const POOLS = {
  mobiles: ['smartphones', 'tablets', 'smartwatches', 'earbuds', 'chargers', 'cables', 'cases', 'screen-guards', 'power-banks'],
  cctv_security: ['cctv-cameras', 'dvr-nvr', 'surveillance-hdd', 'cctv-power', 'cctv-cables', 'video-door-phones', 'cctv-kits', 'installation-service'],
  computers_laptops: ['laptops', 'desktops', 'all-in-ones', 'monitors'],
  components_peripherals: ['graphics-cards', 'processors', 'motherboards', 'ram', 'storage', 'psu', 'cabinets', 'coolers',
    'keyboards', 'mice', 'headsets', 'webcams', 'printers', 'routers', 'ups', 'speakers'],
};

// Delivery: zones = whole zones, areas = single areas, radius = km from the shop
const SHOPS = [
  { n: 1, key: 'sai', name: 'Sri Sai Mobiles & Accessories', area: 'Ameerpet', types: ['mobiles'], owner: 'Venkatesh Goud',
    desc: 'Smartphones and accessories with bill and brand warranty. Same-day delivery across central Hyderabad since 2009.',
    zones: ['Central Hyderabad'], areas: ['Kukatpally', 'KPHB Colony', 'Jubilee Hills'], charge: ['flat', 49], free: 3000, min: 0, usual: 120,
    hours: H('10:30', '21:30'), verified: true, upi: 'srisaimobiles@okhdfcbank', force: ['MTP03HN/A', 'MYEC3HN/A'], landmark: 'Opp. Ameerpet Metro, Pillar 1012' },
  { n: 2, key: 'kphb', name: 'KPHB Computer World', area: 'Kukatpally', types: ['components_peripherals', 'computers_laptops'], owner: 'Srinivas Reddy',
    desc: 'Gaming PCs, graphics cards and laptop upgrades. Free PC assembly on builds above ₹50,000. GST bills available.',
    zones: ['West Hyderabad'], areas: [], charge: ['per_km', 15], free: 10000, min: 500, usual: 60,
    hours: ALL_DAY, verified: true, upi: 'kphbcomputerworld@okicici', force: ['ZT-D40600H-10M', 'RTX 4060 VENTUS 2X BLACK 8G OC', 'GPC-R57600-4060', '100-100001015BOX'],
    landmark: 'Near JNTU Metro Station, KPHB Road No. 1', install: 300 },
  { n: 3, key: 'hitech', name: 'Hitech Gadget Hub', area: 'Madhapur', types: ['mobiles', 'computers_laptops'], owner: 'Mohammed Imran',
    desc: 'Latest phones and laptops for the IT corridor. Office deliveries in Hitec City within the hour.',
    radius: 10, charge: ['free', 0], free: null, min: 0, usual: 60, hours: ALL_DAY, verified: true, upi: 'hitechgadgethub@ybl',
    force: ['MTP03HN/A', 'MW123HN/A', 'FA507NVR-LP091W'], landmark: 'Beside Inorbit Mall Road, Madhapur' },
  { n: 4, key: 'cyber', name: 'Cyber Zone Systems', area: 'Gachibowli', types: ['components_peripherals', 'computers_laptops'], owner: 'Karthik Rao',
    desc: 'PC components, monitors and peripherals. Expert advice for gamers and creators.',
    radius: 10, charge: ['flat', 99], free: 15000, min: 0, usual: 120, hours: ALL_DAY, verified: true, upi: 'cyberzonesystems@okaxis',
    force: ['ZT-D40600H-10M', 'DUAL-RTX4060-O8G', 'RTX 5060 8G VENTUS 2X OC'], landmark: 'DLF Cyber City Road, Gachibowli', install: 300 },
  { n: 5, key: 'kondapur', name: 'Kondapur Laptop Point', area: 'Kondapur', types: ['computers_laptops'], owner: 'Praveen Kumar',
    desc: 'New and certified refurbished laptops with 6-month shop warranty. Laptop service and upgrades.',
    radius: 8, charge: ['flat', 79], free: 40000, min: 0, usual: 120, hours: H('10:00', '21:00'), verified: false, upi: 'kondapurlaptops@paytm',
    force: ['83ER00EVIN', 'fq5007AU'], refurb: true, landmark: 'Botanical Garden Road, Kondapur' },
  { n: 6, key: 'miyapur', name: 'Miyapur Mobile Bazaar', area: 'Miyapur', types: ['mobiles'], owner: 'Ramesh Yadav',
    desc: 'Best prices on Redmi, Samsung, Vivo and OPPO. Exchange offers available on call.',
    zones: ['West Hyderabad'], areas: [], charge: ['flat', 39], free: 2000, min: 0, usual: 120, hours: H('10:00', '21:30'), verified: true,
    upi: 'miyapurmobilebazaar@ybl', force: ['MTP03HN/A', '24115RA8EI'], landmark: 'Near Miyapur X Roads, Allwyn Colony' },
  { n: 7, key: 'deccan', name: 'Deccan PC Components', area: 'Secunderabad', types: ['components_peripherals'], owner: 'Abdul Rahman',
    desc: 'PC components wholesale & retail at Chenoy Trade Centre. GST bills and dealer prices for bulk buyers.',
    zones: ['Secunderabad & North', 'Central Hyderabad'], areas: [], charge: ['flat', 99], free: 20000, min: 1000, usual: 240,
    hours: H('10:30', '20:30', false), verified: true, upi: 'deccanpccomponents@okhdfcbank',
    force: ['ZT-D40600H-10M', 'GV-N4060EAGLE OC-8GD'], landmark: 'Inside Chenoy Trade Centre, Park Lane', install: 250 },
  { n: 8, key: 'abids', name: 'Abids CCTV & Electronics', area: 'Abids', types: ['cctv_security'], owner: 'Syed Faraz',
    desc: 'Hikvision & CP Plus authorised dealer. Installation by certified technicians within 24 hours.',
    zones: ['Central Hyderabad', 'South Hyderabad'], areas: [], charge: ['flat', 99], free: 10000, min: 0, usual: 240,
    hours: H('10:00', '21:00'), verified: true, upi: 'abidscctv@okicici', force: ['HIK-4CH-2MP-KIT', 'DS-2CE76D0T-ITPFS'], landmark: 'Bank Street, near GPO Abids' },
  { n: 9, key: 'koti', name: 'Koti Mobile Galaxy', area: 'Koti', types: ['mobiles'], owner: 'Mahesh Agarwal',
    desc: 'New, open-box and refurbished phones with bill and warranty. Trusted by Koti market buyers for 15 years.',
    zones: ['Central Hyderabad', 'South Hyderabad', 'East Hyderabad'], areas: [], charge: ['flat', 49], free: 5000, min: 0, usual: 120,
    hours: H('10:30', '21:30'), verified: false, upi: 'kotimobilegalaxy@ybl', force: ['MTP03HN/A'], refurb: true, landmark: 'Bank Street, Koti' },
  { n: 10, key: 'dsnr', name: 'Dilsukhnagar Digital Store', area: 'Dilsukhnagar', types: ['mobiles', 'components_peripherals'], owner: 'Naresh Chary',
    desc: 'Phones, accessories, printers and routers for home and office. Free delivery above ₹1,500.',
    zones: ['South Hyderabad', 'East Hyderabad'], areas: [], charge: ['flat', 49], free: 1500, min: 0, usual: 120,
    hours: H('10:00', '21:30'), verified: true, upi: 'dsnrdigital@okaxis', force: ['Z6Z13A', 'Archer C6'], landmark: 'Opp. Dilsukhnagar Bus Depot' },
  { n: 11, key: 'secureeye', name: 'SecureEye CCTV Solutions', area: 'LB Nagar', types: ['cctv_security'], owner: 'Anil Kumar',
    desc: 'Complete CCTV solutions for homes, apartments and shops. Free site visit before installation.',
    zones: ['South Hyderabad', 'East Hyderabad'], areas: [], charge: ['free', 0], free: null, min: 0, usual: 240,
    hours: H('09:30', '20:30'), verified: true, upi: 'secureeyecctv@paytm', force: ['HIK-4CH-2MP-KIT', 'CPP-8CH-24MP-KIT', 'SRV-CCTV-4'], landmark: 'Sagar Ring Road, LB Nagar' },
  { n: 12, key: 'begumpet', name: 'Begumpet PC Builders', area: 'Begumpet', types: ['components_peripherals', 'computers_laptops'], owner: 'Rohit Jain',
    desc: 'Custom gaming and workstation builds, assembled and stress-tested the same day.',
    zones: ['Central Hyderabad', 'Secunderabad & North'], areas: [], charge: ['flat', 149], free: 25000, min: 0, usual: 240,
    hours: H('11:00', '21:00'), verified: true, upi: 'begumpetpcbuilders@okhdfcbank',
    force: ['RTX 4060 VENTUS 2X BLACK 8G OC', 'ZT-D40600H-10M', 'GPC-R57600-4060'], landmark: 'Prakash Nagar, Begumpet', install: 300 },
  { n: 13, key: 'banjara', name: 'Banjara Premium Gadgets', area: 'Banjara Hills', types: ['mobiles', 'computers_laptops'], owner: 'Aditi Sharma',
    desc: 'Premium Apple, Samsung and Google devices. Doorstep demo and data transfer on request.',
    radius: 12, charge: ['free', 0], free: null, min: 0, usual: 60, hours: H('10:30', '22:00'), verified: true, upi: 'banjarapremium@okicici',
    force: ['MTP03HN/A', 'MG6K4HN/A', 'MFYP4HN/A', 'SM-S938BZBCINS', 'MW123HN/A'], landmark: 'Road No. 12, Banjara Hills' },
  { n: 14, key: 'uppal', name: 'Uppal Tech Point', area: 'Uppal', types: ['mobiles', 'cctv_security', 'components_peripherals'], owner: 'Shiva Prasad',
    desc: 'Mobiles, CCTV and computer accessories under one roof.',
    zones: ['East Hyderabad'], areas: ['Tarnaka', 'Habsiguda', 'Malkajgiri'], charge: ['flat', 59], free: 3000, min: 0, usual: 120,
    hours: H('10:00', '21:00'), verified: false, upi: 'uppaltechpoint@ybl', force: [], landmark: 'Uppal Ring Road, near Metro Station' },
  { n: 15, key: 'mehdi', name: 'Mehdipatnam Systems & Security', area: 'Mehdipatnam', types: ['cctv_security', 'computers_laptops', 'components_peripherals'],
    owner: 'Imtiaz Ali', desc: 'CCTV, computers and networking for homes and small businesses.',
    radius: 15, charge: ['per_km', 12], free: 8000, min: 0, usual: 240, hours: H('10:30', '21:00'), verified: true, upi: 'mehdipatnamsystems@okaxis',
    force: ['HIK-4CH-2MP-KIT', 'DS-2CE76D0T-ITPFS', 'DS-2CE16D0T-ITPFS', 'SRV-CCTV-1'], landmark: 'Rethibowli, Mehdipatnam', install: 300 },
];

// A shop waiting for admin approval (demo for the admin panel)
const PENDING_SHOP = {
  n: 16, key: 'nizampet', name: 'Sai Ganesh Electronics', area: 'Nizampet', types: ['mobiles', 'cctv_security'], owner: 'Ganesh Babu',
  desc: 'Mobiles, accessories and CCTV for Nizampet and Bachupally.', zones: [], areas: ['Nizampet', 'Bachupally', 'Kukatpally'],
  charge: ['flat', 49], free: 2000, min: 0, usual: 120, hours: H('10:00', '21:00'), verified: false, upi: 'saiganeshelectronics@ybl', force: [],
  landmark: 'Main Road, Nizampet Village',
};

// ---------------------------------------------------------------------------
// header
// ---------------------------------------------------------------------------
emit(`-- Gadget Galli demo data. GENERATED by supabase/seed/generate-seed.mjs — edit the generator, not this file.
-- All shops, people, phone numbers and UPI IDs are fictional.
-- Demo logins (test OTP 123456): customers +91 90000 00001..00012, shop owners +91 90000 10001..10016,
-- new shop owner +91 90000 19999. Admin: admin@gadgetgalli.in / GadgetGalli@2026 (change it!).
set session_replication_role = default;
begin;
`);

// zones & areas
emit(`insert into public.zones (id, name, sort) values\n${ZONES.map((z) => `  (${z.id}, ${q(z.name)}, ${z.sort})`).join(',\n')};`);
emit(`insert into public.areas (id, zone_id, name, pincode, lat, lng) values\n${AREAS.map((a) => `  (${a.id}, ${a.zone_id}, ${q(a.name)}, ${q(a.pincode)}, ${a.lat}, ${a.lng})`).join(',\n')};`);
emit(`select setval('public.zones_id_seq', (select max(id) from public.zones)); select setval('public.areas_id_seq', (select max(id) from public.areas));`);

// categories
const catId = {};
let cid = 0;
const catRows = [];
CATEGORIES.forEach((top, ti) => {
  cid += 1;
  const topId = cid;
  catId[top.slug] = topId;
  catRows.push(`  (${topId}, ${q(top.slug)}, ${q(top.name)}, ${q(top.te)}, ${q(top.hi)}, ${q(top.icon)}, null, ${q(top.shop_type)}, ${ti})`);
  top.children.forEach((c, ci) => {
    cid += 1;
    catId[c.slug] = cid;
    catRows.push(`  (${cid}, ${q(c.slug)}, ${q(c.name)}, ${q(c.te)}, ${q(c.hi)}, ${q(c.icon)}, ${topId}, ${q(top.shop_type)}, ${ci})`);
  });
});
emit(`insert into public.categories (id, slug, name, name_te, name_hi, icon, parent_id, shop_type, sort) values\n${catRows.join(',\n')};`);
emit(`select setval('public.categories_id_seq', (select max(id) from public.categories));`);

// brands
const brandNames = [...new Set(PRODUCTS.map((p) => p.brand))].sort();
const brandId = Object.fromEntries(brandNames.map((b, i) => [b, i + 1]));
emit(`insert into public.brands (id, name, slug) values\n${brandNames.map((b) => `  (${brandId[b]}, ${q(b)}, ${q(slugify(b))})`).join(',\n')};`);
emit(`select setval('public.brands_id_seq', (select max(id) from public.brands));`);

// synonyms
emit(`insert into public.search_synonyms (words) values\n${SYNONYMS.map((w) => `  (${arr(w)})`).join(',\n')};`);

// catalog
const productByMn = {};
const catalogRows = PRODUCTS.map((p, i) => {
  const id = ID.product(i + 1);
  const popularity = Math.round((p.price > 50000 ? 30 : 60) + rnd() * 120);
  const row = { ...p, id, popularity, catId: catId[p.cat] };
  if (!row.catId) throw new Error(`Unknown category ${p.cat}`);
  if (productByMn[p.mn]) throw new Error(`Duplicate model number ${p.mn}`);
  productByMn[p.mn] = row;
  return row;
});
emit(`insert into public.catalog_products (id, category_id, brand_id, name, model, model_number, variant, key_specs, specs, in_the_box, keywords, mrp, status, popularity) values\n${catalogRows
  .map((p) => `  (${q(p.id)}, ${p.catId}, ${brandId[p.brand]}, ${q(p.name)}, ${q(p.model)}, ${q(p.mn)}, ${js(p.v)}, ${arr(p.ks)}, ${js(p.sp)}, ${q(p.box || null)}, ${q(p.kw)}, ${num(p.mrp)}, 'approved', ${p.popularity})`)
  .join(',\n')};`);

// Everything above (areas, categories, brands, synonyms, catalog) is real reference data that a
// production project needs too. It is also written to seed-reference.sql (no demo people or shops).
const referenceEnd = out.length;

// ---------------------------------------------------------------------------
// auth users + profiles
// ---------------------------------------------------------------------------
const authRows = [];
const identityRows = [];
const profileUpdates = [];
const users = {};
let un = 0;
function addPhoneUser(key, name, phone, role = 'customer') {
  un += 1;
  const id = ID.user(un);
  users[key] = { id, name, phone: `+${phone}`, role };
  authRows.push(`  ('00000000-0000-0000-0000-000000000000', ${q(id)}, 'authenticated', 'authenticated', null, '', null, ${q(phone)}, now(), '{"provider":"phone","providers":["phone"]}', ${js({ name })}, now() - interval '${between(20, 120)} days', now(), '', '', '', '', '', '', '', '')`);
  identityRows.push(`  (${q(id)}, ${q(id)}, ${js({ sub: id, phone })}, 'phone', now(), now(), now())`);
  profileUpdates.push(`update public.users set name = ${q(name)}, role = ${q(role)}, onboarded = true where id = ${q(id)};`);
  return id;
}
function addEmailUser(key, name, email, password, adminRole) {
  un += 1;
  const id = ID.user(un);
  users[key] = { id, name, email };
  authRows.push(`  ('00000000-0000-0000-0000-000000000000', ${q(id)}, 'authenticated', 'authenticated', ${q(email)}, extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(), null, null, '{"provider":"email","providers":["email"]}', ${js({ name })}, now() - interval '200 days', now(), '', '', '', '', '', '', '', '')`);
  identityRows.push(`  (${q(id)}, ${q(id)}, ${js({ sub: id, email, email_verified: true })}, 'email', now(), now(), now())`);
  profileUpdates.push(`update public.users set name = ${q(name)}, admin_role = ${q(adminRole)}, onboarded = true where id = ${q(id)};`);
  return id;
}

addEmailUser('admin', 'Gadget Galli Admin', 'admin@gadgetgalli.in', 'GadgetGalli@2026', 'super_admin');
addEmailUser('support', 'Support Desk', 'support@gadgetgalli.in', 'GadgetGalli@2026', 'support');
CUSTOMERS.forEach((c) => addPhoneUser(c.key, c.name, c.phone));
[...SHOPS, PENDING_SHOP].forEach((s) => addPhoneUser(`owner_${s.key}`, s.owner, `9190000100${String(s.n).padStart(2, '0')}`, 'shop_owner'));
addPhoneUser('newowner', 'Lakshmi Prasanna', '919000019999', 'customer');

emit(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token) values\n${authRows.join(',\n')};`);
emit(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values\n${identityRows.join(',\n')};`);
emit(profileUpdates.join('\n'));

// addresses
const ADDRESS_LINES = {
  Kukatpally: { house: 'Flat 302', building: 'Sai Residency', street: 'Road No. 4, KPHB Phase 3', landmark: 'Near JNTU Metro Station' },
  Madhapur: { house: 'Flat 1104', building: 'My Home Abhra', street: 'Hitec City Road', landmark: 'Opp. Cyber Towers' },
  Dilsukhnagar: { house: 'H.No. 16-11-740', building: '', street: 'Moosarambagh', landmark: 'Near Dilsukhnagar Bus Stand' },
  Gachibowli: { house: 'Flat 504', building: 'Aparna Sarovar', street: 'Nallagandla Road', landmark: 'Near ISB Gate' },
  Mehdipatnam: { house: 'H.No. 12-2-823', building: '', street: 'Asif Nagar', landmark: 'Near Rythu Bazar' },
  Secunderabad: { house: 'Flat 202', building: 'Sri Lakshmi Towers', street: 'SD Road', landmark: 'Near Paradise Circle' },
  Kondapur: { house: 'Flat 701', building: 'Lansum Etania', street: 'Masjid Banda Road', landmark: 'Near Botanical Garden' },
  Uppal: { house: 'H.No. 3-8-112', building: '', street: 'Bharath Nagar', landmark: 'Near Uppal Stadium' },
  'LB Nagar': { house: 'H.No. 3-12-45', building: '', street: 'Vanasthali Hills Road', landmark: 'Near LB Nagar Metro' },
  'Banjara Hills': { house: 'Villa 8', building: 'Green Meadows', street: 'Road No. 10', landmark: 'Near GVK One' },
  Ameerpet: { house: 'Flat 3B', building: 'Srinivasa Apartments', street: 'Satyam Theatre Road', landmark: 'Near Ameerpet Metro' },
  Miyapur: { house: 'Flat 409', building: 'Mayuri Nagar Residency', street: 'Mayuri Nagar', landmark: 'Near Miyapur Metro Depot' },
};
const addressOf = {};
let an = 0;
const addrRows = CUSTOMERS.map((c) => {
  an += 1;
  const a = areaByName(c.area);
  const l = ADDRESS_LINES[c.area];
  const lat = +(a.lat + (rnd() - 0.5) * 0.008).toFixed(6);
  const lng = +(a.lng + (rnd() - 0.5) * 0.008).toFixed(6);
  const id = ID.address(an);
  addressOf[c.key] = { id, area: a, lat, lng, ...l, name: c.name, label: 'home' };
  return `  (${q(id)}, ${q(users[c.key].id)}, 'home', ${q(c.name)}, ${q(l.house)}, ${q(l.building || null)}, ${q(l.street)}, ${q(l.landmark)}, ${a.id}, ${q(a.name)}, ${q(a.pincode)}, ${lat}, ${lng}, true)`;
});
// Ravi also has an office address in HITEC City
an += 1;
const hitec = areaByName('HITEC City');
addrRows.push(`  (${q(ID.address(an))}, ${q(users.ravi.id)}, 'office', 'Ravi Kumar', 'Floor 6, Tower B', 'Cyber Gateway', 'HITEC City Main Road', 'Near Cyber Towers', ${hitec.id}, 'HITEC City', ${q(hitec.pincode)}, 17.4504, 78.3808, false)`);
emit(`insert into public.addresses (id, user_id, label, contact_name, house, building, street, landmark, area_id, area_name, pincode, lat, lng, is_default) values\n${addrRows.join(',\n')};`);
emit(CUSTOMERS.map((c) => `update public.users set last_area_id = ${areaByName(c.area).id} where id = ${q(users[c.key].id)};`).join('\n'));

// ---------------------------------------------------------------------------
// shops, delivery areas, listings
// ---------------------------------------------------------------------------
const shopRows = [];
const daRows = [];
const listingRows = [];
const listingsByShop = {};
let ln = 0;
const shopById = {};

function shopPrice(p, factor) {
  let price = p.price * factor;
  price = price >= 1000 ? Math.round(price / 100) * 100 - 1 : Math.max(99, Math.round(price / 10) * 10 - 1);
  if (p.mrp && price > p.mrp) price = p.mrp;
  return price;
}

for (const s of [...SHOPS, PENDING_SHOP]) {
  const id = ID.shop(s.n);
  s.id = id;
  shopById[s.key] = s;
  const a = areaByName(s.area);
  s.lat = +(a.lat + (rnd() - 0.5) * 0.006).toFixed(6);
  s.lng = +(a.lng + (rnd() - 0.5) * 0.006).toFixed(6);
  const phone = `+9190000100${String(s.n).padStart(2, '0')}`;
  const status = s === PENDING_SHOP ? 'under_review' : 'approved';
  const mode = s.radius ? 'radius' : 'areas';
  shopRows.push(`  (${q(id)}, ${q(users[`owner_${s.key}`].id)}, ${q(slugify(`${s.name} ${s.area}`))}, ${q(s.name)}, array[${s.types.map((t) => q(t)).join(', ')}]::public.shop_type[], ${q(s.desc)}, ${js(s.hours)}, ${q(s.owner)}, ${q(phone)}, ${q(phone)}, ${q(phone)}, ${q(`Shop No. ${s.n + 3}, Ground Floor, ${s.area} Main Road`)}, ${a.id}, ${q(a.pincode)}, ${q(s.landmark)}, ${s.lat}, ${s.lng}, ${q(mode)}, ${num(s.radius ?? null)}, ${q(s.charge[0])}, ${s.charge[1]}, ${num(s.free)}, ${s.min}, ${s.usual}, true, ${q(s.upi)}, ${q(s.name)}, ${status === 'approved'}, ${q(status)}, ${s.verified}, 8, ${status === 'approved' ? ago(between(30, 400) * 1440) : 'null'}, ${ago(between(1, 3) * 1440)})`);
  for (const z of s.zones ?? []) daRows.push(`  (${q(id)}, ${zoneByName(z).id}, null)`);
  for (const ar of s.areas ?? []) daRows.push(`  (${q(id)}, null, ${areaByName(ar).id})`);

  // listings
  const pool = new Set(s.types.flatMap((t) => POOLS[t]));
  const chosen = new Map();
  for (const mn of s.force) {
    if (!productByMn[mn]) throw new Error(`Unknown forced product ${mn}`);
    chosen.set(mn, productByMn[mn]);
  }
  const target = s === PENDING_SHOP ? 12 : between(32, 58);
  const candidates = catalogRows.filter((p) => pool.has(p.cat) && !chosen.has(p.mn));
  // RTX 4060 desktop cards only where the demo scenario expects them
  const isRtx4060Card = (p) => p.cat === 'graphics-cards' && /RTX 4060(?! Ti)/.test(p.name);
  for (const p of candidates.sort(() => rnd() - 0.5)) {
    if (chosen.size >= target) break;
    if (isRtx4060Card(p)) continue;
    if (rnd() < 0.75) chosen.set(p.mn, p);
  }
  listingsByShop[s.key] = [];
  for (const p of chosen.values()) {
    ln += 1;
    const lid = ID.listing(ln);
    const factor = 0.97 + rnd() * 0.08;
    const price = shopPrice(p, factor);
    const tracked = rnd() < 0.4;
    const qty = tracked ? between(0, 12) : null;
    const inStock = tracked ? qty > 0 : rnd() > 0.05;
    const installable = ['cctv-cameras', 'cctv-kits', 'video-door-phones'].includes(p.cat) || (!!s.install && ['graphics-cards', 'processors', 'motherboards', 'coolers'].includes(p.cat));
    const instCharge = !installable ? null : p.cat === 'cctv-kits' ? 1500 : p.cat.startsWith('cctv') || p.cat === 'video-door-phones' ? 450 : s.install;
    listingRows.push(`  (${q(lid)}, ${q(id)}, ${q(p.id)}, 'new', ${price}, ${num(p.mrp)}, ${p.cat === 'installation-service' ? 0 : 12}, ${q(p.cat === 'installation-service' ? 'shop' : 'brand')}, ${num(qty)}, ${inStock}, ${installable}, ${num(instCharge)})`);
    listingsByShop[s.key].push({ id: lid, product: p, price, condition: 'new', inStock, instCharge });

    // Refurbished / open-box variants for some phones and laptops
    if (s.refurb && ['smartphones', 'laptops'].includes(p.cat) && rnd() < 0.45) {
      ln += 1;
      const rid = ID.listing(ln);
      const cond = rnd() < 0.5 ? 'refurbished' : 'open_box';
      const rprice = shopPrice(p, cond === 'refurbished' ? 0.72 : 0.88);
      listingRows.push(`  (${q(rid)}, ${q(id)}, ${q(p.id)}, ${q(cond)}, ${rprice}, ${num(p.mrp)}, 6, 'shop', ${between(1, 3)}, true, false, null)`);
      listingsByShop[s.key].push({ id: rid, product: p, price: rprice, condition: cond, inStock: true });
    }
  }
}
emit(`insert into public.shops (id, owner_id, slug, name, shop_types, description, hours, owner_name, owner_phone, contact_phone, whatsapp_phone, address_line, area_id, pincode, landmark, lat, lng, delivery_mode, delivery_radius_km, delivery_charge_type, delivery_charge, free_delivery_above, min_order, usual_delivery_mins, store_pickup, upi_id, upi_name, upi_verified, status, verified, registration_step, approved_at, submitted_at) values\n${shopRows.join(',\n')};`);
emit(`insert into public.delivery_areas (shop_id, zone_id, area_id) values\n${daRows.join(',\n')};`);
emit(`insert into public.shop_products (id, shop_id, catalog_product_id, condition, price, mrp, warranty_months, warranty_type, stock_qty, in_stock, installation_available, installation_charge) values\n${listingRows.join(',\n')};`);
emit(`insert into public.shop_private (shop_id, gst_number) values
  (${q(shopById.kphb.id)}, '36ABCPR1234K1Z5'), (${q(shopById.deccan.id)}, '36AAKFD5678M1Z2'), (${q(shopById.abids.id)}, '36BXYPS4321L1Z9'),
  (${q(shopById.banjara.id)}, '36AAHCB9876Q1Z1'), (${q(PENDING_SHOP.id)}, null);`);
emit(`insert into public.shop_documents (shop_id, doc_type, path, doc_number, status) values
  (${q(PENDING_SHOP.id)}, 'owner_id_proof', ${q(`${PENDING_SHOP.id}/aadhaar-demo.jpg`)}, 'XXXX XXXX 4821', 'submitted'),
  (${q(PENDING_SHOP.id)}, 'udyam_certificate', ${q(`${PENDING_SHOP.id}/udyam-demo.pdf`)}, 'UDYAM-TS-02-0012345', 'submitted'),
  (${q(shopById.kphb.id)}, 'gst_certificate', ${q(`${shopById.kphb.id}/gst.pdf`)}, '36ABCPR1234K1Z5', 'accepted'),
  (${q(shopById.kphb.id)}, 'owner_id_proof', ${q(`${shopById.kphb.id}/pan.jpg`)}, 'ABCPR1234K', 'accepted');`);

// A custom product waiting for admin approval
emit(`insert into public.catalog_products (id, category_id, brand_id, name, model, model_number, variant, key_specs, keywords, mrp, status, created_by, created_by_shop)
values (${q(ID.product(900))}, ${catId.cables}, null, 'Portronics Konnect L 1.2m Type-C Fast Charging Cable', 'Konnect L Type-C', 'POR-1401', '{"length":"1.2 m"}', array['60W fast charge', 'Braided', '1.2 m'], 'type c cable portronics', 499, 'pending', ${q(users.owner_dsnr.id)}, ${q(shopById.dsnr.id)});`);
ln += 1;
emit(`insert into public.shop_products (id, shop_id, catalog_product_id, condition, price, mrp, in_stock) values (${q(ID.listing(ln))}, ${q(shopById.dsnr.id)}, ${q(ID.product(900))}, 'new', 249, 499, true);`);

// ---------------------------------------------------------------------------
// orders in every status
// ---------------------------------------------------------------------------
const RIDERS = [['Ramu', '+919849012345', 'TS 09 EX 4521'], ['Saleem', '+919849023456', 'TS 07 FK 8812'], ['Naveen', '+919849034567', 'TS 08 GH 1290'],
  ['Prakash', '+919849045678', 'TS 10 JK 6634'], ['Yusuf', '+919849056789', 'TS 13 AB 9087']];
const REVIEWS = [
  [5, 'Genuine product with bill. Delivered in under an hour 👍'],
  [5, 'Shop owner explained everything on the call. Paid by UPI after confirmation, very smooth.'],
  [5, 'Price was lower than online and I got it the same day.'],
  [4, 'Packaging was good. Rider called before coming.'],
  [4, 'Little delay in dispatch but the shop kept me updated.'],
  [5, 'Installation done neatly, technician was polite and showed the mobile app setup.'],
  [5, 'Best shop in the area for PC parts. Will buy again.'],
  [5, 'చాలా బాగుంది, త్వరగా డెలివరీ చేశారు. 🙏'],
  [4, 'बहुत अच्छी सर्विस, उसी दिन मिल गया।'],
  [3, 'Good price but delivery took around 3 hours.'],
  [5, 'Sealed box, GST invoice given. Highly recommended.'],
  [4, 'Got exactly what I needed for my build. Thanks!'],
];
const REPLIES = ['Thank you sir! Visit again 🙏', 'Thanks for choosing us! Happy to help anytime.', 'Thank you for the kind words 😊', null, null];

const orderRows = [];
const eventRows = [];
const dispatchRows = [];
const paymentRows = [];
const reviewRows = [];
const issueRows = [];
let onum = 0;
let rnum = 0;

function lineFor(listing, qty, withInst = false) {
  const p = listing.product;
  return {
    shop_product_id: listing.id,
    catalog_product_id: p.id,
    name: p.name,
    brand: p.brand,
    variant: p.v,
    condition: listing.condition,
    price: listing.price,
    mrp: p.mrp,
    qty,
    photo: null,
    warranty_months: p.cat === 'installation-service' ? 0 : 12,
    with_installation: withInst,
    installation_charge: withInst ? listing.instCharge : null,
    line_total: listing.price * qty + (withInst ? (listing.instCharge ?? 0) * qty : 0),
  };
}

/**
 * spec: {customer, shop, status, ago (minutes since request), items: [[mn|null, qty]], method, pickup, review, issue,
 *        beforeIssue, updated, reject, cancel}
 */
function addOrder(spec) {
  onum += 1;
  const id = ID.order(onum);
  const shop = shopById[spec.shop];
  const cust = CUSTOMERS.find((c) => c.key === spec.customer);
  const addr = addressOf[spec.customer];
  const listings = listingsByShop[spec.shop].filter((l) => l.inStock || spec.status !== 'REQUESTED');
  const items = [];
  for (const [mn, qty, inst] of spec.items) {
    let l = mn ? listings.find((x) => x.product.mn === mn && x.condition === 'new') : null;
    if (!l) l = pick(listings.filter((x) => !items.some((i) => i.shop_product_id === x.id)));
    items.push(lineFor(l, qty, !!inst && !!l.instCharge));
  }
  const itemTotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const instTotal = items.reduce((s, i) => s + (i.with_installation ? (i.installation_charge ?? 0) * i.qty : 0), 0);
  const pickup = !!spec.pickup;
  const km = +(Math.hypot((shop.lat - addr.lat) * 111, (shop.lng - addr.lng) * 106)).toFixed(2);
  let charge = 0;
  if (!pickup) {
    const [type, amt] = shop.charge;
    if (shop.free != null && itemTotal >= shop.free) charge = 0;
    else if (type === 'flat') charge = amt;
    else if (type === 'per_km') charge = Math.round(amt * Math.max(1, Math.ceil(km)));
  }
  const grand = itemTotal + instTotal + charge;
  const orderNo = `GG-26-${String(1000 + onum).padStart(6, '0')}`;

  // timeline (minutes after request)
  const flow = ['REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'DELIVERED'];
  const T = spec.ago;
  const gaps = { CONFIRMED: between(4, 12), PAID: between(6, 18), PACKED: between(5, 15), DISPATCHED: between(8, 25), DELIVERED: spec.autoDelivered ? 72 * 60 : between(25, 90) };
  const at = { REQUESTED: T };
  let cursor = T;
  const finalFlow = spec.status === 'ISSUE_REPORTED' ? spec.beforeIssue : spec.status;
  const reach = flow.includes(finalFlow) ? flow.indexOf(finalFlow) : flow.indexOf(spec.reachedBefore ?? 'REQUESTED');
  for (let i = 1; i <= reach; i++) {
    cursor -= gaps[flow[i]];
    at[flow[i]] = Math.max(cursor, 1);
  }
  const ts = (s) => (at[s] != null ? ago(at[s]) : 'null');
  const address = pickup ? null : { name: cust.name, label: 'home', house: addr.house, building: addr.building || null, street: addr.street, landmark: addr.landmark, area: addr.area.name, pincode: addr.area.pincode, lat: addr.lat, lng: addr.lng };

  const ownerId = users[`owner_${spec.shop}`].id;
  const custId = users[spec.customer].id;
  let endCol = '';
  let endTs = 'null';
  let terminalNote = null;
  if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(spec.status)) {
    const endAgo = spec.status === 'EXPIRED' ? T - 120 : Math.max(1, (at[flow[reach]] ?? T) - between(3, 10));
    endCol = spec.status.toLowerCase() === 'rejected' ? 'rejected_at' : spec.status === 'CANCELLED' ? 'cancelled_at' : 'expired_at';
    endTs = ago(endAgo);
    at[spec.status] = endAgo;
  }
  if (spec.status === 'ISSUE_REPORTED') {
    at.ISSUE_REPORTED = Math.max(1, (at[spec.beforeIssue] ?? 10) - between(10, 60));
  }

  orderRows.push(`  (${q(id)}, ${q(orderNo)}, ${q(custId)}, ${q(shop.id)}, ${q(spec.status)}, ${q(spec.status === 'ISSUE_REPORTED' ? spec.beforeIssue : null)}, ${q(spec.method ?? 'call')}, ${q(pickup ? 'pickup' : 'delivery')}, ${js(items)}, ${itemTotal}, ${instTotal}, ${charge}, ${grand}, ${q(cust.name)}, ${address ? js(address) : 'null'}, ${pickup ? 'null' : addr.area.id}, ${pickup ? 'null' : km}, ${q(spec.note ?? null)}, ${js({ name: shop.name, upi_id: shop.upi })}, ${!!spec.updated}, ${q(spec.reject ?? null)}, ${q(spec.cancel ?? null)}, ${q(at.DELIVERED != null && spec.status !== 'ISSUE_REPORTED' ? (spec.autoDelivered ? 'auto' : 'customer') : spec.status === 'ISSUE_REPORTED' && spec.beforeIssue === 'DELIVERED' ? 'customer' : null)}, ${ts('REQUESTED')}, ${ts('CONFIRMED')}, ${ts('PAID')}, ${ts('PACKED')}, ${ts('DISPATCHED')}, ${ts('DELIVERED')}, ${endCol === 'rejected_at' ? endTs : 'null'}, ${endCol === 'cancelled_at' ? endTs : 'null'}, ${endCol === 'expired_at' ? endTs : 'null'}, ${at.ISSUE_REPORTED != null ? ago(at.ISSUE_REPORTED) : 'null'}, ${ago(T)})`);

  // events
  const ev = (from, to, actorId, role, note, when, meta = {}) =>
    eventRows.push(`  (${q(id)}, ${q(from)}, ${q(to)}, ${actorId ? q(actorId) : 'null'}, ${q(role)}, ${q(note)}, ${js(meta)}, ${ago(when)})`);
  ev(null, 'REQUESTED', custId, 'customer', spec.method === 'whatsapp' ? 'Customer sent the order on WhatsApp' : 'Customer is calling the shop', at.REQUESTED, { contact_method: spec.method ?? 'call' });
  const service = pickup ? 'store_pickup' : spec.service ?? pick(['porter', 'rapido', 'porter', 'own', 'uber']);
  const rider = pick(RIDERS);
  const payMethod = pickup && rnd() < 0.5 ? 'cash' : 'upi';
  for (let i = 1; i <= reach; i++) {
    const s = flow[i];
    const prev = flow[i - 1];
    if (s === 'CONFIRMED') ev(prev, s, ownerId, 'shop', spec.updated ? 'Shop updated the order after the call' : 'Confirmed on call', at[s], { updated: !!spec.updated });
    if (s === 'PAID') {
      const txn = payMethod === 'upi' ? `4${between(10000000, 99999999)}${between(100, 999)}` : null;
      ev(prev, s, ownerId, 'shop', `Payment received by ${payMethod === 'upi' ? 'UPI' : payMethod.replace('_', ' ')}${txn ? ` · Txn ${txn}` : ''}`, at[s], { method: payMethod, txn_id: txn });
      paymentRows.push(`  (${q(id)}, ${q(payMethod)}, ${grand}, ${q(txn)}, ${q(ownerId)}, ${ago(at[s])})`);
    }
    if (s === 'PACKED') ev(prev, s, ownerId, 'shop', 'Packed', at[s]);
    if (s === 'DISPATCHED') {
      ev(prev, s, ownerId, 'shop', pickup ? 'Ready for pickup' : `Sent via ${service[0].toUpperCase()}${service.slice(1)} · ${rider[0]}`, at[s], { service });
      dispatchRows.push(`  (${q(id)}, ${q(service)}, ${pickup ? 'null' : q(rider[0])}, ${pickup ? 'null' : q(rider[1])}, ${pickup ? 'null' : q(rider[2])}, ${service === 'porter' ? q(`https://porter.in/track/demo-${onum}`) : 'null'}, ${service === 'porter' || service === 'rapido' ? q(String(between(1000, 9999))) : 'null'}, ${at.DELIVERED ? 'null' : ago(at[s] - 45)}, ${ago(at[s])})`);
    }
    if (s === 'DELIVERED') {
      ev(prev, s, spec.autoDelivered ? null : custId, spec.autoDelivered ? 'system' : 'customer', spec.autoDelivered ? 'Marked delivered automatically after 72 hours' : 'Customer received the order', at[s]);
    }
  }
  if (spec.status === 'REJECTED') ev(flow[reach], 'REJECTED', ownerId, 'shop', spec.reject.replace(/_/g, ' '), at.REJECTED, { reason: spec.reject });
  if (spec.status === 'CANCELLED') ev(flow[reach], 'CANCELLED', custId, 'customer', spec.cancel, at.CANCELLED);
  if (spec.status === 'EXPIRED') ev('REQUESTED', 'EXPIRED', null, 'system', 'No response from the shop in 2 hours', at.EXPIRED);
  if (spec.status === 'ISSUE_REPORTED') {
    const iid = ID.issue(onum);
    ev(spec.beforeIssue, 'ISSUE_REPORTED', custId, 'customer', `Problem reported: ${spec.issue.type.replace(/_/g, ' ')}`, at.ISSUE_REPORTED, { issue_id: iid });
    issueRows.push(`  (${q(iid)}, ${q(id)}, ${q(custId)}, ${q(shop.id)}, ${q(spec.issue.type)}, ${q(spec.issue.text)}, 'open', ${ago(at.ISSUE_REPORTED)})`);
  }
  if (spec.review && (spec.status === 'DELIVERED' || (spec.status === 'ISSUE_REPORTED' && spec.beforeIssue === 'DELIVERED'))) {
    rnum += 1;
    const [rating, text] = spec.review === true ? pick(REVIEWS) : spec.review;
    const reply = rating >= 4 ? pick(REPLIES) : 'Sorry for the delay, sir. We have added another delivery partner.';
    reviewRows.push(`  (${q(ID.review(rnum))}, ${q(id)}, ${q(shop.id)}, ${q(custId)}, ${q(cust.name.split(' ')[0])}, ${rating}, ${q(text)}, ${q(reply)}, ${reply ? ago(Math.max(1, (at.DELIVERED ?? 60) - 120)) : 'null'}, ${ago(Math.max(1, (at.DELIVERED ?? 60) - 30))})`);
  }
  return id;
}

const DAY = 1440;
// ---- The demo scenario customers (Ravi in Kukatpally etc.)
addOrder({ customer: 'ravi', shop: 'kphb', status: 'DELIVERED', ago: 20 * DAY, items: [['ZT-D40600H-10M', 1]], method: 'call', review: [5, 'Got the RTX 4060 within 50 minutes. Sealed box, GST bill given. Super fast!'] });
addOrder({ customer: 'ravi', shop: 'cyber', status: 'DISPATCHED', ago: 95, items: [['RTX 5060 8G VENTUS 2X OC', 1]], method: 'whatsapp', service: 'porter', note: 'Need GST bill' });
addOrder({ customer: 'ravi', shop: 'miyapur', status: 'CONFIRMED', ago: 25, items: [['24115RA8EI', 1], [null, 1]], method: 'call', updated: true });
addOrder({ customer: 'ravi', shop: 'sai', status: 'CANCELLED', ago: 6 * DAY, items: [['MTP03HN/A', 1]], method: 'call', cancel: 'Found a better colour option elsewhere', reachedBefore: 'CONFIRMED' });
addOrder({ customer: 'priya', shop: 'hitech', status: 'REQUESTED', ago: 8, items: [['MW123HN/A', 1]], method: 'call', note: 'Please call before 6 PM' });
addOrder({ customer: 'priya', shop: 'banjara', status: 'DELIVERED', ago: 9 * DAY, items: [['MG6K4HN/A', 1]], method: 'whatsapp', review: [5, 'Doorstep demo and data transfer done. Premium service!'] });
addOrder({ customer: 'arjun', shop: 'dsnr', status: 'PAID', ago: 260, items: [['Z6Z13A', 1]], method: 'call' });
addOrder({ customer: 'arjun', shop: 'secureeye', status: 'PACKED', ago: 70, items: [['HIK-4CH-2MP-KIT', 1, true]], method: 'call', note: 'Ground floor house, need installation today' });
addOrder({ customer: 'sneha', shop: 'cyber', status: 'REQUESTED', ago: 42, items: [['DUAL-RTX4060-O8G', 1], [null, 1]], method: 'whatsapp' });
addOrder({ customer: 'sneha', shop: 'kondapur', status: 'DELIVERED', ago: 3 * DAY, items: [['fq5007AU', 1]], method: 'call', review: true });
addOrder({ customer: 'farhan', shop: 'mehdi', status: 'PAID', ago: 35, items: [['DS-2CE16D0T-ITPFS', 2, true], ['SRV-CCTV-1', 2]], method: 'call' });
addOrder({ customer: 'farhan', shop: 'abids', status: 'ISSUE_REPORTED', beforeIssue: 'DELIVERED', ago: 2 * DAY, items: [['DS-2CE76D0T-ITPFS', 2, true]], method: 'call',
  issue: { type: 'damaged', text: 'One dome camera has a cracked cover. Shared photos with the shop on WhatsApp.' } });
addOrder({ customer: 'kavya', shop: 'deccan', status: 'DISPATCHED', ago: 31 * 60, items: [['GV-N4060EAGLE OC-8GD', 1]], method: 'call', service: 'rapido' });
addOrder({ customer: 'kavya', shop: 'begumpet', status: 'REJECTED', ago: 4 * DAY, items: [['GPC-R57600-4060', 1]], method: 'whatsapp', reject: 'out_of_stock' });
addOrder({ customer: 'rahul', shop: 'kondapur', status: 'DISPATCHED', ago: 50, items: [['83ER00EVIN', 1]], method: 'call', pickup: true });
addOrder({ customer: 'divya', shop: 'uppal', status: 'EXPIRED', ago: 3 * DAY, items: [[null, 1]], method: 'call' });
addOrder({ customer: 'suresh', shop: 'secureeye', status: 'ISSUE_REPORTED', beforeIssue: 'PAID', ago: 26 * 60, items: [['CPP-8CH-24MP-KIT', 1]], method: 'call',
  issue: { type: 'paid_not_sent', text: 'Paid the full amount by UPI yesterday. Shop is not answering calls since morning.' } });
addOrder({ customer: 'ananya', shop: 'banjara', status: 'CONFIRMED', ago: 15, items: [['MFYP4HN/A', 1]], method: 'whatsapp' });
addOrder({ customer: 'vikram', shop: 'sai', status: 'DELIVERED', ago: 75 * 60, items: [['MYEC3HN/A', 1], [null, 1]], method: 'call', autoDelivered: true });
addOrder({ customer: 'meena', shop: 'miyapur', status: 'CANCELLED', ago: 2 * DAY, items: [[null, 1]], method: 'call', cancel: 'Ordered by mistake', reachedBefore: 'REQUESTED' });

// ---- Order history across all shops (ratings, "usually delivers in", reports)
const approvedShops = SHOPS.map((s) => s.key);
for (let i = 0; i < 70; i++) {
  const shopKey = approvedShops[i % approvedShops.length];
  const cust = pick(CUSTOMERS).key;
  const roll = rnd();
  addOrder({
    customer: cust,
    shop: shopKey,
    status: roll < 0.82 ? 'DELIVERED' : roll < 0.9 ? 'REJECTED' : roll < 0.95 ? 'CANCELLED' : 'EXPIRED',
    reject: pick(['out_of_stock', 'customer_not_reachable', 'area_not_served']),
    cancel: 'Changed my mind',
    ago: between(2, 60) * DAY + between(0, 600),
    items: rnd() < 0.3 ? [[null, 1], [null, between(1, 2)]] : [[null, 1]],
    method: rnd() < 0.55 ? 'call' : 'whatsapp',
    pickup: rnd() < 0.12,
    review: rnd() < 0.75 ? true : null,
  });
}

emit(`insert into public.orders (id, order_no, customer_id, shop_id, status, status_before_issue, contact_method, fulfilment, items, item_total, installation_total, delivery_charge, grand_total, customer_name, address, area_id, distance_km, note, shop_snapshot, updated_by_shop, reject_reason, cancel_reason, delivered_by, requested_at, confirmed_at, paid_at, packed_at, dispatched_at, delivered_at, rejected_at, cancelled_at, expired_at, issue_reported_at, created_at) values\n${orderRows.join(',\n')};`);
emit(`select setval('public.order_no_seq', ${1000 + onum + 1});`);
emit(`insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note, meta, created_at) values\n${eventRows.join(',\n')};`);
emit(`insert into public.dispatch_details (order_id, service, rider_name, rider_phone, vehicle_no, tracking_url, delivery_otp, eta, created_at) values\n${dispatchRows.join(',\n')};`);
emit(`insert into public.payments_log (order_id, method, amount, upi_txn_id, recorded_by, created_at) values\n${paymentRows.join(',\n')};`);
emit(`insert into public.reviews (id, order_id, shop_id, customer_id, customer_name, rating, body, shop_reply, shop_replied_at, created_at) values\n${reviewRows.join(',\n')};`);
emit(`insert into public.issues (id, order_id, customer_id, shop_id, type, description, status, created_at) values\n${issueRows.join(',\n')};`);

// Derived shop numbers (same formulas as the live triggers/functions)
emit(`update public.shops s set
  rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.reviews r where r.shop_id = s.id), 0),
  rating_count = (select count(*) from public.reviews r where r.shop_id = s.id),
  orders_delivered = (select count(*) from public.orders o where o.shop_id = s.id and o.delivered_at is not null),
  avg_delivery_mins = (select round(avg(extract(epoch from (o.delivered_at - o.confirmed_at)) / 60))::int
                       from public.orders o where o.shop_id = s.id and o.delivered_by = 'customer'
                         and o.fulfilment = 'delivery' and o.confirmed_at is not null and o.delivered_at is not null
                       having count(*) >= 3);`);

// Referrals: Priya invited Sneha and Ananya
emit(`update public.users set referred_by = ${q(users.priya.id)} where id in (${q(users.sneha.id)}, ${q(users.ananya.id)});
insert into public.referrals (referrer_id, referred_id, code, status, created_at, converted_at)
select ${q(users.priya.id)}, u.id, (select referral_code from public.users where id = ${q(users.priya.id)}), 'ordered', now() - interval '40 days', now() - interval '30 days'
from public.users u where u.id in (${q(users.sneha.id)}, ${q(users.ananya.id)});`);

// Favourites
emit(`insert into public.favourites (user_id, shop_id) values (${q(users.ravi.id)}, ${q(shopById.kphb.id)}), (${q(users.ravi.id)}, ${q(shopById.cyber.id)}), (${q(users.priya.id)}, ${q(shopById.banjara.id)});`);

// ---------------------------------------------------------------------------
// search logs (feeds admin reports and "Demand near you")
// ---------------------------------------------------------------------------
const QUERIES = [
  ['rtx 4060', 40, 6], ['iphone 15', 38, 5], ['iphone 17', 20, 3], ['hikvision 4 channel cctv kit', 14, 3], ['rtx 5060', 12, 2],
  ['ryzen 5 7600', 10, 2], ['galaxy s25', 12, 3], ['redmi note 14 pro', 15, 4], ['macbook air m4', 11, 2], ['cc camera', 16, 9],
  ['gaming laptop', 13, 6], ['airpods pro', 9, 2], ['1tb ssd', 8, 4], ['wifi router', 7, 3], ['power bank 20000', 9, 3],
  ['gpu', 10, 12], ['printer', 6, 3], ['ups', 5, 2], ['monitor 27 inch', 6, 3], ['type c cable', 8, 4],
  // things nobody lists yet -> zero results / demand
  ['rtx 4070 super', 23, 0], ['ps5', 18, 0], ['playstation 5', 9, 0], ['macbook pro m4 max', 6, 0], ['asus rog ally', 7, 0],
  ['samsung z fold 7', 8, 0], ['steam deck', 5, 0], ['gopro hero 13', 6, 0], ['dji mini 4 pro', 4, 0], ['rtx 4090', 11, 0],
];
const logRows = [];
const nearAreas = ['Kukatpally', 'KPHB Colony', 'Madhapur', 'Gachibowli', 'Kondapur', 'Miyapur', 'Ameerpet', 'Secunderabad', 'Dilsukhnagar', 'LB Nagar', 'Uppal', 'Mehdipatnam', 'Banjara Hills'];
for (const [query, count, results] of QUERIES) {
  for (let i = 0; i < count; i++) {
    const a = areaByName(pick(nearAreas));
    const cust = rnd() < 0.7 ? users[pick(CUSTOMERS).key].id : null;
    const typed = rnd() < 0.2 ? query.replace(' ', '') : query;
    const norm = query.toLowerCase().replace(/([a-z])([0-9])/g, '$1 $2').replace(/([0-9])([a-z])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim();
    logRows.push(`  (${cust ? q(cust) : 'null'}, ${q(typed)}, ${q(norm)}, ${a.id}, ${a.lat}, ${a.lng}, ${results}, ${ago(between(5, 7 * DAY))})`);
  }
}
emit(`insert into public.search_logs (user_id, query, normalized, area_id, lat, lng, results_count, created_at) values\n${logRows.join(',\n')};`);

// shop stats (views / call / WhatsApp taps) for the last 7 days
const statRows = [];
for (const s of SHOPS) {
  for (let d = 0; d < 7; d++) {
    statRows.push(`  (${q(s.id)}, (now() at time zone 'Asia/Kolkata')::date - ${d}, ${between(12, 140)}, ${between(1, 14)}, ${between(1, 18)}, ${between(0, 6)})`);
  }
}
emit(`insert into public.shop_stats_daily (shop_id, day, views, call_taps, whatsapp_taps, shares) values\n${statRows.join(',\n')};`);

// ---------------------------------------------------------------------------
// content
// ---------------------------------------------------------------------------
const bannersAt = out.length;
emit(`insert into public.banners (title, subtitle, bg_color, link_type, link_value, sort) values
  ('Hyderabad shops, delivered in hours', 'Order by call or WhatsApp · pay the shop by UPI', '#4F46E5', 'none', null, 1),
  ('Graphics cards in stock near you', 'RTX 4060 · RTX 5060 · RX 7600 from ₹25,999', '#0F172A', 'search', 'graphics card', 2),
  ('Secure your home this festive season', 'CCTV kits with same-day installation', '#FF6B35', 'category', ${q(String(catId['cctv-security']))}, 3),
  ('Invite friends to Gadget Galli', 'Share your code on WhatsApp', '#16A34A', 'url', '/referral', 4);`);
emit(`insert into public.featured (kind, shop_id, sort) values ('shop', ${q(shopById.kphb.id)}, 1), ('shop', ${q(shopById.banjara.id)}, 2), ('shop', ${q(shopById.abids.id)}, 3);
insert into public.featured (kind, catalog_product_id, sort) values ('product', ${q(productByMn['ZT-D40600H-10M'].id)}, 1), ('product', ${q(productByMn['MTP03HN/A'].id)}, 2), ('product', ${q(productByMn['HIK-4CH-2MP-KIT'].id)}, 3);`);

// A few notifications so inboxes are not empty
emit(`insert into public.notifications (user_id, app, kind, title, body, data, push_status) values
  (${q(users.ravi.id)}, 'customer', 'order_dispatched', 'On the way! 🛵', 'Porter · ${RIDERS[0][0]}. Tap "I received my order" when it arrives.', ${js({ order_id: ID.order(2), url: `/order/${ID.order(2)}` })}, 'skipped'),
  (${q(users.owner_hitech.id)}, 'partner', 'new_order', 'New order GG-26-001005', 'Priya Reddy wants 1 item(s). Call them to confirm.', ${js({ order_id: ID.order(5), url: `/partner/order/${ID.order(5)}` })}, 'skipped');`);

emit(`commit;`);

writeFileSync(OUT, `${out.join('\n\n')}\n`);

// Production starter data: the same areas, categories, brands, synonyms, catalog and home banners,
// without demo users, shops, orders or search history.
const reference = [
  `-- Gadget Galli reference data for a NEW production project. GENERATED by supabase/seed/generate-seed.mjs.
-- Zones/areas/pincodes, categories (EN/TE/HI), brands, search synonyms, ${catalogRows.length} catalog products and home banners.
-- No demo people, shops or orders. Apply once after the migrations: psql "$DATABASE_URL" -f supabase/seed-reference.sql`,
  'begin;',
  ...out.slice(1, referenceEnd),
  out[bannersAt],
  'commit;',
];
writeFileSync(join(dirname(OUT), 'seed-reference.sql'), `${reference.join('\n\n')}\n`);
console.log(`Wrote ${OUT}: ${catalogRows.length} products, ${SHOPS.length + 1} shops, ${ln} listings, ${onum} orders, ${rnum} reviews, ${logRows.length} searches`);
