/* Built-in profile: GRS Protocast investment, Siraya Tech Cast True Blue resin,
 * CZ121 brass, vacuum-assisted casting.
 *
 * This file is a worked example of a profile pack. To add your own material
 * system, copy it, change the data, give each profile a unique `id`, and load
 * it from index.html after js/profile.js. See docs/PROFILES.md.
 *
 * Values marked `manufacturer` come from the GRS Protocast datasheet. "GRS",
 * "Protocast", "Siraya Tech" and "True Blue" belong to their owners; this
 * project is not affiliated with or endorsed by them. */
(function (CPT) {
  'use strict';

  const P = CPT.Profile;
  const stage = P.stage;

  const SOURCE = 'GRS Protocast datasheet';
  const SOURCE_BURNOUT = 'GRS Protocast datasheet — Typical Resin Burnout';

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
      builtInVersion: 1,
      materials: {
        investment: 'GRS Protocast',
        resin: 'Siraya Tech Cast True Blue',
        metal: 'CZ121 brass',
        kiln: 'Programmable electric kiln',
        castingMachine: 'Vacuum casting table/chamber',
      },
      params: {
        waterRatioPct: { label: 'Water ratio', unit: 'g water / 100 g powder', value: 40, sourceType: 'manufacturer', ref: 40, range: [38, 40], options: [36, 38, 40], source: SOURCE, note: 'Datasheet: conventional mixing 40:100; vacuum mixing range 38–40:100. Less water = stronger, denser mould but thicker slurry, shorter working time and lower permeability.' },
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
      safetyNotes: [
        'Molten brass is hazardous. Equipment manufacturer instructions and your PPE requirements take precedence over this app.',
        'CZ121 is a leaded brass (about 3% lead, 39% zinc). Melting releases zinc and lead fume — effective extraction and a suitable respirator are essential. No food or drink in the casting area.',
        'Water must never contact molten metal. Keep quench water well away from the furnace and pouring area.',
        'Hot investment flasks stay dangerous long after they look cool. Use tongs and gloves.',
        'The vacuum system must be suitable for hot-flask casting.',
        'This app never knows a real temperature. A finished timer means the scheduled time has passed — not that the kiln or metal is at temperature.',
      ],
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
    p.builtInVersion = 2;
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

    // Stronger mix than the datasheet range — experimental.
    p.params.waterRatioPct.value = 36;
    p.params.waterRatioPct.sourceType = 'experimental';
    p.params.metalReadyOffsetMinutes.value = 0;
    return p;
  }

  P.register(defaultProfile);
  P.register(fastProfile);
})(globalThis.CPT = globalThis.CPT || {});
