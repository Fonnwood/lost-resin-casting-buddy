/* Casting Process Tracker — shared UI building blocks.
 * Pure functions that return HTML strings (always escape user text with `h`).
 * Views in js/ui/*.js compose these; they are exported as CPT.UI.lib. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const MIN = U.MIN;

  const PROV_ICON = { manufacturer: '◆', working: '●', experimental: '▲' };

  function ctx() {
    const live = {};
    return {
      live,
      L(key, value, cls, tag) {
        live[key] = value;
        return '<' + (tag || 'span') + ' data-live="' + key + '"' + (cls ? ' class="' + cls + '"' : '') + '></' + (tag || 'span') + '>';
      },
    };
  }

  function prov(type, what) {
    if (!type) return '';
    return '<span class="prov prov-' + h(type) + '" title="' + h(P.SOURCE_TYPES[type] || type) + '">' + (PROV_ICON[type] || '') + ' ' + h((what ? what + ': ' : '') + (P.SOURCE_TYPES[type] || type)) + '</span>';
  }

  /** "Free and open source" note with a link to the code (config.sourceUrl). */
  function openSourceNote(cls) {
    const url = (CPT.config && CPT.config.sourceUrl) || '';
    const link = /^https?:\/\//.test(url) ? ' <a href="' + h(url) + '" target="_blank" rel="noopener">' + (/github\.com/.test(url) ? 'Source code on GitHub' : 'Source code') + '</a>' : '';
    return '<p class="' + (cls || 'hint') + '">Free and open source (MIT licence).' + link + '</p>';
  }

  function btn(action, label, cls, arg, attrs) {
    return '<button type="button" class="btn ' + (cls || '') + '" data-action="' + h(action) + '"' + (arg != null ? ' data-arg="' + h(arg) + '"' : '') + (attrs || '') + '>' + label + '</button>';
  }

  function fill(text, vars, c) {
    let out = h(text || '');
    out = out.replace(/\{(\w+)\}/g, (m, k) => {
      if (k === 'remaining' && c) return c.L('todoRemaining', vars.remaining || '', 'mono');
      return vars[k] != null ? h(vars[k]) : m;
    });
    return out;
  }

  function textVars(run, index) {
    const p = run.profile;
    return {
      targetC: index != null ? P.targetOf(p, index) : '',
      startC: index != null ? P.startTempOf(p, index) : '',
      waterMl: E.waterMl(p),
      powderG: P.param(p, 'powderG'),
      waterRatioPct: P.param(p, 'waterRatioPct'),
      metalTargetC: P.param(p, 'metalTargetC'),
      metal: p.materials.metal,
      name: index != null ? p.stages[index].name : '',
    };
  }

  function stageTitle(run, i) {
    const s = run.profile.stages[i];
    const t = P.targetOf(run.profile, i);
    if (s.type === 'hold' && s.role !== 'peak_hold') return s.name.toUpperCase();
    if (s.type === 'soak') return (s.name || 'Flask conditioning').toUpperCase();
    return (s.name || '').toUpperCase() + (s.type === 'ramp' && t != null && !/°C/.test(s.name) ? ' → ' + t + '°C' : '');
  }

  function describeStage(run, i) {
    const p = run.profile;
    const s = p.stages[i];
    const t = P.targetOf(p, i);
    const from = P.startTempOf(p, i);
    switch (s.type) {
      case 'ramp': return 'Ramp kiln from ' + from + '°C to ' + t + '°C over ' + U.dur(s.minutes) + '.';
      case 'hold': return 'Hold at ' + t + '°C for ' + U.dur(s.minutes) + '.';
      case 'temperature_wait': return 'Bring the kiln to ' + t + '°C (casting temperature). Estimated ' + U.dur(s.minutes) + '.';
      case 'soak': return 'Hold the flask at ' + t + '°C for at least ' + U.dur(s.minutes) + '.';
      case 'timed': return s.name + ' — ' + U.dur(s.minutes, s.unit) + '.';
      default: return s.name + (s.minutes ? ' (about ' + U.dur(s.minutes, s.unit) + ')' : '') + '.';
    }
  }

  function rampRate(run, i) {
    const p = run.profile;
    const s = p.stages[i];
    const t = P.targetOf(p, i);
    const from = P.startTempOf(p, i);
    if (s.type !== 'ramp' || !s.minutes || t == null || from == null) return '';
    const perH = (t - from) / (s.minutes / 60);
    return Math.round(perH) + '°C/hour · ≈' + U.round(perH / 60, 2).toFixed(2) + '°C/min nominal';
  }

  function checklist(run, stage, readonly) {
    if (!stage.checklist || !stage.checklist.length) return '';
    const checks = run.checks[stage.id] || {};
    return '<ul class="checklist">' + stage.checklist.map((item, n) => {
      const on = !!checks[n];
      return '<li><button type="button" class="check' + (on ? ' on' : '') + '" data-action="toggleCheck" data-arg="' + h(stage.id + ':' + n) + '"' + (readonly ? ' disabled' : '') + ' aria-pressed="' + on + '"><span class="box">' + (on ? '✓' : '') + '</span><span>' + h(item) + '</span></button></li>';
    }).join('') + '</ul>';
  }

  function checklistProgress(run, stage) {
    const n = (stage.checklist || []).length;
    if (!n) return null;
    const checks = run.checks[stage.id] || {};
    const done = stage.checklist.filter((x, i) => checks[i]).length;
    return { done, n };
  }

  function minLine(stage) {
    if (stage.minMinutes == null || stage.minMinutes === '') return '';
    const below = Number(stage.minutes) < Number(stage.minMinutes);
    const mprov = (stage.provenance && stage.provenance.minimum) || 'manufacturer';
    return '<div class="minline' + (below ? ' warn' : '') + '">' +
      '<div><span class="k">' + (mprov === 'manufacturer' ? 'Manufacturer minimum' : 'Minimum') + '</span><span class="v">' + h(U.dur(stage.minMinutes)) + '</span></div>' +
      '<div><span class="k">Current setting</span><span class="v">' + h(U.dur(stage.minutes)) + '</span></div>' +
      (below ? '<div class="below">⚠ Below the minimum</div>' : '') + '</div>';
  }

  function refLine(stage) {
    if (!stage.ref) return '';
    const bits = [];
    if (stage.ref.minutes != null && Number(stage.ref.minutes) !== Number(stage.minutes)) bits.push('Datasheet: ' + U.dur(stage.ref.minutes) + ' · Current: ' + U.dur(stage.minutes));
    if (stage.ref.targetC != null && stage.targetC != null && Number(stage.ref.targetC) !== Number(stage.targetC)) bits.push('Datasheet: ' + stage.ref.targetC + '°C · Current: ' + stage.targetC + '°C');
    return bits.length ? '<div class="refline">' + bits.map(h).join('<br>') + '</div>' : '';
  }

  function provRow(stage) {
    const pv = stage.provenance || {};
    const bits = [];
    if (pv.target && stage.targetC != null) bits.push(prov(pv.target, 'Temp'));
    if (pv.duration) bits.push(prov(pv.duration, 'Time'));
    return bits.length ? '<div class="provrow">' + bits.join('') + (stage.source ? '<span class="src">' + h(stage.source) + '</span>' : '') + '</div>' : '';
  }

  function extendRow(stage) {
    const kiln = stage.control === 'kiln';
    return '<div class="extend">' +
      btn('extend', '+5 min', 'ghost', 5) + btn('extend', '+15 min', 'ghost', 15) + btn('extend', '+30 min', 'ghost', 30) + btn('extendCustom', 'Custom', 'ghost') +
      '</div>' + (kiln ? '<p class="hint">Extending here does not change the kiln. Extend the segment on the kiln controller too.</p>' : '');
  }

  /** Kiln controller entries (C/t segment format) generated from the stages. */
  function kilnProgramBlock(profile, open) {
    const k = P.kilnProgram(profile);
    let html = '<details class="kiln-prog"' + (open ? ' open' : '') + '><summary>Kiln controller programme (' + h(U.dur(k.totalMinutes)) + ')</summary>';
    html += '<table class="prog"><tbody>' + k.rows.map((r) => '<tr><th class="mono">' + h(r.code) + '</th><td class="mono v">' + h(r.code.charAt(0) === 'C' ? U.toDisplayTemp(r.value) : r.value) + '</td><td>' + h(r.meaning) + '</td></tr>').join('') + '</tbody></table>';
    html += '<p class="hint">Cn is the temperature at the start of segment n; tn is the minutes to get from Cn to Cn+1. A hold is a segment where Cn = Cn+1.' +
      (k.bufferMinutes ? ' The last hold includes ' + h(k.bufferMinutes) + ' extra minutes so the kiln keeps the flask hot if casting runs late.' : '') +
      ' Check the format and end code against your controller manual.</p></details>';
    return html;
  }

  function field(label, input, hint) {
    return '<label class="field"><span class="label">' + label + '</span>' + input + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>';
  }

  /** Number input. `isTemp` shows/accepts the user's temperature unit while storing °C. */
  function numInput(bind, value, attrs, isTemp) {
    const shown = isTemp ? U.toDisplayTemp(value) : value;
    return '<input type="number" inputmode="decimal" step="any" data-type="' + (isTemp ? 'tempC' : 'number') + '" data-bind="' + h(bind) + '" value="' + h(shown == null ? '' : shown) + '"' + (attrs || '') + '>';
  }

  function paramField(scope, p, key, opts) {
    const par = p.params[key];
    if (!par) return '';
    opts = opts || {};
    return field(h(par.label) + ' <small>' + h(par.unit) + '</small>',
      numInput(scope + '|params.' + key + '.value', par.value, opts.disabled ? ' disabled' : '', par.unit === '°C'),
      prov(par.sourceType) + (par.note ? ' ' + h(par.note) : '') + (par.ref != null && Number(par.ref) !== Number(par.value) ? ' <strong>Datasheet: ' + h(par.ref) + '</strong>' : ''));
  }

  function toggle(bind, on, label) {
    return '<label class="toggle"><input type="checkbox" data-type="bool" data-bind="' + h(bind) + '"' + (on ? ' checked' : '') + '><span class="track"></span><span>' + h(label) + '</span></label>';
  }

  function select(bind, options, value) {
    return '<select data-bind="' + h(bind) + '">' + Object.keys(options).map((k) => '<option value="' + h(k) + '"' + (value === k ? ' selected' : '') + '>' + h(options[k]) + '</option>').join('') + '</select>';
  }

  function provSelect(bind, value) {
    return '<select data-bind="' + h(bind) + '"><option value="">—</option>' + Object.keys(P.SOURCE_TYPES).map((k) => '<option value="' + k + '"' + (value === k ? ' selected' : '') + '>' + h(P.SOURCE_TYPES[k]) + '</option>').join('') + '</select>';
  }

  function kv(k, v) { return '<div><span class="k">' + h(k) + '</span><span class="v">' + h(v == null ? '—' : v) + '</span></div>'; }

  function safetyCard(profile, compact) {
    const notes = P.safetyNotes(profile);
    if (compact) return '<section class="card safety"><details><summary>⚠ Safety notes</summary><ul>' + notes.map((n) => '<li>' + h(n) + '</li>').join('') + '</ul></details></section>';
    return '<section class="card safety"><h2>⚠ Safety</h2><ul>' + notes.map((n) => '<li>' + h(n) + '</li>').join('') + '</ul></section>';
  }

  /** The profile new runs start from: the user's default, else the first. */
  function defaultProfileOf(app) {
    return app.profiles.find((p) => p.id === app.settings.defaultProfileId) || app.profiles[0];
  }

  function resultForm(scope, d) {
    const bind = scope === 'run' ? 'run|resultDraft.' : scope + '|result.';
    let html = '<div class="eyebrow">OVERALL RESULT (1–5)</div><div class="rating">';
    for (let n = 1; n <= 5; n++) {
      html += '<button type="button" class="btn rate' + (Number(d.rating) === n ? ' on' : '') + '" data-action="rating" data-arg="' + h(scope + ':' + n) + '"><strong>' + n + '</strong><small>' + h(P.RATINGS[n]) + '</small></button>';
    }
    html += '</div><div class="eyebrow">DEFECTS</div><div class="defects">';
    const defects = d.defects || [];
    P.DEFECTS.forEach((name) => {
      const on = defects.includes(name);
      html += '<button type="button" class="check' + (on ? ' on' : '') + '" data-action="toggleDefect" data-arg="' + h(scope + ':' + name) + '" aria-pressed="' + on + '"><span class="box">' + (on ? '✓' : '') + '</span><span>' + h(name) + '</span></button>';
    });
    html += '</div>';
    html += field('Notes', '<textarea rows="4" data-bind="' + bind + 'notes" placeholder="e.g. North tower failed to fill. Very good detail elsewhere.">' + h(d.notes || '') + '</textarea>');
    html += '<div class="grid3">' +
      field('Actual metal weight (g)', '<input type="number" inputmode="decimal" data-type="number" data-bind="' + bind + 'actualMetalWeightG" value="' + h(d.actualMetalWeightG == null ? '' : d.actualMetalWeightG) + '">') +
      field('Actual flask temp (°C)', '<input type="number" inputmode="decimal" data-type="tempC" data-bind="' + bind + 'actualFlaskC" value="' + h(d.actualFlaskC == null ? '' : U.toDisplayTemp(d.actualFlaskC)) + '">') +
      field('Actual pour temp (°C)', '<input type="number" inputmode="decimal" data-type="tempC" data-bind="' + bind + 'actualPourC" value="' + h(d.actualPourC == null ? '' : U.toDisplayTemp(d.actualPourC)) + '">') +
      '</div>';
    return html;
  }

  /** Milestone picker for the planner: every stage, grouped by phase. */
  function planStageSelect(run, selectedId) {
    const groups = [];
    run.profile.stages.forEach((st) => {
      let g = groups[groups.length - 1];
      if (!g || g.phase !== st.phase) { g = { phase: st.phase, items: [] }; groups.push(g); }
      g.items.push(st);
    });
    return '<select data-bind="run|plan.stageId">' + groups.map((g) => '<optgroup label="' + h(P.phaseLabel(run.profile, g.phase)) + '">' +
      g.items.map((st) => '<option value="' + h(st.id) + '"' + (st.id === selectedId ? ' selected' : '') + '>' + h(st.short || st.name) + '</option>').join('') + '</optgroup>').join('') + '</select>';
  }

  /** Quick duration choices for the anchor stage (e.g. the 90 min bench rest → 2 h, 2½ h). */
  function planDurationBlock(run, index) {
    const st = run.profile.stages[index];
    if (st.unit === 's' || !(Number(st.minutes) > 0)) return '';
    const mins = Number(st.minutes);
    let html = field('How long should “' + h(st.short || st.name) + '” be? <small>(minutes)</small>', numInput('run|profile.stages.' + index + '.minutes', st.minutes, ' min="0"'),
      st.minMinutes != null ? 'Minimum ' + h(U.dur(st.minMinutes)) + (st.provenance && st.provenance.minimum === 'manufacturer' ? ' (manufacturer)' : '') + '. Longer is fine — everything after it moves later.' : 'Everything after it moves later.');
    if (st.minMinutes != null) {
      const base = Number(st.minMinutes);
      const opts = [base, base + 30, base + 60].map((m) => '<button type="button" class="btn ghost small' + (m === mins ? ' on' : '') + '" data-action="planStageMinutes" data-arg="' + index + ':' + m + '" aria-pressed="' + (m === mins) + '">' + h(U.dur(m)) + '</button>');
      html += '<div class="row2">' + opts.join('') + '</div>';
    }
    return html;
  }

  function planBlock(run, now) {
    const raw = run.plan || {};
    const profile = run.profile;
    const stages = profile.stages;
    const plan = E.planOf(profile, run.plan);
    let idx = plan ? plan.index : (raw.stageId ? stages.findIndex((s) => s.id === raw.stageId) : -1);
    if (idx < 0) idx = E.defaultPlanIndex(profile);
    const stage = stages[idx];
    const edge = plan ? plan.edge : (raw.edge === 'end' ? 'end' : 'start');
    const name = stage.short || stage.name;

    // Locked: show the committed plan and a way back.
    if (plan && plan.locked && run.status === 'draft') {
      const p = E.planAround(profile, run.values, plan, now);
      return '<p class="lockedplan">🔒 <strong>Locked in:</strong> ' + h(name) + ' ' + (edge === 'end' ? 'ends' : 'starts') + ' at <strong>' + h(U.clock(plan.at, now)) + '</strong></p>' +
        planTable(run, p, now) + '<div class="row2">' + btn('planUnlock', 'Unlock to change', 'ghost small') + btn('planClear', 'Clear plan', 'ghost small') + '</div>';
    }

    let html = '<p class="hint">Pick any point in the process, say when it should happen, and every other step is worked out around it.</p>' +
      field('Plan around', planStageSelect(run, stages[idx].id)) +
      field('This step', '<select data-bind="run|plan.edge"><option value="start"' + (edge === 'start' ? ' selected' : '') + '>starts at</option><option value="end"' + (edge === 'end' ? ' selected' : '') + '>ends at</option></select>') +
      field('Time', '<input type="datetime-local" data-bind="run|plan.at" data-type="datetime" value="' + (plan ? U.toLocalInput(plan.at) : '') + '">');
    html += planDurationBlock(run, idx);

    const earliestPlan = E.planAround(profile, run.values, { stageId: stage.id, edge, at: now }, now);
    const quick = [btn('planAt', 'Earliest possible (' + h(U.clock(earliestPlan.earliest, now)) + ')', 'ghost small', 'earliest')];
    [15, 30].forEach((m) => quick.push(btn('planAt', 'In ' + m + ' min', 'ghost small', String(m))));
    html += '<div class="row2">' + quick.join('') + '</div>';

    if (!plan) return html + '<p class="hint">Choose a time to see the whole schedule.</p>';
    if (run.status === 'draft') {
      const p = E.planAround(profile, run.values, plan, now);
      if (p.tooLate) {
        html += '<p class="warnbox">That doesn’t work: starting right now, ' + h(name) + ' can’t ' + (edge === 'end' ? 'end' : 'start') + ' before <strong>' + h(U.clock(p.earliest, now)) + '</strong>. Use the earliest time above, shorten a step, or pick a different point to plan around.</p>';
      } else {
        html += planTable(run, p, now) + btn('planLock', '🔒 Lock in this plan', 'primary xl');
      }
    } else {
      const sched = E.schedule(run, now);
      const row = sched.rows[plan.index];
      const projected = plan.edge === 'end' ? row.end : row.start;
      const diff = Math.round((projected - plan.at) / MIN);
      html += '<p>Projected ' + h(name) + ' ' + (edge === 'end' ? 'end' : 'start') + ': <strong>' + h(U.clock(projected, now)) + '</strong> ' + (diff === 0 ? '(on plan)' : '(' + (diff > 0 ? diff + ' min later' : -diff + ' min earlier') + ' than planned)') + '</p>';
    }
    html += btn('planClear', 'Clear plan', 'ghost small');
    return html;
  }

  function planTable(run, plan, now) {
    const a = plan.rows[plan.anchor.index];
    const rows = [];
    rows.push('<tr class="anchor"><th>▶ ' + h(a.stage.short || a.stage.name) + '</th><td>' + h(U.clock(a.start, now)) + ' – ' + h(U.clock(a.end, now)) + ' <em>(' + h(U.dur(a.stage.minutes, a.stage.unit)) + ')</em></td></tr>');
    rows.push('<tr><th>Start run (prepare tree)</th><td>' + h(U.clock(plan.startAt, now)) + '</td></tr>');
    rows.push('<tr><th>Start investing</th><td>' + h(U.clock(plan.investAt, now)) + '</td></tr>');
    if (plan.kilnStartAt != null) rows.push('<tr><th>Flask into kiln · start programme</th><td>' + h(U.clock(plan.kilnStartAt, now)) + '</td></tr>');
    if (plan.soakStartAt != null) rows.push('<tr><th>Reach casting temp · start soak</th><td>' + h(U.clock(plan.soakStartAt, now)) + ' <em>est.</em></td></tr>');
    if (plan.metalStartAt != null) rows.push('<tr><th>Start ' + h(run.profile.materials.metal) + ' furnace</th><td>' + h(U.clock(plan.metalStartAt, now)) + ' <em>est.</em></td></tr>');
    if (plan.flaskReadyAt != null) rows.push('<tr><th>Flask ready · cast</th><td><strong>' + h(U.clock(plan.flaskReadyAt, now)) + '</strong></td></tr>');
    return '<table class="plan"><tbody>' + rows.join('') + '</tbody></table><p class="hint">The 750 → casting-temperature cool-down depends on your kiln; its time is an estimate. The full schedule is on the Timeline tab.</p>';
  }

  CPT.UI = CPT.UI || {};
  CPT.UI.lib = { ctx, prov, btn, openSourceNote, fill, textVars, stageTitle, describeStage, rampRate, checklist, checklistProgress, minLine, refLine, provRow, extendRow, kilnProgramBlock, field, numInput, paramField, toggle, select, provSelect, kv, safetyCard, defaultProfileOf, resultForm, planBlock };
})(globalThis.CPT = globalThis.CPT || {});
