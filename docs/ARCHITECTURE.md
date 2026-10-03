# Architecture

Plain HTML, CSS and JavaScript. **No build step, no browser dependencies**, and it works opened straight from disk (`file://`). That's why scripts are classic `<script>` files sharing one `CPT` namespace rather than ES modules, which browsers block on `file://`.

```
index.html          loads scripts in dependency order
config.js           host configuration (branding, defaults, extra profiles)
js/util.js          pure helpers: time/temperature formatting, escaping
js/profile.js       profile model: stage types, registry, validation, helpers (no process data)
profiles/*.js       profile packs registered with CPT.Profile.register
js/engine.js        run event log → schedule, metal timing, alerts, back-planning, .ics export. No DOM.
js/storage.js       localStorage behind a small interface (+ in-memory fallback)
js/sync.js          optional account sync: pushes/pulls browser storage to /api (no DOM)
js/alerts.js        notifications, sound, vibration, wake lock, downloads
js/ui/components.js shared HTML-string building blocks
js/ui/{now,timeline,run,history,settings,modals}.js   one file per screen
js/app.js           controller: state, actions, 1 s tick, input binding
sw.js               offline cache (network-first; never caches /api)
api/                optional server: Vercel Functions (Node, CommonJS) for sign-in and sync
api/_lib/           shared server helpers; memory-store.js and pg-store.js share one interface
```

The browser never depends on the server: it reads and writes localStorage as always, and `js/sync.js` reconciles that with the account in the background. See [HOSTING.md](HOSTING.md).

## Ideas to keep

- **A run is an event log plus a snapshot of its profile.** Everything displayed is a pure function of `(run, now)`, so timers survive the page being closed. Don't add state that can't be recomputed.
- **Process values live in profiles**, never in engine/UI code. If you're typing a temperature or duration into `js/`, it belongs in a profile.
- **Data is stored in °C / minutes / 24 h**; conversion is display-only (`util.js`, applied in `app.js` when rendering).
- **Views return HTML strings.** Always pass user text through `esc` (`h`). Inputs use `data-bind="scope|path"` and `data-type`; `app.js` writes them into state on `change`.
- **The app never claims equipment state.** A finished timer means "scheduled time passed".

## Adding a screen or field

1. Add the renderer in `js/ui/` and register it in `RENDER` in `app.js`; add the script tag to `index.html` **and** the asset list in `sw.js` (bump `CACHE`).
2. Bind inputs with `data-bind`; add a new `data-type` in `readValue` if needed.
3. Add unit tests for logic in `engine.js`/`profile.js`; extend `tests/e2e.js` for UI flows.

## Tests

`npm test` (unit + API + sync; set `TEST_DATABASE_URL` to also test against Postgres) · `npm run lint` · `npm run test:e2e` (needs `npm install` and a browser; start `npm start` first). `tests/e2e-sync.js` signs in two phones against `npm run dev`. CI runs all of them.
