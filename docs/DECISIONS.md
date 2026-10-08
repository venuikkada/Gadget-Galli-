# Decisions and assumptions

The brief said "if something is unclear, make a sensible choice and list your choices". These are the choices, grouped by area, with the reason for each. Anything marked **(changeable)** is a single constant, setting or row you can edit.

## Platform and architecture

1. **Supabase as the one backend** for all three parts: Postgres, phone/email auth, storage, realtime and edge functions. It gives SQL (needed for typo-tolerant search and reports), row-level security for "a shop only sees its own orders", and realtime for the live timeline. It also avoids running servers.
2. **Business rules live in the database.** Every action (place order, confirm, mark paid, dispatch, review, approve shop…) is a `SECURITY DEFINER` Postgres function that checks who is calling and whether the step is allowed, then returns JSON. Both apps call these functions; neither writes order tables directly. A buggy or tampered app cannot skip a step, every change writes a timeline event and a notification in the same transaction, and the rules are covered by SQL tests.
3. **One mobile app for customers and shop owners**, built with Expo SDK 56 and expo-router. The role is picked at sign-up and can be switched later. Partner code (`src/partner`, `src/app/partner`) imports only from `src/shared`, so it can become a separate "Gadget Galli Partner" app later without rewriting.
4. **The admin panel is a web app** (React, Vite, Tailwind). The team works from laptops and needs tables, filters and document viewing; it also works on a phone.
5. **pnpm monorepo** with a `@gg/shared` package for the order status machine, ₹ and phone formatting, IST times, WhatsApp and UPI link builders, and the shared types, so both apps format and validate the same way.
6. **Haversine distance instead of PostGIS.** At city scale (around 35 km) plain lat/lng maths is accurate enough, and it runs anywhere. Switch to PostGIS if you expand to many cities.
7. **Search runs inside Postgres** (`pg_trgm` trigram similarity, normalisation, a synonyms table and a model-number bonus) rather than in a separate search service:
   - Typos and spacing are handled: `iphon 15` and `rtx4060` both work.
   - Synonyms are editable in the admin panel: gpu → graphics card, cc camera → CCTV, mobile → phone.
   - Every search is logged. That feeds the "searches with no results" report and the shops' "Demand near you".

## Location and delivery

8. **Hyderabad only.** A location counts as in service if the nearest known area centre is within 8 km and it is within 35 km of the city centre. Anyone outside sees "We serve Hyderabad only for now" and can join a waitlist, which shows in Admin → Areas. **(changeable)**
9. **57 areas in 5 zones, with real pincodes:** West Hyderabad, Central Hyderabad, Secunderabad & North, East Hyderabad and South Hyderabad. Admins can add areas and pincodes.
10. **Shops choose their own delivery coverage.** A shop can tick whole zones, single areas, or deliver within a radius (5, 10, 15 or 20 km). It also sets its delivery charge (free, flat or per km), a free-delivery threshold, a minimum order, its usual delivery time and whether it offers store pickup.
11. **"Delivers to my area" is on by default in search.** Customers see only what they can actually get, and a hint says how many more products exist elsewhere in the city.
12. **Google Maps is optional.** Without an API key, customers pick their area from a list and addresses still work. With a key, they get a draggable map pin and Places address search.

## Accounts and roles

13. **Customers and shop owners log in with phone number + OTP.** That is the norm in India, and the shop needs the number to call the customer. **Admins use email + password.** Email sign-up is disabled; a super admin creates admin accounts.
14. **Admin roles:** `super_admin` can do everything, including granting admin roles. `support` can do everything else: review shops, handle orders, problems and the catalog, and send campaigns. The database checks "is an admin" for all admin functions, and "is a super admin" for role changes.
15. **Demo phone numbers log in with OTP 123456** (in `supabase/config.toml` and the local stack). All demo people, shops, phone numbers and UPI IDs are fictional.
16. **Deleting an account anonymises it rather than erasing order history.** Shops keep their order records, without the customer's personal details. Deletion is blocked while an order is still active.

