# Changelog

## Unreleased

- Fix: shortening a step was impossible on iPhone because the numeric keypad has no minus key. The custom-adjust dialog now takes plain minutes with separate “+ Add time” and “− Shorten” buttons.
- Metal melt on the TIMELINE: “Start furnace” and “Metal ready to pour” now appear as a side lane beside the burnout stage they fall in, and follow the plan, kiln re-syncs and delays. The start turns into “Start now — N late” if its time passes; once started it counts down to expected readiness, then shows when the metal was confirmed.
- Metal weight calculator on the RUN screen: pattern volume from the slicer (ml) or weighed resin + wax (g), alloy density (brass C121 default, plus bronze, copper, silver, gold, pewter, aluminium or custom), sprue allowance, and one tap to use the result as the run's metal weight.
- Plan the timeline around any milestone, not just the casting time: pick a step, say when it starts or ends (e.g. bench rest from 15:45), choose its length (90 min / 2 h / 2½ h), and every other step is recalculated. "Earliest possible" suggests a time when yours is too soon, and "Lock in this plan" commits it. Older casting-time plans still work.
- Open-source release preparation: MIT licence, contributing/security docs, issue and PR templates.
- Host configuration in `config.js` (name, logo, default settings, extra profiles, custom stylesheet).
- Process data moved out of the core into `profiles/`; profile registry, blank profiles, validation with readable errors, per-profile safety notes and phase headings.
- Display settings: °C/°F, 12/24-hour clock, accent colour, text size, custom CSS.
- Hosting: `npm start` (no dependencies), Dockerfile + nginx, optional GitHub Pages workflow.
- `js/ui.js` split into one file per screen; ESLint; many more unit tests.

## 1.0.0

First release: NOW / TIMELINE / RUN / HISTORY, editable profiles, calendar alarm export, offline PWA.
