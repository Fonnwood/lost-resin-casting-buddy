/* Server configuration, all from environment variables (see docs/HOSTING.md).
 * Files under api/_lib are shared helpers, not endpoints (Vercel skips `_` paths). */
'use strict';

const env = process.env;
/** The bare address in EMAIL_FROM ("Name <a@b.c>" or "a@b.c"). */
const fromAddress = ((env.EMAIL_FROM || '').match(/<([^>]+)>/) || (env.EMAIL_FROM || '').match(/^\s*(\S+@\S+)\s*$/) || [])[1] || '';
const int = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

module.exports = {
  /** Postgres connection string. Vercel's Neon integration sets DATABASE_URL. */
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
  /** Local development only (`npm run dev`): in-memory database, codes printed to the console. */
  dev: env.CB_DEV === '1',

  appName: env.APP_NAME || 'Casting Buddy',
  /** Credit at the foot of emails ("by …"); APP_BY='' hides it. */
  appBy: env.APP_BY != null ? env.APP_BY : 'Fonnwood',
  appByUrl: env.APP_BY_URL != null ? env.APP_BY_URL : 'https://fonnwood.com',
  /** Resend (https://resend.com) sends the sign-in codes. */
  resendApiKey: env.RESEND_API_KEY || '',
  emailFrom: env.EMAIL_FROM || '',

  sessionDays: int(env.SESSION_DAYS, 30),
  codeMinutes: 10,
  codeAttempts: 5,
  codesPerHour: 5,
  codesPerDay: 20,
  codeResendSeconds: int(env.CODE_RESEND_SECONDS, 30),

  /** Public address of this site, for scheduled callbacks. Defaults to the address the app was opened on. */
  appUrl: (env.APP_URL || '').replace(/\/+$/, ''),

  /** Push notifications (see docs/HOSTING.md). VAPID keys identify this server to browsers' push services. */
  vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: env.VAPID_PRIVATE_KEY || '',
  vapidSubject: env.VAPID_SUBJECT || (fromAddress ? 'mailto:' + fromAddress : ''),
  /** Upstash QStash wakes the server at each alert time (works on every Vercel plan). */
  qstashToken: env.QSTASH_TOKEN || '',
  qstashUrl: (env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/+$/, ''),
  qstashSigningKeys: [env.QSTASH_CURRENT_SIGNING_KEY, env.QSTASH_NEXT_SIGNING_KEY].filter(Boolean),
  /** Optional alternative or safety net: a cron calling GET /api/push/deliver with this bearer token. */
  cronSecret: env.CRON_SECRET || '',
  maxPushAlerts: 60,
  pushHorizonHours: 72,
  /** Alerts this late (server or scheduler down) are dropped rather than sent out of context. */
  pushStaleMinutes: 30,

  /** Sync limits. Vercel caps request and response bodies at 4.5 MB. */
  maxDocBytes: 512 * 1024,
  maxChangesPerRequest: 100,
  maxDocsPerUser: 5000,
  pageRows: 100,
  pageBytes: 2 * 1024 * 1024,
};
