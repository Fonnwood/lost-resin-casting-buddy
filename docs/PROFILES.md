# Writing a profile

A **profile** is the whole process as data: stages, timings, temperatures, wording, checklists, safety notes. The app has no built-in knowledge of any investment, resin or metal — the Protocast profiles in [`profiles/protocast-trueblue-cz121.js`](../profiles/protocast-trueblue-cz121.js) are just an example.

There are four ways to get a profile into the app, from easiest to most permanent:

1. **In the app** — Settings → Process profiles → *New blank profile*, or *Duplicate* an existing one, then edit everything in the editor.
2. **Import a file** — Settings → *Import profile* with a `.json` file (profiles you *Export* from the app work).
3. **Host config** — put profile objects in `config.js` under `profiles: [...]`; they appear for everyone using that copy.
4. **Profile pack** — a script in `profiles/` that calls `CPT.Profile.register(() => ({...}))`, added to `index.html` and `sw.js` (copy the Protocast file).

Runs take a *copy* of the profile, so editing a profile never changes a run in progress or in history.

## Shape

```jsonc
{
  "id": "my-process",            // unique
  "name": "My process",
  "materials": { "investment": "", "resin": "", "metal": "Silver", "kiln": "", "castingMachine": "" },
  "params": { /* see below */ },
  "controller": { "stopCode": -121, "note": "…" },   // kiln controller programme display
  "safetyNotes": ["…"],          // shown before a run starts; falls back to generic notes
  "phases": { "burnout": "Firing" },                  // optional heading overrides
  "stages": [ /* see below */ ]
}
```

Everything except `name` and `stages` is optional; gaps are filled with neutral defaults. **Temperatures are always stored in °C**; the app converts for display when the user picks °F.

### Stages

| Field | Meaning |
|---|---|
| `id` | Unique within the profile. |
| `name`, `short` | Full name and the shorter timeline label. |
| `phase` | Free-text id (`a-z0-9_`). Consecutive stages with the same phase share a heading; label it with `phases`. |
| `type` | `manual` (no timer), `timed`, `ramp`, `hold`, `temperature_wait`, `soak`, `cast_prep`, `cast_sequence`, `finish`. |
| `control` | `user` waits for a tap and shifts everything after it when late. `kiln` runs on the kiln's own schedule and doesn't drift. |
| `minutes`, `unit` | Duration; `unit: "s"` for seconds. |
| `minMinutes` | A minimum the app won't let you finish before without warning. |
| `targetC` | Target temperature. Holds and soaks inherit the previous target if empty. |
| `doNow`, `instructions`, `warning`, `notes` | Wording. `doNow` accepts placeholders: `{targetC} {startC} {waterMl} {powderG} {waterRatioPct} {metal} {metalTargetC} {remaining}`. Write temperatures as `220°C`; they're converted for °F users. |
| `checklist` | Array of strings, ticked on the NOW screen. |
| `events` | `[{ "id", "trigger": "before-end" \| "after-start", "offsetMinutes", "text" }]` in-stage reminders. |
| `completeLabel`, `alertText` | Button and alert wording. |
| `provenance`, `ref`, `source` | Where a value comes from (`manufacturer` / `working` / `experimental`), the datasheet figure to compare against, and a citation. Changing a `manufacturer` value flips it to `working` automatically. |
| `role` | Hooks a stage into special behaviour (below). |

### Roles

Roles are how the engine finds the stages it treats specially. Use each at most once.

`measure` (investment calculator wording) · `set` · `kiln_start` (anchors the kiln schedule) · `peak_hold` · `cool_to_cast` · `soak` (flask conditioning; the metal-furnace countdown is planned against it) · `cast_prep` · `cast` · `post_pour_vacuum` · `cooling` · `finish`.

A process with no furnace/metal timing can simply omit `soak` and `cast`.

### Params

`params` holds the numbers the calculator, metal timing and kiln programme use: `waterRatioPct`, `powderG`, `flaskDiameterMm`, `flaskHeightMm`, `powderPerCm3`, `ambientC`, `metalTargetC`, `metalHeatMinutes`, `metalReadyOffsetMinutes`, `metalWeightG`, `controllerHoldBufferMinutes`. Each is `{ label, unit, value, sourceType, note?, ref?, range?, options?, source? }`. Units shown as `°C` get temperature conversion.

## Checking your work

The editor and importer run the same validation (`CPT.Profile.validate`): unusable profiles are rejected with a reason; suspicious ones (unknown roles, a `cast` stage without a `soak`) produce warnings. For a hand-written pack, add a test in `tests/profile.test.js` — the "shipped profiles are valid" test already covers anything you register.
