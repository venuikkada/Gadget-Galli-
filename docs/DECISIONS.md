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
10. ~~**Shops choose their own delivery coverage.**~~ Replaced by #54: every shop delivers all over Hyderabad. (Before: a shop could tick whole zones, single areas, or deliver within a radius (5, 10, 15 or 20 km). It also sets its delivery charge (free, flat or per km), a free-delivery threshold, a minimum order, its usual delivery time and whether it offers store pickup.) The charge, threshold, minimum, usual time and pickup settings stay.
11. ~~**"Delivers to my area" is on by default in search.**~~ Removed by #54: every shop delivers everywhere in Hyderabad, so search shows every shop, nearest first.
12. **Maps run on OpenStreetMap, with no account or key.**
    - One map engine everywhere: Leaflet with OpenStreetMap tiles, shown in a WebView on Android and iOS and in an iframe on the websites and in the admin panel (`packages/shared/src/map`). Leaflet is bundled (`pnpm map:assets`), so no CDN is needed.
    - Saving an address needs an exact pin: from GPS ("Use my current location"), dragging the map, or a place search. The old silent fallback to the area's centre is gone, so shops and riders get the customer's real door.
    - Place search uses OpenStreetMap's free Nominatim service, limited to Hyderabad and run only when the person submits (its usage policy allows about one search a second and no search-as-you-type).
    - "Directions" and "Navigate" open Google Maps with a plain link to the exact pin; no Google key or billing.
    - OpenStreetMap's own tile servers are fine while traffic is small. Before the apps get busy, set `mapTileUrl` and `mapAttribution` in each website's `config.js` (and `EXPO_PUBLIC_MAP_TILE_URL` for the phone apps) to a tile provider's free-tier key, for example MapTiler. **(changeable)**
    - The exact pin is visible only to the customer, the shop handling that order and admins. A rider gets it only when the shop taps "Send location to rider".
12a. **Delivery time depends on distance.** A shop's usual time (its real average once it has three deliveries, otherwise what it declared) is taken to cover a typical 4 km trip. Each customer sees it shortened or lengthened by the ride time for their actual distance: roads about 40% longer than the straight line, 18 km/h on a two-wheeler in Hyderabad traffic. Rounded to 5 minutes, never under 20. The search filter, "fastest" sorting, the "Fastest delivery" tag and every "Delivers in" use it. After dispatch, an order without a shop-entered ETA shows the dispatch time plus the ride and 5 minutes' handover. The same formula is in `packages/shared/src/map/eta.ts` and in SQL (`gg_delivery_eta_mins`), and tests on both sides check the same examples. **(changeable: the constants)**

## Accounts and roles

13. **Customers and shop owners log in with phone number + OTP.** That is the norm in India, and the shop needs the number to call the customer. **Admins use email + password.** Email sign-up is disabled; a super admin creates admin accounts.
14. **Admin roles:** `super_admin` can do everything, including granting admin roles. `support` can do everything else: review shops, handle orders, problems and the catalog, and send campaigns. The database checks "is an admin" for all admin functions, and "is a super admin" for role changes.
15. **Demo phone numbers log in with OTP 123456** (in `supabase/config.toml` and the local stack). All demo people, shops, phone numbers and UPI IDs are fictional.
16. **Deleting an account anonymises it rather than erasing order history.** Shops keep their order records, without the customer's personal details. Deletion is blocked while an order is still active.

## Orders and money

