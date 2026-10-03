# Security policy

Casting Buddy is a client-side app that stores everything in the browser. Hosted copies can add an optional account API (`api/`): email sign-in codes, sessions and synced casting data in Postgres — see [docs/HOSTING.md](docs/HOSTING.md).

## Reporting a vulnerability

Please report security problems privately through GitHub's **Security → Report a vulnerability** form on this repository rather than a public issue. Include steps to reproduce and the browser/version you used. You'll get an acknowledgement within a week.

Things that count: script injection from imported or synced data (profiles, runs, backups), anything that lets one account read or change another's data, sign-in bypass or code brute-forcing, session theft, or a service-worker caching problem that serves stale or attacker-controlled code.

## Not a safety system

This app is a timing aid. It does not control or monitor any equipment, and a bug in it must never be the only thing standing between you and a hazard. See the safety section of the [README](README.md).