## Orders and money

17. **The app never touches money.** After the shop confirms, the customer pays the shop directly through a UPI link (`upi://pay` with the shop's UPI ID, amount and order number) or by scanning the shop's QR code. The shop then taps "Payment received". This avoids a payment-gateway licence, settlement delays and fees for shops.
18. **The order is created the moment the customer taps Call or WhatsApp.** The shop sees it in the app with a loud alert, and both sides share the order number. The WhatsApp message is pre-filled with the order number, items, total and address.
19. **One shop per cart.** Adding an item from another shop asks the customer whether to start a new cart. One order goes to one shop, with one delivery.
20. **The shop can edit prices or quantities when confirming** (for example, after agreeing a price on the call). The customer sees that the shop updated the order.
21. **Order flow:** REQUESTED → CONFIRMED → PAID → PACKED → DISPATCHED → DELIVERED. Other statuses are REJECTED (by the shop, with a reason), CANCELLED (by the customer), EXPIRED and ISSUE_REPORTED.
    - Customers can cancel only before payment.
    - Cash is allowed only for store pickup.
    - **Store pickup** uses the same steps: "Dispatched" means "ready for pickup".
22. **Timers:** **(changeable, in `private.run_order_jobs` and `public.gg_stuck_reason`)**
    - A request with no shop response expires after **2 hours**.
    - The customer gets a reminder after **24 hours** in DISPATCHED, and the order is marked delivered automatically after **72 hours**.
    - Admin "stuck" flags appear for: not confirmed in 30 minutes, paid but not dispatched in 3 hours, dispatched but not delivered in 24 hours.
23. **Problems** can be reported up to **7 days after delivery**. The order shows "Issue reported" and goes back to its previous status once the admin resolves it. Resolving can also warn or suspend the shop.
24. **The shop sees the customer's phone number only while the order is active** (REQUESTED to DISPATCHED). It sees name, address and items for its own orders.
25. **Spam guard:** a customer can have at most **5 orders waiting** for shops at once.
26. **Reviews** are allowed only after delivery, one per order, with photos. The shop can reply publicly. Ratings and the "usually delivers in" time are recalculated from real orders.
27. **Order numbers** look like `GG-26-001092` (GG-year-sequence).

## Shops

28. **The registration wizard saves after every step** (8 steps), so an owner can stop and continue later.
    - Admin approval is needed before the shop appears to customers.
    - **Verified** is a separate, stronger badge that an admin gives after checking documents and visiting or video-calling the shop.
29. **Documents** (trade licence, Udyam or GST certificate, owner ID) go to a private storage bucket. Only admins can open them, through links that expire in 5 minutes.
30. **Products come from one master catalog**, so "iPhone 15 128 GB Black" from ten shops appears as one product with ten prices.
    - Shops can add a **custom product**. It goes to the admin's review queue and appears in customer search once approved. Duplicates can be merged into the existing product.
    - A shop's listing has its own price, MRP, condition (new, open box, refurbished, used), warranty, stock, installation charge, photos and notes.
31. **Bulk upload is CSV.** Excel and Google Sheets both "Save as CSV", and the current SheetJS releases aren't published on the npm registry. Rows are matched by model number, then by exact name. Rows that don't match become custom products for review. Up to 500 rows per upload, with errors shown per row.
32. **New orders ring loudly.**
    - In the app: a looping alarm with vibration and a full-screen popup.
    - In the background: a MAX-importance Android notification channel with a custom sound.
    - A 30-second poll catches anything realtime or push missed.
    - Android owners get a one-time tip to allow notifications and turn off battery saver.
33. **Open/Closed switch plus opening hours.** Customers can't order from a closed shop, and the app shows when it opens next. Hours past midnight and 24-hour days are supported.
34. **"Demand near you"** shows each shop what people in its delivery area searched for in the last 7 days that it doesn't list. Searches that returned nothing are highlighted, and an "Add it" shortcut opens the catalog.

## Language, design and content

35. **English, Telugu and Hindi** for every screen (about 870 strings each).
    - The Telugu and Hindi texts were machine-drafted with care for placeholders and brand names. **Have a native speaker review them before launch.** `pnpm i18n:check` keeps the three files in step.
    - Category names have Telugu and Hindi columns in the database. Shop and product names stay as the shop entered them, because that's how people search.
36. **Fonts:** Poppins (headings) and Inter (body) for English. These don't contain Telugu or Devanagari letters, so the app switches to **Noto Sans Telugu** and **Noto Sans Devanagari** in those languages.
37. **Design tokens follow the brief:**
    - Indigo `#4F46E5` for primary actions and Orange `#FF6B35` for buying actions.
    - Green, Amber and Red for statuses.
    - Background `#F8FAFC` and text `#0F172A`.
    - Light and dark mode.
38. **Prices** use the Indian grouping (₹1,25,000) and all times are shown in IST.
39. **Product images:** the demo catalog has no product photos, to avoid copyright problems. The app shows a neat tile with the category icon and brand instead. Shops are encouraged to upload real photos of their stock, which also builds trust.
40. **Home banners are admin-managed content in one language** (usually English). Add per-language columns if you want localised campaigns.

## Sharing, notifications, admin

41. **Share links** use the web domain (`https://gadgetgalli.in/s/product/<id>`), served by the admin web app. Supabase edge functions can't serve HTML pages, so share pages live there. The page shows the product or shop and opens the app, or the store if the app isn't installed. WhatsApp previews use the generic brand card (see SETUP.md for per-product previews).
42. **Push notifications** use Expo push. Every in-app notification row is pushed by the `send-push` edge function, triggered by the database through `pg_net`, with retries every 5 minutes.
43. **Push campaigns** from the admin panel create a notification for every user in the chosen segment (customers, shop owners, everyone, or one area).

## Business model (v1)

44. **No commission or fees in v1.** The schema already has `featured` (paid placement) and shop stats, so monetisation can be switched on later without migrations. See MARKETING.md for the suggested plans.

## Websites (Hostinger)

45. **The customer app and the Shop Partner app are two websites made from one build.**
    - The web build reads a small `config.js` when the page loads. It holds the Supabase keys, which side to show (`customer` or `partner`), demo mode and the addresses of the other sites.
    - So the same files serve both websites, and they can be pointed at a server after uploading, without a rebuild.
    - The store app still shows both sides, with the role picked at sign-up.
    - On the customer site, shop owners can shop too. On the partner site, the buy/sell question is skipped and new users go straight to shop registration.
    - Each site's switch button opens the other website.
46. **The demo phone numbers show on the login screen only in demo mode** (`EXPO_PUBLIC_DEMO=1`, or `demo: true` in a website's `config.js`). Earlier builds always showed them, which a real launch must not do.
47. **Hostinger serves the websites; Supabase stays the backend.** Hostinger's web hosting serves files and PHP but has no Postgres, so the database, logins, storage and realtime stay on Supabase (the free tier is enough for a demo). An `.htaccess` file in each site sends every address to `index.html`, so links like `/product/…` work.

## Development and testing

48. **No Docker was available while building**, so:
    - `supabase/tests` runs every migration and the seed on a throwaway local Postgres, with a small auth/storage shim, and asserts search, security, the order flow and jobs.
    - `scripts/dev-stack` is a small Supabase-compatible API on the same database, used for development and the Playwright end-to-end test.
    - Official `supabase start` (Docker) works too.
49. **Seed data is generated** by `supabase/seed/generate-seed.mjs`, which is deterministic:
    - `seed.sql` is the full demo: 16 shops, 624 listings, 90 orders in every status, reviews and search history.
    - `seed-reference.sql` is the production starter: areas, categories, brands, synonyms, 172 catalog products and banners only.