17. ~~**The app never touches money.**~~ Replaced by #52: customers now pay Gadget Galli, and Gadget Galli pays the shop after delivery. Payments still go by plain UPI (`upi://pay` links and QR codes), so there is no payment gateway, licence or gateway fee.
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
    - A custom product gets its category's specification form (`packages/shared/src/specs.ts`): a laptop asks for processor, RAM, storage, display and graphics; a CCTV camera for resolution, type, night vision and use; a graphics card for GPU, memory and power.
      - Variant options are stored in lowercase (`ram`, `storage`) and become the variant chips. Specifications use the English names customers read (`Processor`), the same keys as the catalog.
      - Free name/value rows cover anything else. A sub-category added later uses its main category's form.
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
37. **Brand palette: "Peacock Teal + Marigold".** One brand colour that none of the big Indian shopping apps use (Flipkart and Paytm are blue, Amazon navy and orange, Swiggy orange, Zomato red, Zepto and PhonePe purple, Blinkit yellow and green, Meesho and Nykaa pink). Deep teal reads as trustworthy tech; with marigold gold it also feels Indian and festive.
    - **One source of truth:** `packages/shared/src/palette.ts` holds the scales, the light and dark tokens, gradients, category colours, banner presets and status colours. The mobile theme, the admin's Tailwind theme (`apps/admin/src/index.css`) and the icons all follow it.
    - **Teal 600 `#0B7A80`** is the primary colour: links, chips, tabs, icons.
    - **Teal 700 `#08656B`** fills every buy button (cart bar, ADD, Call to order, Pay by UPI, Send OTP). It is one step darker so the 82%-white captions on those buttons still pass contrast.
    - **Marigold `#FFB300`** is only for highlights: discount and "Best price" badges, stars, count bubbles, the current order step. It is never a button and never carries white text (dark ink text instead).
    - **Statuses:** Requested marigold, Confirmed teal, Paid lagoon blue, Packed plum, Dispatched saffron, Delivered leaf green, Rejected or problem red, Cancelled or expired grey.
    - **Contrast is tested:** `packages/shared/src/__tests__/palette.test.ts` checks every text-on-colour pair (4.5:1 for text, 3:1 for icons) in light and dark mode. On the green "open" and red "closed" gradients, text is full white only.
    - **Dark mode** uses deep teal-black surfaces, lighter teal for actions with dark text on them, and borders instead of shadows.
    - **Logo:** a marigold shopping bag with a teal lightning bolt (`brand/mark.svg`). `pnpm brand:assets` renders the app icon, Android adaptive icons, splash, favicons, the admin logo and the link-preview image from it.
    - Banners saved with the old indigo palette are mapped to the new presets in code and by the migration `20261010000011_brand_palette.sql`.
38. **Prices** use the Indian grouping (₹1,25,000) and all times are shown in IST.
39. **Product images:** the demo catalog has no product photos, to avoid copyright problems. The app shows a neat tile with the category icon and brand instead. Shops are encouraged to upload real photos of their stock, which also builds trust.
40. **Home banners are admin-managed content in one language** (usually English). Add per-language columns if you want localised campaigns.

## Sharing, notifications, admin

41. **Share links** use the web domain (`https://gadgetgalli.in/s/product/<id>`), served by the admin web app. Supabase edge functions can't serve HTML pages, so share pages live there. The page shows the product or shop and opens the app, or the store if the app isn't installed. WhatsApp previews use the generic brand card (see SETUP.md for per-product previews).
42. **Push notifications** use Expo push. Every in-app notification row is pushed by the `send-push` edge function, triggered by the database through `pg_net`, with retries every 5 minutes.
43. **Push campaigns** from the admin panel create a notification for every user in the chosen segment (customers, shop owners, everyone, or one area).

## Business model (v1)

