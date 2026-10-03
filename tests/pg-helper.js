/* A Postgres store in its own fresh schema, so test files running in
 * parallel against one TEST_DATABASE_URL don't trip over each other. */
'use strict';
const { Pool } = require('pg');

async function freshPgStore(schema) {
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE; CREATE SCHEMA ' + schema); } finally { await admin.end(); }
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  return require('../api/_lib/pg-store').create(url.toString());
}

module.exports = { freshPgStore };
