/* Casting Process Tracker — Modal dialogs.
 * Renderers return { html, live } — see js/ui/components.js. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const { btn, field, planBlock, privacyLink } = CPT.UI.lib;

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
        body = '<h2>Adjust “' + h(s ? s.name : '') + '”</h2>' + field('Minutes', '<input type="number" inputmode="numeric" min="1" id="ext-min" value="10" step="1">') +
          (s && s.control === 'kiln' ? '<p class="hint">Change the kiln controller as well — the app can’t.</p>' : '') +
          '<div class="row2">' + btn('applyExtend', '+ Add time', 'primary xl', 1) + btn('applyExtend', '− Shorten', 'secondary xl', -1) + '</div>' +
          btn('closeModal', 'Cancel', 'ghost');
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
        body = '<h2>Plan the timeline</h2>' + (run ? planBlock(run, now) : '') + '<div class="row2">' + btn('closeModal', 'Done', 'primary') + '</div>';
        break;
      case 'signIn': {
        const err = m.error ? '<p class="warnbox" role="alert">' + h(m.error) + '</p>' : '';
        const days = (CPT.Sync && CPT.Sync.status.sessionDays) || 30;
        if (m.step === 'code') {
          body = '<h2>Check your email</h2><p>We sent a 6-digit code to <strong>' + h(m.email) + '</strong>. It works for 10 minutes; if you asked more than once, use the newest.</p>' +
            field('Sign-in code', '<input type="text" id="si-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="123456" aria-label="6-digit sign-in code">') + err +
            '<div class="col">' + btn('signInVerify', m.busy ? 'Signing in…' : 'Sign in', 'primary xl', null, m.busy ? ' disabled' : '') +
            '<div class="row2">' + btn('signInSend', m.expired ? 'Send a new code' : 'Resend code', 'ghost', null, m.busy ? ' disabled' : '') + btn('signInBack', 'Different email', 'ghost') + '</div></div>';
        } else {
          body = '<h2>Sign in or create an account</h2><p>Enter your email and we’ll send you a sign-in code — no password. New addresses get an account automatically.</p>' +
            field('Email', '<input type="email" id="si-email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" value="' + h(m.email || '') + '">') + err +
            '<div class="row2">' + btn('signInSend', m.busy ? 'Sending…' : 'Email me a code', 'primary xl', null, m.busy ? ' disabled' : '') + btn('closeModal', 'Cancel', 'ghost') + '</div>' +
            '<p class="hint">You stay signed in on this device for ' + h(days) + ' days. We store only your email address and your casting data. ' + privacyLink('How we handle your data') + '</p>';
        }
        break;
      }
      case 'signOut':
        body = '<h2>Sign out?</h2><p>Everything stays in your account. What should happen on this device?</p>' +
          '<div class="col">' + btn('signOutKeep', 'Sign out — keep my data here', 'primary xl') + btn('signOutClear', 'Sign out and remove data from this device', 'danger') + btn('closeModal', 'Cancel', 'ghost') + '</div>' +
          '<p class="hint">Remove it on a shared or borrowed device.</p>';
        break;
      case 'safety':
        body = '<h2>⚠ Before you start</h2><ul class="safety-list">' + P.safetyNotes(run && run.profile).map((n) => '<li>' + h(n) + '</li>').join('') + '</ul>' + btn('safetyAck', 'I UNDERSTAND', 'primary xl');
        break;
      default: body = '';
    }
    return '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + body + '</div></div>';
  }

  CPT.UI.renderModal = renderModal;
})(globalThis.CPT = globalThis.CPT || {});
