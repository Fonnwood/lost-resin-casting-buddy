/* End-to-end walk-through of a full casting run in a phone-sized browser,
 * using Playwright's fake clock to jump through the long burnout.
 *
 *   npx http-server -p 8080 -s &   (from the repo root)
 *   node tests/e2e.js [http://localhost:8080] [screenshot-dir]
 *
 * Requires the `playwright` package (not a dependency of the app itself). */
'use strict';
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8080';
const SHOTS = process.argv[3] || null;
const MIN = 60000;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.clock.install({ time: new Date('2026-09-27T08:00:00') });
  await page.goto(BASE + '/index.html');

  let n = 0;
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true }); };
  const tap = async (text) => { await page.getByRole('button', { name: text }).first().click(); await page.waitForTimeout(50); };
  const expectText = async (text) => {
    const found = await page.getByText(text).first().isVisible().catch(() => false);
    if (!found) throw new Error('Expected to see: ' + text);
  };
  const advance = async (ms) => { await page.clock.fastForward(ms); await page.waitForTimeout(50); };

  await shot('welcome');
  await tap('START NEW CASTING RUN');
  await shot('new-run-modal');
  await page.locator('#nr-profile').selectOption('protocast-trueblue-cz121-initial');
  await tap('Create run');
  await tap('I UNDERSTAND');
  await expectText('260 ml');
  await shot('run-view-draft');

  // Plan backwards from tomorrow 09:00
  await tap('Tomorrow 09:00');
  await expectText('Flask into kiln');
  await tap('START RUN NOW');
  await expectText('WHAT TO DO NOW');
  await shot('now-prepare-tree');

  await tap('Tree ready');
  await expectText('Measure 260 ml water FIRST');
  await shot('now-measure');
  await tap('Powder added');
  await expectText('HAND MIX');
  await advance(70000);
  await expectText('TIME UP');
  await shot('now-hand-mix-overdue');
  for (let i = 0; i < 5; i++) await tap('COMPLETE NOW');
  await expectText('LEAVE FLASK UNTOUCHED');
  await expectText('Manufacturer minimum');
  await shot('now-set');

  // Phone slept through the set: the app asks rather than assuming.
  await advance(121 * MIN);
  await expectText('Scheduled stage ended');
  await shot('attention-overdue');
  await tap('YES — CONTINUE');
  await expectText('PREPARE FLASK FOR BURNOUT');
  await expectText('Kiln controller programme');
  await shot('now-burnout-prep');
  await tap('Flask in kiln');
  await expectText('RAMP TO 220°C');
  await expectText('scheduled, not measured');
  await shot('now-ramp-220');

  // Phone asleep for 5 hours: kiln advances on schedule; attention prompt.
  await advance(300 * MIN);
  await expectText('While the app was closed');
  await shot('attention-kiln');
  await tap('KILN MATCHES');
  await expectText('RAMP TO 450°C');

  await page.getByRole('button', { name: 'TIMELINE', exact: true }).click();
  await expectText('Resin burnout');
  await shot('timeline');
  await page.getByRole('button', { name: 'NOW', exact: true }).click();

  // Jump to the end of burnout.
  await advance((90 + 120 + 180 + 240 + 5) * MIN);
  const att = await page.getByText('While the app was closed').isVisible().catch(() => false);
  if (att) await tap('KILN MATCHES');
  await expectText('Waiting for kiln');
  await shot('now-cool-to-cast');
  await tap('KILN AT CASTING TEMPERATURE');
  await expectText('FLASK CONDITIONING');
  await expectText('START CZ121 BRASS FURNACE NOW');
  await shot('now-soak-metal-start');
  await tap('START METAL MELT');
  await advance(30 * MIN);
  await shot('now-soak-heating');
  await advance(31 * MIN);
  await expectText('FLASK READY');
  await tap('CZ121 BRASS AT POUR TEMPERATURE');
  await expectText('READY TO CAST');
  await shot('now-ready');
  await tap('CONTINUE TO CASTING');
  await expectText('Vacuum machine ready?');
  await tap('CONFIRM — VACUUM MACHINE READY');
  await expectText('CASTING SEQUENCE');
  await shot('now-cast-sequence');
  await tap('FLASK REMOVED');
  await advance(8000);
  await expectText('FLASK OUT OF KILN');
  await shot('now-flask-out');
  await tap('FLASK SEATED');
  await tap('VACUUM ON');
  await tap('POUR STARTED');
  await expectText('Keep vacuum running');
  await shot('now-post-pour-vacuum');
  await advance(61000);
  await tap('SWITCH VACUUM OFF');
  await expectText('DO NOT QUENCH YET');
  await shot('now-cooling');
  await advance(16 * MIN);
  await tap('QUENCH NOW');
  await expectText('Quench & record results');
  await tap('Good');
  await page.getByRole('button', { name: 'Porosity', exact: true }).click();
  await page.locator('textarea').first().fill('North tower failed to fill. Very good detail elsewhere.');
  await page.locator('textarea').first().blur();
  await shot('now-results');
  await tap('SAVE RESULTS & COMPLETE RUN');
  await expectText('Actual timeline');
  await shot('history-detail');
  await tap('← All runs');
  await expectText('Compare runs');
  await shot('history');

  // Settings and profile editor
  await page.getByRole('button', { name: 'Settings' }).click();
  await expectText('Process profiles');
  await shot('settings');
  await tap('Edit');
  await expectText('Stages');
  await shot('profile-editor');

  // Persistence across reload (fresh run survives)
  await page.getByRole('button', { name: '← Done' }).click();
  await page.getByRole('button', { name: 'NOW', exact: true }).click();
  await tap('START NEW CASTING RUN');
  await tap('Create run');
  await expectText('5-hour fast burnout');
  await expectText('outside the Protocast datasheet range');
  await expectText('234 ml');
  await tap('38:100');
  await expectText('247 ml');
  await tap('36:100');
  await expectText('Mix ratio');
  await expectText('Below the minimum');
  await shot('run-view-fast-profile');
  await tap('START RUN NOW');
  await tap('Tree ready');
  await page.reload();
  await expectText('MEASURE WATER AND POWDER');

  // Customisation: units, accent, text size, custom CSS, 12-hour clock
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('[data-bind="settings|tempUnit"]').selectOption('F');
  await page.locator('[data-bind="settings|textScale"]').selectOption('115');
  await page.locator('[data-bind="settings|accent"]').evaluate((el) => { el.value = '#2dd4bf'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.getByText('Custom CSS', { exact: true }).click();
  await page.locator('[data-bind="settings|customCss"]').fill(':root { --radius: 2px; }');
  await page.locator('[data-bind="settings|customCss"]').blur();
  await page.waitForTimeout(100);
  const look = await page.evaluate(() => ({
    accent: document.documentElement.style.getPropertyValue('--accent'),
    size: document.documentElement.style.fontSize,
    css: document.getElementById('user-css').textContent,
  }));
  if (look.accent !== '#2dd4bf' || look.size !== '115%' || !/--radius/.test(look.css)) errors.push('Appearance settings not applied: ' + JSON.stringify(look));
  await page.getByRole('button', { name: 'NOW', exact: true }).click();
  await page.getByRole('button', { name: 'RUN' }).click();
  await expectText('°F');
  const bodyText = await page.locator('body').innerText();
  if (/\d°C/.test(bodyText)) errors.push('°C still visible after switching to °F');
  // A temperature typed in °F is stored in °C
  const tInput = page.locator('input[data-bind="run|profile.stages.9.targetC"]');
  await tInput.fill('1000');
  await tInput.dispatchEvent('change');
  const storedC = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('cpt.v1.runs')).find((r) => r.id === JSON.parse(localStorage.getItem('cpt.v1.activeRunId'))).profile.stages.map((s) => s.targetC)));
  if (!/537\.78,/.test(storedC)) errors.push('1000°F was not stored as 537.78°C: ' + storedC);
  await shot('fahrenheit');

  // A brand-new profile from scratch can be edited, including its phase headings
  await page.getByRole('button', { name: 'Settings' }).click();
  await tap('New blank profile');
  await expectText('Phase headings');
  await page.locator('[data-bind$="|phases.prepare"]').fill('Getting ready');
  await page.locator('[data-bind$="|phases.prepare"]').dispatchEvent('change');
  await expectText('Stages');
  await shot('blank-profile-editor');

  // Importing a broken profile explains what is wrong instead of failing silently
  await page.getByRole('button', { name: '← Done' }).click();
  await page.locator('input[data-action-change="importProfile"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ name: 'Bad', stages: [{ id: 'a', type: 'nonsense' }] })) });
  await page.getByText('Import failed').first().waitFor({ timeout: 3000 });

  // Light theme renders
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await shot('light-theme');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) errors.push('Horizontal overflow at 390px');

  await browser.close();
  if (errors.length) {
    console.error('FAILED with errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('e2e OK — full run walked through' + (SHOTS ? ', ' + n + ' screenshots in ' + SHOTS : ''));
})().catch((e) => { console.error(e); process.exit(1); });
