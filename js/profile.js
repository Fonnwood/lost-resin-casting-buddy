/* Casting Process Tracker — process profiles.
 * Every process value lives in a profile as data. Nothing in engine/UI
 * hard-codes a temperature or duration; they read stages/params from a profile
 * (or a run's snapshot of one). This file holds the profile *model* — stage
 * types, helpers, validation. The profiles themselves live in profiles/. */
(function (CPT) {
  'use strict';

  const STAGE_TYPES = {
    manual: 'Manual step (no timer)',
    timed: 'Timed step (you confirm)',
    ramp: 'Temperature ramp',
    hold: 'Temperature hold',
    temperature_wait: 'Wait for temperature (you confirm)',
    soak: 'Casting-temperature soak',
    cast_prep: 'Ready-to-cast check',
    cast_sequence: 'Casting sequence',
    finish: 'Finish & record results',
  };

  /** Default phase headings. A profile can override or add its own in `profile.phases`. */
  const PHASES = {
    prepare: 'A · Prepare',
    invest: 'B · Invest',
    set: 'C · Initial set',
    burnout_prep: 'D · Prepare for burnout',
    burnout: 'E · Resin burnout',
    casting_temp: 'F · Reduce to casting temperature',
    soak: 'G · Casting-temperature soak',
    cast: 'H · Cast',
    cooling: 'I · Cooling & quench',
  };

  const SOURCE_TYPES = {
    manufacturer: 'Manufacturer',
    working: 'Working setting',
    experimental: 'Experimental',
  };

  function stage(o) {
    return Object.assign({
      control: 'user', minutes: 0, minMinutes: null, targetC: null, unit: 'min',
      checklist: [], events: [], doNow: '', instructions: '', warning: '', notes: '',
      provenance: {}, ref: null, source: '',
    }, o);
  }




  // ------------------------------------------------------------ registry

  const registry = [];

  /**
   * Register a built-in profile. `factory` returns a fresh profile object each
   * call (profiles are mutated by editing, so never share one instance).
   */
  function register(factory) {
    const sample = factory();
    if (registry.some((r) => r.id === sample.id)) throw new Error('Duplicate profile id: ' + sample.id);
    registry.push({ id: sample.id, factory });
  }

  /** Fresh copies of every registered profile (config.hideBuiltInProfiles hides them). */
  function builtInProfiles() {
    const cfg = CPT.config || {};
    const list = cfg.hideBuiltInProfiles ? [] : registry.map((r) => r.factory());
    (cfg.profiles || []).forEach((raw, i) => {
      try {
        const p = normalise(CPT.util.clone(raw));
        p.builtIn = true;
        p.builtInVersion = p.builtInVersion || 1;
        list.push(p);
      } catch (e) {
        console.error('config.profiles[' + i + '] ignored:', e.message);
      }
    });
    return list;
  }

  /** A fresh copy of one registered profile, or undefined. */
  function builtIn(id) {
    const r = registry.find((x) => x.id === id);
    return r ? r.factory() : undefined;
  }

  // ---------------------------------------------------- blank / standard

  /**
   * The parameters the engine knows how to use. A profile may omit any of them;
   * `normalise` fills the gaps from here so the calculator, metal timing and
   * kiln programme never see an undefined value.
   */
  function standardParams() {
    return {
      waterRatioPct: { label: 'Water ratio', unit: 'g water / 100 g powder', value: 40, sourceType: 'working', note: 'Water per 100 g of investment powder.' },
      powderG: { label: 'Powder quantity', unit: 'g', value: 650, sourceType: 'working', note: 'Starting quantity — adjust after measuring actual usage.' },
      flaskDiameterMm: { label: 'Flask diameter', unit: 'mm', value: 76.2, sourceType: 'working' },
      flaskHeightMm: { label: 'Flask height', unit: 'mm', value: 101.6, sourceType: 'working' },
      powderPerCm3: { label: 'Powder per cm³ of flask', unit: 'g/cm³', value: 1.2, sourceType: 'experimental', note: 'Estimate used only by the calculator. Calibrate from real usage.' },
      ambientC: { label: 'Ambient / kiln start temperature', unit: '°C', value: 20, sourceType: 'working' },
      metalTargetC: { label: 'Target pour temperature', unit: '°C', value: 1000, sourceType: 'experimental' },
      metalHeatMinutes: { label: 'Estimated furnace heat-up / melt time', unit: 'min', value: 60, sourceType: 'working', note: 'Depends on your furnace and charge. Measure and adjust.' },
      metalReadyOffsetMinutes: { label: 'Metal ready after flask soak by', unit: 'min', value: 0, sourceType: 'working', note: 'The flask can wait at temperature; molten metal should not wait. 0 = metal ready as the soak completes.' },
      metalWeightG: { label: 'Metal weight', unit: 'g', value: 0, sourceType: 'working' },
      controllerHoldBufferMinutes: { label: 'Extra controller hold at casting temp', unit: 'min', value: 60, sourceType: 'working', note: 'Added to the soak in the kiln controller programme so the kiln keeps holding if casting runs late.' },
    };
  }

  const GENERIC_MATERIALS = { investment: '', resin: '', metal: 'Metal', kiln: '', castingMachine: '' };

  const GENERIC_SAFETY_NOTES = [
    'Molten metal, hot flasks and vacuum equipment are dangerous. Equipment manufacturer instructions and your PPE requirements take precedence over this app.',
    'Use effective fume extraction and a respirator suitable for your metal. No food or drink in the casting area.',
    'Water must never contact molten metal. Keep quench water well away from the furnace and pouring area.',
    'Hot investment flasks stay dangerous long after they look cool. Use tongs and gloves.',
    'This app never knows a real temperature. A finished timer means the scheduled time has passed — not that the kiln or metal is at temperature.',
  ];

  /** Safety notes for a profile, falling back to the generic set. */
  function safetyNotes(profile) {
    return profile && Array.isArray(profile.safetyNotes) && profile.safetyNotes.length ? profile.safetyNotes : GENERIC_SAFETY_NOTES;
  }

  /** A minimal valid profile to start a new process from scratch. */
  function blankProfile(name) {
    return normalise({
      id: CPT.util.uid('profile'),
      name: name || 'New profile',
      materials: Object.assign({}, GENERIC_MATERIALS),
      stages: [
        stage({ id: 'prepare', name: 'Prepare', short: 'Prepare', phase: 'prepare', type: 'manual', minutes: 15, doNow: 'Get everything ready.', provenance: { duration: 'working' } }),
        stage({ id: 'finish', name: 'Finish & record results', short: 'Finish', phase: 'cooling', type: 'finish', role: 'finish', minutes: 10, provenance: { duration: 'working' } }),
      ],
    });
  }

  // --------------------------------------------------------- validation

  const KNOWN_ROLES = ['measure', 'set', 'kiln_start', 'peak_hold', 'cool_to_cast', 'soak', 'cast_prep', 'cast', 'post_pour_vacuum', 'cooling', 'finish'];

  /**
   * Check a profile and return human-readable problems.
   * `errors` make it unusable; `warnings` are things worth fixing.
   */
  function validate(p) {
    const errors = [];
    const warnings = [];
    if (!p || typeof p !== 'object') return { errors: ['Not a profile.'], warnings };
    if (!Array.isArray(p.stages) || !p.stages.length) { errors.push('A profile needs at least one stage.'); return { errors, warnings }; }
    const ids = new Set();
    p.stages.forEach((s, i) => {
      const where = 'Stage ' + (i + 1) + (s && s.name ? ' (' + s.name + ')' : '');
      if (!s || typeof s !== 'object') { errors.push(where + ' is not an object.'); return; }
      if (s.id != null) {
        if (ids.has(s.id)) errors.push(where + ': duplicate id “' + s.id + '”.');
        ids.add(s.id);
      }
      if (s.type && !STAGE_TYPES[s.type]) errors.push(where + ': unknown type “' + s.type + '”.');
      if (s.control && s.control !== 'user' && s.control !== 'kiln') errors.push(where + ': control must be “user” or “kiln”.');
      if (s.minutes != null && (!isFinite(Number(s.minutes)) || Number(s.minutes) < 0)) errors.push(where + ': minutes must be a number ≥ 0.');
      if (s.targetC != null && s.targetC !== '' && !isFinite(Number(s.targetC))) errors.push(where + ': targetC must be a number.');
      if (s.role && !KNOWN_ROLES.includes(s.role)) warnings.push(where + ': role “' + s.role + '” isn’t used by the app.');
    });
    const roles = p.stages.map((s) => s && s.role).filter(Boolean);
    ['soak', 'cast', 'cast_prep'].forEach((r) => {
      if (roles.filter((x) => x === r).length > 1) warnings.push('More than one stage has role “' + r + '”; only the first is used.');
    });
    if (roles.includes('cast') && !roles.includes('soak')) warnings.push('Has a “cast” stage but no “soak” stage, so metal timing can’t be planned.');
    return { errors, warnings };
  }

  /**
   * Kiln controller programme in C/t segment form (e.g. Yudian-style
   * controllers): the kiln moves from Cn to Cn+1 over tn minutes, so a hold is
   * written as Cn = Cn+1. Generated from the kiln stages plus the cool-down and
   * casting-temperature hold, so it always matches what the app is timing.
   */
  function kilnProgram(profile) {
    const stages = profile.stages;
    const soakIdx = stages.findIndex((s) => s.role === 'soak');
    const buffer = Number(param(profile, 'controllerHoldBufferMinutes')) || 0;
    const segs = [];
    let cur = Number(param(profile, 'ambientC'));
    stages.forEach((s, i) => {
      const inBurnout = s.control === 'kiln' || s.role === 'cool_to_cast' || i === soakIdx;
      if (!inBurnout) return;
      const target = targetOf(profile, i);
      if (target == null) return;
      const isSoak = i === soakIdx;
      const minutes = Math.round(Number(s.minutes) + (isSoak ? buffer : 0));
      const kind = target === cur ? 'hold' : target > cur ? 'ramp' : 'cool';
      segs.push({ fromC: cur, toC: target, minutes, kind, stageId: s.id, label: (kind === 'hold' ? 'Hold ' + target + '°C' : (kind === 'ramp' ? 'Ramp ' : 'Cool ') + cur + ' → ' + target + '°C') + (isSoak && buffer ? ' (soak ' + s.minutes + ' + ' + buffer + ' buffer)' : '') });
      cur = target;
    });
    const stop = (profile.controller && profile.controller.stopCode != null) ? profile.controller.stopCode : -121;
    const rows = [];
    segs.forEach((g, k) => {
      const n = String(k + 1).padStart(2, '0');
      rows.push({ code: 'C' + n, value: g.fromC, meaning: k === 0 ? 'Start temperature' : 'Segment ' + (k + 1) + ' starts at' });
      rows.push({ code: 't' + n, value: g.minutes, meaning: g.label + ' — ' + g.minutes + ' min' });
    });
    const last = String(segs.length + 1).padStart(2, '0');
    rows.push({ code: 'C' + last, value: cur, meaning: 'Final temperature' });
    rows.push({ code: 't' + last, value: stop, meaning: 'End of programme (check your manual)' });
    const total = segs.reduce((a, g) => a + g.minutes, 0);
    return { segments: segs, rows, totalMinutes: total, bufferMinutes: buffer };
  }

  const DEFECTS = [
    'Incomplete fill', 'Cold shut', 'Porosity', 'Gas porosity', 'Investment inclusions', 'Surface roughness',
    'Cracking', 'Flash', 'Metal penetration', 'Oxidation', 'Sprue failure', 'Resin ash / residue', 'Other',
  ];

  const RATINGS = { 1: 'Failed', 2: 'Poor', 3: 'Usable', 4: 'Good', 5: 'Excellent' };


  /** Heading for a phase id: the profile's own wording first, then the default. */
  function phaseLabel(profile, phase) {
    return (profile && profile.phases && profile.phases[phase]) || PHASES[phase] || phase;
  }

  /** Stage lookups by role so engine/UI never depend on specific ids. */
  function byRole(profile, role) { return profile.stages.find((s) => s.role === role); }

  function param(profile, key) {
    const p = profile.params && profile.params[key];
    return p ? p.value : undefined;
  }

  /** The effective target temperature of a stage (holds/soaks inherit the previous target). */
  function targetOf(profile, index) {
    const s = profile.stages[index];
    if (s.targetC != null && s.targetC !== '') return Number(s.targetC);
    if (s.type === 'hold' || s.type === 'soak') return startTempOf(profile, index);
    return null;
  }

  /** Starting temperature of a ramp: previous target, else ambient. */
  function startTempOf(profile, index) {
    for (let i = index - 1; i >= 0; i--) {
      const t = profile.stages[i].targetC;
      if (t != null && t !== '') return Number(t);
    }
    return param(profile, 'ambientC');
  }

  /** Flattened summary (spec §32 shape) used by history & compare table. */
  function summary(profile) {
    const peak = byRole(profile, 'peak_hold');
    const cool = byRole(profile, 'cool_to_cast');
    const soak = byRole(profile, 'soak');
    const set = byRole(profile, 'set');
    const vac = byRole(profile, 'post_pour_vacuum');
    const cooling = byRole(profile, 'cooling');
    return {
      investment: profile.materials.investment,
      resin: profile.materials.resin,
      metal: profile.materials.metal,
      waterRatioPct: param(profile, 'waterRatioPct'),
      setMinutes: set ? set.minutes : null,
      peakC: peak ? peak.targetC : null,
      peakHoldMinutes: peak ? peak.minutes : null,
      flaskCastingTempC: cool ? Number(cool.targetC) : null,
      soakMinutes: soak ? soak.minutes : null,
      metalPourTempC: param(profile, 'metalTargetC'),
      metalHeatMinutes: param(profile, 'metalHeatMinutes'),
      postPourVacuumSeconds: vac ? Math.round(vac.minutes * 60) : null,
      initialCoolingMinutes: cooling ? cooling.minutes : null,
    };
  }

  /** Map a stage field to its provenance key. */
  const PROV_FIELD = { minutes: 'duration', targetC: 'target', minMinutes: 'minimum' };

  /**
   * Apply an edit to a stage field, keeping provenance honest:
   * a manufacturer value that is changed becomes "working"; restoring the
   * datasheet value restores "manufacturer".
   * Returns a message when provenance changed.
   */
  function editStageField(st, field, value) {
    st[field] = value;
    const pk = PROV_FIELD[field];
    if (!pk || !st.ref || !(field in st.ref)) return null;
    st.provenance = st.provenance || {};
    const before = st.provenance[pk];
    if (Number(value) === Number(st.ref[field])) st.provenance[pk] = 'manufacturer';
    else if (before === 'manufacturer') st.provenance[pk] = 'working';
    if (before !== st.provenance[pk]) {
      return st.provenance[pk] === 'manufacturer'
        ? 'Matches the datasheet again — marked as manufacturer value.'
        : 'Changed from the datasheet value — now marked as a working setting.';
    }
    return null;
  }

  /** Is a value outside the parameter's datasheet range (if it has one)? */
  function outOfRange(p, value) {
    const v = Number(value == null ? p.value : value);
    return !!(p.range && (v < p.range[0] || v > p.range[1]));
  }

  function editParam(p, value) {
    p.value = value;
    if (p.ref == null) return null;
    const before = p.sourceType;
    if (Number(value) === Number(p.ref)) p.sourceType = 'manufacturer';
    else if (outOfRange(p, value)) p.sourceType = 'experimental';
    else if (before === 'manufacturer' || (p.range && before === 'experimental')) p.sourceType = 'working';
    if (before !== p.sourceType) {
      if (p.sourceType === 'manufacturer') return 'Matches the datasheet again — marked as manufacturer value.';
      if (p.sourceType === 'experimental') return 'Outside the datasheet range — marked as experimental.';
      return 'Changed from the datasheet value — now marked as a working setting.';
    }
    return null;
  }

  /**
   * Validate and repair a profile (imported or hand-written). Throws with a
   * readable message when it can't be used; missing optional parts are filled
   * from neutral defaults.
   */
  function normalise(p) {
    const { errors } = validate(p);
    if (errors.length) throw new Error(errors.slice(0, 3).join(' '));
    p.materials = Object.assign({}, GENERIC_MATERIALS, p.materials || {});
    p.params = Object.assign(standardParams(), p.params || {});
    p.controller = Object.assign({ stopCode: -121, note: 'C/t segment format: the kiln moves from Cn to Cn+1 over tn minutes. A hold is a segment where Cn = Cn+1. Check your controller manual.' }, p.controller || {});
    p.stages = p.stages.map((s, i) => stage(Object.assign({ id: s.id || 'stage_' + i, name: s.name || 'Stage ' + (i + 1), phase: s.phase || 'burnout', type: s.type || 'timed' }, s)));
    p.id = p.id || CPT.util.uid('profile');
    p.name = p.name || 'Imported profile';
    p.schema = 1;
    return p;
  }

  CPT.Profile = {
    STAGE_TYPES, PHASES, SOURCE_TYPES, DEFECTS, RATINGS, GENERIC_SAFETY_NOTES, KNOWN_ROLES,
    register, builtInProfiles, builtIn, blankProfile, standardParams, safetyNotes, validate, kilnProgram, stage, phaseLabel, byRole, param, targetOf, startTempOf, summary, editStageField, editParam, outOfRange, normalise,
  };
})(globalThis.CPT = globalThis.CPT || {});
