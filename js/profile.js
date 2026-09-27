/* Casting Process Tracker — process profiles.
 * Every process value lives here as data. Nothing in engine/UI hard-codes a
 * temperature or duration; they read stages/params from a profile (or a run's
 * snapshot of one). */
(function (CPT) {
  'use strict';

  const SOURCE = 'GRS Protocast datasheet';
  const SOURCE_BURNOUT = 'GRS Protocast datasheet — Typical Resin Burnout';

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

  function burnout(id, type, targetC, minutes, extra) {
    return stage(Object.assign({
      id, phase: 'burnout', type, control: 'kiln', targetC, minutes,
      provenance: { duration: 'manufacturer', target: 'manufacturer' },
      ref: { minutes, targetC }, source: SOURCE_BURNOUT,
    }, extra));
  }

  function mixing(id, name, minutes, doNow) {
    return stage({
      id, name, phase: 'invest', type: 'timed', minutes, doNow,
      provenance: { duration: 'manufacturer' }, ref: { minutes }, source: SOURCE + ' — conventional mixing',
    });
  }

  function defaultProfile() {
    return {
      id: 'protocast-trueblue-cz121-initial',
      name: 'Protocast / True Blue / CZ121 — Initial',
      schema: 1,
      builtIn: true,
      materials: {
        investment: 'GRS Protocast',
        resin: 'Siraya Tech Cast True Blue',
        metal: 'CZ121 brass',
        kiln: 'Programmable electric kiln',
        castingMachine: 'Vacuum casting table/chamber',
      },
      params: {
        waterRatioPct: { label: 'Water ratio', unit: 'g water / 100 g powder', value: 40, sourceType: 'manufacturer', ref: 40, source: SOURCE, note: 'Conventional mixing 40:100. Vacuum mixing range 38–40:100.' },
        powderG: { label: 'Powder quantity', unit: 'g', value: 650, sourceType: 'working', note: 'Working starting quantity — adjust after measuring actual usage.' },
        flaskDiameterMm: { label: 'Flask diameter', unit: 'mm', value: 76.2, sourceType: 'working', note: 'Nominally 3 inch.' },
        flaskHeightMm: { label: 'Flask height', unit: 'mm', value: 101.6, sourceType: 'working', note: 'Nominally 4 inch.' },
        powderPerCm3: { label: 'Powder per cm³ of flask', unit: 'g/cm³', value: 1.2, sourceType: 'experimental', note: 'Estimate used only by the calculator. Calibrate from real usage.' },
        ambientC: { label: 'Ambient / kiln start temperature', unit: '°C', value: 20, sourceType: 'working', note: 'Kiln starts cold.' },
        metalTargetC: { label: 'Target pour temperature', unit: '°C', value: 975, sourceType: 'experimental', note: 'Experimental starting value — not from the Protocast datasheet.' },
        metalHeatMinutes: { label: 'Estimated furnace heat-up / melt time', unit: 'min', value: 60, sourceType: 'working', note: 'Depends on your furnace and charge. Measure and adjust.' },
        metalReadyOffsetMinutes: { label: 'Metal ready after flask soak by', unit: 'min', value: 0, sourceType: 'working', note: 'The flask can wait at temperature; molten brass should not wait. 0 = metal ready as the soak completes.' },
        metalWeightG: { label: 'Metal weight', unit: 'g', value: 0, sourceType: 'working', note: 'Charge weight for this flask.' },
        controllerHoldBufferMinutes: { label: 'Extra controller hold at casting temp', unit: 'min', value: 60, sourceType: 'working', note: 'Added to the soak in the kiln controller programme so the kiln keeps holding if casting runs late. The app still tracks the soak minimum.' },
      },
      controller: { stopCode: -121, note: 'C/t segment format: the kiln moves from Cn to Cn+1 over tn minutes. A hold is a segment where Cn = Cn+1. Check your controller manual.' },
      stages: [
        stage({
          id: 'prepare_tree', name: 'Prepare resin tree', short: 'Prepare resin tree', phase: 'prepare', type: 'manual', minutes: 15,
          provenance: { duration: 'working' },
          doNow: 'Prepare the resin tree and fix it in the flask. Tick each item as you go.',
          checklist: [
            'True Blue prints fully cleaned',
            'Post-cure completed',
            'Supports / printed sprues prepared',
            'Models connected to central sprue / tree',
            'Pouring cup fitted',
            'Assembly secured in flask',
            'Adequate clearance from flask walls',
          ],
          completeLabel: 'Tree ready — start investing',
        }),
        stage({
          id: 'invest_measure', name: 'Measure water and powder', short: 'Measure water & powder', phase: 'invest', type: 'manual', minutes: 5, role: 'measure',
          provenance: { duration: 'working' },
          doNow: 'Measure {waterMl} ml water FIRST. Weigh {powderG} g powder. Add powder to water.',
          instructions: 'Ratio {waterRatioPct}:100. Always add powder to water.',
          source: SOURCE,
          completeLabel: 'Powder added — start hand mix',
        }),
        mixing('invest_hand_mix', 'Hand mix', 1, 'Hand mix until all powder is wetted.'),
        mixing('invest_machine_mix', 'Machine mix', 2, 'Machine mix.'),
        mixing('invest_vacuum_bowl', 'Vacuum mixing bowl', 2, 'Vacuum the mixing bowl.'),
        mixing('invest_pour', 'Pour investment', 1, 'Pour investment into the flask, down the side — not onto the models.'),
        mixing('invest_vacuum_flask', 'Vacuum flask', 2, 'Vacuum the filled flask.'),
        stage({
          id: 'set', name: 'Leave flask untouched', short: 'Initial set', phase: 'set', type: 'timed', role: 'set',
          minutes: 120, minMinutes: 90,
          provenance: { duration: 'working', minimum: 'manufacturer' }, ref: { minMinutes: 90 }, source: SOURCE,
          doNow: 'Leave the flask completely untouched.',
          warning: 'Do not strip the base, remove vacuum tape or disturb the flask during this period.',
          events: [{ id: 'set_prep_kiln', trigger: 'before-end', offsetMinutes: 15, text: 'Get the kiln ready: stand/grid in place, kiln cold, burnout programme entered.' }],
          completeLabel: 'Set complete',
        }),
        stage({
          id: 'burnout_prep', name: 'Prepare flask for burnout', short: 'Flask into kiln', phase: 'burnout_prep', type: 'manual', minutes: 10, role: 'kiln_start',
          provenance: { duration: 'working' }, source: SOURCE,
          doNow: 'Prepare the flask and load the cold kiln. Start the kiln programme when you tap the button — that moment anchors the whole burnout schedule.',
          warning: 'Never put the flask into a hot furnace.',
          checklist: [
            'Minimum set time completed',
            'Remove flask base',
            'Inspect sprue opening',
            'Place flask sprue / opening downward',
            'Use raised stand / grid',
            'Clearance beneath opening',
            'Catch tray in place (if used)',
            'Flask ≥ 15 mm from kiln elements',
            'Kiln starts cold / near ambient',
          ],
          completeLabel: 'Flask in kiln — start burnout',
        }),
        burnout('burnout_ramp_1', 'ramp', 220, 90, { name: 'Ramp to 220°C', short: 'Ramp → 220°C' }),
        burnout('burnout_hold_1', 'hold', 220, 180, { name: 'Hold at 220°C', short: 'Hold 220°C' }),
        burnout('burnout_ramp_2', 'ramp', 450, 120, { name: 'Ramp to 450°C', short: 'Ramp → 450°C' }),
        burnout('burnout_hold_2', 'hold', 450, 120, { name: 'Hold at 450°C', short: 'Hold 450°C' }),
        burnout('burnout_ramp_3', 'ramp', 750, 180, { name: 'Ramp to 750°C', short: 'Ramp → 750°C' }),
        burnout('burnout_peak', 'hold', 750, 240, {
          name: 'High-temperature burnout', short: 'Hold 750°C', role: 'peak_hold', minMinutes: 240, banner: 'HIGH-TEMPERATURE BURNOUT',
          provenance: { duration: 'manufacturer', target: 'manufacturer', minimum: 'manufacturer' },
          ref: { minutes: 240, targetC: 750, minMinutes: 240 },
          alertText: 'High-temperature burnout complete (scheduled). Reduce kiln to casting temperature.',
        }),
        stage({
          id: 'cool_to_cast', name: 'Cool to casting temperature', short: 'Cool → casting temp', phase: 'casting_temp', type: 'temperature_wait', role: 'cool_to_cast',
          targetC: 525, minutes: 90,
          provenance: { target: 'working', duration: 'working' },
          doNow: 'Reduce the kiln to {targetC}°C. Confirm when the kiln display shows {targetC}°C.',
          instructions: 'Cool-down time depends on your kiln. The duration is only an estimate used for planning.',
          notes: 'The casting temperature is a working process setting, not a Protocast specification.',
          completeLabel: 'Kiln at casting temperature',
        }),
        stage({
          id: 'soak', name: 'Flask conditioning', short: 'Hold casting temp', phase: 'soak', type: 'soak', role: 'soak',
          minutes: 60, minMinutes: 60,
          provenance: { duration: 'manufacturer', minimum: 'manufacturer' }, ref: { minutes: 60, minMinutes: 60 }, source: SOURCE,
          instructions: 'Hold the flask at casting temperature for at least 1 hour, otherwise the inside of the flask may be much cooler than the kiln display.',
        }),
        stage({
          id: 'cast_prep', name: 'Ready to cast', short: 'Ready to cast', phase: 'cast', type: 'cast_prep', role: 'cast_prep', minutes: 5,
          provenance: { duration: 'working' },
          doNow: 'Leave the flask in the kiln. Get the vacuum casting machine ready.',
          checklist: [
            'Vacuum pump running correctly',
            'Chamber / table clear',
            'Gasket correctly seated',
            'Crucible path clear',
            'Flask tongs ready',
            'PPE fitted',
            'Extraction operating',
          ],
          completeLabel: 'Vacuum machine ready — confirm',
        }),
        stage({
          id: 'cast', name: 'Cast', short: 'Cast', phase: 'cast', type: 'cast_sequence', role: 'cast', minutes: 2,
          provenance: { duration: 'working' },
        }),
        stage({
          id: 'post_pour_vacuum', name: 'Post-pour vacuum', short: 'Post-pour vacuum', phase: 'cast', type: 'timed', role: 'post_pour_vacuum',
          minutes: 1, unit: 's', provenance: { duration: 'working' },
          doNow: 'Keep vacuum running.',
          notes: 'Working setting — GRS does not specify a post-pour vacuum time.',
          completeLabel: 'Switch vacuum off',
          alertText: 'Post-pour vacuum complete.',
        }),
        stage({
          id: 'cooling', name: 'Cast cooling', short: 'Cool', phase: 'cooling', type: 'timed', role: 'cooling',
          minutes: 15, provenance: { duration: 'working' },
          doNow: 'Leave the flask to cool.',
          warning: 'DO NOT QUENCH YET',
          alertText: 'Initial cooling interval complete. Decide whether to quench.',
        }),
        stage({
          id: 'finish', name: 'Quench & record results', short: 'Quench / results', phase: 'cooling', type: 'finish', role: 'finish', minutes: 20,
          provenance: { duration: 'working' },
          checklist: [
            'Remove investment',
            'Rinse',
            'Pickle / clean if applicable',
            'Inspect casting',
            'Photograph result',
            'Record defects',
            'Record actual metal weight',
            'Record actual temperatures',
            'Add notes',
          ],
        }),
      ],
    };
  }

  /**
   * 5-hour fast burnout for small (≈25 mm) models with strong kiln extraction,
   * on a Technical Super Market R14-LPB kiln. Every value that departs from the
   * Protocast datasheet keeps the datasheet figure as `ref`, so the app shows
   * both and flags anything below a manufacturer minimum.
   */
  function fastProfile() {
    const p = defaultProfile();
    p.id = 'protocast-trueblue-cz121-fast5h';
    p.name = 'Protocast / True Blue / CZ121 — 5-hour fast burnout (R14-LPB)';
    p.materials.kiln = 'Technical Super Market R14-LPB';
    p.makeDefault = true;
    const byId = (id) => p.stages.find((s) => s.id === id);
    const FAST = 'Fast 5-hour schedule (small models, 1 m³/min extraction)';

    byId('prepare_tree').checklist.splice(1, 1, 'UV post-cured 20–30 min — prints completely hard and dry (no uncured resin)');
    const set = byId('set');
    set.name = 'Bench rest — leave flask untouched';
    set.short = 'Bench rest';
    set.minutes = 90;
    set.provenance = { duration: 'manufacturer', minimum: 'manufacturer' };
    set.ref = { minutes: 90, minMinutes: 90 };
    set.doNow = 'Flask on a flat bench at room temperature. Leave it completely untouched.';
    set.instructions = 'Do not shorten this step — the investment needs the full time to set before a fast heating cycle.';

    const prep = byId('burnout_prep');
    prep.checklist = prep.checklist.concat(['Air extractor fan ON', 'Door shutters cracked slightly', 'Controller programme entered (C/t values below)']);

    const seg = (id, targetC, minutes, extra) => {
      const st = byId(id);
      st.targetC = targetC;
      st.minutes = minutes;
      st.provenance = { duration: 'experimental', target: targetC === st.ref.targetC ? 'manufacturer' : 'experimental' };
      st.source = FAST;
      Object.assign(st, extra || {});
    };
    seg('burnout_ramp_1', 220, 15, { instructions: 'Max ramp (~13°C/min). Drives off moisture.' });
    seg('burnout_hold_1', 220, 45, { instructions: 'Drives off the remaining water.' });
    seg('burnout_ramp_2', 450, 15, { instructions: 'Max ramp (~15°C/min).' });
    seg('burnout_hold_2', 450, 45, { instructions: 'Starts breaking down the True Blue polymer.' });
    seg('burnout_ramp_3', 730, 20, { name: 'Ramp to 730°C', short: 'Ramp → 730°C', instructions: 'Max ramp (~14°C/min).' });
    seg('burnout_peak', 730, 150, {
      short: 'Hold 730°C',
      instructions: 'Peak burnout. Extraction fan clears the resin ash gas.',
      provenance: { duration: 'experimental', target: 'experimental', minimum: 'manufacturer' },
    });

    const cool = byId('cool_to_cast');
    cool.targetC = 550;
    cool.minutes = 25;
    cool.provenance = { target: 'experimental', duration: 'experimental' };
    cool.instructions = 'Natural cooling. The schedule allows about 25 min; confirm when the kiln actually shows {targetC}°C.';
    cool.notes = '550°C casting temperature is part of the fast schedule, not a Protocast specification.';

    p.params.metalReadyOffsetMinutes.value = 0;
    return p;
  }

  /** Profiles shipped with the app. Newly added ones are seeded into existing installs once. */
  function builtInProfiles() { return [defaultProfile(), fastProfile()]; }

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

  const SAFETY_NOTES = [
    'Molten brass is hazardous. Equipment manufacturer instructions and your PPE requirements take precedence over this app.',
    'CZ121 is a leaded brass (about 3% lead, 39% zinc). Melting releases zinc and lead fume — effective extraction and a suitable respirator are essential. No food or drink in the casting area.',
    'Water must never contact molten metal. Keep quench water well away from the furnace and pouring area.',
    'Hot investment flasks stay dangerous long after they look cool. Use tongs and gloves.',
    'The vacuum system must be suitable for hot-flask casting.',
    'This app never knows a real temperature. A finished timer means the scheduled time has passed — not that the kiln or metal is at temperature.',
  ];

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

  function editParam(p, value) {
    p.value = value;
    if (p.ref == null) return null;
    const before = p.sourceType;
    if (Number(value) === Number(p.ref)) p.sourceType = 'manufacturer';
    else if (before === 'manufacturer') p.sourceType = 'working';
    if (before !== p.sourceType) {
      return p.sourceType === 'manufacturer'
        ? 'Matches the datasheet again — marked as manufacturer value.'
        : 'Changed from the datasheet value — now marked as a working setting.';
    }
    return null;
  }

  /** Light validation / repair of an imported profile. Throws on unusable input. */
  function normalise(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.stages) || !p.stages.length) {
      throw new Error('Not a casting profile (no stages).');
    }
    const base = defaultProfile();
    p.materials = Object.assign({}, base.materials, p.materials || {});
    p.params = Object.assign({}, base.params, p.params || {});
    p.controller = Object.assign({}, base.controller, p.controller || {});
    p.stages = p.stages.map((s, i) => stage(Object.assign({ id: s.id || 'stage_' + i, name: s.name || 'Stage ' + (i + 1), phase: s.phase || 'burnout', type: s.type || 'timed' }, s)));
    p.id = p.id || CPT.util.uid('profile');
    p.name = p.name || 'Imported profile';
    p.schema = 1;
    return p;
  }

  CPT.Profile = {
    STAGE_TYPES, PHASES, SOURCE_TYPES, DEFECTS, RATINGS, SAFETY_NOTES,
    defaultProfile, fastProfile, builtInProfiles, kilnProgram, stage, byRole, param, targetOf, startTempOf, summary, editStageField, editParam, normalise,
  };
})(globalThis.CPT = globalThis.CPT || {});
