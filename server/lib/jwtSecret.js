/**
 * JWT signing secret — never commit real secrets; set JWT_SECRET in server/.env (see .env.example).
 */
let memo = null;
let resolved = false;

function getJwtSecret() {
  if (resolved) return memo;

  const s = process.env.JWT_SECRET?.trim();
  if (s) {
    memo = s;
    resolved = true;
    return memo;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set in production. Add it to your environment or server/.env');
    process.exit(1);
  }

  console.warn(
    '[vizodesk] JWT_SECRET is not set — using a local dev-only default. Set JWT_SECRET in server/.env before deploying.',
  );
  memo = '__VIZODESK_LOCAL_DEV_ONLY_DO_NOT_USE_IN_PRODUCTION__';
  resolved = true;
  return memo;
}

module.exports = { getJwtSecret };