44. **No commission or fees in v1.** (A `commission_pct` setting exists since #52 and is 0; since #57 shops pay it to Gadget Galli on delivered orders once it is set above 0.) The schema already has `featured` (paid placement) and shop stats, so monetisation can be switched on later without migrations. See MARKETING.md for the suggested plans.

## Websites (Hostinger)

45. **The customer app and the Shop Partner app are two websites made from one build.**
    - The web build reads a small `config.js` when the page loads. It holds the Supabase keys, which side to show (`customer` or `partner`), demo mode and the addresses of the other sites.
    - So the same files serve both websites, and they can be pointed at a server after uploading, without a rebuild.
    - The store app still shows both sides, with the role picked at sign-up.
    - On the customer site, shop owners can shop too. On the partner site, the buy/sell question is skipped and new users go straight to shop registration.
    - Each site's switch button opens the other website.
46. **The demo phone numbers show on the login screen only in demo mode** (`EXPO_PUBLIC_DEMO=1`, or `demo: true` in a website's `config.js`). Earlier builds always showed them, which a real launch must not do.
47. **Hostinger serves the websites; Supabase stays the backend.** Hostinger's web hosting serves files and PHP but has no Postgres, so the database, logins, storage and realtime stay on Supabase (the free tier is enough for a demo). An `.htaccess` file in each site sends every address to `index.html`, so links like `/product/…` work.
48. **On demo websites the demo numbers sign in without SMS.**
    - Supabase sends OTPs only after an SMS provider is switched on in its dashboard, which a demo shouldn't need.
    - So with `demo: true`, the apps turn a demo number (+91 90000 0xxxx or 1xxxx) and the OTP into an email and password login: `<number>@demo.gadgetgalli.in` with password `gg-demo-<OTP>`. The demo data gives every demo phone account this login (`apps/mobile/src/auth/demo.ts`).
    - A wrong OTP fails as usual, and the made-up numbers are never texted. Other numbers, and every number when `demo` is off, use SMS OTP.
    - A real launch starts from a project without the demo data, so these logins don't exist there.

## Security

49. **Defence in depth, details in [SECURITY.md](SECURITY.md).**
    - Every table has row-level security. Signed-out visitors can only run browsing functions, and every function has a fixed `search_path`.
    - Per-user rate limits apply to the writes a spammer would abuse.
    - Admin 2-step verification is **optional** (the founder's choice). Once an admin turns it on, `is_admin()` requires an `aal2` session, so the password alone is not enough.
    - Websites send a CSP and security headers. Phone apps keep the session in the Keystore or Keychain.

## Development and testing

50. **No Docker was available while building**, so:
    - `supabase/tests` runs every migration and the seed on a throwaway local Postgres, with a small auth/storage shim, and asserts search, security, the order flow and jobs.
    - `scripts/dev-stack` is a small Supabase-compatible API on the same database, used for development and the Playwright end-to-end test.
    - Official `supabase start` (Docker) works too.
51. **Seed data is generated** by `supabase/seed/generate-seed.mjs`, which is deterministic:
    - `seed.sql` is the full demo: 16 shops, 624 listings, 90 orders in every status, reviews and search history.
    - `seed-reference.sql` is the production starter: areas, categories, brands, synonyms, 172 catalog products and banners only.

## Payments

52. ~~**Customers pay Gadget Galli; shops are paid after delivery.**~~ Replaced by #57 for new orders: customers now pay the shop. Orders placed before migration 0018 finish on this flow (payee `gadget_galli`), so the Payments tabs for them stay. The original decision, kept for those orders: the founder's choice, so a shop only sends goods once the money is safe, and is only paid once the customer has the goods.
    - **Flow:** the shop accepts (CONFIRMED) → the customer pays Gadget Galli's UPI ID or QR and enters the UPI reference (UTR) → an admin checks the bank app and taps **Payment received** (PAID; only admins can do this) → the shop packs and sends → DELIVERED makes the shop's **payout due** → an admin pays the shop's UPI ID and records the reference (**payout paid**).
    - **Checks are manual for now**, so there is no payment gateway. A gateway (Razorpay, Cashfree) can later call `admin_confirm_payment` from a webhook without changing the apps.
    - **Payment method:** UPI to Gadget Galli only; there is no cash on delivery. The shop's own UPI ID is used only for its payouts.
    - **Payout amount:** the full order total while `commission_pct` is 0. A super admin can change the commission (0–50%) in Admin → Payments → Settings; each payout stores its commission and amount.
    - **Protection:** a problem report (ISSUE_REPORTED) holds the payout until it is resolved. A confirmed order with no payment claim after 24 hours expires, so shops aren't kept waiting. A payment reference that isn't in the bank can be rejected with a reason, and the customer can try again.
    - **Ways to pay** (migration 0016):
      - **UPI:** a one-tap button, a QR the app makes with the exact amount and order number, and optionally Gadget Galli's own uploaded QR image (bank / PhonePe Business), on which the customer types the amount.
      - **Bank transfer (NEFT / IMPS):** account name, number, IFSC and the order number as the remark, each with a copy button. It's for orders above a customer's UPI limit.
      - The customer enters the UPI reference or the bank UTR, and the order records the method.
    - **Settings** (Admin → Payments → Settings, super admin): UPI ID and name, QR image (`banners/payments/…`), bank account and commission, stored in `app_config`. Customers can pay once a UPI ID **or** a complete bank account is saved (`pay_to.ready`); until then they see "payment details are being set up". The admin Dashboard and Payments page warn while nothing is saved.
    - **Speed:** every new payment claim rings and shows a pop-up in the admin panel (realtime notification, 15 s polling as a fallback), so you can confirm within minutes. The customer's order screen updates live when you confirm.
    - Code: `supabase/migrations/20261020000014_platform_payments.sql`, admin `PaymentsPage.tsx`, partner `PayoutsScreen.tsx`.

## Login SMS

53. **Login OTPs go by SMS through MSG91, via Supabase's Send SMS hook.** The founder chose MSG91: Indian, about ₹0.20 per OTP, with help for DLT registration.
    - Supabase creates and checks the code as before. Only the sending is replaced: Supabase Auth calls the `send-sms` edge function, which checks the hook signature (Standard Webhooks) and posts the code to MSG91's Flow API with the DLT-approved template.
    - **Guards:** only Indian mobile numbers (`+91` and 6–9) get an SMS, which stops SMS-pumping to premium foreign numbers. The made-up demo numbers are never texted, because they fall in a real mobile series. Logs show only the last 4 digits and never the code.
    - **Errors reach the user in their language:** the function's message starts with a code (`SMS_NOT_SET_UP`, `SMS_SEND_FAILED`…), which `apps/mobile/src/auth/smsError.ts` translates.
    - **Demo logins stay** (#48) until the real launch.
    - Setup: [SETUP.md](SETUP.md) §2. Code: `supabase/functions/send-sms`.

## Delivery coverage

54. **Every shop delivers all over Hyderabad.** The founder's choice: customers should never see "this shop does not deliver to your address".
    - `gg_delivering_shop_ids` and `shop_delivers_to` (migration 0015) now treat every approved shop as delivering to every address in the service area. Everything else (search, home, shop and product pages, cart, `place_order`) goes through them.
    - Removed: the "Delivers to my area" filter, the "shops in other areas" section and every "doesn't deliver" message, the area/radius step in shop registration, and the "area not served" reject reason.
    - **Still in place:** addresses outside Hyderabad are refused (#8, the waitlist). Each shop keeps its own delivery charge (free, flat or per km), so far orders can cost more and the customer sees the charge before ordering. ETAs still grow with distance (#12a). Store pickup stays.
    - The old coverage columns and `delivery_areas` table are kept, unused, so this can be undone.

## Order and payment safety

55. **Once a customer says "I have paid", the order is frozen until Gadget Galli checks the payment** (migration 0017, from the October bug sweep). Otherwise money could arrive for an order that was already cancelled, with nothing telling anyone to refund it.
    - **While a payment is being checked** (CONFIRMED with a payment claim): the customer can't cancel or report a problem, and the shop can't reject (`PAYMENT_UNDER_REVIEW`). The apps hide those buttons and offer a WhatsApp chat with support instead. Support confirms or rejects the payment first, then changes the order and refunds if needed.
    - **Admin "Change status"** and problem resolution can't skip the payment check: an order becomes PAID only through **Payment received** (which records the payment, the method and the stock), and packing, sending and delivery need a confirmed payment.
    - **Confirming an unclaimed payment** records whether it came by UPI or bank transfer.
    - **Only super admins can block another admin**, so a support login can't lock out the owners.
    - **Payouts lock their orders** while being marked paid: two admins (or two tabs) can't pay and notify the same payout twice.
    - **Alarms:** the Shop Partner app also rings (and sends a loud push) when an order is paid, the moment to pack and send. In a browser the alarm plays only after the owner has tapped the page once; the alarm offers "Turn on sound" when the browser blocks it.
    - **Home feed:** featured shops (Admin → Content) lead "Shops near you" with a Featured tag; featured products show as "Handpicked for you"; **Top deals** lists the biggest discounts off MRP among the 50 most popular products in stock.

## Product forms

56. **Every kind of product gets its own form in the Shop Partner app** (packages/shared/src/specs.ts). The founder's request: a phone, a CCTV camera and a graphics card must not share one generic form.
    - **Custom product:** the shop first picks the kind of product from tiles with drawings, then sees only that kind's questions:
      - brand chips and a model example;
      - "This version" (RAM / storage / colour, resolution / camera type, channels…) and the specifications;
      - fields a product can't do without are marked * and checked, for example storage and colour for a phone, resolution and type for a CCTV camera, processor, RAM and storage for a laptop.
      - The full product name is built from brand, model and version (the shop can still type its own). What the shop searched for pre-fills the brand and model.
    - **Price & stock** ("Details for buyers") asks what buyers of that kind of product ask:
      - for every listing: the bill;
      - for open-box, refurbished and used pieces also: physical condition, box & accessories;
      - by kind: battery health and repairs for a used phone, battery backup, charger and Windows for a laptop, mining for a used graphics card, HDD included for a DVR, power adapter for a camera.
      - These are stored on the listing (`shop_products.specs`), so customers see them with the product's specs on the shop item page. No database change was needed.
    - Spec tables and variant labels now read in a fixed order ("8 GB · 128 GB · Black"; a laptop's processor, display, graphics…), because the database keeps no key order.
    - Spec field names stay in English (RAM, Processor, Resolution): they're trade terms, and the spec tables show them in English to customers too.

## Customers pay the shop

57. **Customers pay the shop directly; Gadget Galli makes sure the shop delivers** (migration 0018). The founder's request: collecting every order's money made all of it Gadget Galli's turnover, with more tax. Holding customers' money for shops is also what RBI-authorised payment aggregators do. Now only the commission reaches Gadget Galli. (Tax and RBI points are for the founder to confirm with a CA; this is not legal advice.)
    - **Two ways to pay**, set when the shop accepts:
      - **Advance:** the customer pays the shop's UPI ID in the app (button, QR with the exact amount, or the shop's own QR image) and enters the UPI reference. The shop checks its UPI app and taps **Payment received** (or **Not received**, with a reason the customer sees). Only for shops with a UPI ID Gadget Galli has checked, and only up to the shop's limit.
      - **Pay on delivery:** the customer pays the shop at handover (UPI or cash), or at the shop for a pickup. "No product, no payment." The shop packs straight away and records how the customer paid at handover.
      - By default the order is advance when the shop's limit allows it and the order is delivered; otherwise pay on delivery. The shop can always choose pay on delivery when accepting.
    - **Advance limits** (the founder's choice: advance for every shop that has earned it):
      - **New** (not verified): pay on delivery only.
      - **Verified:** up to ₹10,000.
      - **Trusted** (25+ deliveries, 4.3★ or better, no open complaints): up to ₹50,000.
      - Both limits and the trusted thresholds are settings (Admin → Payments → Settings). An admin can also set one shop's own limit (0 turns advance off) on its page.
    - **Protection for advance payments:**
      - **Delivery code:** every order has a 4-digit code (in `private.order_codes`, which no API or shop can read). The customer sees it once the order is sent and gives it only with the product in hand. The shop or rider enters it at handover (`shop_mark_delivered`); 5 wrong tries lock it for 30 minutes. Otherwise the customer taps "I received my order". Orders paid to the shop are never marked delivered automatically.
      - **Send-by time** once paid: paid before 9 AM → by 1 PM; 9 AM to 5 PM → within 4 hours; after 5 PM → by 1 PM next day (IST).
      - **Overdue alerts** (order jobs, every 5 minutes): a payment the shop hasn't confirmed in 2 hours, an order not sent by its send-by time, or not delivered 2 days after sending. Each alerts the customer, the shop (loud alarm) and the admins once. The customer can then report it even while a payment is unconfirmed.
      - **Advance pauses** while the shop has an overdue order, an open "paid but not sent" / "not received" complaint, or a strike: its new orders are paid on delivery.
      - **Refunds:** a shop that can't deliver a paid order refunds the customer by UPI and records the reference (`shop_cancel_order`); the customer is told the reference and can contact support if it doesn't arrive.
      - **Strikes** (admin, on the shop page) for a proven "paid but not delivered or refunded": 1 turns advance off, 2 suspend the shop. Clearing them is an admin action too.
    - **Commission** (the founder's choice: a % on delivered orders): `commission_pct` of each delivered order paid to a shop becomes **due**; a reported problem holds it, a cancellation removes it. The shop pays everything due from **Commission & payments** in the Shop Partner app (Gadget Galli's UPI ID and QR from Settings) and enters the reference. An admin confirms it (Admin → Payments → Commission), rejects it with a reason, or records one paid in cash. 0% (the default) means nothing is due.
    - **Older orders** placed before 0018 were paid to Gadget Galli (#52) and finish that way: admin payment check, payouts to shops, delivery 72 hours after sending. Requests no shop had accepted yet switched to the new flow.
    - Code: `supabase/migrations/20261024000018_pay_the_shop.sql` (tests `11_pay_the_shop.test.sql`); customer `OrderScreen.tsx`, `PayCard.tsx`, `OrderProtection.tsx`; partner `OrderScreen.tsx`, `orderSheets.tsx`, `PayoutsScreen.tsx`; admin `PaymentsPage.tsx`, `ShopDetailPage.tsx`.


## Android release

58. **Ready for Google Play** (see [PLAY-STORE.md](PLAY-STORE.md)).
    - **Expo SDK 57** (React Native 0.86). Expo SDK 56's JavaScript engine (Hermes V1) has a known memory regression, fixed in SDK 57.0.9. Shop owners keep the Shop Partner app open all day for the new-order alarm, so a slow leak would end in crashes and missed orders. Switching the engine off on SDK 56 would have meant compiling React Native from source on every build, which is slower and more fragile.
    - **No background audio.** `expo-audio` adds a media-playback foreground service by default, and Google Play asks apps to justify that permission with a video. The new-order alarm plays while the app is open; with the phone locked, the push notification's loud `new-orders` channel rings instead.
    - **Public legal pages:** `/privacy`, `/terms` and `/delete-account` need no login, because Play needs public privacy policy and account deletion links. Moving them out of the customer-only section also fixed Terms and Privacy on the Shop Partner website, which used to bounce shop owners back to the partner home.
    - **Build profiles** (`apps/mobile/eas.json`):
      - `preview`: an APK for shops to install directly, with the demo logins.
      - `beta`: the bundle for Play's closed test, with the demo logins, because real SMS login needs DLT approval first.
      - `production`: demo logins off.
    - **Push on Android** needs Firebase's `google-services.json`, read from the EAS file variable `GOOGLE_SERVICES_JSON` (or `apps/mobile/google-services.json` for local builds).
    - **Support contacts** come from `EXPO_PUBLIC_SUPPORT_*` in builds and `supportPhone` / `supportWhatsapp` / `supportEmail` in the websites' `config.js`, so the number can change without a new app build.

59. **The shop's UPI QR and bank account at every step** (migration 0019; the founder's request after a test order showed no way to pay).
    - **Before:** pay-on-delivery orders said only "pay when it arrives" until dispatch, and shops had no bank account. Customers could pay a shop only by UPI, which most banks cap at about ₹1 lakh a day.
    - **Customers** see how to pay from the moment the shop accepts:
      - **Advance orders:** UPI (one tap, a QR with the exact amount, the shop's own QR image, the UPI ID) or **bank transfer** (account, IFSC, amount and remark to copy), then the UPI reference or bank UTR for the shop to check.
      - **Pay on delivery:** the same details, with "pay only when the product is in your hands" and nothing to enter; the shop records the payment at handover. Pickups say "pay at the shop".
    - **Shops** add an optional bank account in registration step 6 or shop details:
      - the account number is typed twice; the IFSC and the number are checked in the app and in the database;
      - at handover, **Show payment QR** puts a QR with the exact amount and the bank account on the shop's phone for the customer.
    - **Privacy:** bank details live in `shop_private`, which only the owner and admins can read. A customer gets them only for their own order, once the shop has accepted it. The public shop page never shows them.
    - **Checks:** approving a shop checks its bank account as well as its UPI ID. Admins can tick "Bank account checked" on the shop page. Any change by the shop needs a new check, and customers see a "verified" tick only on checked details.
    - The money still goes straight to the shop, never through Gadget Galli (#57). Advance payments still need a checked UPI ID; the bank account is an extra way to pay.
