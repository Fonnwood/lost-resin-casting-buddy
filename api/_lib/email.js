/* Sends the sign-in code. Uses Resend's HTTP API (no SDK needed); in local
 * development without a key, prints the code to the console instead. */
'use strict';

const config = require('./config');
const { HttpError } = require('./http');

/** Last few dev-mode messages, read by scripts/serve.js for tests. */
const outbox = [];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function message(code) {
  const name = config.appName;
  const mins = config.codeMinutes;
  const by = config.appBy;
  const url = /^https?:\/\//.test(config.appByUrl) ? config.appByUrl : '';
  const footText = by ? '\n—\n' + name + ', a free, open-source app by ' + by + (url ? ' · ' + url : '') + '\n' : '';
  const footHtml = by ? '<p style="color:#888;font-size:12px;margin-top:24px">' + esc(name) + ', a free, open-source app by ' +
    (url ? '<a href="' + esc(url) + '" style="color:#888">' + esc(by) + '</a>' : esc(by)) + '</p>' : '';
  return {
    subject: code + ' is your ' + name + ' sign-in code',
    text: 'Your ' + name + ' sign-in code is ' + code + '.\n\nIt expires in ' + mins + ' minutes. If you didn’t ask for it, you can ignore this email.\n' + footText,
    html: '<p>Your ' + esc(name) + ' sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:monospace">' + code + '</p>' +
      '<p>It expires in ' + mins + ' minutes. If you didn’t ask for it, you can ignore this email.</p>' + footHtml,
  };
}

async function sendCode(to, code) {
  const msg = message(code);
  if (config.resendApiKey && config.emailFrom) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.resendApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text().catch(() => ''));
      throw new HttpError(502, 'Couldn’t send the email just now. Please try again in a minute.');
    }
    return;
  }
  if (config.dev) {
    console.log('[dev] Sign-in code for ' + to + ': ' + code);
    outbox.push({ to, code, subject: msg.subject });
    if (outbox.length > 20) outbox.shift();
    return;
  }
  throw new HttpError(503, 'Email sending is not configured on this server (RESEND_API_KEY / EMAIL_FROM).');
}

module.exports = { sendCode, outbox, message };
