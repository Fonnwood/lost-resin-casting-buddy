/* End-to-end: turn on notifications in the app and check that it hands the
 * server the right upcoming alerts as a run progresses. Headless Chrome can't
 * reach a real push service, so the browser's subscription is a stand-in;
 * the server side (encryption, timing, delivery) is covered by push.test.js.
 *
 *   npm run dev &
 *   node tests/e2e-push.js [http://localhost:8080] [screenshot-dir] */
'use strict';
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8080';
const SHOTS = process.argv[3] || null;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  // A stand-in push subscription (the server accepts any well-formed one).
  await ctx.addInitScript(() => {
    const fake = (key) => ({
      endpoint: 'https://push.example/e2e-' + Math.random().toString(36).slice(2),
      options: { applicationServerKey: key },
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }; },
      unsubscribe: async () => true,
    });
    let sub = null;
    PushManager.prototype.getSubscription = async function () { return sub; };
    PushManager.prototype.subscribe = async function (opts) { sub = fake(opts.applicationServerKey); return sub; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const sent = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/push/schedule')) sent.push(JSON.parse(r.postData())); });

  let n = 0;
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/push-${String(++n).padStart(2, '0')}-${name}.png` }); };
  const tap = async (text) => { await page.getByRole('button', { name: text }).first().click(); await page.waitForTimeout(80); };
  const see = async (text) => { await page.getByText(text).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => { throw new Error('expected to see "' + text + '"'); }); };
  const waitSent = async (pred, what) => {
    for (let i = 0; i < 100; i++) { if (sent.some(pred)) return sent.filter(pred).pop(); await page.waitForTimeout(50); }
    throw new Error('expected the app to send ' + what + '; sent: ' + JSON.stringify(sent).slice(0, 400));
  };

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await tap('Settings');
  await see('Turn on notifications');
  await page.locator('section.card', { hasText: 'Alerts' }).first().scrollIntoViewIfNeeded();
  await shot('settings-off');
  await tap('Turn on notifications');
  await see('Notifications on.');
  await shot('settings-on');
  await waitSent((b) => b.subscription && Array.isArray(b.alerts) && b.alerts.length === 0, 'an empty list (no run yet)');

  // Start a run and reach a timed step: its end is handed to the server.
  await tap('NOW');
  await tap('START NEW CASTING RUN');
  await page.locator('#nr-profile').selectOption('protocast-trueblue-cz121-initial');
  await tap('Create run');
  await tap('I UNDERSTAND');
  await tap('START RUN NOW');
  await tap('Tree ready');
  await tap('Powder added');
  const mix = await waitSent((b) => (b.alerts || []).some((a) => a.key === 'end:invest_hand_mix'), 'the hand-mix alert');
  const alert = mix.alerts.find((a) => a.key === 'end:invest_hand_mix');
  if (!(alert.at > Date.now() && alert.at < Date.now() + 2 * 60000) || !alert.title) throw new Error('odd alert: ' + JSON.stringify(alert));
  if (!mix.alerts.some((a) => a.key === 'metalNow')) throw new Error('furnace start not included');
  await shot('now-running');

  // Turning an alert off in Settings removes it from what the server gets.
  await tap('Settings');
  await page.locator('label.toggle', { has: page.locator('input[data-bind="settings|alerts.prefs.metalNow"]') }).click();
  await waitSent((b) => b.alerts && b.alerts.length && !b.alerts.some((a) => a.key === 'metalNow'), 'the list without the furnace-start alert');

  // Turning notifications off tells the server to forget this device.
  await tap('Turn off notifications');
  await waitSent((b) => b.unsubscribe === true, 'an unsubscribe');
  await see('Turn on notifications');

  await browser.close();
  if (errors.length) { console.error('FAILED with errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('e2e push OK — notifications on, alerts handed over, off again');
})().catch((e) => { console.error(e); process.exit(1); });
