/* Postgres store (Neon via the Vercel Marketplace, or any Postgres 13+).
 * Tables are created on first use, so a fresh database needs no setup step. */
'use strict';

const { Pool } = require('pg');
const { page } = require('./memory-store');

const SCHEMA_LOCK = -7262021; // any constant; serialises concurrent cold-start migrations

const SCHEMA = `
SELECT pg_advisory_xact_lock(${SCHEMA_LOCK});
CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_codes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes (email, created_at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE SEQUENCE IF NOT EXISTS doc_seq;
CREATE TABLE IF NOT EXISTS docs (
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       JSONB,
  updated_at BIGINT NOT NULL,
  seq        BIGINT NOT NULL DEFAULT nextval('doc_seq'),
  PRIMARY KEY (user_id, kind, id)
);
CREATE INDEX IF NOT EXISTS docs_user_seq ON docs (user_id, seq);
`;

const ms = (d) => (d == null ? null : new Date(d).getTime());

function create(connectionString) {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
  pool.on('error', (err) => console.error('Postgres pool error', err));
  // On Vercel Fluid compute, release idle connections before the instance suspends.
  try { require('@vercel/functions').attachDatabasePool(pool); } catch (e) { /* not on Vercel */ }

  let ready;
  const migrate = () => {
    if (!ready) ready = pool.query(SCHEMA).catch((err) => { ready = null; throw err; });
    return ready;
  };
  const q = async (text, params) => { await migrate(); return pool.query(text, params); };

  return {
    kind: 'postgres',
    pool,
    migrate,
    async codeStats(email, now) {
      const { rows } = await q(
        `SELECT max(created_at) AS last_at,
                count(*) FILTER (WHERE created_at > $2) AS hour,
                count(*) FILTER (WHERE created_at > $3) AS day
           FROM login_codes WHERE email = $1 AND created_at > $3`,
        [email, new Date(now - 3600000), new Date(now - 86400000)]);
      return { lastAt: ms(rows[0].last_at), hour: Number(rows[0].hour), day: Number(rows[0].day) };
    },
    async createCode(email, hash, expiresAt) {
      await migrate();
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('UPDATE login_codes SET used_at = now() WHERE email = $1 AND used_at IS NULL', [email]);
        await c.query('INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)', [email, hash, new Date(expiresAt)]);
        await c.query('COMMIT');
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        throw err;
      } finally { c.release(); }
    },
    async latestCode(email, now) {
      const { rows } = await q(
        'SELECT id, code_hash, attempts FROM login_codes WHERE email = $1 AND used_at IS NULL AND expires_at > $2 ORDER BY id DESC LIMIT 1',
        [email, new Date(now)]);
      return rows[0] ? { id: rows[0].id, hash: rows[0].code_hash, attempts: rows[0].attempts } : null;
    },
    async failCode(id) {
      const { rows } = await q('UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [id]);
      return rows[0] ? rows[0].attempts : Infinity;
    },
    async consumeCode(id) {
      const { rowCount } = await q('UPDATE login_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL', [id]);
      return rowCount === 1;
    },
    async upsertUser(email) {
      const { rows } = await q(
        'INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id', [email]);
      return Number(rows[0].id);
    },
    async createSession(hash, userId, expiresAt) {
      await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hash, userId, new Date(expiresAt)]);
    },
    async sessionUser(hash, now) {
      const { rows } = await q(
        'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > $2',
        [hash, new Date(now)]);
      return rows[0] ? { userId: Number(rows[0].id), email: rows[0].email } : null;
    },
    async deleteSession(hash) { await q('DELETE FROM sessions WHERE token_hash = $1', [hash]); },
    async deleteUser(userId) { await q('DELETE FROM users WHERE id = $1', [userId]); },
    async liveDocCount(userId) {
      const { rows } = await q('SELECT count(*) AS n FROM docs WHERE user_id = $1 AND data IS NOT NULL', [userId]);
      return Number(rows[0].n);
    },
    async sync(userId, since, changes, limits) {
      await migrate();
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        // One writer per user at a time, so `seq` order matches commit order and cursors never skip a change.
        await c.query('SELECT pg_advisory_xact_lock($1)', [userId]);
        let rejected = [];
        if (changes.length) {
          const { rows } = await c.query(
            `INSERT INTO docs (user_id, kind, id, data, updated_at)
             SELECT $1, t.kind, t.id, t.data::jsonb, t.updated_at
               FROM unnest($2::text[], $3::text[], $4::text[], $5::bigint[]) AS t (kind, id, data, updated_at)
             ON CONFLICT (user_id, kind, id) DO UPDATE
               SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, seq = nextval('doc_seq')
               WHERE EXCLUDED.updated_at > docs.updated_at
             RETURNING kind, id`,
            [userId, changes.map((x) => x.kind), changes.map((x) => x.id), changes.map((x) => (x.data === null ? null : x.json)), changes.map((x) => x.updatedAt)]);
          const won = new Set(rows.map((r) => r.kind + ':' + r.id));
          rejected = changes.filter((x) => !won.has(x.kind + ':' + x.id));
        }
        const rej = rejected.length ? (await c.query(
          `SELECT kind, id, data, updated_at, seq FROM docs
            WHERE user_id = $1 AND (kind, id) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
          [userId, rejected.map((x) => x.kind), rejected.map((x) => x.id)])).rows : [];
        const after = (await c.query(
          'SELECT kind, id, data, updated_at, seq FROM docs WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
          [userId, since, limits.pageRows + 1])).rows;
        await c.query('COMMIT');
        const norm = (r) => ({ kind: r.kind, id: r.id, data: r.data, updatedAt: Number(r.updated_at), seq: Number(r.seq) });
        return page(after.map(norm), rej.map(norm), since, limits);
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        throw err;
      } finally { c.release(); }
    },
    async cleanup(now) {
      await q('DELETE FROM login_codes WHERE created_at < $1', [new Date(now - 86400000)]);
      await q('DELETE FROM sessions WHERE expires_at <= $1', [new Date(now)]);
    },
  };
}

module.exports = { create };
