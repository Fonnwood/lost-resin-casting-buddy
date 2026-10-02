# Contributing

Thanks for helping! Casting Buddy is a small, dependency-free app and we'd like to keep it that way.

## Setup

```sh
git clone https://github.com/fonnwood/lost-resin-casting-buddy
cd lost-resin-casting-buddy
npm install        # dev tools only (eslint, playwright); the app itself needs nothing
npm start          # http://localhost:8080
npm run check      # lint + unit tests
```

End-to-end test: with `npm start` running, `npx playwright install chromium` once, then `npm run test:e2e`.

## Before you open a PR

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — especially "ideas to keep".
- `npm run check` passes; run the e2e test if you touched UI.
- Check the UI at 390 px wide in dark and light themes. This is used one-handed with gloves near hot metal: big targets, clear contrast, no colour-only signals.
- Process data (temperatures, times, wording) goes in a **profile**, with a source for any figure called `manufacturer`.

## Profiles are welcome

Different investments, resins and metals are best shared as profiles: see [docs/PROFILES.md](docs/PROFILES.md). Please say where each number came from and mark anything you haven't verified as `working` or `experimental`. Don't submit text copied from a manufacturer's datasheet — cite it instead.

## Safety

This app guides a hazardous process. Changes that could display a wrong time, temperature or instruction need a test and a clear note in the PR.
