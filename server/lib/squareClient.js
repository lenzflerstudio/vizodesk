/**
 * Square API client — credentials from Settings (DB) with optional env fallback.
 * @see https://developer.squareup.com/docs/sdks/nodejs
 */
const { SquareClient, SquareEnvironment } = require('square');
const db = require('../db');
const { decryptAppSecret } = require('./appSecretCrypto');

function buildClient(accessToken, environmentMode) {
  const tok = String(accessToken || '').trim();
  if (!tok) return null;
  const prod = String(environmentMode || '').toLowerCase() === 'production';
  return new SquareClient({
    token: tok,
    environment: prod ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
}

/**
 * @returns {{ client: import('square').SquareClient | null, locationId: string | null, source: 'database'|'env'|'none' }}
 */
function getSquareClientForUser(userId) {
  const envTok = process.env.SQUARE_ACCESS_TOKEN?.trim();
  const envLoc = process.env.SQUARE_LOCATION_ID?.trim();
  const envMode = process.env.SQUARE_ENVIRONMENT;

  const row = db
    .prepare(
      `SELECT square_access_token_enc, square_location_id, square_environment FROM user_settings WHERE user_id = ?`
    )
    .get(userId);

  const dbTok = row?.square_access_token_enc ? decryptAppSecret(row.square_access_token_enc) : null;
  const dbLoc = row?.square_location_id != null ? String(row.square_location_id).trim() : '';
  const dbMode = row?.square_environment != null ? String(row.square_environment).trim() : '';

  const token = (dbTok && dbTok.trim()) || envTok || null;
  const locationId = dbLoc || envLoc || null;
  const mode = (dbMode || envMode || 'sandbox').trim();

  if (!token) {
    return { client: null, locationId: locationId || null, source: dbTok ? 'database' : envTok ? 'env' : 'none' };
  }

  const source = dbTok ? 'database' : 'env';
  return {
    client: buildClient(token, mode),
    locationId: locationId || null,
    source,
  };
}

/**
 * Webhook verification — app-wide (one subscription URL per deployment).
 * @returns {{ signatureKey: string | null, notificationUrl: string | null }}
 */
function getSquareWebhookVerification() {
  const row = db
    .prepare(
      `SELECT square_webhook_signature_key_enc, square_webhook_notification_url FROM app_settings WHERE id = 1`
    )
    .get();

  const envKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  const envUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL?.trim();

  const dbKey = row?.square_webhook_signature_key_enc
    ? decryptAppSecret(row.square_webhook_signature_key_enc)
    : null;
  const dbUrl = row?.square_webhook_notification_url != null ? String(row.square_webhook_notification_url).trim() : '';

  return {
    signatureKey: (dbKey && dbKey.trim()) || envKey || null,
    notificationUrl: dbUrl || envUrl || null,
  };
}

module.exports = {
  getSquareClientForUser,
  getSquareWebhookVerification,
};
