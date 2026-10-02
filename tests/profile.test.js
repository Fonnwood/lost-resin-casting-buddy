/* Profile model: registry, validation, blank profiles, host config. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/util.js');
require('../js/profile.js');
require('../js/engine.js');
require('../profiles/protocast-trueblue-cz121.js');

const { Profile: P, Engine: E } = globalThis.CPT;
const T0 = Date.UTC(2026, 8, 27, 8, 0, 0);

test.afterEach(() => { delete globalThis.CPT.config; });

test('built-in profiles are fresh copies each time', () => {
  const a = P.builtIn('protocast-trueblue-cz121-initial');
  a.name = 'mutated';
  assert.notEqual(P.builtIn('protocast-trueblue-cz121-initial').name, 'mutated');
});

test('registering the same id twice is an error', () => {
  assert.throws(() => P.register(() => P.builtIn('protocast-trueblue-cz121-initial')), /Duplicate profile id/);
});

test('the shipped profiles are valid', () => {
  P.builtInProfiles().forEach((p) => {
    const { errors, warnings } = P.validate(p);
    assert.deepEqual(errors, [], p.id);
    assert.deepEqual(warnings, [], p.id);
  });
});

test('validate reports problems in plain words', () => {
  assert.match(P.validate({}).errors[0], /at least one stage/);
  const r = P.validate({ stages: [
    { id: 'a', type: 'nonsense' },
    { id: 'a', minutes: -5 },
    { id: 'c', control: 'robot', targetC: 'hot' },
    { id: 'd', role: 'mystery' },
  ] });
  assert.equal(r.errors.length, 5);
  assert.ok(r.errors.some((e) => /unknown type/.test(e)));
  assert.ok(r.errors.some((e) => /duplicate id/.test(e)));
  assert.ok(r.errors.some((e) => /control must be/.test(e)));
  assert.ok(r.warnings.some((w) => /mystery/.test(w)));
});

test('warns when a cast stage has no soak to plan the metal against', () => {
  const r = P.validate({ stages: [{ id: 'c', role: 'cast', type: 'cast_sequence' }] });
  assert.ok(r.warnings.some((w) => /no “soak” stage/.test(w)));
});

test('normalise fills gaps from neutral defaults, not from a built-in profile', () => {
  const p = P.normalise({ name: 'Mine', stages: [{ name: 'Only', minutes: 5 }] });
  assert.equal(p.materials.metal, 'Metal');
  assert.equal(p.materials.investment, '');
  assert.equal(p.params.waterRatioPct.value, 40);
  assert.equal(p.stages[0].control, 'user');
});

test('a blank profile runs through the whole engine without errors', () => {
  const p = P.blankProfile('Scratch');
  assert.deepEqual(P.validate(p).errors, []);
  const run = E.newRun(p, T0);
  E.startRun(run, T0);
  const sched = E.schedule(run, T0);
  assert.equal(sched.rows.length, p.stages.length);
  E.metalInfo(run, sched, T0);
  E.flaskInfo(run, sched, T0);
  E.runState(run, sched, T0);
  assert.doesNotThrow(() => E.calendar(run, T0));
  assert.doesNotThrow(() => E.calculator(p, 0));
  assert.doesNotThrow(() => P.kilnProgram(p));
});

test('safety notes fall back to the generic set and honour a profile’s own', () => {
  assert.equal(P.safetyNotes(P.blankProfile()), P.GENERIC_SAFETY_NOTES);
  assert.equal(P.safetyNotes(undefined), P.GENERIC_SAFETY_NOTES);
  assert.ok(P.safetyNotes(P.builtIn('protocast-trueblue-cz121-initial')).some((n) => /leaded/.test(n)));
  assert.ok(!P.GENERIC_SAFETY_NOTES.some((n) => /leaded|CZ121/.test(n)));
});

test('phaseLabel prefers the profile’s wording, then the default, then the id', () => {
  assert.equal(P.phaseLabel({ phases: { burnout: 'Firing' } }, 'burnout'), 'Firing');
  assert.equal(P.phaseLabel({}, 'burnout'), P.PHASES.burnout);
  assert.equal(P.phaseLabel(null, 'polish'), 'polish');
});

test('config.profiles adds host-provided profiles and hideBuiltInProfiles hides the shipped ones', () => {
  const mine = { id: 'host-1', name: 'Host profile', stages: [{ id: 's', name: 'Step', minutes: 1 }] };
  globalThis.CPT.config = { profiles: [mine, { name: 'broken' }] };
  const ids = P.builtInProfiles().map((p) => p.id);
  assert.ok(ids.includes('host-1') && ids.includes('protocast-trueblue-cz121-fast5h'));
  assert.ok(!ids.includes(undefined));
  globalThis.CPT.config = { hideBuiltInProfiles: true, profiles: [mine] };
  assert.deepEqual(P.builtInProfiles().map((p) => p.id), ['host-1']);
});
