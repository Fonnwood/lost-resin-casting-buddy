/* Server configuration, all from environment variables (see docs/HOSTING.md).
 * Files under api/_lib are shared helpers, not endpoints (Vercel skips `_` paths). */
'use strict';

const env = process.env;
const int = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

module.exports = {
  /** Postgres connection string. Vercel's Neon integration sets DATABASE_URL. */
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
  /** Local development only (`npm run dev`): in-memory database, codes printed to the console. */
  dev: env.CB_DEV === '1',

  appName: env.APP_NAME || 'Casting Buddy',
  /** Resend (https://resend.com) sends the sign-in codes. */
  resendApiKey: env.RESEND_API_KEY || '',
  emailFrom: env.EMAIL_FROM || '',

  sessionDays: int(env.SESSION_DAYS, 30),
  codeMinutes: 10,
  codeAttempts: 5,
  codesPerHour: 5,
  codesPerDay: 20,
  codeResendSeconds: int(env.CODE_RESEND_SECONDS, 30),

  /** Sync limits. Vercel caps request and response bodies at 4.5 MB. */
  maxDocBytes: 512 * 1024,
  maxChangesPerRequest: 100,
  maxDocsPerUser: 5000,
  pageRows: 100,
  pageBytes: 2 * 1024 * 1024,
};
