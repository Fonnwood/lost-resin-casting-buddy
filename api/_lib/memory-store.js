/* In-memory store for local development and tests. Same behaviour as
 * pg-store.js; everything is lost when the process exits. */
'use strict';

const HOUR = 3600000;

function create() {
  const users = new Map();      // id → { id, email }
  const codes = [];             // { id, email, hash, attempts, createdAt, expiresAt, usedAt }
  const sessions = new Map();   // hash → { userId, expiresAt }
  const docs = new Map();       // userId → Map(key → { kind, id, data, updatedAt, seq })
  let nextId = 1;
  let seq = 0;

  const userDocs = (userId) => { if (!docs.has(userId)) docs.set(userId, new Map()); return docs.get(userId); };

  return {
    kind: 'memory',
    async codeStats(email, now) {
      const mine = codes.filter((c) => c.email === email);
      return {
        lastAt: mine.reduce((m, c) => Math.max(m, c.createdAt), 0) || null,
        hour: mine.filter((c) => c.createdAt > now - HOUR).length,
        day: mine.filter((c) => c.createdAt > now - 24 * HOUR).length,
      };
    },
    async createCode(email, hash, expiresAt) {
      const now = Date.now();
      codes.forEach((c) => { if (c.email === email && !c.usedAt) c.usedAt = now; });
      codes.push({ id: nextId++, email, hash, attempts: 0, createdAt: now, expiresAt, usedAt: null });
    },
    async latestCode(email, now) {
      const c = codes.filter((x) => x.email === email && !x.usedAt && x.expiresAt > now).pop();
      return c ? { id: c.id, hash: c.hash, attempts: c.attempts } : null;
    },
    async failCode(id) {
      const c = codes.find((x) => x.id === id);
      if (!c) return Infinity;
      return ++c.attempts;
    },
    async consumeCode(id) {
      const c = codes.find((x) => x.id === id);
      if (!c || c.usedAt) return false;
      c.usedAt = Date.now();
      return true;
    },
    async upsertUser(email) {
      for (const u of users.values()) if (u.email === email) return u.id;
      const id = nextId++;
      users.set(id, { id, email });
      return id;
    },
    async createSession(hash, userId, expiresAt) { sessions.set(hash, { userId, expiresAt }); },
    async sessionUser(hash, now) {
      const s = sessions.get(hash);
      if (!s || s.expiresAt <= now) return null;
      const u = users.get(s.userId);
      return u ? { userId: u.id, email: u.email } : null;
    },
    async deleteSession(hash) { sessions.delete(hash); },
    async deleteUser(userId) {
      users.delete(userId);
      docs.delete(userId);
      for (const [h, s] of sessions) if (s.userId === userId) sessions.delete(h);
    },
    async liveDocCount(userId) { return [...userDocs(userId).values()].filter((d) => d.data !== null).length; },
    async sync(userId, since, changes, limits) {
      const mine = userDocs(userId);
      const rejected = [];
      changes.forEach((c) => {
        const key = c.kind + ':' + c.id;
        const cur = mine.get(key);
        if (cur && !(c.updatedAt > cur.updatedAt)) { rejected.push(key); return; }
        mine.set(key, { kind: c.kind, id: c.id, data: c.data === null ? null : JSON.parse(c.json), updatedAt: c.updatedAt, seq: ++seq });
      });
      const after = [...mine.values()].filter((d) => d.seq > since).sort((a, b) => a.seq - b.seq);
      return page(after, rejected.map((k) => mine.get(k)), since, limits);
    },
    async cleanup(now) {
      for (let i = codes.length - 1; i >= 0; i--) if (codes[i].createdAt < now - 24 * HOUR) codes.splice(i, 1);
      for (const [h, s] of sessions) if (s.expiresAt <= now) sessions.delete(h);
    },
  };
}

/** Shared paging: rejected pushes always come back (so the client adopts the
 * winning version); then changes after `since`, up to the row/byte budget. */
function page(after, rejectedRows, since, limits) {
  const out = rejectedRows.map(row);
  let bytes = out.reduce((n, r) => n + JSON.stringify(r.data).length, 0);
  let cursor = since;
  let more = false;
  for (let i = 0; i < after.length; i++) {
    const r = row(after[i]);
    const size = JSON.stringify(r.data).length;
    if (i > 0 && (i >= limits.pageRows || bytes + size > limits.pageBytes)) { more = true; break; }
    out.push(r);
    bytes += size;
    cursor = after[i].seq;
  }
  return { cursor, more, changes: out };
}

function row(d) {
  return { kind: d.kind, id: d.id, data: d.data, deleted: d.data === null, updatedAt: d.updatedAt };
}

module.exports = { create, page };
