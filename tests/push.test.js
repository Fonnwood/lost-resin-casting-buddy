/* Push notifications, end to end: real VAPID signing and payload encryption
 * (web-push), sent to a fake push service on localhost, which decrypts them
 * like a browser would. Also QStash signature checks and the cron path. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const ece = require('http_ece');

process.env.CB_DEV = '1'; // in-process timers stand in for QStash
const { createServer } = require('../scripts/serve.js');
const { setStore } = require('../api/_lib/store');
const config = require('../api/_lib/config');
const push = require('../api/_lib/push');

/** A fake browser push service plus the browser-side keys to read what arrives. */
async function fakeBrowser() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const received = [];
  let status = 201;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      let msg = null;
      try { msg = JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: ecdh, authSecret }).toString('utf8')); } catch (e) { msg = { error: e.message }; }
      received.push({ msg, headers: req.headers });
      res.writeHead(status).end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/push/' + crypto.randomBytes(6).toString('hex');
  return {
    received,
    close: () => server.close(),
    goneNextTime() { status = 410; },
    subscription: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') } },
  };
}

const post = (base, path, body, headers) => fetch(base + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const waitFor = async (fn, ms) => { const end = Date.now() + (ms || 3000); while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

const stores = [['memory', () => require('../api/_lib/memory-store').create()]];
if (process.env.TEST_DATABASE_URL) {
  stores.push(['postgres', () => require('./pg-helper').freshPgStore('push_test')]);
}

for (const [name, makeStore] of stores) test('push notifications (' + name + ' store)', async (t) => {
  const store = await makeStore();
  setStore(store);
  const server = createServer({ api: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.close(); setStore(undefined); push._timers.forEach((x) => clearTimeout(x)); if (store.pool) await store.pool.end(); });

  await t.test('the app learns the public key from /api/session', async () => {
    const s = await (await fetch(base + '/api/session')).json();
    assert.match(s.pushKey, /^[A-Za-z0-9_-]{80,}$/);
  });

  await t.test('alerts arrive at their time, decrypted intact, once each', async () => {
    const phone = await fakeBrowser();
    t.after(phone.close);
    const now = Date.now();
    const r = await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [
      { key: 'metalNow', at: now + 300, title: 'Start brass furnace now', body: 'So the metal is ready as the soak completes.' },
      { key: 'end:hold', at: now + 600, title: '730°C hold complete (scheduled).' },
      { key: 'later', at: now + 3600000, title: 'Much later' },
    ] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(phone.received.length, 0, 'nothing early');
    assert.ok(await waitFor(() => phone.received.length >= 2));
    await new Promise((res) => setTimeout(res, 150));
    assert.equal(phone.received.length, 2, 'the later one waits');
    assert.deepEqual(phone.received[0].msg, { title: 'Start brass furnace now', body: 'So the metal is ready as the soak completes.', tag: 'metalNow' });
    assert.equal(phone.received[1].msg.tag, 'end:hold');
    assert.equal(phone.received[0].headers.urgency, 'high');
    assert.match(phone.received[0].headers.authorization, /^vapid t=/);
    const id = push.deviceId(phone.subscription.endpoint);
    // Booking the next wake-up finishes just after the last send; give it a moment.
    let nextAt = null;
    for (let i = 0; i < 100 && nextAt !== now + 3600000; i++) { nextAt = (await store.pushDevice(id)).nextAt; await new Promise((res) => setTimeout(res, 20)); }
    assert.equal(nextAt, now + 3600000, 'next wake-up booked');
  });

  await t.test('a wake-up that fires a moment early still books the next one', async () => {
    const id = push.deviceId('https://push.example/early');
    const now = Date.now();
    await store.upsertPushDevice({ id, endpoint: 'https://push.example/early', p256dh: 'x'.repeat(20), auth: 'y'.repeat(20) }, now);
    await store.replacePushAlerts(id, [{ key: 'later', at: now + 3600000, title: 'Later', body: '' }]);
    await store.setPushNextAt(id, now + 400); // the wake-up being handled now, which arrived 400 ms early
    await push.scheduleNext(store, id, base, now);
    assert.equal((await store.pushDevice(id)).nextAt, now + 3600000);
    await store.deletePushDevice(id);
  });

  await t.test('rescheduling replaces pending alerts and never repeats sent ones', async () => {
    const phone = await fakeBrowser();
    t.after(phone.close);
    const now = Date.now();
    await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [{ key: 'a', at: now + 100, title: 'A' }, { key: 'b', at: now + 5000, title: 'B (old time)' }] });
    assert.ok(await waitFor(() => phone.received.length === 1));
    // The run was extended: B moves, A is re-sent by the app but already went out.
    await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [{ key: 'a', at: now + 100, title: 'A' }, { key: 'b', at: Date.now() + 200, title: 'B (new time)' }] });
    assert.ok(await waitFor(() => phone.received.length === 2));
    await new Promise((res) => setTimeout(res, 300));
    assert.deepEqual(phone.received.map((x) => x.msg.title), ['A', 'B (new time)']);
    // An empty list (run finished) clears everything pending.
    await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [{ key: 'c', at: Date.now() + 200, title: 'C' }] });
    await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [] });
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(phone.received.length, 2);
  });

  await t.test('a subscription the browser dropped (410) is forgotten', async () => {
    const phone = await fakeBrowser();
    t.after(phone.close);
    phone.goneNextTime();
    await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [{ key: 'x', at: Date.now() + 50, title: 'X' }, { key: 'y', at: Date.now() + 5000, title: 'Y' }] });
    assert.ok(await waitFor(() => phone.received.length === 1));
    assert.ok(await waitFor(() => true, 100));
    assert.equal(await store.pushDevice(push.deviceId(phone.subscription.endpoint)), null);
  });

  await t.test('unsubscribe forgets the device', async () => {
    const phone = await fakeBrowser();
    t.after(phone.close);
    await post(base, '/api/push/schedule', { subscription: phone.subscription, alerts: [{ key: 'x', at: Date.now() + 300, title: 'X' }] });
    assert.equal((await post(base, '/api/push/schedule', { endpoint: phone.subscription.endpoint, unsubscribe: true })).status, 200);
    await new Promise((res) => setTimeout(res, 450));
    assert.equal(phone.received.length, 0);
  });

  await t.test('bad schedules are refused', async () => {
    const phone = await fakeBrowser();
    t.after(phone.close);
    const now = Date.now();
    const sub = phone.subscription;
    const bad = [
      { alerts: [] },
      { subscription: { endpoint: 'ftp://x', keys: sub.keys }, alerts: [] },
      { subscription: { endpoint: sub.endpoint, keys: { p256dh: 'short', auth: sub.keys.auth } }, alerts: [] },
      { subscription: sub, alerts: 'soon' },
      { subscription: sub, alerts: [{ key: 'k', at: now + 100 * 3600000, title: 'too far' }] },
      { subscription: sub, alerts: [{ key: '', at: now + 1000, title: 'no key' }] },
      { subscription: sub, alerts: Array.from({ length: 61 }, (_, i) => ({ key: 'k' + i, at: now + 1000, title: 't' })) },
    ];
    for (const b of bad) assert.ok([400, 413].includes((await post(base, '/api/push/schedule', b)).status), JSON.stringify(b).slice(0, 90));
    assert.equal((await post(base, '/api/push/schedule', { subscription: sub, alerts: [] }, { origin: 'https://evil.example' })).status, 403);
  });

  await t.test('QStash wake-ups need a valid signature', async () => {
    const keys = config.qstashSigningKeys;
    config.qstashSigningKeys = ['sig_current', 'sig_next'];
    t.after(() => { config.qstashSigningKeys = keys; });
    const url = base + '/api/push/deliver';
    const raw = JSON.stringify({ device: 'a'.repeat(64) });
    const sign = (key, claims) => {
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const head = enc({ alg: 'HS256', typ: 'JWT' });
      const body = enc(Object.assign({ iss: 'Upstash', sub: url, exp: now + 300, nbf: now, body: crypto.createHash('sha256').update(raw).digest('base64url') }, claims));
      return head + '.' + body + '.' + crypto.createHmac('sha256', key).update(head + '.' + body).digest('base64url');
    };
    const send = (sig) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'upstash-signature': sig }, body: raw }).then((r) => r.status);
    assert.equal(await send(sign('sig_current')), 200);
    assert.equal(await send(sign('sig_next')), 200, 'key rotation');
    assert.equal(await send(sign('wrong')), 401);
    assert.equal(await send(sign('sig_current', { sub: 'https://evil.example/api/push/deliver' })), 401);
    assert.equal(await send(sign('sig_current', { exp: 1 })), 401);
    assert.equal(await send(sign('sig_current', { body: 'tampered' })), 401);
    assert.equal(await send(''), 401);
  });

  await t.test('cron delivery needs CRON_SECRET and sends everything due', async () => {
    const phone = await fakeBrowser();
    t.after(phone.close);
    const id = push.deviceId(phone.subscription.endpoint);
    await store.upsertPushDevice(Object.assign({ id, endpoint: phone.subscription.endpoint }, phone.subscription.keys), Date.now());
    await store.replacePushAlerts(id, [{ key: 'due', at: Date.now() - 1000, title: 'Due', body: '' }, { key: 'stale', at: Date.now() - 3600000, title: 'Too late', body: '' }]);
    assert.equal((await fetch(base + '/api/push/deliver')).status, 401);
    config.cronSecret = 'cron-test-secret';
    t.after(() => { config.cronSecret = ''; });
    assert.equal((await fetch(base + '/api/push/deliver', { headers: { authorization: 'Bearer nope' } })).status, 401);
    const r = await fetch(base + '/api/push/deliver', { headers: { authorization: 'Bearer cron-test-secret' } });
    assert.equal(r.status, 200);
    assert.ok(await waitFor(() => phone.received.length === 1));
    assert.equal(phone.received[0].msg.title, 'Due', 'stale alerts are dropped, not sent late');
  });
});
