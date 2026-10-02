/* Display formatting helpers. Run with: npm test */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/util.js');
const U = globalThis.CPT.util;

test.afterEach(() => U.setFormat({ tempUnit: 'C', clock24h: true }));

test('temperatures convert for display and back for storage', () => {
  U.setFormat({ tempUnit: 'F' });
  assert.equal(U.toDisplayTemp(220), 428);
  assert.equal(U.toDisplayTemp(975), 1787);
  assert.equal(U.fromDisplayTemp(428), 220);
  assert.equal(U.fromDisplayTemp(1000), 537.78);
  assert.equal(U.temp(730), '1346°F');
  U.setFormat({ tempUnit: 'C' });
  assert.equal(U.temp(730), '730°C');
  assert.equal(U.fromDisplayTemp(730), 730);
});

test('blank and non-numeric values pass through unchanged', () => {
  U.setFormat({ tempUnit: 'F' });
  assert.equal(U.toDisplayTemp(null), null);
  assert.equal(U.toDisplayTemp(''), '');
  assert.equal(U.temp(null), '—');
});

test('localiseTemps rewrites °C in free text, including rates', () => {
  U.setFormat({ tempUnit: 'F' });
  assert.equal(U.localiseTemps('Ramp to 220°C then 450 °C.'), 'Ramp to 428°F then 842°F.');
  assert.equal(U.localiseTemps('13°C/hour · 0.2°C/min'), '23.4°F/hour · 0.4°F/min');
  assert.equal(U.localiseTemps('Target °C'), 'Target °F');
  assert.equal(U.localiseTemps('no temperatures here'), 'no temperatures here');
  U.setFormat({ tempUnit: 'C' });
  assert.equal(U.localiseTemps('Ramp to 220°C'), 'Ramp to 220°C');
});

test('localiseHtml changes text but never attributes or textareas', () => {
  U.setFormat({ tempUnit: 'F' });
  const html = '<p title="220°C">Hold 220°C</p><input value="Ramp to 220°C"><textarea>Hold 220°C</textarea><b>450°C</b>';
  assert.equal(U.localiseHtml(html), '<p title="220°C">Hold 428°F</p><input value="Ramp to 220°C"><textarea>Hold 220°C</textarea><b>842°F</b>');
});

test('clock honours 12-hour format', () => {
  const t = new Date(2026, 8, 27, 15, 5).getTime();
  assert.equal(U.clock(t, t), '15:05');
  U.setFormat({ clock24h: false });
  assert.equal(U.clock(t, t), '3:05 PM');
  assert.equal(U.clock(new Date(2026, 8, 27, 0, 7).getTime(), t), '12:07 AM');
});

test('esc escapes HTML-significant characters', () => {
  assert.equal(U.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
});

test('getPath / setPath build intermediate objects and arrays', () => {
  const o = {};
  U.setPath(o, 'a.b.0.c', 1);
  assert.deepEqual(o, { a: { b: [{ c: 1 }] } });
  assert.equal(U.getPath(o, 'a.b.0.c'), 1);
  assert.equal(U.getPath(o, 'a.x.y'), undefined);
});
