#!/usr/bin/env node
/* Create the account tables in DATABASE_URL and check the connection.
 * Optional: the server also creates them on first use.
 *
 *   DATABASE_URL=postgres://… npm run db:setup      (or: vercel env pull && npm run db:setup) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Pick up a local .env / .env.local (as written by `vercel env pull`) if present.
for (const f of ['.env.local', '.env']) {
  const file = path.join(__dirname, '..', f);
  if (!fs.existsSync(file)) continue;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error('Set DATABASE_URL first (Vercel → Storage → your Neon database → .env.local tab).'); process.exit(1); }

(async () => {
  const store = require('../api/_lib/pg-store').create(url);
  try {
    await store.migrate();
    const { rows } = await store.pool.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM docs WHERE data IS NOT NULL) AS docs');
    console.log('Database ready: ' + rows[0].users + ' accounts, ' + rows[0].docs + ' synced items.');
  } catch (err) {
    console.error('Database setup failed: ' + err.message);
    process.exitCode = 1;
  } finally { await store.pool.end(); }
})();
