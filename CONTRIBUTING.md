# Contributing

Thanks for helping! Casting Buddy's browser app is small and dependency-free, and we'd like to keep it that way. The optional server in `api/` (accounts, sync, notifications) uses three packages: `pg`, `@vercel/functions` and `web-push`.

## Setup

```sh
git clone https://github.com/fonnwood/lost-resin-casting-buddy
cd lost-resin-casting-buddy
npm install        # dev tools and the server's packages; the browser app needs nothing
npm start          # http://localhost:8080, static only (no accounts)
npm run dev        # plus accounts, sync and notifications: in-memory database, sign-in codes printed in the terminal
npm run check      # lint + unit, API and sync tests
```

To also run the API tests against a real Postgres, set `TEST_DATABASE_URL=postgres://…` (the tests use, and wipe, schemas named `api_test` and `push_test` in it).

End-to-end tests (run `npx playwright install chromium` once first):

- with `npm start` running: `npm run test:e2e`
- with `CODE_RESEND_SECONDS=2 npm run dev` running: `node tests/e2e-sync.js` (two phones sign in and sync) and `node tests/e2e-push.js` (notifications)

## Before you open a PR

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), especially "ideas to keep".
- `npm run check` passes. Run the e2e tests if you touched UI, sync or notifications.
- Check the UI at 390 px wide in dark and light themes. This is used one-handed with gloves near hot metal: big targets, clear contrast, no colour-only signals.
- Process data (temperatures, times, wording) goes in a **profile**, with a source for any figure called `manufacturer`.
- The app must keep working with no server and no account. Anything touching `api/`, `js/sync.js` or `js/push.js` must store no personal data beyond the email address.

## Profiles are welcome

Different investments, resins and metals are best shared as profiles: see [docs/PROFILES.md](docs/PROFILES.md). Please say where each number came from, and mark anything you haven't verified as `working` or `experimental`. Don't submit text copied from a manufacturer's datasheet; cite it instead.

## Safety

This app guides a hazardous process. Changes that could display a wrong time, temperature or instruction need a test and a clear note in the PR.
