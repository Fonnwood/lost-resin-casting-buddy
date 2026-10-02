# Changelog

## Unreleased

- Metal weight calculator on the RUN screen: pattern volume from the slicer (ml) or weighed resin + wax (g), alloy density (brass C121 default, plus bronze, copper, silver, gold, pewter, aluminium or custom), sprue allowance, and one tap to use the result as the run's metal weight.
- Open-source release preparation: MIT licence, contributing/security docs, issue and PR templates.
- Host configuration in `config.js` (name, logo, default settings, extra profiles, custom stylesheet).
- Process data moved out of the core into `profiles/`; profile registry, blank profiles, validation with readable errors, per-profile safety notes and phase headings.
- Display settings: °C/°F, 12/24-hour clock, accent colour, text size, custom CSS.
- Hosting: `npm start` (no dependencies), Dockerfile + nginx, optional GitHub Pages workflow.
- `js/ui.js` split into one file per screen; ESLint; many more unit tests.

## 1.0.0

First release: NOW / TIMELINE / RUN / HISTORY, editable profiles, calendar alarm export, offline PWA.
