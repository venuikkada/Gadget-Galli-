# Gadget Galli

**Hyderabad electronics shops, delivered in hours.**

Customers search for the exact item they want (an iPhone 15 128 GB, an RTX 4060, a Hikvision 2 MP camera kit). They see which nearby shops have it, at what price and how fast each can deliver, add it to a one-shop cart, and order by **calling or WhatsApp-ing the shop**. They pay the shop directly by **UPI**, so the app never holds money. The shop sends the item with Porter, Rapido, Uber or its own rider, and the customer taps **"I received my order"**.

Three parts share one Supabase backend:

| Part | What it is | Code |
|---|---|---|
| **Customer app** | Android/iOS app (Expo, React Native). Also runs on the web. | `apps/mobile/src/customer`, `apps/mobile/src/app/(customer)` |
| **Shop Partner app** | The same app. The role is chosen at sign-up. Partner code is kept separate so it can become its own app later. | `apps/mobile/src/partner`, `apps/mobile/src/app/partner` |
| **Admin panel** | Web panel for the Gadget Galli team (React, Vite, Tailwind) | `apps/admin` |
| **Backend** | Supabase: Postgres schema, search, the order workflow as database functions, row-level security, storage, realtime, edge functions | `supabase/` |

> 📣 **Selling and marketing:** see **[docs/MARKETING.md](docs/MARKETING.md)** for the full go-to-market playbook: signing up shops, getting customers, scripts, budgets, the launch calendar and the numbers to watch.

---

## What's inside

**Customer app**
- Phone number login with OTP; English, Telugu and Hindi; light and dark mode.
- Delivery location from GPS, the area list or saved addresses (Home / Office / Other with a map pin). Anywhere outside Hyderabad shows "We serve Hyderabad only for now" with a Notify me button.
- Typo-tolerant search. `iphon 15`, `rtx4060`, `4060`, `gpu` (synonym for graphics card) and `cc camera` all find the right products. By default it shows only shops that deliver to you. Filters: category, brand, price, condition, delivery time and rating. Sorts: relevance, price, nearest, fastest and top rated.
- Product page that compares every shop's price, delivery time and charge, distance, rating and stock.
- Shop page: photos, a Verified badge, opening hours, Google Maps, search inside the shop and reviews with the shop's replies.
- One-shop cart with an optional installation service, delivery or store pickup and a note. Ordering is by **Call** or **WhatsApp** (with the order details pre-filled).
- Live order timeline (Requested → Confirmed → Paid → Packed → Dispatched → Delivered). After the shop confirms, the customer can **Pay ₹X by UPI** through a link or QR. They see dispatch details (rider, phone, vehicle, OTP, tracking), tap "I received my order" (with a celebration), then rate and review with photos. They can report a problem within 7 days.
- Favourite shops, my reviews, referral code, notifications, help and legal pages, and account deletion.

**Shop Partner app**
- An 8-step registration wizard that saves as you go:
  1. Shop details and hours
  2. Contacts
  3. Address and map pin
  4. Delivery zones, areas or radius, plus charges
  5. Photos
  6. UPI ID and QR
  7. Private documents
  8. Submit
- After submitting, the owner sees a status page (under review, changes requested or rejected).
- Dashboard: Open/Closed switch; today's requests, sales, views, and call and WhatsApp taps; and what needs attention.
- **Loud new-order alert**: an alarm sound and vibration in the app, plus a high-priority notification channel on Android.
- Orders screen with one big button for each step:
  - Accept (with the option to edit prices or quantities) or Reject
  - Payment received (UPI, bank or cash, with a screenshot)
  - Packed (package and bill photos)
  - Send (Porter, Rapido, Uber or own rider, with shortcuts to open those apps)
- Products:
  - Add from the master catalog, or add a custom product (the admin reviews it).
  - Edit price and stock with one tap.
  - Duplicate a listing to add a variant.
  - Bulk upload from a CSV file, with errors shown per row.
- Insights: sales by day, week and month; top products; average confirm, dispatch and delivery times; and **"Demand near you"**, which lists what customers nearby searched for that the shop doesn't sell yet.
- Reviews with replies, plus a shop link and QR with a **printable A4 poster** in English, Telugu and Hindi.

**Admin panel**
- **Dashboard**: today's numbers and anything that is stuck.
- **Shops**: review queue with private documents opened through 5-minute signed links; approve, reject or ask for changes; Verified and UPI-checked badges; warn and suspend; internal notes; audit history.
- **Catalog**:
  - Approve or merge custom products.
  - Edit products and photos.
  - Manage categories (with Telugu and Hindi names), brands and search synonyms.
  - Test search results live.
- **Orders**: filters and a full timeline. Stuck orders are flagged automatically: not confirmed in 30 minutes, paid but not dispatched in 3 hours, or dispatched but not delivered in 24 hours. Admins can change an order's status, with a note required.
- **Problems**: notes; resolve with an optional warning or suspension for the shop.
- **Customers**: search and block. A super admin can manage admin roles.
- **Content and growth**: home banners, featured shops and products, push campaigns by segment or area, and referral tracking.
- **Areas**: zones, areas and pincodes, plus the waitlist of people outside Hyderabad.
- **Reports**: orders and GMV per day, **searches with no results** (useful for deciding which shops to recruit), top searches, top shops and orders by area. Each table can be exported as CSV.
- Public share pages `/s/product/:id` and `/s/shop/:id` that open the app from WhatsApp links.

