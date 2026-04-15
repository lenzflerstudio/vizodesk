const { randomBytes } = require('crypto');
const db = require('../db');

const MAX_ALLOC_ATTEMPTS = 24;

/**
 * 32-char hex token (16 random bytes). Suitable for public_token; collision risk is negligible globally.
 */
function generateToken() {
  return randomBytes(16).toString('hex');
}

function tokenExistsInDb(token) {
  const t = String(token || '').trim();
  if (!t) return true;
  if (db.prepare('SELECT 1 AS x FROM bookings WHERE public_token = ? LIMIT 1').get(t)) return true;
  if (db.prepare('SELECT 1 AS x FROM invoices WHERE public_token = ? LIMIT 1').get(t)) return true;
  return false;
}

/**
 * Resolves booking.origin for this server's INSERT.
 * - Desktop / studio proxy (BOOKING_CREATE_PROXY_TO_REMOTE): local-first.
 * - Inbound create via SYNC_SECRET (studio → hosted API): local.
 * - Hosted multi-tenant cloud: set VIZODESK_HOSTED_CLOUD=true so JWT-created rows are origin=cloud.
 * - Default (self-hosted, dev, single-tenant): local.
 */
function resolveBookingOrigin(req) {
  if (process.env.BOOKING_CREATE_PROXY_TO_REMOTE === 'true') {
    return 'local';
  }
  if (req && req.authViaSyncSecret) {
    return 'local';
  }
  if (String(process.env.VIZODESK_HOSTED_CLOUD || '').toLowerCase() === 'true') {
    return 'cloud';
  }
  return 'local';
}

/**
 * Allocate a public_token guaranteed unique in this database (bookings + invoices).
 */
function allocateUniquePublicToken() {
  for (let attempt = 1; attempt <= MAX_ALLOC_ATTEMPTS; attempt += 1) {
    const token = generateToken();
    if (!tokenExistsInDb(token)) {
      console.log('[bookingToken] allocated public_token attempt=%s origin_check=ok', attempt);
      return token;
    }
    console.warn('[bookingToken] public_token collision, regenerating (attempt %s)', attempt);
  }
  throw new Error('PUBLIC_TOKEN_ALLOCATION_FAILED');
}

module.exports = {
  generateToken,
  allocateUniquePublicToken,
  tokenExistsInDb,
  resolveBookingOrigin,
};
