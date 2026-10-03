# Hosting with accounts (Vercel)

Casting Buddy is local-first: it works with no server at all, and every static host still works exactly as before. A copy hosted on Vercel can also offer **optional accounts**, so people can keep their runs, profiles and settings in one place and use them on several devices.

## What users get

- **Optional.** Nobody has to sign in. Without an account, everything stays in the browser as before.
- **Email and a code, nothing else.** Enter an email, receive a 6-digit code, and you're signed in for 30 days on that device (an HttpOnly cookie). There are no passwords and no profile to fill in. The first sign-in creates the account.
- **Sync.** Runs, profiles, settings and the active run are pushed a few seconds after each change and pulled when the app is opened or brought back to the front, and every 5 minutes while it's open. It works offline and catches up when the connection returns. Text size and keep-screen-awake stay per device.
- **Sign out** keeps the data on the device, or removes it (for shared devices). **Delete account** removes the email address and all synced data from the server.

## What is stored

| Table | Contents |
|---|---|
| `users` | email address, created time |
| `login_codes` | email, a hash of the code, attempts, expiry. Deleted after a day. |
| `sessions` | a hash of the session token, the user, expiry |
| `docs` | the user's casting data: one JSON document per run/profile, plus settings and which run is active |

No names, no IP addresses, no analytics. Codes and session tokens are random, and only their SHA-256 hashes are kept.

## Set up on Vercel (about 15 minutes)

1. **Import the repo.** Vercel → *Add New → Project* → pick this GitHub repo. Framework preset: **Other**. Leave the build command and output directory empty. Deploy.
2. **Add the database.** In the project: *Storage → Create Database → Neon (Serverless Postgres)*. The free plan is plenty. Connect it to the project for Production and Preview. This sets `DATABASE_URL`. The tables are created automatically on first use.
3. **Set up email.** Create a free account at [resend.com](https://resend.com). Add and verify your domain (*Domains → Add*, then copy the DNS records it shows into your domain's DNS). Create an API key.
4. **Add environment variables** (*Settings → Environment Variables*, Production and Preview):

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | the key from Resend |
   | `EMAIL_FROM` | e.g. `Casting Buddy <signin@yourdomain.com>` (must be on the verified domain) |
   | `APP_NAME` | optional; shown in the email (default `Casting Buddy`) |
   | `SESSION_DAYS` | optional; how long a sign-in lasts (default `30`) |

5. **Add your domain.** *Settings → Domains → Add* and follow the DNS instructions.
6. **Redeploy** (*Deployments → ⋯ → Redeploy*) so the new variables apply, then open the site → ⚙ Settings → **Account & sync → Sign in with email**.

Optional checks:

- `npx vercel env pull .env.local && npm install && npm run db:setup` confirms the database connection and creates the tables.
- `https://yourdomain/api/session` should return `{"accounts":true,"email":null,"sessionDays":30}`.

### Recommended: rate-limit the sign-in endpoint

Each address can request at most one code per 30 seconds, 5 per hour and 20 per day. A code allows 5 attempts and lasts 10 minutes. Only the newest code works. To stop someone spraying codes at many different addresses (which costs email quota and reputation), add a Vercel Firewall rule: *Firewall → Configure → New rule*, path equals `/api/auth/request-code`, action **Rate limit** of 10 requests per 10 minutes per IP.

## How sync behaves

- Each run, each profile, the settings and the active-run pointer is a separate document, so editing a profile on the laptop and running a cast on the phone don't conflict.
- If the same document changes on two devices, the later edit wins.
- **Signing in on a device that already has data:** data already in the account wins any clash (such as settings), and runs that exist only on that device are added to the account. A run in progress on the device is never dropped.
- If a session expires, nothing on the device is lost. Sign in again and the edits made in the meantime are pushed.

## Running it yourself

- `npm run dev` runs the app and API locally with an in-memory database. Sign-in codes are printed in the terminal instead of emailed.
- `DATABASE_URL=postgres://… RESEND_API_KEY=… EMAIL_FROM=… npm start` runs the real thing on any Node 20+ server with any Postgres 13+ (after `npm install`).
- The Docker image and GitHub Pages workflow stay static, without accounts. Set `accounts: false` in `config.js` to hide sign-in on any other host.

API reference: the endpoint files in [`api/`](../api) each start with a short description. Tests: `npm test` covers the API (and runs it against real Postgres too when `TEST_DATABASE_URL` is set) and sync between simulated devices. `tests/e2e-sync.js` signs in two phones in a browser.
