#!/usr/bin/env node
/* Zero-dependency static file server for local use or simple self-hosting.
 *
 *   node scripts/serve.js [port] [--host 0.0.0.0] [--dev]
 *
 * Defaults to http://localhost:8080. The app is plain static files, so any
 * web server works; this exists so `npm start` needs no installs.
 *
 * Accounts and sync (the /api endpoints) are served too when DATABASE_URL is
 * set (needs `npm install`), or with --dev: an in-memory database, and sign-in
 * codes printed here instead of emailed. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** Files the browser may fetch. Everything else in the repo (tests, docs, scripts…) stays private. */
const PUBLIC = [/^\/$/, /^\/index\.html$/, /^\/config\.js$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/(js|css|icons|profiles)\//, /^\/[\w.-]+\.css$/];

/** API endpoints: /api/<name> → api/<name>.js. `_lib` holds helpers, not endpoints. */
const API = /^\/api\/((?:[a-z-]+\/)?[a-z-]+)$/;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function createServer(opts) {
  const api = opts && opts.api;
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400).end('Bad request'); return; }

    const m = api && pathname.match(API);
    if (m) {
      const file = path.join(ROOT, 'api', m[1] + '.js');
      if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"Not found"}'); return; }
      Promise.resolve(require(file)(req, res)).catch((err) => { console.error(err); if (!res.headersSent) res.writeHead(500).end(); });
      return;
    }
    // Static only: tell the app there are no accounts here (instead of a 404 in the console).
    if (!api && pathname === '/api/session') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"accounts":false,"email":null}');
      return;
    }
    // Development only: the last emailed sign-in code, for automated tests.
    if (api && process.env.CB_DEV === '1' && pathname === '/__dev/outbox') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(require('../api/_lib/email').outbox));
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT + path.sep) || !PUBLIC.some((re) => re.test(pathname))) { res.writeHead(404).end('Not found'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const args = process.argv.slice(2);
  const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return false; args.splice(i, 1); return true; };
  if (take('--dev')) process.env.CB_DEV = '1';
  const hostIdx = args.indexOf('--host');
  const HOST = hostIdx >= 0 ? args.splice(hostIdx, 2)[1] : (process.env.HOST || '127.0.0.1');
  const PORT = Number(args[0] || process.env.PORT || 8080);
  const api = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.CB_DEV === '1');

  createServer({ api }).listen(PORT, HOST, () => {
    console.log('Casting Buddy running at http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '/');
    if (HOST === '0.0.0.0') console.log('Listening on all interfaces — reachable from other devices on your network.');
    if (api) console.log('Accounts & sync: on' + (process.env.DATABASE_URL || process.env.POSTGRES_URL ? ' (Postgres)' : ' (development: in-memory database, sign-in codes printed below)'));
  });
}
