# Security policy

Casting Buddy is a static, client-side app: it has no server component and stores everything in the browser on the device that runs it.

## Reporting a vulnerability

Please report security problems privately through GitHub's **Security → Report a vulnerability** form on this repository rather than a public issue. Include steps to reproduce and the browser/version you used. You'll get an acknowledgement within a week.

Things that count: script injection from imported files (profiles, runs, backups), anything that lets a hosted copy leak data between users, or a service-worker caching problem that serves stale or attacker-controlled code.

## Not a safety system

This app is a timing aid. It does not control or monitor any equipment, and a bug in it must never be the only thing standing between you and a hazard. See the safety section of the [README](README.md).
