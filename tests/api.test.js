/* Accounts & sync API, end to end over HTTP. Runs against the in-memory store,
 * and against real Postgres too when TEST_DATABASE_URL is set, e.g.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/cb_test npm test */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CB_DEV = '1'; // codes go to the in-process outbox instead of email
const { createServer } = require('../scripts/serve.js');
const { setStore } = require('../api/_lib/store');
const { outbox } = require('../api/_lib/email');
const config = require('../api/_lib/config');

/** A device: remembers its cookie like a browser would. */
function device(base) {
  let cookie = '';
  async function call(path, body, opts) {
    const headers = Object.assign({ cookie }, body !== undefined ? { 'content-type': 'application/json' } : {}, (opts && opts.headers) || {});
    const r = await fetch(base + path, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null), setCookie: set };
  }
  return {
    call,
    get cookie() { return cookie; },
    async signIn(email) {
      // Real devices sign in minutes apart; skip the 30 s resend wait here.
      const wait = config.codeResendSeconds;
      config.codeResendSeconds = 0;
      const r = await call('/api/auth/request-code', { email }).finally(() => { config.codeResendSeconds = wait; });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const code = outbox.filter((m) => m.to === email.toLowerCase().trim()).pop().code;
      const v = await call('/api/auth/verify', { email, code });
      assert.equal(v.status, 200, JSON.stringify(v.body));
      return v;
    },
  };
}

const stores = [['memory', () => require('../api/_lib/memory-store').create()]];
if (process.env.TEST_DATABASE_URL) {
  stores.push(['postgres', () => require('./pg-helper').freshPgStore('api_test')]);
}

