# Put Gadget Galli online on Hostinger (temporary domains)

This puts three separate websites on your Hostinger account, each with its own temporary address (like `https://lightblue-cat-123456.hostingersite.com`):

| Website | What it is | Package |
|---|---|---|
| **Customer app** | Search, compare shops, cart, order by call or WhatsApp, pay by UPI, track orders | `gadget-galli-customer.zip` |
| **Shop Partner app** | Shop sign-up, new-order alarm, orders, products, insights, QR poster | `gadget-galli-partner.zip` |
| **Admin panel** | Shop approvals, orders, problems, catalog, content and reports. Also serves the share pages that open from WhatsApp links | `gadget-galli-admin.zip` |

Hostinger serves the websites. The database, logins and photos live in a free **Supabase** project, because Hostinger web hosting can't run that part. Allow about 30 minutes.

**Get the packages:** run `pnpm deploy:hostinger` (they appear in `deploy/hostinger/`), or use the ZIP files you were sent. You also need `gadget-galli-supabase.zip`, which holds the database files.

**Your Hostinger plan must allow three websites.** If it allows only one, start with the customer app.

---

## 1. Create three websites on Hostinger

Do this three times: once for the **customer** app, once for the **partner** app and once for the **admin** panel.

1. In **hPanel**, go to **Websites → Add website**.
2. Choose an empty **custom PHP/HTML website** (not WordPress or the Website Builder).
3. When asked for a domain, choose **use a temporary domain**.
4. Write down each website's address, and which app it is for.

## 2. Set up the database on Supabase (free)

1. Sign up at [supabase.com](https://supabase.com) and create a **New project**:
   - Name: `gadget-galli-demo`.
   - Region: **South Asia (Mumbai)**.
   - Save the database password somewhere safe.

   Wait about 2 minutes for the project to start.
2. *(Recommended)* Go to **Database → Extensions** and turn on **pg_cron** and **pg_net**. They expire unanswered orders and send reminders automatically.
3. Unzip `gadget-galli-supabase.zip` on your computer. Then go to **SQL Editor → New query** and run these files in order, pasting each one's full text and clicking **Run** (if Supabase warns about the query, run it anyway):
   1. `1-schema.sql`, which creates the tables, search and order rules.
   2. `2-demo-data.sql`, which adds the demo shops, products, customers and orders.
      - For a real launch, run `2-launch-data.sql` instead: areas, categories and the product catalog, with no demo people or shops.
   3. `3-change-admin-passwords.sql`. **Required.** The demo admin password is published, so change it before the admin site goes online.
      - At the top of the file, put your email and two strong passwords in the quotes, then run it.
      - From then on, you log in to the admin panel with your email and the new password.
4. Turn on phone login for the demo numbers: go to **Authentication → Sign In / Providers → Phone** and switch it on.
   - **SMS provider:** if the form asks for one, choose Twilio and type placeholder values. The test numbers never send a real SMS.
   - **Test Phone Numbers and OTPs:** paste the line from `test-phone-numbers.txt`.
   - **Test OTPs valid until:** pick a date next year.
   - Click **Save**.
5. Go to **Project Settings → API** (or click **Connect** at the top of the dashboard) and copy two values:
   - the **Project URL**, like `https://abcdefgh.supabase.co`;
   - the **anon public** key. Newer projects call it the **publishable** key, and it starts with `sb_publishable_`.

   This key is meant to be public; the database's security rules protect the data. **Never** use the `service_role` or secret key on a website.

## 3. Upload the websites

For each of the three websites:

1. In hPanel, open the website's **File Manager** and go into `public_html`.
2. Delete the placeholder file Hostinger put there (`default.php`).
3. Upload the matching ZIP, right-click it and choose **Extract** into `public_html`. Then delete the ZIP.
   - `index.html`, `config.js` and `.htaccess` must sit directly inside `public_html`, not in a subfolder.
   - Hidden files: if you can't see `.htaccess`, turn on "show hidden files" in the File Manager settings.
4. Open **`config.js`** (right-click → Edit) and fill in the quotes:
   ```js
   supabaseUrl: "https://abcdefgh.supabase.co",
   supabaseAnonKey: "your anon / publishable key",
   customerAppUrl: "https://your-customer-site.hostingersite.com",
   partnerAppUrl: "https://your-partner-site.hostingersite.com",
   adminUrl: "https://your-admin-site.hostingersite.com",
   ```
   - Use the same values on all three websites, starting with `https://` and with no slash at the end.
   - Leave `app` as it is; it tells the website which app to show.
   - Save. There's nothing to rebuild; the site uses the new values on the next page load.

If a website still shows **http://** or a security warning, turn on SSL for it in hPanel (**Security → SSL**, then **Force HTTPS**). Location and other browser features need https.

## 4. Try it

| Website | Log in with | Try this |
|---|---|---|
| Customer app | `+91 90000 00001`, OTP `123456` (Ravi, Kukatpally) | Search `iphon 15`, compare shops, order on WhatsApp |
| Shop Partner app | `+91 90000 10002`, OTP `123456` (KPHB Computer World) | Accept the order, mark it paid, packed and sent |
| Admin panel | The email and password you set in step 2.3 | Watch the order, approve shops, see reports |

Other demo numbers: customers `+91 90000 00002` to `00012`, shop owners `+91 90000 10001` to `10016`, and `+91 90000 19999` to register a new shop. They all use OTP `123456`.

**If something doesn't work:**
- **A page shows "The app is not connected to a server yet":** `config.js` is missing the Supabase URL or key.
- **Pages other than the home page show "404" after a refresh:** the `.htaccess` file is missing from `public_html`.
- **A change to `config.js` doesn't show up:** clear the cache in hPanel (**Performance → Cache Manager / CDN → Purge all**), then reload.
- **Phone login fails:** check the test numbers and the "valid until" date in Supabase (step 2.4).

## Good to know

- **Anyone with the links can use the demo logins.** Keep this project for demos only, with the fictional demo data.
- **Supabase's free projects pause after a week with no activity.** Open the Supabase dashboard to wake the project up.
- **The web Shop Partner app rings for new orders only while it is open in the browser.** For the loud alarm with the phone locked, shops need the Android app (see [SETUP.md](SETUP.md), section 4).
- **Share links** from the customer app open on the admin website (`/s/product/…`), which offers "Open in your browser".
- **Maps** need no key. Customers drop an exact pin when they save an address (GPS, dragging the map or searching a place); shops see it on every order with the distance, ride time, "Directions" and "Send location to rider".

## Going live for real later

1. Create a new Supabase project and run `1-schema.sql` with `2-launch-data.sql`, not the demo data.
2. Set up real SMS with DLT registration (see [SETUP.md](SETUP.md), section 2).
3. Set `demo: false` in the two app websites' `config.js`, so the demo numbers no longer show.
4. Connect your own domains to the three websites in hPanel (for example `gadgetgalli.in`, `partner.gadgetgalli.in` and `admin.gadgetgalli.in`), and update the addresses in every `config.js`.
   - Maps use OpenStreetMap's free tiles. Before you advertise widely, get a free map-tile key (for example from MapTiler) and fill in `mapTileUrl` and `mapAttribution` in every `config.js`, so busy days don't hit OpenStreetMap's limits.
5. Publish the Android app for customers and shops (see [SETUP.md](SETUP.md), section 4).
