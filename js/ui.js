/* Casting Process Tracker — view renderers.
 * Each renderer returns { html, live }. `html` contains empty
 * <span data-live="key"> placeholders; `live` holds their current text. The
 * app re-renders structure only when `html` changes and otherwise just updates
 * the live spans, so buttons are not replaced under your finger every second. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const MIN = U.MIN;

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

  // ------------------------------------------------------------ components

  const PROV_ICON = { manufacturer: '◆', working: '●', experimental: '▲' };

  function prov(type, what) {
    if (!type) return '';
    return '<span class="prov prov-' + h(type) + '" title="' + h(P.SOURCE_TYPES[type] || type) + '">' + (PROV_ICON[type] || '') + ' ' + h((what ? what + ': ' : '') + (P.SOURCE_TYPES[type] || type)) + '</span>';
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
    html += '<table class="prog"><tbody>' + k.rows.map((r) => '<tr><th class="mono">' + h(r.code) + '</th><td class="mono v">' + h(r.value) + '</td><td>' + h(r.meaning) + '</td></tr>').join('') + '</tbody></table>';
    html += '<p class="hint">Cn is the temperature at the start of segment n; tn is the minutes to get from Cn to Cn+1. A hold is a segment where Cn = Cn+1.' +
      (k.bufferMinutes ? ' The last hold includes ' + h(k.bufferMinutes) + ' extra minutes so the kiln keeps the flask hot if casting runs late.' : '') +
      ' Check the format and end code against your controller manual.</p></details>';
    return html;
  }

  // ------------------------------------------------------------ NOW view

  function renderNow(app, now) {
    const c = ctx();
    const run = app.activeRun();
    if (!run) return { html: welcome(app, now), live: c.live };
    if (run.status === 'draft') return { html: draftCard(app, run, now, c), live: c.live };

    const sched = E.schedule(run, now);
    const i = sched.cur;
    const stages = run.profile.stages;
    if (i >= stages.length) {
      return { html: '<section class="card"><h2>All steps complete</h2><p>Record the result to finish this run.</p>' + resultForm('run', run.resultDraft || {}) + btn('completeRun', 'SAVE RESULTS & COMPLETE RUN', 'primary xl') + btn('backStage', '← Back to previous step', 'ghost') + '</section>', live: c.live };
    }

    const row = sched.rows[i];
    const s = row.stage;
    const state = E.runState(run, sched, now);
    const metal = E.metalInfo(run, sched, now);
    const flask = E.flaskInfo(run, sched, now);
    const done = sched.rows.filter((r) => r.status === 'done').length;

    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state state-' + state.toLowerCase() + '">' + state.replace(/_/g, ' ') + '</span></div>';
    html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + stages.length + '" aria-valuenow="' + done + '"><div style="width:' + Math.round(done / stages.length * 100) + '%"></div></div>';
    html += '<div class="progress-label">Overall casting progress: ' + (done + 1) + ' / ' + stages.length + '</div>';

    html += stageCard(app, run, sched, row, metal, flask, now, c);

    if (metal.relevant && s.type !== 'cast_sequence') html += metalPanel(run, metal, flask, now, c);

    const evs = E.stageEvents(run, sched).filter((ev) => ev.at > now && ev.at - now < 3 * 3600000).slice(0, 3);
    if (evs.length) {
      html += '<section class="card upcoming"><div class="eyebrow">COMING UP</div>' + evs.map((ev, n) => '<div class="up"><span class="mono">' + c.L('ev' + n, U.hms(ev.at - now)) + '</span><span>' + h(ev.text) + (ev.estimate ? ' <em>(est.)</em>' : '') + '</span></div>').join('') + '</section>';
    }

    const next = sched.rows[i + 1];
    if (next && s.type !== 'finish') {
      html += '<section class="card next"><div class="eyebrow">NEXT</div><div class="next-name">' + h(next.stage.name) + '</div>' +
        '<p>' + h(describeStage(run, i + 1)) + '</p>' +
        '<div class="times"><span>Starts ' + (row.status === 'active' && s.control === 'kiln' ? '' : '≈ ') + h(U.clock(next.start, now)) + '</span><span>Ends ' + (next.estimate ? '≈ ' : '') + h(U.clock(next.end, now)) + '</span></div></section>';
    }

    const u = E.undoable(run);
    html += '<section class="card escape"><div class="eyebrow">TIMER STUCK OR WRONG?</div><div class="row3">' +
      btn('resetStage', '↺ Reset timer', 'ghost small') + btn('skipStage', 'Skip step →', 'ghost small') + (i > 0 ? btn('backStage', '← Previous step', 'ghost small') : '') +
      '</div></section>';
    html += '<div class="footer-actions">' + (u ? btn('undo', '↶ Undo: ' + h(u.label), 'ghost small') : '') + btn('nav', 'Full timeline', 'ghost small', 'timeline') + '</div>';
    return { html, live: c.live };
  }

  function welcome(app, now) {
    const recent = app.runs.filter((r) => r.status === 'complete').slice(-3).reverse();
    let html = '<section class="card hero"><div class="eyebrow">NO ACTIVE CASTING RUN</div><h1>Ready when you are</h1>' +
      '<p>Start a run to track investing, burnout, flask soak, metal and pour from one screen.</p>' +
      btn('newRun', 'START NEW CASTING RUN', 'primary xl') + '</section>';
    if (recent.length) {
      html += '<section class="card"><div class="eyebrow">RECENT RUNS</div>' + recent.map((r) => '<button type="button" class="listrow" data-action="historyOpen" data-arg="' + h(r.id) + '"><span>' + h(r.name) + '</span><span class="muted">' + (r.result && r.result.rating ? '★ ' + r.result.rating + '/5' : '') + '</span></button>').join('') + '</section>';
    }
    html += safetyCard(true);
    return html;
  }

  function draftCard(app, run, now, c) {
    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state state-draft">DRAFT</span></div>';
    html += '<section class="card hero"><div class="eyebrow">WHAT TO DO NOW</div>';
    if (run.plan && run.plan.castAt) {
      const plan = E.planFromCastTime(run.profile, run.values, run.plan.castAt, now);
      html += '<h1>Plan: cast ' + h(U.clock(plan.castAt, now)) + '</h1>';
      if (plan.tooLate) {
        html += '<p class="warnbox">That casting time is too soon. Earliest if you start now: <strong>' + h(U.clock(plan.earliest, now)) + '</strong>.</p>';
      } else {
        html += '<p>Start the run (prepare the tree) at <strong>' + h(U.clock(plan.startAt, now)) + '</strong>. Start investing by <strong>' + h(U.clock(plan.investAt, now)) + '</strong>. Flask into the kiln by <strong>' + h(U.clock(plan.kilnStartAt, now)) + '</strong>.</p>' +
          '<p>Start in: <strong class="mono">' + c.L('planStartIn', U.hms(Math.max(0, plan.startAt - now))) + '</strong></p>';
      }
    } else {
      html += '<h1>Run not started</h1><p>Check the values for this casting on the RUN screen, or plan backwards from a casting time. Then start.</p>';
    }
    html += btn('startRun', 'START RUN NOW', 'primary xl') + '<div class="row2">' + btn('nav', 'Edit run values', 'ghost', 'run') + btn('planOpen', 'Plan from casting time', 'ghost') + '</div>' + '</section>';
    html += safetyCard(true);
    return html;
  }

  function stageCard(app, run, sched, row, metal, flask, now, c) {
    const s = row.stage;
    const i = row.i;
    const vars = textVars(run, i);
    const t = P.targetOf(run.profile, i);
    vars.remaining = U.hms(row.remaining || 0);
    const kiln = s.control === 'kiln';
    const overdue = row.overdue > 0;
    const stepLabel = (P.PHASES[s.phase] || s.phase) + ' · Step ' + (i + 1) + ' of ' + run.profile.stages.length;

    let todo;
    let body = '';
    let actions = '';
    let timerHtml = '';
    let tempHtml = '';

    // Defaults for "what to do now"
    if (s.doNow) todo = fill(s.doNow, vars, c);
    else if (s.type === 'ramp') todo = fill('Let the kiln programme ramp to {targetC}°C. No action required for another {remaining}.', vars, c);
    else if (s.type === 'hold') todo = fill('Leave the kiln at {targetC}°C. No action required for another {remaining}.', vars, c);
    else todo = fill(s.name + '.', vars, c);

    if (t != null && ['ramp', 'hold', 'temperature_wait', 'soak'].includes(s.type)) {
      tempHtml = '<div class="temp">' + h(t) + '°C</div>';
      if (s.type === 'ramp') {
        const from = P.startTempOf(run.profile, i);
        const frac = Math.min(1, Math.max(0, row.elapsed / Math.max(1, row.scheduledEnd - row.start)));
        tempHtml += '<div class="temp-sub">' + h(from) + '°C → ' + h(t) + '°C · ' + h(rampRate(run, i)) + '</div>';
        tempHtml += '<div class="temp-sub">Programme setpoint now ≈ ' + c.L('setpoint', Math.round(from + (t - from) * frac) + '°C') + ' <em>(scheduled, not measured)</em></div>';
      } else if (kiln) {
        tempHtml += '<div class="temp-sub">Kiln programme target · not measured</div>';
      }
    }

    const timeLine = (label2, endVal) => '<div class="times"><span>Started ' + h(U.clock(row.start, now)) + '</span><span>' + label2 + ' ' + endVal + '</span></div>';

    switch (s.type) {
      case 'ramp':
      case 'hold':
      case 'timed': {
        const isVac = s.role === 'post_pour_vacuum';
        const isCooling = s.role === 'cooling';
        if (overdue && !kiln) {
          timerHtml = '<div class="timer overdue">+' + c.L('timer', U.hms(row.overdue)) + '</div><div class="timer-label">' + (isVac ? 'POST-POUR VACUUM COMPLETE' : isCooling ? 'INITIAL COOLING PERIOD COMPLETE' : 'TIME UP — OVER BY') + '</div>';
          if (!isVac && !isCooling) todo = fill('Time is up. When you have finished, tap “' + (s.completeLabel || 'Complete now') + '”.', vars, c);
        } else {
          timerHtml = '<div class="timer">' + c.L('timer', U.hms(Math.max(0, row.remaining))) + '</div><div class="timer-label">' + (row.paused ? 'TRACKING PAUSED' : 'remaining') + '</div>';
        }
        body += timeLine(overdue && !kiln ? 'Was due' : 'Expected finish', h(U.clock(row.scheduledEnd, now)));
        if (s.role === 'peak_hold' || s.banner) body = '<div class="banner-hot">' + h(s.banner || 'HIGH-TEMPERATURE BURNOUT') + '</div>' + body;
        body += minLine(s) + refLine(s);
        if (s.phase === 'invest') {
          const first = sched.rows.find((r) => r.stage.phase === 'invest' && r.stage.type === 'timed');
          if (first && first.start) {
            const total = sched.rows.filter((r) => r.stage.phase === 'invest' && r.stage.type === 'timed').reduce((a, r) => a + E.minutesOf(r.stage), 0);
            body += '<div class="subtimer">Since powder added: <span class="mono">' + c.L('mixElapsed', U.shortTimer(now - first.start)) + '</span> / ' + h(U.dur(total)) + ' total</div>';
          }
        }
        if (isVac) {
          if (overdue) {
            todo = fill('Post-pour vacuum complete. Switch the vacuum off.', vars, c);
            actions = btn('mark', 'SWITCH VACUUM OFF', 'primary xl', 'vacuum_off');
          } else {
            todo = fill('Keep vacuum running.', vars, c);
            actions = btn('mark', 'Vacuum off early', 'ghost', 'vacuum_off');
          }
          const poured = sched.facts.marks.pour_started;
          if (poured) body += '<div class="subtimer">Pour started ' + h(U.clock(poured, now)) + '</div>';
        } else if (isCooling) {
          if (overdue || row.remaining <= 0) {
            todo = fill('Initial cooling period complete. Decide whether the casting is ready to quench — the timer cannot tell you that.', vars, c);
            actions = '<div class="row2">' + btn('mark', 'QUENCH NOW', 'primary xl', 'quench') + btn('extend', 'WAIT LONGER +5 MIN', 'secondary xl', 5) + '</div>';
          } else {
            body = '<div class="banner-warn">DO NOT QUENCH YET</div>' + body;
            actions = extendRow(s) + btn('mark', 'Quench early', 'ghost', 'quench');
          }
        } else {
          actions = btn('complete', h(s.completeLabel || 'COMPLETE NOW'), (overdue || kiln ? 'primary' : 'secondary') + ' xl');
          if (kiln) actions = btn('complete', 'Kiln already moved on — complete now', 'ghost') + btn('kilnSyncOpen', 'Kiln is on a different step…', 'ghost');
          actions = extendRow(s) + actions;
          if (!kiln) actions += row.paused ? btn('resume', '▶ Resume tracking', 'ghost') : btn('pause', 'Pause tracking', 'ghost');
          if (!kiln) actions += '<p class="hint">Pause tracking only pauses this timer — not any equipment.</p>';
        }
        break;
      }

      case 'temperature_wait': {
        timerHtml = '<div class="timer">' + c.L('timer', U.hms(now - row.start)) + '</div><div class="timer-label">waiting for kiln</div>';
        body += '<div class="times"><span>Started ' + h(U.clock(row.start, now)) + '</span><span>Est. ' + h(U.dur(s.minutes)) + ' → ≈ ' + h(U.clock(row.start + s.minutes * MIN, now)) + '</span></div>';
        body += '<p class="hint">Cool-down time depends on your kiln. The estimate is only used for planning.</p>';
        if (s.notes) body += '<p class="hint">' + h(s.notes) + '</p>';
        actions = btn('complete', h((s.completeLabel || 'Kiln at casting temperature').toUpperCase()) + ' (' + h(t) + '°C)', 'primary xl');
        break;
      }

      case 'soak': {
        if (flask.needsConfirm) {
          body += '<div class="warnbox"><strong>Scheduled only.</strong> The cool-down ramp has reached its scheduled end, but the app cannot see the kiln. Confirm the kiln display shows ' + h(t) + '°C.</div>';
          actions += btn('flaskConfirm', 'At ' + h(t) + '°C since scheduled time', 'secondary', 'scheduled') + btn('flaskConfirm', 'FLASK AT TARGET TEMPERATURE NOW (restart soak)', 'primary', 'now');
        }
        if (!flask.timeReached) {
          timerHtml = '<div class="timer">' + c.L('timer', U.hms(flask.remaining)) + '</div><div class="timer-label">remaining</div>';
          body += '<div class="banner-warn">Do not cast until this reaches zero.</div>';
          if (!s.doNow) todo = fill('Leave the flask in the kiln at {targetC}°C.', vars, c);
        } else {
          timerHtml = '<div class="timer ok">' + c.L('timer', U.hms(flask.elapsed)) + '</div><div class="timer-label">at ' + h(t) + '°C for</div>';
          body = '<div class="banner-ok">FLASK READY</div>' + body;
          if (!s.doNow) todo = fill('Flask ready for casting. Keep it in the kiln until the metal and vacuum machine are ready.', vars, c);
        }
        if (metal.status === 'idle' && metal.startIn != null && metal.startIn <= 0) {
          todo = '<strong>Start the ' + h(metal.name) + ' furnace.</strong><br>The flask will complete its required ' + h(t) + '°C soak in approximately ' + c.L('todoSoak', U.durCompact(Math.max(0, flask.remaining))) + '.';
        }
        body += '<div class="times"><span>Soak started ' + h(U.clock(row.start, now)) + '</span><span>Ready ' + h(U.clock(flask.readyAt, now)) + '</span></div>';
        body += minLine(s);
        const ready = flask.ready && metal.status === 'ready';
        if (ready) {
          body += '<div class="readylist"><div class="eyebrow">READY TO CAST</div>' +
            '<div>Flask: ' + h(t) + '°C ✓</div><div>Flask soak: ' + c.L('soakFor', U.durCompact(flask.elapsed)) + ' ✓</div>' +
            '<div>' + h(metal.name) + ': ' + h(metal.targetC) + '°C ✓ <span class="muted">(confirmed ' + h(U.clock(metal.readyAt, now)) + ')</span></div></div>';
          actions += btn('complete', 'CONTINUE TO CASTING →', 'primary xl');
        } else if (!flask.needsConfirm) {
          const waiting = [];
          if (!flask.timeReached) waiting.push('flask soak');
          if (metal.status !== 'ready') waiting.push('metal confirmation');
          actions += '<button type="button" class="btn primary xl" disabled>Casting unlocks after: ' + h(waiting.join(' + ')) + '</button>' +
            btn('completeAnyway', 'Continue to casting anyway…', 'ghost', waiting.join(' + '));
        }
        const prep = run.profile.stages.find((x) => x.role === 'cast_prep');
        if (prep && prep.checklist && prep.checklist.length) {
          const pr = checklistProgress(run, prep);
          body += '<details class="meanwhile"><summary>While you wait: prepare the vacuum machine (' + pr.done + '/' + pr.n + ')</summary>' + checklist(run, prep) + '</details>';
        }
        break;
      }

      case 'cast_prep': {
        const soakRow = sched.rows[flask.index];
        timerHtml = '';
        body += '<div class="readylist"><div class="eyebrow">READY TO CAST</div>' +
          '<div>Flask: ' + h(flask.targetC) + '°C ✓</div>' +
          (soakRow ? '<div>Flask soak: ' + h(U.durCompact(soakRow.end - soakRow.start)) + ' ✓ · still in kiln ' + c.L('stillIn', U.hms(now - soakRow.start)) + '</div>' : '') +
          '<div>' + h(metal.name) + ': ' + h(metal.targetC) + '°C ' + (metal.status === 'ready' ? '✓' : '—') + '</div></div>';
        body += '<div class="eyebrow">Vacuum machine ready?</div>' + checklist(run, s);
        actions = btn('complete', 'CONFIRM — VACUUM MACHINE READY', 'primary xl');
        break;
      }

      case 'cast_sequence':
        return castSequence(run, sched, row, metal, flask, now, c);

      case 'finish':
        return finishCard(app, run, sched, row, now, c);

      default: {
        // manual / checkpoint
        timerHtml = '<div class="timer small">' + c.L('timer', U.hms(now - row.start)) + '</div><div class="timer-label">elapsed' + (s.minutes ? ' · est. ' + h(U.dur(s.minutes)) : '') + '</div>';
        if (s.role === 'measure') {
          body += '<div class="measure"><div><span class="k">Water</span><span class="v">' + h(vars.waterMl) + ' ml</span></div><div><span class="k">Powder</span><span class="v">' + h(vars.powderG) + ' g</span></div><div><span class="k">Ratio</span><span class="v">' + h(vars.waterRatioPct) + ':100</span></div></div>';
          const wr = run.profile.params.waterRatioPct;
          if (wr) body += '<div class="provrow">' + prov(wr.sourceType, 'Ratio') + '</div>';
          if (wr && P.outOfRange(wr)) body += '<div class="refline">⚠ Stronger than the datasheet range (' + h(wr.range[0]) + '–' + h(wr.range[1]) + ':100): thicker slurry, less working time. Keep to the mixing times.</div>';
        }
        body += checklist(run, s);
        if (s.role === 'kiln_start') body += kilnProgramBlock(run.profile, true);
        const pr = checklistProgress(run, s);
        const label = h(s.completeLabel || 'DONE — NEXT STEP');
        actions = btn('complete', label + (pr && pr.done < pr.n ? ' <small>(' + pr.done + '/' + pr.n + ' ticked)</small>' : ''), 'primary xl');
      }
    }

    let html = '<section class="card stage type-' + h(s.type) + (overdue && !kiln ? ' is-overdue' : '') + (kiln ? ' is-kiln' : '') + '">';
    html += '<div class="todo"><div class="eyebrow">WHAT TO DO NOW</div><p>' + todo + '</p></div>';
    html += '<div class="eyebrow">' + h(stepLabel) + (kiln ? ' · <span class="tag">KILN PROGRAMME</span>' : '') + '</div>';
    html += '<h1 class="stage-name">' + h(stageTitle(run, i)) + '</h1>';
    html += tempHtml + timerHtml + body;
    if (s.warning && s.role !== 'cooling') html += '<div class="banner-warn">' + h(s.warning) + '</div>';
    if (s.instructions) html += '<p class="instructions">' + fill(s.instructions, vars) + '</p>';
    html += provRow(s);
    html += '<div class="actions">' + actions + '</div>';
    html += '</section>';
    return html;
  }

  function castSequence(run, sched, row, metal, flask, now, c) {
    const m = sched.facts.marks;
    const soakRow = sched.rows[flask.index];
    let html = '';
    if (m.flask_removed) {
      html += '<section class="card flask-out"><div class="eyebrow">FLASK OUT OF KILN</div><div class="timer hot">' + c.L('flaskOut', U.hms(now - m.flask_removed)) + '</div><div class="timer-label">counting up — keep moving</div></section>';
    }
    const steps = [
      { n: 1, title: 'Leave flask in kiln', text: 'Keep the flask at casting temperature until everything else is ready.', done: true },
      { n: 2, title: 'Prepare vacuum casting machine', text: 'Checklist confirmed.', done: true },
      { n: 3, title: 'Prepare metal', text: metal.status === 'ready' ? metal.name + ' at ' + metal.targetC + '°C — confirmed ' + U.clock(metal.readyAt, now) : 'Confirm the metal is at pour temperature.', done: metal.status === 'ready', key: 'metal' },
      { n: 4, title: 'Remove flask from kiln', key: 'flask_removed', label: 'FLASK REMOVED' },
      { n: 5, title: 'Place flask on vacuum table', key: 'flask_seated', label: 'FLASK SEATED' },
      { n: 6, title: 'Start vacuum', key: 'vacuum_on', label: 'VACUUM ON', text: 'Confirm adequate vacuum before pouring.' },
      { n: 7, title: 'Pour ' + (metal.name || 'metal'), key: 'pour_started', label: 'POUR STARTED', text: 'Keep vacuum running.' },
    ];
    let activeFound = false;
    html += '<section class="card"><div class="eyebrow">CASTING SEQUENCE' + (soakRow && soakRow.end ? ' · flask soaked ' + h(U.durCompact(soakRow.end - soakRow.start)) : '') + '</div>';
    steps.forEach((st) => {
      let isDone = st.done;
      if (st.key && st.key !== 'metal') isDone = m[st.key] != null;
      const active = !isDone && !activeFound;
      if (active) activeFound = true;
      html += '<div class="seq' + (isDone ? ' done' : '') + (active ? ' active' : '') + '"><div class="seq-n">' + (isDone ? '✓' : st.n) + '</div><div class="seq-body"><div class="seq-title">' + h(st.title) + '</div>' +
        (st.text ? '<div class="seq-text">' + h(st.text) + '</div>' : '') +
        (st.key && m[st.key] ? '<div class="seq-text">' + h(U.clock(m[st.key], now)) + '</div>' : '');
      if (active) {
        if (st.key === 'metal') html += btn('metalReady', h(metal.name).toUpperCase() + ' AT POUR TEMPERATURE', 'primary xl');
        else html += btn('mark', st.label, 'primary xl', st.key);
      }
      html += '</div></div>';
    });
    html += '</section>';
    return html;
  }

  function finishCard(app, run, sched, row, now, c) {
    const m = sched.facts.marks;
    const d = run.resultDraft || {};
    let html = '<section class="card"><div class="eyebrow">CASTING COMPLETE</div><h1 class="stage-name">Quench & record results</h1>';
    html += '<div class="times"><span>Poured ' + h(U.clock(m.pour_started, now)) + '</span><span>Quenched ' + h(U.clock(m.quench, now)) + '</span></div>';
    html += '<div class="eyebrow">FOLLOW-UP</div>' + checklist(run, row.stage);
    html += resultForm('run', d);
    html += btn('completeRun', 'SAVE RESULTS & COMPLETE RUN', 'primary xl') + '</section>';
    return html;
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
      field('Actual flask temp (°C)', '<input type="number" inputmode="decimal" data-type="number" data-bind="' + bind + 'actualFlaskC" value="' + h(d.actualFlaskC == null ? '' : d.actualFlaskC) + '">') +
      field('Actual pour temp (°C)', '<input type="number" inputmode="decimal" data-type="number" data-bind="' + bind + 'actualPourC" value="' + h(d.actualPourC == null ? '' : d.actualPourC) + '">') +
      '</div>';
    return html;
  }

  function metalPanel(run, metal, flask, now, c) {
    let html = '<section class="card metal"><div class="dual">';
    // Flask side
    html += '<div class="side"><div class="eyebrow">FLASK</div><div class="side-temp">' + h(P.targetOf(run.profile, flask.index)) + '°C</div>';
    if (flask.active) {
      if (flask.timeReached) html += '<div class="side-status ok">' + (flask.needsConfirm ? 'Confirm temp' : 'Ready ✓') + '</div>';
      else html += '<div class="side-status">Ready in <span class="mono">' + c.L('mFlask', U.hms(flask.remaining)) + '</span></div>';
    } else if (flask.done) {
      html += '<div class="side-status ok">Soaked ✓</div>';
    } else {
      html += '<div class="side-status">Ready ≈ ' + h(U.clock(metal.soakReadyAt, now)) + ' <em>(est.)</em></div>';
    }
    html += '</div>';
    // Metal side
    html += '<div class="side"><div class="eyebrow">' + h((metal.name || 'METAL').toUpperCase()) + '</div><div class="side-temp">' + h(metal.targetC) + '°C</div>';
    if (metal.status === 'idle') html += '<div class="side-status">Not started</div>';
    else if (metal.status === 'heating') html += '<div class="side-status">Heating since ' + h(U.clock(metal.startedAt, now)) + '</div>';
    else html += '<div class="side-status ok">At pour temp ✓</div>';
    html += '</div></div>';

    if (metal.status === 'idle') {
      if (metal.startIn > 0) {
        html += '<div class="metal-call">Start ' + h(metal.name) + ' furnace in<div class="timer">' + c.L('mStart', U.hms(metal.startIn)) + '</div><div class="timer-label">at ' + h(U.clock(metal.recommendedStart, now)) + (metal.estimated ? ' · estimate — depends on actual cool-down' : '') + '</div></div>';
        html += btn('metalStart', 'START METAL MELT', 'secondary xl');
      } else {
        html += '<div class="metal-call now">START ' + h((metal.name || 'metal').toUpperCase()) + ' FURNACE NOW' + (metal.startIn < -60000 ? '<div class="timer-label">recommended ' + h(U.clock(metal.recommendedStart, now)) + '</div>' : '') + '</div>';
        html += btn('metalStart', 'START METAL MELT', 'primary xl');
      }
    } else if (metal.status === 'heating') {
      const left = metal.expectedReadyAt - now;
      if (left > 0) {
        html += '<div class="metal-call">Expected metal readiness in<div class="timer">' + c.L('mReady', U.hms(left)) + '</div><div class="timer-label">≈ ' + h(U.clock(metal.expectedReadyAt, now)) + ' · estimate, not a measurement</div></div>';
      } else {
        html += '<div class="metal-call now">EXPECTED METAL READINESS<div class="timer-label">Check the temperature before confirming.</div></div>';
      }
      html += btn('metalReady', h((metal.name || 'metal').toUpperCase()) + ' AT POUR TEMPERATURE', left > 0 ? 'secondary xl' : 'primary xl');
    } else {
      html += '<p class="muted">Confirmed at ' + h(metal.targetC) + '°C at ' + h(U.clock(metal.readyAt, now)) + '.</p>';
    }
    html += '<div class="provrow">' + prov(run.profile.params.metalTargetC && run.profile.params.metalTargetC.sourceType, 'Pour temp') + prov(run.profile.params.metalHeatMinutes && run.profile.params.metalHeatMinutes.sourceType, 'Heat-up ' + U.dur(metal.heatMinutes)) + '</div>';
    if (metal.status !== 'idle') html += btn('metalReset', 'Reset metal status', 'ghost small');
    html += '</section>';
    return html;
  }

  // ------------------------------------------------------------ TIMELINE

  function renderTimeline(app, now) {
    const c = ctx();
    const run = app.activeRun();
    if (!run) return { html: '<section class="card"><h2>No active run</h2><p>The timeline appears once you create a run.</p>' + btn('newRun', 'Start new run', 'primary') + '</section>', live: c.live };
    const sched = E.schedule(run, now);
    const metal = E.metalInfo(run, sched, now);
    const flask = E.flaskInfo(run, sched, now);
    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state">' + h(E.runState(run, sched, now).replace(/_/g, ' ')) + '</span></div>';

    // Key milestones
    const castRow = sched.rows[E.planAnchorIndex(run.profile)];
    html += '<section class="card milestones">';
    if (flask.index >= 0) html += '<div><span class="k">Flask ready</span><span class="v">' + (flask.done ? '✓' : h(U.clock(metal.soakReadyAt, now)) + (metal.estimated ? ' <em>est.</em>' : '')) + '</span></div>';
    if (metal.status === 'idle' && metal.recommendedStart && !metal.poured) html += '<div><span class="k">Start ' + h(metal.name) + ' furnace</span><span class="v">' + h(U.clock(metal.recommendedStart, now)) + (metal.estimated ? ' <em>est.</em>' : '') + '</span></div>';
    if (castRow && castRow.status !== 'done') html += '<div><span class="k">Ready to cast</span><span class="v">' + h(U.clock(castRow.start, now)) + ' <em>est.</em></span></div>';
    if (run.plan && run.plan.castAt) html += '<div><span class="k">Planned casting time</span><span class="v">' + h(U.clock(run.plan.castAt, now)) + '</span></div>';
    html += '<div class="row2">' + btn('exportIcs', '📅 Add alarms to calendar', 'ghost') + (run.status === 'draft' ? btn('planOpen', 'Plan from casting time', 'ghost') : '') + '</div>';
    html += '<p class="hint">Calendar alarms ring even when this page is asleep — use them for overnight burnouts.</p></section>';

    let phase = null;
    html += '<section class="card timeline">';
    sched.rows.forEach((row) => {
      const s = row.stage;
      if (s.phase !== phase) {
        phase = s.phase;
        html += '<div class="tl-phase">' + h(P.PHASES[phase] || phase) + '</div>';
      }
      const icon = row.status === 'done' ? '✓' : row.status === 'active' ? '▶' : '○';
      let right = '';
      if (row.status === 'done') {
        const actual = row.end - row.start;
        let dev = '';
        if (E.hasTimer(s) && row.scheduledEnd != null) {
          const delta = Math.round((row.end - row.scheduledEnd) / MIN);
          if (Math.abs(delta) >= 1) dev = ' <span class="dev">' + (delta > 0 ? '+' : '') + delta + ' min</span>';
        }
        if (row.ext) dev += ' <span class="dev">ext ' + (row.ext > 0 ? '+' : '') + row.ext + '</span>';
        right = h(U.clock(row.start, now)) + '–' + h(U.clock(row.end, now)) + ' · ' + h(U.durCompact(actual)) + dev + (row.doneBy === 'schedule' ? ' <em>sched.</em>' : '');
      } else if (row.status === 'active') {
        if (E.hasTimer(s)) right = row.overdue > 0 && s.control !== 'kiln' ? '<strong class="over">+' + c.L('tl_active', U.hms(row.overdue)) + ' over</strong>' : '<strong>' + c.L('tl_active', U.hms(Math.max(0, row.remaining))) + '</strong> remaining';
        else right = '<strong>' + c.L('tl_active', U.hms(now - row.start)) + '</strong> elapsed';
        right += '<br>Started ' + h(U.clock(row.start, now)) + ' · ends ' + (row.estimate ? '≈ ' : '') + h(U.clock(row.end, now));
      } else {
        right = 'Starts ' + h(U.clock(row.start, now)) + '<br>Ends ' + h(U.clock(row.end, now)) + ' · ' + h(U.dur(s.minutes, s.unit)) + (row.estimate ? ' <em>est.</em>' : '');
      }
      const t = P.targetOf(run.profile, row.i);
      html += '<div class="tl-row ' + row.status + '"><div class="tl-icon">' + icon + '</div><div class="tl-main"><div class="tl-name">' + h(s.short || s.name) + (t != null && ['ramp', 'hold', 'soak', 'temperature_wait'].includes(s.type) && !/°C/.test(s.short || s.name) ? ' <span class="muted">' + h(t) + '°C</span>' : '') + (s.control === 'kiln' ? ' <span class="tag">kiln</span>' : '') + '</div><div class="tl-times">' + right + '</div></div></div>';
    });
    html += '</section>';
    return { html, live: c.live };
  }

  // ----------------------------------------------------------------- RUN

  function field(label, input, hint) {
    return '<label class="field"><span class="label">' + label + '</span>' + input + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>';
  }

  function numInput(bind, value, attrs) {
    return '<input type="number" inputmode="decimal" step="any" data-type="number" data-bind="' + h(bind) + '" value="' + h(value == null ? '' : value) + '"' + (attrs || '') + '>';
  }

  function paramField(scope, p, key, opts) {
    const par = p.params[key];
    if (!par) return '';
    opts = opts || {};
    return field(h(par.label) + ' <small>' + h(par.unit) + '</small>',
      numInput(scope + '|params.' + key + '.value', par.value, opts.disabled ? ' disabled' : ''),
      prov(par.sourceType) + (par.note ? ' ' + h(par.note) : '') + (par.ref != null && Number(par.ref) !== Number(par.value) ? ' <strong>Datasheet: ' + h(par.ref) + '</strong>' : ''));
  }

  function renderRun(app, now) {
    const c = ctx();
    const run = app.activeRun();
    if (!run) {
      return { html: '<section class="card"><h2>No active run</h2><p>Create a run to enter the flask, investment and metal values for this casting.</p>' + btn('newRun', 'Start new run', 'primary xl') + '</section>', live: c.live };
    }
    const p = run.profile;
    const calc = E.calculator(p, run.values.displacementMl);
    const sched = E.schedule(run, now);
    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state">' + (run.status === 'draft' ? 'DRAFT' : 'ACTIVE') + '</span></div>';
    if (run.status === 'draft') html += '<section class="card">' + btn('startRun', 'START RUN NOW', 'primary xl') + '<p class="hint">Starting records the time and begins step 1 (prepare resin tree).</p></section>';

    html += '<section class="card"><h2>Run</h2>' +
      field('Run name', '<input type="text" data-bind="run|name" value="' + h(run.name) + '">') +
      field('Model / tree', '<input type="text" data-bind="run|values.modelName" value="' + h(run.values.modelName) + '" placeholder="e.g. Dunrobin Castle tower">') +
      '<div class="grid2">' +
      field('Investment', '<input type="text" data-bind="run|profile.materials.investment" value="' + h(p.materials.investment) + '">') +
      field('Resin', '<input type="text" data-bind="run|profile.materials.resin" value="' + h(p.materials.resin) + '">') +
      '</div>' +
      field('Notes', '<textarea rows="3" data-bind="run|values.notes">' + h(run.values.notes) + '</textarea>') +
      '<p class="hint">Profile: ' + h(run.profileName) + '. Changes here apply to this run only.</p></section>';

    html += '<section class="card"><h2>Flask & investment</h2><div class="calc-out">' +
      '<div><span class="k">Water</span><span class="v big">' + c.L('calcWater', calc.waterMl + ' ml') + '</span></div>' +
      '<div><span class="k">Powder</span><span class="v big">' + c.L('calcPowder', calc.powderG + ' g') + '</span></div></div>' +
      '<p class="hint"><strong>Working starting quantity — adjust after measuring actual usage.</strong> Measure water first, add powder to water.</p>' +
      mixRatios(p) +
      '<div class="grid2">' + paramField('run', p, 'powderG') + paramField('run', p, 'waterRatioPct') + '</div>' +
      '<div class="grid2">' + paramField('run', p, 'flaskDiameterMm') + paramField('run', p, 'flaskHeightMm') + '</div>' +
      field('Model / tree displacement <small>ml (optional)</small>', numInput('run|values.displacementMl', run.values.displacementMl)) +
      '<div class="calc-est"><div>Flask volume <strong>' + c.L('calcVol', calc.flaskVolumeCm3 + ' cm³') + '</strong></div><div>Net of displacement <strong>' + c.L('calcNet', calc.netVolumeCm3 + ' cm³') + '</strong></div>' +
      '<div>Estimated powder to fill <strong>' + c.L('calcEst', calc.estimatedPowderG + ' g / ' + calc.estimatedWaterMl + ' ml') + '</strong> ' + prov(p.params.powderPerCm3 && p.params.powderPerCm3.sourceType) + '</div></div>' +
      paramField('run', p, 'powderPerCm3') +
      '</section>';

    html += '<section class="card"><h2>Metal</h2>' +
      field('Metal alloy', '<input type="text" data-bind="run|profile.materials.metal" value="' + h(p.materials.metal) + '">') +
      '<div class="grid2">' + paramField('run', p, 'metalTargetC') + paramField('run', p, 'metalHeatMinutes') + '</div>' +
      '<div class="grid2">' + paramField('run', p, 'metalWeightG') + paramField('run', p, 'metalReadyOffsetMinutes') + '</div>' +
      '</section>';

    html += '<section class="card"><h2>Plan from casting time</h2>' + planBlock(run, now) + '</section>';

    html += '<section class="card"><h2>Temperatures & durations</h2><p class="hint">Change any value — every later clock time updates immediately. Completed stages are locked.</p>';
    let phase = null;
    p.stages.forEach((s, i) => {
      if (s.phase !== phase) { phase = s.phase; html += '<div class="tl-phase">' + h(P.PHASES[phase] || phase) + '</div>'; }
      const row = sched.rows[i];
      html += stageEditRow('run', s, i, row.status === 'done', row);
    });
    html += '</section>';

    html += '<section class="card"><h2>Kiln controller</h2>' + kilnProgramBlock(p, false) + paramField('run', p, 'controllerHoldBufferMinutes') + '</section>';

    html += '<section class="card"><h2>Export</h2><div class="row2">' + btn('exportRun', 'Export run as JSON', 'ghost') + btn('exportIcs', '📅 Calendar alarms (.ics)', 'ghost') + '</div>' +
      '<div class="danger-zone">' + btn('abandonRun', run.status === 'draft' ? 'Discard draft' : 'Abandon run', 'danger') + '</div></section>';
    return { html, live: c.live };
  }

  /** Water needed at each common ratio for the current powder quantity; tap one to use it. */
  function mixRatios(p) {
    const par = p.params.waterRatioPct;
    if (!par) return '';
    const powder = U.num(P.param(p, 'powderG'), 0);
    const cur = Number(par.value);
    const opts = (par.options || [36, 38, 40]).slice();
    if (!opts.includes(cur)) opts.push(cur);
    opts.sort((a, b) => a - b);
    const label = (r) => {
      if (Number(r) === Number(par.ref)) return 'Datasheet — conventional mix';
      if (par.range && r >= par.range[0] && r <= par.range[1]) return 'Datasheet vacuum-mix range';
      return 'Stronger than datasheet · experimental';
    };
    let html = '<div class="eyebrow">MIX RATIO — water for ' + h(powder) + ' g powder</div><div class="ratios">';
    opts.forEach((r) => {
      const on = Number(r) === cur;
      html += '<button type="button" class="ratio' + (on ? ' on' : '') + '" data-action="setRatio" data-arg="' + h(r) + '" aria-pressed="' + on + '">' +
        '<span class="r">' + h(r) + ':100</span><span class="w">' + h(U.round(powder * r / 100, 1)) + ' ml</span><span class="l">' + (on ? '✓ ' : '') + h(label(r)) + '</span></button>';
    });
    html += '</div>';
    if (P.outOfRange(par)) html += '<div class="refline">⚠ ' + h(cur) + ':100 is outside the Protocast datasheet range (' + h(par.range[0]) + '–' + h(par.range[1]) + ':100). Expect a thicker slurry and shorter working time — vacuum well and work quickly.</div>';
    return html;
  }

  function stageEditRow(scope, s, i, locked, row) {
    const dis = locked ? ' disabled' : '';
    const pv = s.provenance || {};
    const isSec = s.unit === 's';
    let html = '<div class="stage-edit' + (locked ? ' locked' : '') + (row && row.status === 'active' ? ' active' : '') + '"><div class="se-name">' + (locked ? '✓ ' : row && row.status === 'active' ? '▶ ' : '') + h(s.name) + (s.control === 'kiln' ? ' <span class="tag">kiln</span>' : '') + '</div><div class="se-fields">';
    const durLabel = E.hasTimer(s) ? (isSec ? 'Seconds' : 'Minutes') : (isSec ? 'Est. seconds' : 'Est. minutes');
    html += '<label class="mini"><span>' + durLabel + '</span><input type="number" inputmode="decimal" step="any" data-type="' + (isSec ? 'seconds' : 'number') + '" data-bind="' + scope + '|profile.stages.' + i + '.minutes" value="' + h(isSec ? Math.round(s.minutes * 60) : s.minutes) + '"' + dis + '></label>';
    if (s.targetC != null || ['ramp', 'hold', 'temperature_wait'].includes(s.type)) {
      html += '<label class="mini"><span>Target °C</span><input type="number" inputmode="decimal" step="any" data-type="number" data-bind="' + scope + '|profile.stages.' + i + '.targetC" value="' + h(s.targetC == null ? '' : s.targetC) + '"' + dis + ' placeholder="inherit"></label>';
    }
    if (s.minMinutes != null) html += '<label class="mini"><span>Minimum</span><input type="number" value="' + h(s.minMinutes) + '" disabled></label>';
    if (s.role === 'cool_to_cast') {
      html += '<label class="mini wide"><span>Mode</span><select data-bind="' + scope + '|coolMode:' + i + '"' + dis + '>' +
        '<option value="wait"' + (s.type === 'temperature_wait' ? ' selected' : '') + '>Wait for kiln (you confirm)</option>' +
        '<option value="ramp"' + (s.type === 'ramp' ? ' selected' : '') + '>Scheduled ramp (kiln programme)</option></select></label>';
    }
    html += '</div>';
    if (s.minMinutes != null && Number(s.minutes) < Number(s.minMinutes)) html += '<div class="refline">⚠ Below the minimum of ' + h(U.dur(s.minMinutes)) + (pv.minimum === 'manufacturer' ? ' (manufacturer)' : '') + '</div>';
    html += '<div class="provrow">' + (pv.target && s.targetC != null ? prov(pv.target, 'Temp') : '') + (pv.duration ? prov(pv.duration, E.hasTimer(s) ? 'Time' : 'Estimate') : '') + (pv.minimum ? prov(pv.minimum, 'Min') : '') + '</div>' + refLine(s) + '</div>';
    return html;
  }

  function planBlock(run, now) {
    const castAt = run.plan && run.plan.castAt;
    let html = field('I want to cast at', '<input type="datetime-local" data-bind="run|plan.castAt" data-type="datetime" value="' + (castAt ? U.toLocalInput(castAt) : '') + '">',
      'Works backwards through every stage. Cool-down and manual steps use estimates.');
    if (!castAt) return html + '<div class="row2">' + btn('planPreset', 'Tomorrow 09:00', 'ghost', '09:00') + btn('planPreset', 'Tomorrow 10:00', 'ghost', '10:00') + '</div>';
    if (run.status === 'draft') {
      const plan = E.planFromCastTime(run.profile, run.values, castAt, now);
      if (plan.tooLate) html += '<p class="warnbox">Too soon. Earliest casting time if you start now: <strong>' + h(U.clock(plan.earliest, now)) + '</strong>.</p>';
      html += '<table class="plan"><tbody>' +
        '<tr><th>Start run (prepare tree)</th><td>' + h(U.clock(plan.startAt, now)) + '</td></tr>' +
        '<tr><th>Start investing</th><td>' + h(U.clock(plan.investAt, now)) + '</td></tr>' +
        '<tr><th>Flask into kiln · start programme</th><td>' + h(U.clock(plan.kilnStartAt, now)) + '</td></tr>' +
        '<tr><th>Reach casting temp · start soak</th><td>' + h(U.clock(plan.soakStartAt, now)) + ' <em>est.</em></td></tr>' +
        '<tr><th>Start ' + h(run.profile.materials.metal) + ' furnace</th><td>' + h(U.clock(plan.metalStartAt, now)) + ' <em>est.</em></td></tr>' +
        '<tr><th>Flask ready · cast</th><td><strong>' + h(U.clock(plan.flaskReadyAt, now)) + '</strong></td></tr>' +
        '</tbody></table><p class="hint">The 750 → casting-temperature cool-down depends on your kiln; its time is an estimate.</p>';
    } else {
      const sched = E.schedule(run, now);
      const castRow = sched.rows[E.planAnchorIndex(run.profile)];
      const diff = Math.round((castRow.start - castAt) / MIN);
      html += '<p>Projected ready to cast: <strong>' + h(U.clock(castRow.start, now)) + '</strong> ' + (diff === 0 ? '(on plan)' : '(' + (diff > 0 ? diff + ' min later' : -diff + ' min earlier') + ' than planned)') + '</p>';
    }
    html += btn('planClear', 'Clear plan', 'ghost small');
    return html;
  }

  // ------------------------------------------------------------- HISTORY

  function renderHistory(app, now) {
    const c = ctx();
    if (app.historyRunId) return { html: historyDetail(app, now), live: c.live };
    const runs = app.runs.filter((r) => r.status === 'complete' || r.status === 'abandoned').slice().reverse();
    let html = '<section class="card"><h2>History</h2><div class="row2">' + btn('exportHistory', 'Export all history (JSON)', 'ghost') + '<label class="btn ghost file">Import JSON<input type="file" accept="application/json,.json" data-action-change="importFile" hidden></label></div></section>';
    if (!runs.length) return { html: html + '<section class="card"><p>No finished runs yet. Completed casts and their results appear here.</p></section>', live: c.live };

    const recs = runs.map((r) => ({ run: r, rec: E.record(r) }));
    html += '<section class="card"><h2>Compare runs</h2><div class="table-wrap"><table class="compare"><thead><tr><th>Run</th><th>Mix</th><th>Flask</th><th>Metal</th><th>Peak hold</th><th>Soak</th><th>Result</th></tr></thead><tbody>' +
      recs.map(({ run, rec }) => '<tr data-action="historyOpen" data-arg="' + h(run.id) + '"><td><strong>' + h(run.name) + '</strong><br><small>' + h(rec.date) + '</small></td><td>' + h(rec.waterRatioPct) + ':100</td><td>' + h(rec.flaskCastingTempC) + '°C</td><td>' + h(rec.metalPourTempC) + '°C</td><td>' + h(U.dur(rec.peakHoldMinutes)) + '</td><td>' + h(U.dur(rec.soakMinutes)) + '</td><td>' + (run.status === 'abandoned' ? 'abandoned' : rec.rating ? h(rec.rating) + '/5' : '—') + '</td></tr>').join('') +
      '</tbody></table></div></section>';

    html += recs.map(({ run, rec }) => '<button type="button" class="card listcard" data-action="historyOpen" data-arg="' + h(run.id) + '"><div class="lc-top"><strong>' + h(run.name) + '</strong><span>' + (rec.rating ? '★'.repeat(rec.rating) + '☆'.repeat(5 - rec.rating) : run.status === 'abandoned' ? 'abandoned' : '') + '</span></div>' +
      '<div class="muted">' + h(rec.date) + ' · ' + h(rec.metal) + ' · flask ' + h(rec.flaskCastingTempC) + '°C · pour ' + h(rec.metalPourTempC) + '°C</div>' +
      (rec.defects && rec.defects.length ? '<div class="defect-tags">' + rec.defects.map((d) => '<span class="tag">' + h(d) + '</span>').join('') + '</div>' : '') + '</button>').join('');
    return { html, live: c.live };
  }

  function historyDetail(app, now) {
    const run = app.runs.find((r) => r.id === app.historyRunId);
    if (!run) return '<section class="card"><p>Run not found.</p>' + btn('historyBack', '← Back', 'ghost') + '</section>';
    const rec = E.record(run);
    const devs = E.deviations(run);
    const info = E.runtime(run);
    let html = '<div class="row2">' + btn('historyBack', '← All runs', 'ghost') + '</div>';
    html += '<section class="card"><h2>' + h(run.name) + '</h2><p class="muted">' + h(rec.date) + ' · ' + h(run.profileName) + (run.values.modelName ? ' · ' + h(run.values.modelName) : '') + '</p>' +
      '<div class="kv">' +
      kv('Investment', rec.investment) + kv('Resin', rec.resin) + kv('Powder / water', rec.powderG + ' g / ' + rec.waterMl + ' ml (' + rec.waterRatioPct + ':100)') +
      kv('Flask', rec.flaskDiameterMm + ' × ' + rec.flaskHeightMm + ' mm') + kv('Metal', rec.metal + (rec.metalWeightG ? ' · ' + rec.metalWeightG + ' g' : '')) +
      kv('Flask casting temp', rec.flaskCastingTempC + '°C') + kv('Pour temp', rec.metalPourTempC + '°C') + kv('Peak hold', rec.peakC + '°C · ' + U.dur(rec.peakHoldMinutes)) +
      kv('Flask out → pour', rec.flaskOutToPourSeconds != null ? rec.flaskOutToPourSeconds + ' s' : '—') +
      '</div>' + (run.values.notes ? '<p>' + h(run.values.notes) + '</p>' : '') + '</section>';

    html += '<section class="card"><h2>Result</h2>' + resultForm('hrun:' + run.id, run.result || {}) + '</section>';

    html += '<section class="card"><h2>Actual timeline</h2><div class="table-wrap"><table class="devs"><thead><tr><th>Stage</th><th>Start</th><th>Actual</th><th>Set</th><th>Δ</th></tr></thead><tbody>' +
      devs.map((d) => '<tr><td>' + h(d.stage.short || d.stage.name) + (d.doneBy === 'schedule' ? ' <em>sched.</em>' : '') + '</td><td>' + h(U.clock(d.start, d.end)) + '</td><td>' + h(U.durCompact(d.actualMin * MIN)) + '</td><td>' + h(U.dur(d.plannedMin, d.stage.unit)) + '</td><td>' + (d.deltaMin != null && Math.abs(d.deltaMin) >= 1 ? (d.deltaMin > 0 ? '+' : '') + Math.round(d.deltaMin) + 'm' : '') + '</td></tr>').join('') +
      '</tbody></table></div>';
    const marks = Object.keys(info.facts.marks);
    if (marks.length) html += '<div class="kv">' + marks.map((k) => kv(E.MARK_LABELS[k] || k, new Date(info.facts.marks[k]).toLocaleTimeString())).join('') + '</div>';
    if (info.facts.edits.length) html += '<details><summary>' + info.facts.edits.length + ' value change(s) during the run</summary><ul class="edits">' + info.facts.edits.map((e) => '<li>' + h(new Date(e.t).toLocaleTimeString()) + ' · ' + h(e.path) + ': ' + h(e.from) + ' → ' + h(e.to) + '</li>').join('') + '</ul></details>';
    html += '</section>';

    html += '<section class="card"><div class="row2">' + btn('exportRun', 'Export run as JSON', 'ghost', run.id) + btn('deleteRun', 'Delete run', 'danger', run.id) + '</div></section>';
    return html;
  }

  function kv(k, v) { return '<div><span class="k">' + h(k) + '</span><span class="v">' + h(v == null ? '—' : v) + '</span></div>'; }

  // ------------------------------------------------------------ SETTINGS

  function renderSettings(app, now) {
    const c = ctx();
    if (app.editProfileId) return { html: profileEditor(app), live: c.live };
    const s = app.settings;
    const A = CPT.Alerts;
    let html = '<section class="card"><h2>Alerts</h2>';
    const perm = A.permission();
    html += '<p>Notifications: <strong>' + h(perm) + '</strong></p>';
    if (perm !== 'granted' && perm !== 'unsupported') html += btn('requestNotify', 'Enable notifications', 'primary');
    if (perm === 'unsupported') html += '<p class="hint">This browser can’t show notifications here. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).</p>';
    html += '<p class="warnbox">A sleeping phone cannot run web-page timers. For overnight burnouts, use <strong>Add alarms to calendar</strong> on the Timeline screen.</p>';
    html += toggle('settings|alerts.enabled', s.alerts.enabled, 'All in-app alerts') + toggle('settings|alerts.sound', s.alerts.sound, 'Sound') + toggle('settings|alerts.vibrate', s.alerts.vibrate, 'Vibrate (where supported)');
    html += '<div class="eyebrow">INDIVIDUAL ALERTS</div>';
    Object.keys(E.ALERT_PREFS).forEach((k) => { html += toggle('settings|alerts.prefs.' + k, s.alerts.prefs[k] !== false, E.ALERT_PREFS[k]); });
    html += btn('testAlert', 'Test alert', 'ghost') + '</section>';

    html += '<section class="card"><h2>Display</h2>' +
      field('Theme', '<select data-bind="settings|theme"><option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>Dark (workshop)</option><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Light</option><option value="auto"' + (s.theme === 'auto' ? ' selected' : '') + '>Follow system</option></select>') +
      toggle('settings|wakeLock', s.wakeLock, 'Keep screen awake while the app is open' + (A.wakeLockSupported() ? '' : ' (not supported in this browser)')) + '</section>';

    html += '<section class="card"><h2>Process profiles</h2><p class="hint">New runs copy a profile. Editing a profile never changes past or active runs.</p>';
    app.profiles.forEach((p) => {
      const isDef = (s.defaultProfileId || app.profiles[0].id) === p.id;
      html += '<div class="profile-row"><div><strong>' + h(p.name) + '</strong>' + (isDef ? ' <span class="tag">default</span>' : '') + '<div class="muted">' + h(p.stages.length) + ' stages · ' + h(p.materials.metal) + '</div></div><div class="profile-actions">' +
        btn('profileEdit', 'Edit', 'ghost small', p.id) + btn('profileDup', 'Duplicate', 'ghost small', p.id) + btn('profileExport', 'Export', 'ghost small', p.id) +
        (isDef ? '' : btn('profileDefault', 'Make default', 'ghost small', p.id)) + (app.profiles.length > 1 ? btn('profileDelete', 'Delete', 'danger small', p.id) : '') + '</div></div>';
    });
    html += '<div class="row2">' + btn('profileNew', 'New from initial preset', 'ghost') + '<label class="btn ghost file">Import profile<input type="file" accept="application/json,.json" data-action-change="importProfile" hidden></label></div></section>';

    html += '<section class="card"><h2>Data & backup</h2><p class="hint">Everything is stored on this device only. Safari can clear website data you haven’t opened for 7 days — add the app to your Home Screen and export a backup regularly.</p>' +
      '<p>Storage: ' + (CPT.Storage.available ? 'browser storage' : '<strong>not available — data will be lost on reload</strong>') + (app.persisted ? ' · persistent ✓' : '') + '</p>' +
      '<div class="row2">' + btn('exportAll', 'Export full backup', 'ghost') + '<label class="btn ghost file">Restore backup<input type="file" accept="application/json,.json" data-action-change="importFile" hidden></label></div></section>';

    html += safetyCard(false);
    html += '<section class="card"><h2>About</h2><p>Lost Resin Casting Buddy v' + h(CPT.VERSION) + '. A process companion and timing dashboard — not a kiln controller.</p></section>';
    return { html, live: c.live };
  }

  function toggle(bind, on, label) {
    return '<label class="toggle"><input type="checkbox" data-type="bool" data-bind="' + h(bind) + '"' + (on ? ' checked' : '') + '><span class="track"></span><span>' + h(label) + '</span></label>';
  }

  function safetyCard(compact) {
    const notes = P.SAFETY_NOTES;
    if (compact) return '<section class="card safety"><details><summary>⚠ Safety notes</summary><ul>' + notes.map((n) => '<li>' + h(n) + '</li>').join('') + '</ul></details></section>';
    return '<section class="card safety"><h2>⚠ Safety</h2><ul>' + notes.map((n) => '<li>' + h(n) + '</li>').join('') + '</ul></section>';
  }

  function profileEditor(app) {
    const p = app.profiles.find((x) => x.id === app.editProfileId);
    if (!p) return '<section class="card"><p>Profile not found.</p>' + btn('profileClose', '← Back', 'ghost') + '</section>';
    const scope = 'profile:' + p.id;
    let html = '<div class="row2">' + btn('profileClose', '← Done', 'ghost') + '</div>';
    html += '<section class="card"><h2>Profile</h2>' + field('Name', '<input type="text" data-bind="' + scope + '|name" value="' + h(p.name) + '">');
    Object.keys(p.materials).forEach((k) => { html += field(h(k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())), '<input type="text" data-bind="' + scope + '|materials.' + h(k) + '" value="' + h(p.materials[k]) + '">'); });
    html += '</section>';

    html += '<section class="card"><h2>Settings</h2>';
    Object.keys(p.params).forEach((k) => {
      const par = p.params[k];
      html += '<div class="param-edit">' + field(h(par.label) + ' <small>' + h(par.unit) + '</small>', numInput(scope + '|params.' + k + '.value', par.value)) +
        field('Evidence', provSelect(scope + '|params.' + k + '.sourceType', par.sourceType)) + '</div>' + (par.note ? '<p class="hint">' + h(par.note) + '</p>' : '');
    });
    html += '</section>';

    html += '<section class="card"><h2>Stages</h2><p class="hint">Stage order, types, timings, temperatures and wording are all editable. “Kiln programme” stages advance on schedule; “You confirm” stages wait for a tap.</p>';
    p.stages.forEach((s, i) => { html += stageEditor(scope, p, s, i); });
    html += btn('stageInsert', '+ Add stage at end', 'ghost', p.stages.length - 1) + '</section>';
    return html;
  }

  function provSelect(bind, value) {
    return '<select data-bind="' + h(bind) + '"><option value="">—</option>' + Object.keys(P.SOURCE_TYPES).map((k) => '<option value="' + k + '"' + (value === k ? ' selected' : '') + '>' + h(P.SOURCE_TYPES[k]) + '</option>').join('') + '</select>';
  }

  function select(bind, options, value) {
    return '<select data-bind="' + h(bind) + '">' + Object.keys(options).map((k) => '<option value="' + h(k) + '"' + (value === k ? ' selected' : '') + '>' + h(options[k]) + '</option>').join('') + '</select>';
  }

  function stageEditor(scope, p, s, i) {
    const b = scope + '|stages.' + i + '.';
    const pv = s.provenance || {};
    let html = '<details class="stage-editor"><summary><span class="se-idx">' + (i + 1) + '</span> ' + h(s.name) + ' <span class="muted">· ' + h(U.dur(s.minutes, s.unit)) + (s.targetC != null ? ' · ' + h(s.targetC) + '°C' : '') + '</span></summary>';
    html += '<div class="grid2">' + field('Name', '<input type="text" data-bind="' + b + 'name" value="' + h(s.name) + '">') + field('Timeline label', '<input type="text" data-bind="' + b + 'short" value="' + h(s.short || '') + '">') + '</div>';
    html += '<div class="grid2">' + field('Phase', select(b + 'phase', P.PHASES, s.phase)) + field('Type', select(b + 'type', P.STAGE_TYPES, s.type)) + '</div>';
    html += '<div class="grid2">' + field('Control', select(b + 'control', { user: 'You confirm', kiln: 'Kiln programme (auto)' }, s.control)) + field('Duration unit', select(b + 'unit', { min: 'minutes', s: 'seconds' }, s.unit || 'min')) + '</div>';
    html += '<div class="grid3">' + field('Minutes', numInput(b + 'minutes', s.minutes)) + field('Minimum', numInput(b + 'minMinutes', s.minMinutes)) + field('Target °C', numInput(b + 'targetC', s.targetC)) + '</div>';
    html += '<div class="grid3">' + field('Time evidence', provSelect(b + 'provenance.duration', pv.duration)) + field('Minimum evidence', provSelect(b + 'provenance.minimum', pv.minimum)) + field('Temp evidence', provSelect(b + 'provenance.target', pv.target)) + '</div>';
    html += refLine(s);
    html += field('What to do now', '<textarea rows="2" data-bind="' + b + 'doNow">' + h(s.doNow || '') + '</textarea>', 'Placeholders: {targetC} {startC} {waterMl} {powderG} {waterRatioPct} {metal} {metalTargetC} {remaining}');
    html += field('Instructions', '<textarea rows="2" data-bind="' + b + 'instructions">' + h(s.instructions || '') + '</textarea>');
    html += field('Warning', '<input type="text" data-bind="' + b + 'warning" value="' + h(s.warning || '') + '">');
    html += field('Checklist (one per line)', '<textarea rows="4" data-type="lines" data-bind="' + b + 'checklist">' + h((s.checklist || []).join('\n')) + '</textarea>');
    html += '<div class="grid2">' + field('Complete button label', '<input type="text" data-bind="' + b + 'completeLabel" value="' + h(s.completeLabel || '') + '">') + field('Source', '<input type="text" data-bind="' + b + 'source" value="' + h(s.source || '') + '">') + '</div>';
    html += field('Notes', '<input type="text" data-bind="' + b + 'notes" value="' + h(s.notes || '') + '">');
    html += '<div class="eyebrow">IN-STAGE REMINDERS</div>';
    (s.events || []).forEach((ev, j) => {
      html += '<div class="grid3 ev-edit">' + field('When', select(b + 'events.' + j + '.trigger', { 'before-end': 'min before end', 'after-start': 'min after start' }, ev.trigger)) + field('Minutes', numInput(b + 'events.' + j + '.offsetMinutes', ev.offsetMinutes)) + field('Reminder', '<input type="text" data-bind="' + b + 'events.' + j + '.text" value="' + h(ev.text) + '">') + btn('eventDelete', 'Remove', 'danger small', i + ':' + j) + '</div>';
    });
    html += btn('eventAdd', '+ Add reminder', 'ghost small', i);
    html += '<div class="row3">' + btn('stageMove', '↑ Up', 'ghost small', i + ':-1') + btn('stageMove', '↓ Down', 'ghost small', i + ':1') + btn('stageInsert', '+ Insert after', 'ghost small', i) + btn('stageDelete', 'Delete stage', 'danger small', i) + '</div>';
    html += '</details>';
    return html;
  }

  // -------------------------------------------------------------- modals

  function renderModal(app, now) {
    const m = app.modal;
    if (!m) return '';
    const run = app.activeRun();
    let body = '';
    switch (m.type) {
      case 'newRun': {
        const def = app.settings.defaultProfileId || app.profiles[0].id;
        body = '<h2>New casting run</h2>' +
          field('Run name', '<input type="text" id="nr-name" value="' + h('Casting ' + U.isoDate(now)) + '">') +
          field('Model / tree', '<input type="text" id="nr-model" placeholder="optional">') +
          field('Process profile', '<select id="nr-profile">' + app.profiles.map((p) => '<option value="' + h(p.id) + '"' + (p.id === def ? ' selected' : '') + '>' + h(p.name) + '</option>').join('') + '</select>') +
          '<div class="row2">' + btn('createRun', 'Create run', 'primary xl') + btn('closeModal', 'Cancel', 'ghost') + '</div>';
        break;
      }
      case 'extend': {
        const s = run && run.profile.stages[E.currentIndex(run)];
        body = '<h2>Adjust “' + h(s ? s.name : '') + '”</h2>' + field('Add minutes (negative to shorten)', '<input type="number" inputmode="numeric" id="ext-min" value="10" step="1">') +
          (s && s.control === 'kiln' ? '<p class="hint">Change the kiln controller as well — the app can’t.</p>' : '') +
          '<div class="row2">' + btn('applyExtend', 'Apply', 'primary xl') + btn('closeModal', 'Cancel', 'ghost') + '</div>';
        break;
      }
      case 'kilnSync': {
        if (!run) break;
        const cur = E.currentIndex(run);
        const kilnStages = run.profile.stages.map((s, i) => ({ s, i })).filter((x) => x.s.control === 'kiln');
        const sel = m.selected != null ? m.selected : (kilnStages.find((x) => x.i >= cur) || kilnStages[0] || {}).i;
        body = '<h2>Where is the kiln programme?</h2><p class="hint">Pick the segment the kiln controller is showing, and how long it has left. Later times will be recalculated from this.</p><div class="choices">' +
          kilnStages.map((x) => '<button type="button" class="check' + (x.i === sel ? ' on' : '') + '" data-action="syncPick" data-arg="' + x.i + '"><span class="box">' + (x.i === sel ? '●' : '') + '</span><span>' + h(x.s.name) + ' <small class="muted">' + h(U.dur(x.s.minutes)) + '</small></span></button>').join('') + '</div>' +
          field('Minutes left in that segment', '<input type="number" inputmode="numeric" id="sync-min" value="' + h(sel != null ? run.profile.stages[sel].minutes : 0) + '">') +
          '<div class="row2">' + (sel != null ? btn('kilnSyncApply', 'Apply', 'primary xl', sel) : '') + btn('closeModal', 'Cancel', 'ghost') + '</div>';
        break;
      }
      case 'attention': {
        const a = m.data;
        body = '<div class="eyebrow warn">ATTENTION</div>';
        if (a.advanced && a.advanced.length) {
          body += '<h2>While the app was closed</h2><p>The kiln programme should have moved through:</p><ul class="adv">' + a.advanced.map((r) => '<li>✓ ' + h(r.stage.name) + ' <span class="muted">ended ' + h(U.clock(r.end, now)) + '</span></li>').join('') + '</ul>';
          if (a.current) body += '<p>It should now be in <strong>' + h(a.current.stage.name) + '</strong>' + (a.current.stage.control === 'kiln' ? ' (' + h(U.hms(Math.max(0, a.current.remaining))) + ' left)' : '') + '. <strong>Check the kiln controller.</strong></p>';
          body += '<div class="col">' + btn('attentionOk', 'KILN MATCHES — CONTINUE', 'primary xl') + btn('attentionSync', 'KILN IS ON A DIFFERENT STEP', 'secondary xl') + '</div>';
        } else if (a.overdueUser) {
          const r = a.overdueUser;
          body += '<h2>' + h(r.stage.name) + '</h2><p class="big">Scheduled stage ended ' + h(U.durCompact(r.overdue)) + ' ago.</p><p>Is it finished — are you ready to move to the next step?</p>' +
            '<div class="col">' + btn('attentionYes', 'YES — CONTINUE', 'primary xl', r.scheduledEnd) + btn('attentionNo', 'NO — STILL ON THIS STEP', 'secondary xl') + '</div>' +
            '<p class="hint">“Yes” records the stage as finished at its scheduled end (' + h(U.clock(r.scheduledEnd, now)) + ').</p>';
        }
        break;
      }
      case 'confirm':
        body = '<h2>' + h(m.title) + '</h2><p>' + h(m.text) + '</p><div class="row2">' + btn('confirmYes', h(m.yes || 'Yes'), 'danger xl') + btn('closeModal', 'Cancel', 'ghost') + '</div>';
        break;
      case 'plan':
        body = '<h2>Plan from casting time</h2>' + (run ? planBlock(run, now) : '') + '<div class="row2">' + btn('closeModal', 'Done', 'primary') + '</div>';
        break;
      case 'safety':
        body = '<h2>⚠ Before you start</h2><ul class="safety-list">' + P.SAFETY_NOTES.map((n) => '<li>' + h(n) + '</li>').join('') + '</ul>' + btn('safetyAck', 'I UNDERSTAND', 'primary xl');
        break;
      default: body = '';
    }
    return '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + body + '</div></div>';
  }

  CPT.UI = { renderNow, renderTimeline, renderRun, renderHistory, renderSettings, renderModal, describeStage };
})(globalThis.CPT = globalThis.CPT || {});
