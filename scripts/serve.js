#!/usr/bin/env node
/* Zero-dependency static file server for local use or simple self-hosting.
 *
 *   node scripts/serve.js [port] [--host 0.0.0.0]
 *
 * Defaults to http://localhost:8080. The app is plain static files, so any
 * web server works; this exists so `npm start` needs no installs. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const hostIdx = args.indexOf('--host');
const HOST = hostIdx >= 0 ? args.splice(hostIdx, 2)[1] : (process.env.HOST || '127.0.0.1');
const PORT = Number(args[0] || process.env.PORT || 8080);

/** Files the browser may fetch. Everything else in the repo (tests, docs, scripts…) stays private. */
const PUBLIC = [/^\/$/, /^\/index\.html$/, /^\/config\.js$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/(js|css|icons|profiles)\//, /^\/[\w.-]+\.css$/];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400).end('Bad request'); return; }
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

server.listen(PORT, HOST, () => {
  console.log('Casting Buddy running at http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '/');
  if (HOST === '0.0.0.0') console.log('Listening on all interfaces — reachable from other devices on your network.');
});
