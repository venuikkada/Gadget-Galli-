# Going live: setup guide

This takes Gadget Galli from the repo to a real Supabase project, real phones and a hosted admin panel. Follow the steps in order. Each step says where the setting lives.

**What you need (accounts and rough cost)**

| Service | Why | Cost |
|---|---|---|
| [Supabase](https://supabase.com) | Database, login, storage, realtime, edge functions | Free to start; **Pro (US$25/month)** before launch for daily backups and no pausing |
| [MSG91](https://msg91.com) with **DLT registration** | OTP login SMS in India | About ₹0.15–0.25 per SMS |
| [Expo / EAS](https://expo.dev) | Building the Android/iOS apps and sending push notifications | Free tier is enough to start |
| Google Play Console | Publishing on Android | US$25 one time |
| Apple Developer Program | Publishing on iPhone (optional at first; most Hyderabad customers use Android) | US$99/year |
| Maps | OpenStreetMap: map pin, place search and shop/customer maps, no account or key | Free (move to a tile provider's free tier as traffic grows, see DECISIONS #12) |
| A domain such as `gadgetgalli.in` + static hosting (Vercel / Netlify / Cloudflare Pages) | Admin panel and share links | Domain ₹700–1,000/year; hosting free |

**Start these on day one, because they take days or weeks:**
- **SMS sender registration (DLT, step 2).** Registering your business, the sender ID and the OTP template usually takes from a few days to two weeks. Until it is approved, only the test numbers can log in.
- **Google Play access.** Google currently requires new *personal* developer accounts to run a closed test (at least 12 testers for 14 days in a row) before the app can be published to everyone. *Organisation* accounts skip this but need a D-U-N-S number, which can take a few weeks to get. Check the current rule when you sign up.
  - Your partner shops and beta customers (MARKETING.md §10, weeks 1–2) make a natural closed-test group.
  - Shops can also install the preview APK directly (step 4) while you wait.

---

## 1. Supabase project

1. Create a project at supabase.com. Pick region **Mumbai (ap-south-1)** for the lowest latency from Hyderabad, and save the database password.
2. **Dashboard → Database → Extensions**: enable `pg_cron` and `pg_net`. They power the scheduled order jobs and push delivery. `pg_trgm` and `unaccent` are enabled by the migrations.
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the repo root:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push            # applies supabase/migrations/* in order
   ```
4. Load the starter data. It has the 57 areas, the categories with Telugu and Hindi names, brands, search synonyms, 172 catalog products and home banners, but no demo people or shops:
   ```bash
   psql "<connection string from Dashboard → Connect>" -f supabase/seed-reference.sql
   ```
   For a **staging or demo** project you can load the full demo data instead (`supabase/seed.sql`). It adds fictional shops, customers and orders. **Never load `seed.sql` into production.**
5. **Dashboard → Project Settings → API**: copy the **Project URL** and the **anon public key**. Both apps need them. Never put the `service_role` key in an app.

### Create your admin account
1. **Dashboard → Authentication → Users → Add user**: enter your email and a strong password, and tick "Auto confirm".
2. **SQL Editor**:
   ```sql
   update public.users set admin_role = 'super_admin', name = 'Your Name' where email = 'you@yourdomain.in';
   ```
   A super admin can then give other team members the `support` role from **Admin → Customers → Admins**. Each team member first needs their own login, created the same way in step 1.

## 2. Phone OTP login (SMS through MSG91)

Customers and shop owners log in with their phone number and a 6-digit code. Supabase creates the code; the **`send-sms`** edge function sends it through **MSG91** (DECISIONS #53). The apps need no change.

**A. MSG91 and DLT (start on day one; approval takes days)**
1. Sign up at [msg91.com](https://msg91.com) and finish the KYC with your business details.
2. **Register on a DLT portal** (Jio, Airtel, Vi or BSNL; MSG91 support can guide you). Indian operators block SMS without it.
   - **Entity:** your business (PAN, GST or registration). Note the **Entity ID**.
   - **Header (sender ID):** 6 letters, e.g. `GDGTGL`, type *Transactional / Service Implicit*.
   - **Content template:** category *Service Implicit (OTP)*, exactly:
     `{#var#} is your Gadget Galli login code. Do not share it with anyone.`
     Note the **DLT Template ID** once approved.
3. In MSG91, add the Entity ID and the sender ID. Then **SMS → Templates → Create**, with the same text but MSG91's variable:
   `##otp## is your Gadget Galli login code. Do not share it with anyone.`
   Enter the DLT Template ID and sender ID, save, and copy MSG91's **Template ID**.
4. **MSG91 → Authkey:** create an auth key (don't restrict it to IP addresses; Supabase's servers change). Add SMS credit (about ₹0.15–0.25 per OTP).

**B. Supabase (dashboard)**
1. **Authentication → Sign In / Providers → Phone:** turn on *Enable Phone provider* and *Enable phone confirmations*. The SMS provider fields are not used once the hook below is on. If the dashboard won't save without a provider, pick one and leave its fields as placeholders.
2. **Authentication → Hooks → Add hook → Send SMS hook → HTTPS**:
   - URL: `https://<project-ref>.supabase.co/functions/v1/send-sms`
   - Click **Generate secret**, copy it (it starts with `v1,whsec_`), then **Create**.
3. **Edge Functions → Secrets** (enter them here yourself; never paste keys into a chat or the code):
   | Name | Value |
   |---|---|
   | `SEND_SMS_HOOK_SECRET` | the hook secret from step 2 |
   | `MSG91_AUTH_KEY` | MSG91 auth key |
   | `MSG91_TEMPLATE_ID` | MSG91's Template ID (not the DLT one) |
   | `MSG91_OTP_VAR` | only if your template's variable isn't `##otp##`, e.g. `OTP` for `##OTP##` |
4. The function is deployed already on the demo project. On a new project: `supabase functions deploy send-sms --no-verify-jwt`.
5. **Authentication → Rate limits:** keep SMS sending at about 30 per hour. The function also refuses non-Indian numbers, which stops SMS-pumping fraud.

**C. Test it:** log in with your own number. The SMS should arrive within about 10 seconds. If it doesn't, look at **Edge Functions → send-sms → Logs** (phone numbers show only the last 4 digits). The app tells the user what went wrong:
- "SMS login is not switched on yet": a secret is missing.
- "We could not send the SMS": MSG91 refused, for example a wrong key or template, no credit, or a template not yet approved on DLT.

**Demo numbers.** `+91 90000 xxxxx` are made up but sit in a real mobile series, so the function never texts them. On the demo websites (`demo: true`) they sign in with OTP `123456` by password, as before. For the store apps' reviewers, add them under **Authentication → Phone → Test phone numbers**, e.g. `919000000001=123456` (`supabase/config.toml` lists them). Remove these, and set `demo: false`, at the real launch.

## 3. Storage, realtime, scheduled jobs, push

- **Storage buckets** are created by the migrations, with their access rules:
  - Public: `shop-media`, `product-photos`, `review-photos`, `banners`.
  - Private: `shop-documents` (admins only) and `order-media` (only the customer, the shop and admins).
- **Realtime** for `orders`, `order_events` and `notifications` is also turned on by the migrations. It drives the live order timeline and the shop's loud new-order alert. The app also polls every 30–45 seconds, so it keeps working if realtime drops.
- **Scheduled order jobs** run every 5 minutes through `pg_cron`. They expire requests that get no reply in 2 hours, remind customers about orders that have been on the way for 24 hours, and mark orders delivered automatically after 72 hours. If `pg_cron` was not enabled before `db push`, either re-run the last migration or schedule the `order-jobs` edge function (below) every 5 minutes.

### Edge functions
```bash
supabase functions deploy send-push
supabase functions deploy order-jobs
supabase functions deploy delete-account

# Secrets (pick long random strings):
supabase secrets set PUSH_WEBHOOK_SECRET=<random-1> CRON_SECRET=<random-2>
```
Then tell the database where to send push notifications (**SQL Editor**):
```sql
insert into public.app_config (key, value) values
  ('push_webhook_url', 'https://<project-ref>.supabase.co/functions/v1/send-push'),
  ('push_webhook_secret', '<random-1>')
on conflict (key) do update set value = excluded.value;
```
Every new row in `notifications` (order updates, the new-order alert for shops, admin campaigns) is then sent through Expo push within seconds. Notifications that fail are retried by the 5-minute job.

## 4. Mobile app (Android & iOS)

1. `cp apps/mobile/.env.example apps/mobile/.env`, then fill in:
   - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: from step 1.
   - `EXPO_PUBLIC_SHARE_BASE_URL`: where the admin panel is hosted, e.g. `https://gadgetgalli.in`. Shared links look like `https://gadgetgalli.in/s/product/<id>`.
   - `EXPO_PUBLIC_SUPPORT_PHONE`, `EXPO_PUBLIC_SUPPORT_WHATSAPP`: your support line, shown in Help.
   - Maps need no key: they use OpenStreetMap. When traffic grows, set `EXPO_PUBLIC_MAP_TILE_URL` and `EXPO_PUBLIC_MAP_ATTRIBUTION` to a tile provider's free tier (for example MapTiler).
2. Link the app to EAS:
   ```bash
   cd apps/mobile
   npm i -g eas-cli && eas login
   eas init                     # creates the project; put the id in .env as EAS_PROJECT_ID (and EXPO_OWNER)
   ```
3. Set up push credentials:
   - **Android**: create a Firebase project, add an Android app with package `in.gadgetgalli.app` and upload the FCM V1 service-account key with `eas credentials`.
   - **iOS**: EAS creates the APNs key for you during the first build.
4. Build:
   ```bash
   eas build --profile preview --platform android      # installable APK for testing with shops
   eas build --profile production --platform android   # AAB for Google Play
   eas build --profile production --platform ios
   eas submit --platform android                       # or upload in Play Console
   ```
5. **Google Play listing:**
   - Category: Shopping.
   - Content rating: Everyone.
   - Data safety: phone number, approximate and precise location, photos (all optional except the phone number), no data sold.
   - Give reviewers a demo login: test phone number plus OTP `123456`.
6. **The new-order sound:** on Android, the loud `new-orders` notification channel is created on first launch. Shop owners should allow notifications and turn off battery optimisation for the app. The partner app reminds them.

> The same app serves customers and shop owners. The partner code (`src/partner`, `src/app/partner`) only imports from `src/shared`, so it can later become a separate "Gadget Galli Partner" app with its own store listing.

## 5. Admin panel and share links

1. `cp apps/admin/.env.example apps/admin/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Optionally also set `VITE_PLAY_STORE_URL` and `VITE_APP_STORE_URL`, which the share page uses for its "Get the app" buttons.
2. Build: `pnpm admin:build` creates the static site in `apps/admin/dist`.
3. Host it on Vercel, Netlify or Cloudflare Pages.
   - It is a single-page app, so every path must be served by `index.html`. The rewrite files are included: `apps/admin/public/_redirects` for Netlify and Cloudflare Pages, and `apps/admin/vercel.json` for Vercel (set the project root to `apps/admin`).
   - Point `gadgetgalli.in` at it. `/` is the admin login, and `/s/...` serves the public share pages.
4. **The customer and Shop Partner apps as websites:** the same app also runs in a browser. [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md) builds all three websites (customer, Shop Partner, admin) with a `config.js` you fill in after uploading, and walks through Hostinger step by step.
5. **WhatsApp link previews** use the generic Gadget Galli title, description and logo from `index.html`, because the share page is rendered in the browser. If you later want per-product previews (photo and price in the WhatsApp card), add a small edge or serverless function that returns OG tags for `/s/*` before the SPA loads.

## 6. Before launch: checklist

- [ ] The admin password from the demo data is not used anywhere; your own admin account works.
- [ ] Production has `seed-reference.sql` only, with no demo shops or people.
- [ ] Test OTP numbers are removed from production after store approval (or kept only for one reviewer number).
- [ ] SMS DLT template approved; a real number receives the OTP within about 10 seconds.
- [ ] Push notifications reach a real Android phone: place a test order and check that the shop phone rings.
- [ ] `pg_cron` job `gg-order-jobs` exists (**Database → Cron**), or the `order-jobs` function is scheduled.
- [ ] Database backups are on (Pro plan) and Point-in-Time Recovery is considered.
- [ ] Legal pages in the app (Help → Terms / Privacy) reviewed by a lawyer. The text is in `apps/mobile/src/shared/i18n/en.ts` under `legal`. Under the **Consumer Protection (E-Commerce) Rules 2020**, a marketplace must show each seller's name, address and contact details (the shop page does this) and name a **Grievance Officer** with contact details. Add yours to the Terms.
- [ ] Have a native speaker review the Telugu (`te.ts`) and Hindi (`hi.ts`) texts.
- [ ] Support WhatsApp number is staffed during shop hours.

## Local development and tests

See the [README](../README.md#quick-start-local-no-docker-needed):
- `pnpm dev-stack` runs a local Postgres with the real migrations and demo data, plus a small Supabase-compatible API.
- `pnpm db:test` runs the SQL tests.
- `pnpm e2e` runs the browser end-to-end test.

The local stack is for development only. It implements just the parts of Supabase the apps use, has no SMS and accepts OTP `123456` for any number. Never deploy it.

If you prefer the official Supabase local stack (Docker), `supabase start` also works with this repo. It reads `supabase/config.toml`, applies the migrations and loads `seed.sql`.
