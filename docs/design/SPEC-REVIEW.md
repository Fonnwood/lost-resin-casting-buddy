# Spec review — amendments adopted for v1

The spec in [SPEC.md](SPEC.md) is approved and mostly built as written. This page lists the gaps found while reviewing it and how v1 handles each one. Where the two documents disagree, this page wins.

## 1. Kiln-program stages must not shift when you tap late (fixes §27 vs §10)

§27 says every stage shifts downstream timings when it is completed late. That is right for things *you* do (mixing, the flask set, pouring), but wrong for burnout segments run by a **programmable kiln**: the kiln moves on at its own scheduled time whether or not anyone taps the phone. If the app waited for a tap at 03:00 to end the 220 °C hold, the whole projected schedule would drift away from what the kiln is actually doing.

**Adopted:** every stage has a `control` setting:

| control | Meaning | Timing behaviour |
|---|---|---|
| `kiln` | Segment of the kiln controller's programme (E1–E6) | Advances **on schedule**, anchored to "Flask in kiln — start burnout". Labelled *scheduled*, never *measured*. |
| `user` | Something a person does or confirms | Waits for a tap. A late tap shifts everything after it (§27). |

Extending a kiln stage in the app (+15 min etc.) shows a reminder to extend the segment on the kiln controller too. The app can't change the kiln itself.

## 2. Reopen behaviour split by control type (refines §38)

- **Kiln stages that passed while the app was closed:** "While you were away the kiln programme should have moved through: … It should now be in: *Hold 450 °C* (01:12 left). Check the controller." Buttons: **Kiln matches — continue** or **Kiln is on a different step**. The second opens a re-sync dialog where you pick the actual segment and the minutes it has left.
- **User stages that ran past their end:** "Scheduled stage ended 17 minutes ago." Buttons: **Yes — it's done, continue** or **No — still on this step**, as in the spec.

## 3. Browser alerts won't wake a sleeping phone overnight (limits §29, §30)

A web page cannot run timers or show notifications while iOS has suspended it, and Web Push needs a server, which v1 doesn't have. The alerts in §29 therefore only fire while the app is open. That matters most during the ~16 h overnight burnout.

**Adopted:**
- **Export schedule to calendar (.ics)**: every upcoming intervention (stage ends, *start brass furnace*, soak complete, …) becomes a calendar event with an alarm. The phone's own calendar then alerts you reliably, even offline.
- **Keep screen awake** toggle (Screen Wake Lock API) for use beside the bench.
- In-app alerts (notification + sound + vibration) still fire whenever the app is open, and each one can be turned off separately.

## 4. CZ121 is a *leaded* brass (safety notes, §44)

CZ121 (CW614N, CuZn39Pb3) contains roughly 2.5–3.5 % lead as well as ~39 % zinc. The safety notes now name **lead and zinc fume** explicitly, not just zinc. Effective extraction and a suitable respirator matter even more, and so does keeping food and drink out of the casting area.

## 5. The metal shouldn't wait for the flask (refines §15)

The flask can sit at casting temperature indefinitely, which is what the soak is for. Molten brass held too long loses zinc and oxidises. So the brass-furnace countdown targets **metal ready at the moment the flask soak completes**, plus an editable `metalReadyOffsetMinutes` (default 0, a *working* value). A positive offset has the metal ready slightly after the flask, never before.

## 6. Wait-for-kiln vs. back-planning (resolves §11 vs §30)

§11 prefers "wait for kiln" (no assumed duration) for the 750 → 525 °C cool-down, but §30's back-planning needs a duration. **Adopted:** F1 defaults to `temperature_wait` (you confirm *Kiln at casting temperature*), but it still carries an **estimated** cool-down (90 min, *working*). Only projections and the back-plan use that estimate, and they're labelled *estimate*. You can switch F1 to a scheduled `ramp` (Mode 1) in the profile. In that mode the soak stage asks for **Flask at target temperature** before casting is unlocked, because a finished schedule is not a measured temperature.

## 7. Runs snapshot their profile

Editing a profile must not rewrite history. A new run takes a **copy** of the profile. Edits made during a run (e.g. +30 min on the 750 °C hold) apply to that run's copy and are logged as deviations. Profile edits affect future runs only.

## 8. Provenance flips automatically (strengthens §33)

Each timing or temperature carries provenance (`manufacturer` / `working` / `experimental`), and manufacturer values keep a reference copy of the datasheet figure. If you change a manufacturer value, it automatically becomes **working**, and the UI shows the datasheet figure next to it ("Datasheet: 3 h · Current: 4 h"). Setting it back to the datasheet value restores *manufacturer*. This is what stops folklore turning into "manufacturer instructions".

## 9. Calculator: powder estimate is labelled as such (§4)

A 3″ × 4″ flask is about 463 cm³. The calculator shows flask volume, net volume after displacement, and an **estimated** powder quantity. The estimate uses an editable grams-per-cm³ factor (default 1.2 g/cm³ at 40:100, *experimental*). 650 g stays the working default. Record actual usage to calibrate.

## 10. Storage choice and eviction (§37)

v1 uses `localStorage` behind a small `StorageService` so it can move to IndexedDB later without touching the rest of the app. The data is small (a run is a few KB). **Important:** Safari can evict storage for websites you haven't opened in 7 days. To avoid that, install the app to the home screen (PWA storage is exempt), and use *Export all history* now and then as a backup.

## 11. Undo

Gloved, dirty hands mis-tap. Every user action (complete, extend, mark poured, …) is recorded as a group of events, and the most recent user action can be undone from the NOW screen.

## 12. Architecture as built (§40, §43, §49)

- Plain HTML/CSS/JS, no build step, no dependencies. Classic scripts (not ES modules), so it also runs straight from `index.html` on `file://`.
- The run is an **event log** (`STAGE_START`, `STAGE_DONE`, `EXTEND`, `PAUSE`, `MARK`, `METAL_START`, `KILN_SYNC`, …). Schedules, countdowns, run state and alerts are all pure functions of `(run, now)` in `js/engine.js`, which is unit-tested with `node --test`. The UI never holds timing state.
- Timers are timestamp-based throughout.
- The spec's run states (`DRAFT … COMPLETE`) are derived from the current stage's phase and the metal state.
