# Lost Resin Casting Buddy

A mobile-first **process companion and timing dashboard** for vacuum-assisted investment casting of resin-printed models (lost-resin casting). It runs entirely in your browser — no account, no server, no tracking.

At any moment it answers: **Where am I? What should I be doing now? What happens next, and when?**

- **NOW** — one big current step: what to do, target temperature, countdown, extend buttons, the next step, and a parallel **flask vs. metal** panel that tells you when to start the furnace.
- **TIMELINE** — the whole process with actual and projected clock times, and export of every upcoming intervention as **calendar alarms (.ics)** for overnight burnouts.
- **RUN** — values for this casting, an investment calculator, a **metal weight calculator**, and **plan backwards from a casting time**.
- **HISTORY** — finished runs with ratings, defects, notes, planned-vs-actual timelines, comparison, JSON export/import.
- **Settings** — alerts (each individually), °C/°F, theme, accent, text size, custom CSS, a full **profile editor**, backup/restore.

> **Everything is changeable.** The process itself is a *profile* — stages, timings, temperatures, wording, checklists, safety notes — that you edit in the app, import/export as JSON, or ship with your own copy. The included profiles (GRS Protocast investment, Siraya Tech Cast True Blue resin, CZ121 brass) are examples, not requirements. See [docs/PROFILES.md](docs/PROFILES.md).

## Run it

You need nothing but a browser.

```sh
git clone https://github.com/fonnwood/lost-resin-casting-buddy
cd lost-resin-casting-buddy
npm start               # http://localhost:8080  (Node 20+, no installs needed)
npm run start:lan       # reachable from your phone on the same Wi-Fi
```

or open `index.html` directly. Any static file server works. On iPhone use **Share → Add to Home Screen** for offline use, notifications, and storage that Safari won't evict. (Phones need HTTPS or `localhost` for the offline/PWA features; a LAN address over plain HTTP works for the app itself.)

Your data lives in your browser's storage on that device — use **Settings → Export full backup** regularly.

## Host it

It's a folder of static files, so anywhere works:

| Where | How |
|---|---|
| Docker | `docker build -f deploy/Dockerfile -t casting-buddy . && docker run -p 8080:80 casting-buddy` |
| GitHub Pages | Settings → Pages → Source: GitHub Actions, then run the *Deploy to GitHub Pages* workflow |
| Vercel / Netlify / Cloudflare Pages / S3 | Publish the repo root as static files, no build command (`vercel.json` sets sensible headers) |

Everyone using a hosted copy keeps their own data in their own browser; the server never sees it. To rebrand or pre-load profiles, edit [`config.js`](config.js) — see [docs/CUSTOMISING.md](docs/CUSTOMISING.md).

## Principles

- **Nothing process-specific is hard-coded.** Each value carries its evidence level (*manufacturer* / *working* / *experimental*); changing a datasheet value marks it *working* automatically.
- **The app never claims equipment state.** A finished ramp timer means "scheduled ramp complete", not "kiln is at 450 °C". Flask temperature and metal readiness always need a tap.
- **Timers are timestamp-based.** Closing the browser or sleeping the phone loses nothing; on reopen the app shows what should have happened and asks you to confirm it.
- **Kiln stages advance on schedule; your stages wait for you.**

## Contributing

Bug reports, profiles for other materials, and code are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). `npm run check` runs lint and tests.

## Safety

Molten metal, hot flasks and vacuum equipment are dangerous. Some alloys (such as leaded brass) release toxic fume when melted: use effective extraction and a suitable respirator. This app is a timing aid, **not a safety system and not a kiln controller**; it cannot see your equipment, and times and temperatures in the bundled profiles are starting points you must verify for your own setup. Equipment manufacturers' instructions and PPE requirements always take precedence. Use at your own risk — see the licence.

## Credits and trademarks

Bundled profile values reference public manufacturer datasheets (GRS Protocast) and community experience. GRS, Protocast, Siraya Tech, True Blue and other product names belong to their owners; this project is independent and not affiliated with or endorsed by them.

## Licence

[MIT](LICENSE)
