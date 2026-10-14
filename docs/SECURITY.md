# Security

How Gadget Galli is protected, and the checklist the founder works through. No app is unhackable. The aim is that an attacker gets nothing useful from any single mistake, and that the steps below remove the easy ways in.

## What the apps do

**Data**
- **Row-level security is on every table.**
  - Customers see only their own orders, addresses and profile.
  - Shops see only their own orders and products. A customer's phone number is shown to a shop only for that shop's active orders.
  - Admin data is visible to admins only.
  - Tests: `supabase/tests/02_security.test.sql`.
- **All writes go through database functions** that check who is calling. Signed-out visitors can run only the browsing functions (search, product and shop pages). Everything else needs a login (`supabase/tests/08_hardening.test.sql`).
- **Every function has a fixed `search_path`.** New functions start with no access for signed-out visitors.
- **Rate limits** stop spam from one account (exceeding them gives `RATE_LIMITED`):

  | What | Limit |
  |---|---|
  | Problem reports | 5 a day |
  | Reviews | 10 a day |
  | Custom products | 200 a day |
  | Push tokens | 20 a day |
  | "Notify me" requests | 10 a day |
  | Saved addresses | 30 a day |
  | Pending orders | 5 at a time |

**Logins**
- **Admin panel:** optional 2-step verification (**Security** page).
  - With it on, logging in needs the password plus a 6-digit code from an authenticator app.
  - The database itself treats a password-only session as a non-admin, so a stolen password alone opens nothing.
  - Super admins see which admins have it on.
- **Phone apps:** the login session is kept in the encrypted Android Keystore or iOS Keychain. It is left out of Android backups, and unused permissions (microphone, overlay, old storage) are blocked.

**Websites** (`.htaccess` from `scripts/deploy/security-headers.mjs`)
- Forced HTTPS with HSTS.
- A Content Security Policy.
- No framing by other sites (clickjacking).
- `nosniff`, a strict referrer policy and a permissions policy.
- Hidden files and source maps are never served, and there are no directory listings.

**Server side**
- The `service_role` key is never in an app or website.
- The push and job functions check secret headers.
- Account deletion checks the user's login.

## Founder's checklist

1. **Turn on 2-step verification everywhere it matters**:
   - Gadget Galli admin panel (**Security → Turn on**);
   - Supabase;
   - Hostinger;
   - GitHub;
   - Google Play Console;
   - the email account behind all of them. Someone who controls this email can reset all the others.
2. **Never share the admin password.** Give each team member their own admin account, so it can be removed when they leave.
3. **Before the real launch, remove the demo logins.** The demo phone numbers sign in with a published OTP. Start the real project without the demo data (`docs/DEPLOY-HOSTINGER.md`, "Going live for real later"), and set `demo: false` in every `config.js`.
4. **Leaked-password protection** (Supabase → Authentication → Passwords): turn it on when you move to the Pro plan. It refuses passwords known from data breaches.
5. **Backups:** the free plan has no automatic backups. Before real customers arrive, move to Pro (daily backups), or export the database weekly (Supabase → Database → Backups).
6. **Secrets:**
   - `PUSH_WEBHOOK_SECRET` and `CRON_SECRET` live only in Supabase → Edge Functions → Secrets.
   - If one ever leaks, set a new value there and in the matching webhook or cron job.
7. **Updates:** run `pnpm audit` before each release.
   - Today's findings (`node-forge`, `braces`, `uuid`) are in Expo's build tools and are not shipped in the app.
   - `decode-uri-component` can only slow down the browser of whoever sends it a crafted link.
8. **If something looks wrong:** in Supabase → Authentication → Users, sign the user out of every device; in the admin panel, block the account or suspend the shop. Then check Supabase → Logs.
