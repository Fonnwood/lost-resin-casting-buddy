# Lost Resin Casting Buddy

*By [Fonnwood](https://fonnwood.com).*

A mobile-first **process companion and timing dashboard** for vacuum-assisted investment casting of resin-printed models (lost-resin casting).

At any moment it answers: **Where am I? What should I be doing now? What happens next, and when?**

**Use it now at [castingbuddyapp.com](https://castingbuddyapp.com).** It's free, needs no account, and works offline once loaded. It's also open source: run your own copy, change anything, or host it for your workshop.

- **NOW**: one big current step showing what to do, the target temperature, a countdown, extend buttons and the next step. A parallel **flask vs. metal** panel tells you when to start the furnace.
- **TIMELINE**: the whole process with actual and projected clock times, the metal melt running alongside the burnout (when to start the furnace, when the metal should be ready), and export of every upcoming intervention as **calendar alarms (.ics)** for overnight burnouts.
- **RUN**: values for this casting, an investment calculator, a **metal weight calculator**, and **planning backwards from a casting time**.
- **HISTORY**: finished runs with ratings, defects, notes, planned-vs-actual timelines, comparison, and JSON export/import.
- **Settings**: alerts (each individually), °C/°F, theme, accent, text size, custom CSS, a full **profile editor**, backup/restore, and an optional account.

> **Everything is changeable.** The process itself is a *profile*: stages, timings, temperatures, wording, checklists and safety notes. You edit it in the app, import/export it as JSON, or ship it with your own copy. The included profiles (GRS Protocast investment, Siraya Tech Cast True Blue resin, CZ121 brass) are examples, not requirements. See [docs/PROFILES.md](docs/PROFILES.md).

## Using it

Open [castingbuddyapp.com](https://castingbuddyapp.com) on your phone. On iPhone, use **Share → Add to Home Screen**. That gives you offline use and notifications, and stops Safari clearing your data after 7 days without a visit. On Android, use **Install app** from the browser menu.

### Notifications

Turn them on in **Settings → Alerts → Turn on notifications** (or from the NOW screen). They arrive at each step even when the app is closed or the phone is locked: kiln stage ends through an overnight burnout, when to start the furnace, metal ready, soak complete. No account is needed. On iPhone and iPad, add the app to your Home Screen first and open it from there (iOS 16.4 or later). Each alert can be switched off individually, and **Add alarms to calendar** on the Timeline screen remains a good backup.

### Your data, with or without an account

- **No account (the default):** everything stays in your browser on that device. Nothing is sent anywhere. Use **Settings → Export full backup** now and then.
- **Optional account:** to use your runs on more than one device (a phone in the workshop, a laptop for planning), go to **Settings → Account & sync → Sign in with email**. There's no password: you get a 6-digit code by email and stay signed in on that device for 30 days. Your runs, profiles and settings then sync automatically, and the app still works offline and catches up later.
- **Signing out** lets you keep the data on that device or remove it (useful on a shared device). **Delete account** removes your email address and everything synced from the server.

### Privacy

The full policy (UK GDPR) is at [castingbuddyapp.com/privacy.html](https://castingbuddyapp.com/privacy.html). In short: without an account, castingbuddyapp.com never sees your data. With an account, the server stores your **email address** and your **casting data** (runs, profiles, settings), and nothing else: no name, no password, no IP addresses, no analytics or tracking. Sign-in codes and session tokens are stored only as one-way hashes.

If you turn on notifications, the server also keeps your device's push address (issued by your browser's push service, not linked to you or to an account) and the times and wording of your upcoming alerts, so it can send them. Turning notifications off deletes these. Unused push addresses are deleted after 30 days, and sent alerts after 2 days.

Emails are sent through [Resend](https://resend.com), the database is hosted by [Neon](https://neon.tech), alert timing uses [Upstash QStash](https://upstash.com/docs/qstash), and the site runs on [Vercel](https://vercel.com).

## Run your own copy

You need nothing but a browser:

```sh
git clone https://github.com/fonnwood/lost-resin-casting-buddy
cd lost-resin-casting-buddy
npm start               # http://localhost:8080  (Node 20+, no installs needed)
npm run start:lan       # reachable from your phone on the same Wi-Fi
```

You can also open `index.html` directly. Phones need HTTPS or `localhost` for the offline/PWA features. A LAN address over plain HTTP works for the app itself.

To try accounts locally: `npm install && npm run dev`. This uses an in-memory database, and sign-in codes are printed in the terminal instead of emailed.

## Host it

| Where | Accounts? | How |
|---|---|---|
| Vercel | Optional | Import the repo, add a Neon database and a Resend key (and QStash for notifications). This is how castingbuddyapp.com runs. See [docs/HOSTING.md](docs/HOSTING.md). |
| Any Node 20+ server | Optional | `npm install`, then `DATABASE_URL=… RESEND_API_KEY=… EMAIL_FROM=… npm start` with any Postgres 13+ |
| Docker | No | `docker build -f deploy/Dockerfile -t casting-buddy . && docker run -p 8080:80 casting-buddy` |
| GitHub Pages | No | Settings → Pages → Source: GitHub Actions, then run the *Deploy to GitHub Pages* workflow |
| Netlify / Cloudflare Pages / S3 | No | Publish the repo root as static files, no build command |

Without accounts, every visitor keeps their own data in their own browser and your server never sees it. The app only offers sign-in where the server provides it. To rebrand, change the GitHub link, pre-load profiles or turn accounts off, edit [`config.js`](config.js). See [docs/CUSTOMISING.md](docs/CUSTOMISING.md).

## Principles

- **Nothing process-specific is hard-coded.** Each value carries its evidence level (*manufacturer* / *working* / *experimental*). Changing a datasheet value marks it *working* automatically.
- **The app never claims equipment state.** A finished ramp timer means "scheduled ramp complete", not "kiln is at 450 °C". Flask temperature and metal readiness always need a tap.
- **Timers are timestamp-based.** Closing the browser or sleeping the phone loses nothing. On reopen, the app shows what should have happened and asks you to confirm it.
- **Kiln stages advance on schedule; your stages wait for you.**
- **Local-first.** The app works fully without a server or an account. Sync is an extra, never a requirement.

## Contributing

Bug reports, profiles for other materials, and code are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). `npm run check` runs lint and tests.

## Safety

Molten metal, hot flasks and vacuum equipment are dangerous. Some alloys (such as leaded brass) release toxic fume when melted, so use effective extraction and a suitable respirator. This app is a timing aid, **not a safety system and not a kiln controller**. It cannot see your equipment, and times and temperatures in the bundled profiles are starting points you must verify for your own setup. Equipment manufacturers' instructions and PPE requirements always take precedence. Use at your own risk; see the licence.

## Credits and trademarks

Made by [Fonnwood](https://fonnwood.com). Bundled profile values reference public manufacturer datasheets (GRS Protocast) and community experience. GRS, Protocast, Siraya Tech, True Blue and other product names belong to their owners. This project is independent and not affiliated with or endorsed by them.

## Licence

[MIT](LICENSE)
