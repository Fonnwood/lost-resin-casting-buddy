/* End-to-end: sign in on two phones and see a run made on one appear on the
 * other. Needs the development server (in-memory accounts, codes not emailed):
 *
 *   CODE_RESEND_SECONDS=2 npm run dev &
 *   node tests/e2e-sync.js [http://localhost:8080] [screenshot-dir] */
'use strict';
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8080';
const SHOTS = process.argv[3] || null;
const EMAIL = 'e2e-' + Date.now() + '@example.com';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let n = 0;

  async function phone(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    // The test provokes a resend limit (429) and a wrong code (400) on purpose; Chrome logs those.
    page.on('console', (m) => { if (m.type() === 'error' && !/status of (400|429)\b/.test(m.text())) errors.push(name + ': ' + m.text()); });
    await page.goto(BASE + '/index.html');
    return {
      page,
      shot: async (label) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/sync-${String(++n).padStart(2, '0')}-${name}-${label}.png`, fullPage: true }); },
      tap: async (text) => { await page.getByRole('button', { name: text, exact: true }).first().click(); await page.waitForTimeout(80); },
      see: async (text) => { await page.getByText(text).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => { throw new Error(name + ': expected to see "' + text + '"'); }); },
    };
  }

  async function signIn(p) {
    await p.tap('Settings');
    await p.see('Account & sync');
    await p.tap('Sign in with email');
    await p.page.locator('#si-email').fill(EMAIL);
    await p.shot('email');
    await p.page.locator('#si-email').press('Enter');
    await p.see('Check your email');
    const box = await (await fetch(BASE + '/__dev/outbox')).json();
    const code = box.filter((m) => m.to === EMAIL).pop().code;
    await p.page.locator('#si-code').fill(code);
    await p.shot('code');
    await p.tap('Sign in');
    await p.see('Signed in as');
    await p.see(EMAIL);
  }

  const a = await phone('a');
  await a.see('Sign in to sync (optional)');
  await a.shot('welcome');

  // Phone A: a run made before signing in still ends up in the account.
  await a.tap('START NEW CASTING RUN');
  await a.page.locator('#nr-name').fill('Synced ring tree');
  await a.tap('Create run');
  await a.tap('I UNDERSTAND');
  await signIn(a);
  await a.see('Synced');
  await a.shot('signed-in');

  // A wrong code is refused with a clear message.
  const b = await phone('b');
  await b.tap('Settings');
  await b.tap('Sign in with email');
  await b.page.locator('#si-email').fill(EMAIL);
  await b.tap('Email me a code');
  // Same address seconds after phone A: the resend limit explains itself, then lets you retry.
  await b.see('Please wait');
  await b.shot('resend-wait');
  await b.page.waitForTimeout(2500);
  await b.tap('Email me a code');
  await b.see('Check your email');
  await b.page.locator('#si-code').fill('000000');
  await b.tap('Sign in');
  const wrongOk = await b.page.getByText('That code isn’t right').first().isVisible().catch(() => false);
  const box = await (await fetch(BASE + '/__dev/outbox')).json();
  const right = box.filter((m) => m.to === EMAIL).pop().code;
  if (right !== '000000' && !wrongOk) throw new Error('b: wrong code was not refused');
  await b.shot('wrong-code');
  await b.page.locator('#si-code').fill(right);
  await b.tap('Sign in');
  await b.see('Signed in as');

  // Phone B now has A's draft run.
  await b.tap('NOW');
  await b.see('Synced ring tree');
  await b.shot('run-arrived');

  // Rename on B → appears on A after a sync.
  await b.tap('RUN');
  const nameInput = b.page.locator('input[data-bind="run|name"]');
  await nameInput.fill('Renamed on phone B');
  await nameInput.dispatchEvent('change');
  await b.tap('Settings');
  await b.tap('Sync now');
  await b.see('Synced.');
  await a.tap('Sync now');
  await a.tap('NOW');
  await a.see('Renamed on phone B');

  // Sign out (keeping data) on A.
  await a.tap('Settings');
  await a.tap('Sign out');
  await a.shot('sign-out');
  await a.tap('Sign out — keep my data here');
  await a.see('Sign in with email');
  await a.tap('NOW');
  await a.see('Renamed on phone B');

  await browser.close();
  if (errors.length) { console.error('FAILED with errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('e2e sync OK — two devices signed in and synced');
})().catch((e) => { console.error(e); process.exit(1); });
