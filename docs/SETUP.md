# Going live: setup guide

This takes Gadget Galli from the repo to a real Supabase project, real phones and a hosted admin panel. Follow the steps in order. Each step says where the setting lives.

**What you need (accounts and rough cost)**

| Service | Why | Cost |
|---|---|---|
| [Supabase](https://supabase.com) | Database, login, storage, realtime, edge functions | Free to start; **Pro (US$25/month)** before launch for daily backups and no pausing |
| SMS provider with **DLT registration** (MSG91, Textlocal, Twilio…) | OTP login SMS in India | About ₹0.15–0.25 per SMS |
| [Expo / EAS](https://expo.dev) | Building the Android/iOS apps and sending push notifications | Free tier is enough to start |
| Google Play Console | Publishing on Android | US$25 one time |
| Apple Developer Program | Publishing on iPhone (optional at first; most Hyderabad customers use Android) | US$99/year |
| Google Cloud (Maps SDK + Places API) | Map pin and address search (optional: the app falls back to the area list) | Free monthly credit covers early usage |
| A domain such as `gadgetgalli.in` + static hosting (Vercel / Netlify / Cloudflare Pages) | Admin panel and share links | Domain ₹700–1,000/year; hosting free |

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

## 2. Phone OTP login (SMS)

Customers and shop owners log in with their phone number.

1. **Dashboard → Authentication → Sign In / Providers → Phone**: enable it and pick a provider. Supabase supports Twilio, Twilio Verify, MessageBird, Vonage and **Textlocal (India)**. To use **MSG91** or another Indian gateway, set up a [Send SMS Auth Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook) that calls the gateway's API.
2. **India DLT is mandatory.** Register your company, sender ID (e.g. `GDGTGL`) and this template on your provider's DLT portal (Jio, Airtel, Vi…):
   `{#var#} is your Gadget Galli login code. Do not share it with anyone.`
   SMS that don't match a registered template are blocked by telecom operators.
3. **For app store review and demos**, add test numbers under **Authentication → Phone → Test OTPs**, e.g. `919000000001=123456`. `supabase/config.toml` lists the demo numbers. Remove them from production once the stores have approved the app.
4. **Authentication → Rate limits**: keep OTP sending at about 30 per hour per IP to stop SMS abuse.

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
   - Optional maps (Google Cloud Console → enable *Maps SDK for Android*, *Maps SDK for iOS*, *Places API (New)*; restrict each key to your app):
     - `GOOGLE_MAPS_ANDROID_API_KEY`
     - `GOOGLE_MAPS_IOS_API_KEY`
     - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`: used for Places address search.
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
4. **WhatsApp link previews** use the generic Gadget Galli title, description and logo from `index.html`, because the share page is rendered in the browser. If you later want per-product previews (photo and price in the WhatsApp card), add a small edge or serverless function that returns OG tags for `/s/*` before the SPA loads.

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