for (const [name, makeStore] of stores) {
  test('accounts & sync API (' + name + ' store)', async (t) => {
    const store = await makeStore();
    setStore(store);
    const server = createServer({ api: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    t.after(async () => { server.close(); if (store.pool) await store.pool.end(); setStore(undefined); });
    let n = 0;
    const freshEmail = () => 'maker' + (++n) + '-' + name + '@example.com';

    await t.test('session reports accounts available and signed out', async () => {
      const r = await device(base).call('/api/session');
      assert.equal(r.body.accounts, true);
      assert.equal(r.body.email, null);
      assert.equal(r.body.sessionDays, 30);
    });

    await t.test('sign in with an emailed code sets a 30-day HttpOnly cookie', async () => {
      const d = device(base);
      const email = freshEmail();
      const v = await d.signIn('  ' + email.toUpperCase() + ' ');
      assert.equal(v.body.email, email);
      assert.match(v.setCookie, /^cb_session=[\w-]{40,};/);
      assert.match(v.setCookie, /HttpOnly/);
      assert.match(v.setCookie, /SameSite=Lax/);
      assert.match(v.setCookie, new RegExp('Max-Age=' + 30 * 86400));
      assert.equal((await d.call('/api/session')).body.email, email);
    });

    await t.test('bad input and wrong codes are refused; five wrong guesses kill the code', async () => {
      const d = device(base);
      assert.equal((await d.call('/api/auth/request-code', { email: 'not-an-email' })).status, 400);
      const email = freshEmail();
      await d.call('/api/auth/request-code', { email });
      const code = outbox.filter((m) => m.to === email).pop().code;
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 4; i++) {
        const r = await d.call('/api/auth/verify', { email, code: wrong });
        assert.equal(r.status, 400);
        assert.ok(!r.body.expired);
      }
      const fifth = await d.call('/api/auth/verify', { email, code: wrong });
      assert.equal(fifth.body.expired, true);
      const late = await d.call('/api/auth/verify', { email, code });
      assert.equal(late.status, 400, 'the right code no longer works after too many guesses');
      assert.equal((await d.call('/api/session')).body.email, null);
    });

    await t.test('a code works once, and a newer code replaces the older one', async () => {
      const email = freshEmail();
      const a = device(base);
      await a.call('/api/auth/request-code', { email });
      const first = outbox.filter((m) => m.to === email).pop().code;
      const s = await store.codeStats(email, Date.now());
      assert.equal(s.hour, 1);
      // Pretend 30 s have passed so a resend is allowed.
      const stats = store.codeStats;
      store.codeStats = async () => ({ lastAt: Date.now() - 31000, hour: 1, day: 1 });
      await a.call('/api/auth/request-code', { email });
      store.codeStats = stats;
      const second = outbox.filter((m) => m.to === email).pop().code;
      if (first !== second) assert.equal((await a.call('/api/auth/verify', { email, code: first })).status, 400);
      assert.equal((await a.call('/api/auth/verify', { email, code: second })).status, 200);
      assert.equal((await device(base).call('/api/auth/verify', { email, code: second })).status, 400, 'single use');
    });

    await t.test('codes are rate limited per address', async () => {
      const email = freshEmail();
      const d = device(base);
      assert.equal((await d.call('/api/auth/request-code', { email })).status, 200);
      const again = await d.call('/api/auth/request-code', { email });
      assert.equal(again.status, 429);
      assert.ok(again.body.retryAfter > 0 && again.body.retryAfter <= config.codeResendSeconds);
    });

    await t.test('state-changing requests must be same-origin JSON', async () => {
      const d = device(base);
      await d.signIn(freshEmail());
      const form = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie: d.cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
      assert.equal(form.status, 415);
      const cross = await d.call('/api/sync', { since: 0 }, { headers: { origin: 'https://evil.example' } });
      assert.equal(cross.status, 403);
      const same = await d.call('/api/sync', { since: 0 }, { headers: { origin: base } });
      assert.equal(same.status, 200);
      assert.equal((await d.call('/api/sync')).status, 405, 'GET is not allowed');
    });

    await t.test('sync needs a session', async () => {
      assert.equal((await device(base).call('/api/sync', { since: 0, changes: [] })).status, 401);
    });

    await t.test('two devices: push, pull, last writer wins, deletes propagate', async () => {
      const email = freshEmail();
      const phone = device(base);
      const laptop = device(base);
      await phone.signIn(email);
      await laptop.signIn(email);

      const p1 = await phone.call('/api/sync', { since: 0, changes: [
        { kind: 'run', id: 'r1', data: { id: 'r1', name: 'First', nested: { b: 2, a: 1 } }, updatedAt: 1000 },
        { kind: 'settings', id: 'main', data: { tempUnit: 'F' }, updatedAt: 1000 },
      ] });
      assert.equal(p1.status, 200);
      assert.equal(p1.body.more, false);
      assert.ok(p1.body.cursor > 0);

      const l1 = await laptop.call('/api/sync', { since: 0 });
      assert.deepEqual(l1.body.changes.map((c) => c.kind + ':' + c.id).sort(), ['run:r1', 'settings:main']);
      assert.deepEqual(l1.body.changes.find((c) => c.id === 'r1').data, { id: 'r1', name: 'First', nested: { a: 1, b: 2 } });

      // An older edit loses, and the winner comes straight back to the loser.
      const stale = await laptop.call('/api/sync', { since: l1.body.cursor, changes: [{ kind: 'run', id: 'r1', data: { id: 'r1', name: 'Stale' }, updatedAt: 500 }] });
      assert.equal(stale.body.changes.length, 1);
      assert.equal(stale.body.changes[0].data.name, 'First');

      // A newer edit wins and reaches the other device.
      const newer = await laptop.call('/api/sync', { since: stale.body.cursor, changes: [{ kind: 'run', id: 'r1', data: { id: 'r1', name: 'Renamed' }, updatedAt: 2000 }] });
      const p2 = await phone.call('/api/sync', { since: p1.body.cursor });
      assert.equal(p2.body.changes.length, 1);
      assert.equal(p2.body.changes[0].data.name, 'Renamed');
      assert.ok(newer.body.cursor >= p2.body.cursor - 0);

      // Equal timestamps keep what the account already has (a new device never overwrites with "unknown age" data).
      const tie = await phone.call('/api/sync', { since: p2.body.cursor, changes: [{ kind: 'settings', id: 'main', data: { tempUnit: 'C' }, updatedAt: 1000 }] });
      assert.equal(tie.body.changes[0].data.tempUnit, 'F');

      // Deleting leaves a tombstone the other device receives.
      const del = await phone.call('/api/sync', { since: tie.body.cursor, changes: [{ kind: 'run', id: 'r1', deleted: true, updatedAt: 3000 }] });
      assert.equal(del.status, 200);
      const l2 = await laptop.call('/api/sync', { since: newer.body.cursor });
      const tomb = l2.body.changes.find((c) => c.id === 'r1');
      assert.equal(tomb.deleted, true);
      assert.equal(tomb.data, null);

      // Another account sees none of it.
      const other = device(base);
      await other.signIn(freshEmail());
      assert.deepEqual((await other.call('/api/sync', { since: 0 })).body.changes, []);
    });

    await t.test('large histories come back in pages', async () => {
      const d = device(base);
      await d.signIn(freshEmail());
      for (let b = 0; b < 3; b++) {
        const changes = [];
        for (let i = 0; i < 90; i++) changes.push({ kind: 'run', id: 'run-' + b + '-' + i, data: { i, b }, updatedAt: 10 });
        assert.equal((await d.call('/api/sync', { since: 0, changes })).status, 200);
      }
      const seen = new Set();
      let since = 0;
      let rounds = 0;
      for (;;) {
        const r = await d.call('/api/sync', { since });
        r.body.changes.forEach((c) => seen.add(c.id));
        since = r.body.cursor;
        rounds++;
        if (!r.body.more) break;
      }
      assert.equal(seen.size, 270);
      assert.ok(rounds >= 3);
    });

    await t.test('invalid sync payloads are refused', async () => {
      const d = device(base);
      await d.signIn(freshEmail());
      const bad = [
        { since: -1 },
        { since: 0, changes: 'x' },
        { since: 0, changes: [{ kind: 'nope', id: 'a', data: {}, updatedAt: 1 }] },
        { since: 0, changes: [{ kind: 'run', id: '', data: {}, updatedAt: 1 }] },
        { since: 0, changes: [{ kind: 'run', id: 'a', data: [], updatedAt: 1 }] },
        { since: 0, changes: [{ kind: 'run', id: 'a', data: {}, updatedAt: 'soon' }] },
        { since: 0, changes: [{ kind: 'run', id: 'a', data: { x: 'y'.repeat(config.maxDocBytes) }, updatedAt: 1 }] },
      ];
      for (const b of bad) assert.ok([400, 413].includes((await d.call('/api/sync', b)).status), JSON.stringify(b).slice(0, 80));
      // NUL characters (not storable in Postgres) are dropped rather than failing the sync.
      const ok = await d.call('/api/sync', { since: 0, changes: [{ kind: 'run', id: 'nul', data: { note: 'a\u0000b' }, updatedAt: 1 }] });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.changes[0].data.note, 'ab');
    });

    await t.test('sign out ends only that device; deleting the account removes everything', async () => {
      const email = freshEmail();
      const a = device(base);
      const b = device(base);
      await a.signIn(email);
      await b.signIn(email);
      await a.call('/api/sync', { since: 0, changes: [{ kind: 'run', id: 'keep', data: { id: 'keep' }, updatedAt: 1 }] });
      const out = await a.call('/api/auth/logout', {});
      assert.match(out.setCookie, /Max-Age=0/);
      assert.equal((await a.call('/api/session')).body.email, null);
      assert.equal((await b.call('/api/session')).body.email, email);

      assert.equal((await b.call('/api/account/delete', {})).status, 200);
      assert.equal((await b.call('/api/session')).body.email, null);
      const again = device(base);
      await again.signIn(email);
      assert.deepEqual((await again.call('/api/sync', { since: 0 })).body.changes, [], 'a new account starts empty');
    });

    await t.test('expired sessions are refused and cleaned up', async () => {
      const d = device(base);
      await d.signIn(freshEmail());
      const realNow = Date.now;
      Date.now = () => realNow() + 31 * 86400000;
      try {
        assert.equal((await d.call('/api/session')).body.email, null);
        await store.cleanup(Date.now());
      } finally { Date.now = realNow; }
    });
  });
}

test('without a database the API says accounts are off', async () => {
  setStore(null);
  const server = createServer({ api: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.deepEqual(await (await fetch(base + '/api/session')).json(), { accounts: false, email: null });
    const r = await fetch(base + '/api/auth/request-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"a@b.co"}' });
    assert.equal(r.status, 503);
  } finally { server.close(); setStore(undefined); }
});

test('the static server keeps the API and helpers private unless enabled', async () => {
  const server = createServer({ api: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.deepEqual(await (await fetch(base + '/api/session')).json(), { accounts: false, email: null });
    assert.equal((await fetch(base + '/api/sync', { method: 'POST' })).status, 404);
    assert.equal((await fetch(base + '/api/_lib/config.js')).status, 404);
    assert.equal((await fetch(base + '/index.html')).status, 200);
    assert.match(await (await fetch(base + '/privacy.html')).text(), /Privacy policy/);
  } finally { server.close(); }
});