---

## Quick start (local, no Docker needed)

Requirements: Node 22+, pnpm 10, and PostgreSQL 15+ server binaries (`initdb`). On Ubuntu, `apt install postgresql` is enough. On macOS, use `brew install postgresql@16`.

```bash
pnpm install

# 1. Start the local backend: Postgres with all migrations and demo data, plus a small
#    Supabase-compatible API on http://localhost:54321 (prints the keys to use)
pnpm dev-stack

# 2a. Admin panel (in another terminal)
cp apps/admin/.env.example apps/admin/.env     # set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from step 1
pnpm admin                                      # http://localhost:5173

# 2b. Mobile app (Expo)
cp apps/mobile/.env.example apps/mobile/.env   # set EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY from step 1
pnpm mobile                                     # press w for web, or scan the QR code with Expo Go / a dev build
```

> If you change `EXPO_PUBLIC_*` values, restart Expo with `npx expo start --clear`. Expo bakes them into the bundle.

To test against a real Supabase project instead, see **[docs/SETUP.md](docs/SETUP.md)**.

### Demo logins

All people, shops, phone numbers and UPI IDs in the demo data are fictional. On the local stack and on a Supabase project with the test numbers from `supabase/config.toml`, every demo phone number logs in with **OTP `123456`**.

| Who | Login |
|---|---|
| Admin (super admin) | `admin@gadgetgalli.in` / `GadgetGalli@2026` |
| Admin (support) | `support@gadgetgalli.in` / `GadgetGalli@2026` |
| Customer: Ravi Kumar, Kukatpally (home and office addresses) | `+91 90000 00001` |
| Other customers | `+91 90000 00002` … `00012` |
| Shop owners (15 live shops + 1 under review) | `+91 90000 10001` … `10016` (e.g. `10002` KPHB Computer World, `10004` Cyber Zone Systems) |
| New user with no shop yet (to try registration) | `+91 90000 19999` |

Try this: log in as Ravi and search **`rtx 4060`**. Only KPHB Computer World and Cyber Zone Systems show up as delivering to Kukatpally. Deccan PC Components and Begumpet PC Builders stock it but don't deliver there; turn off "Delivers to my area" to see them.

---

## Tests and checks

| Command | What it checks |
|---|---|
| `pnpm db:test` | Creates a throwaway Postgres, applies every migration and the seed, then runs SQL test suites: search (typos, synonyms, delivery filtering), security (RLS, shops can't see each other's orders, documents admin-only, phone visible only on active orders), the full order state machine, scheduled jobs (expiry, reminders, auto-delivery), partner/admin flows and an API smoke test. |
| `pnpm test` | Unit tests for `@gg/shared` (₹1,25,000 formatting, IST times, opening hours, the status machine, WhatsApp/UPI links, search helpers). |
| `pnpm typecheck` | TypeScript for every package. |
| `pnpm i18n:check` | Telugu and Hindi match English key-for-key (placeholders, brand names) and every `t()` key used in code exists. |
| `pnpm e2e:prepare && pnpm dev-stack --serve-admin apps/admin/dist --serve-mobile apps/mobile/dist`, then `pnpm e2e` | **End-to-end browser test (Playwright).** A customer searches "rtx4060", compares shops and orders on WhatsApp. The shop accepts, records the UPI payment with a photo, packs the order and sends it with Rapido. The customer confirms delivery and leaves a review. A new owner registers a shop through all 8 steps. The admin reviews the documents and approves the shop and a custom product. The app switches to Telugu, and a share page opens. Screenshots go to `test-results/smoke/`. Run `pnpm dev-stack:reset` first for fresh data. |

## Repository layout

```
apps/
  mobile/            Expo SDK 56 app (expo-router). src/customer, src/partner, src/shared, src/app (routes)
  admin/             React + Vite + Tailwind admin panel and public share pages
packages/
  shared/            Types, order status machine, ₹/phone/IST formatting, WhatsApp & UPI links (used by both apps)
supabase/
  migrations/        Schema, search, order workflow, RLS, storage, realtime/push/jobs (10 files)
  seed/              Demo data generator (zones, 57 areas, categories, 172 products, 16 shops, 90 orders…)
  seed.sql           Generated demo data (pnpm db:seed:generate)
  functions/         Edge functions: send-push, order-jobs, delete-account
  tests/             SQL tests + run-tests.sh
scripts/
  dev-stack/         Local Postgres + Supabase-compatible API (pnpm dev-stack)
  e2e/               Playwright smoke test
docs/
  SETUP.md           Going live: Supabase, SMS, maps, push, app store builds, admin hosting
  DECISIONS.md       Every product and technical choice made, and why
  MARKETING.md       How to sell: shops, customers, channels, scripts, budgets, KPIs
```
