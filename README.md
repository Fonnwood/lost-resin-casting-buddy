# Lost Resin Casting Buddy

A mobile-first **process companion and timing dashboard** for vacuum-assisted investment casting of resin-printed models. The default profile is GRS Protocast investment, Siraya Tech Cast True Blue resin and CZ121 brass.

At any moment it answers: **Where am I? What should I be doing now? What happens next, and when?**

- **NOW**: one big current step with "what to do now", the target temperature, a countdown or elapsed timer, extend buttons (+5/+15/+30/custom), the next step, and a parallel **flask vs. brass** panel that tells you when to start the furnace.
- **TIMELINE**: the whole process with actual and projected clock times, plus export of every upcoming intervention as **calendar alarms (.ics)** for overnight burnouts.
- **RUN**: values for this casting, including an investment calculator (water from powder and ratio), metal settings, every temperature and duration, and **plan backwards from a casting time**.
- **HISTORY**: finished runs with a 1–5 result, defects, notes, a planned-vs-actual timeline, a comparison table, and JSON export/import.
- **Settings (⚙)**: individually switchable alerts, keep-screen-awake, profile editor (stages, timings, temperatures, wording, evidence levels), and full backup/restore.

## Built-in profiles

| Profile | Burnout | Notes |
|---|---|---|
| **Protocast / True Blue / CZ121 — 5-hour fast burnout (R14-LPB)** *(default)* | 220 °C 15+45 min → 450 °C 15+45 min → 730 °C 20+150 min → cool to 550 °C → 60 min soak | For small (~25 mm) models with strong kiln extraction. The 730 °C / 2.5 h peak is below the Protocast datasheet's 750 °C / 4 h; the app shows both figures and flags it. |
| Protocast / True Blue / CZ121 — Initial | Protocast datasheet *Typical Resin Burnout* | 220 °C 90+180 → 450 °C 120+120 → 750 °C 180+240 → 525 °C → 60 min soak |

Both profiles include a **kiln controller programme** (C/t segment format) generated from their stages. It appears on the *flask into kiln* step and on the RUN screen.

## Principles

- **Nothing process-specific is hard-coded.** Every temperature and duration comes from an editable profile. Each value carries its evidence level (*manufacturer* / *working* / *experimental*). Changing a datasheet value automatically marks it as *working*.
- **The app never claims equipment state.** A finished ramp timer means "scheduled ramp complete", not "kiln is at 450 °C". Flask temperature and metal readiness always need a tap to confirm.
- **Timers are timestamp-based.** The run is an event log, and every countdown is computed from `(run, now)`. Closing Safari or letting the phone sleep loses nothing. On reopen the app shows what should have happened and asks you to confirm it against the kiln.
- **Kiln-programme stages advance on schedule; your stages wait for you.** A late tap on a stage you control (mixing, set, pour) shifts everything after it. The kiln's own programme segments don't drift because you tapped late.

See [docs/SPEC.md](docs/SPEC.md) for the original specification and [docs/SPEC-REVIEW.md](docs/SPEC-REVIEW.md) for the amendments adopted in v1.

## Running it

It is plain HTML, CSS and JavaScript with no build step and no dependencies.

- Open `index.html` directly, or
- serve the folder (`npx http-server .`) and open it on your phone. On iPhone, use **Share → Add to Home Screen** for offline use, notifications and storage that Safari won't evict.

Production is a static Vercel deploy of this repository. Every PR gets a preview deployment.

## Tests

```sh
node --test tests/*.test.js          # engine unit tests (no dependencies)
npx http-server -p 8080 -s . &       # then:
node tests/e2e.js http://localhost:8080 [screenshot-dir]   # full casting run in a 390×844 browser (needs playwright)
```

## Code map

| File | Role |
|---|---|
| `js/profile.js` | Default *Protocast / True Blue / CZ121 — Initial* profile, evidence levels, safety notes |
| `js/engine.js` | Run event log → schedule, run state, metal timing, alerts, reopen check, back-planning, calendar export. No DOM. |
| `js/storage.js` | StorageService (localStorage now; swappable for IndexedDB) |
| `js/alerts.js` | AlertService: notifications, sound, vibration, wake lock, downloads |
| `js/ui.js` | View renderers (pure HTML strings) |
| `js/app.js` | Controller: state, actions, 1 s tick, bindings |
| `sw.js`, `manifest.webmanifest` | PWA / offline |

## Safety

Molten brass, hot flasks and vacuum equipment are dangerous. CZ121 is a **leaded** brass: melting it releases zinc and lead fume, so use effective extraction and a suitable respirator. Equipment manufacturer instructions and PPE requirements always take precedence over this app.
