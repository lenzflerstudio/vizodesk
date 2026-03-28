/**
 * Encrypted key/value secrets (cloud sync, etc.).
 * Table name is app_secret_kv — not "app_settings" (that table is the singleton portal row).
 */
const db = require('../db');
const { encryptAppSecret, decryptAppSecret } = require('./appSecretCrypto');

const INTERNAL_KEYS = ['SYNC_SECRET'];

/** Accept camelCase or env-style names from API / UI. */
const KEY_ALIASES = {
  sync_secret: 'SYNC_SECRET',
  SYNC_SECRET: 'SYNC_SECRET',
};

function maskPreview(plain) {
  if (!plain) return null;
  const s = String(plain);
  if (s.length <= 4) return '********';
  return `****${s.slice(-4)}`;
}

/** Effective value: database (decrypted) first, then process.env. */
function getSetting(key) {
  if (!INTERNAL_KEYS.includes(key)) return null;
  const row = db.prepare('SELECT value_enc FROM app_secret_kv WHERE key = ?').get(key);
  if (row?.value_enc) {
    const v = decryptAppSecret(row.value_enc);
    if (v && String(v).trim()) return String(v).trim();
  }
  const env = process.env[key];
  return env != null && String(env).trim() ? String(env).trim() : null;
}

function setSetting(key, plain) {
  if (!INTERNAL_KEYS.includes(key)) throw new Error('Invalid integration key');
  if (plain == null || String(plain).trim() === '') {
    db.prepare('DELETE FROM app_secret_kv WHERE key = ?').run(key);
    return;
  }
  const enc = encryptAppSecret(String(plain).trim());
  db.prepare('INSERT OR REPLACE INTO app_secret_kv (key, value_enc) VALUES (?, ?)').run(key, enc);
}

/**
 * Apply fields from POST body.
 * - Omitted key → no change
 * - null or "" → remove from DB (fall back to env)
 * - non-empty → store encrypted
 */
function applyIntegrationSecretsFromBody(body) {
  if (!body || typeof body !== 'object') return;
  for (const [k, v] of Object.entries(body)) {
    const internal = KEY_ALIASES[k];
    if (!internal) continue;
    if (v === undefined) continue;
    if (v === null || String(v).trim() === '') {
      setSetting(internal, null);
    } else {
      setSetting(internal, v);
    }
  }
}

function getIntegrationSecretsForApi() {
  const v = getSetting('SYNC_SECRET');
  return {
    sync_secret: {
      configured: !!v,
      preview: v ? maskPreview(v) : null,
    },
  };
}

module.exports = {
  getSetting,
  setSetting,
  applyIntegrationSecretsFromBody,
  getIntegrationSecretsForApi,
  INTEGRATION_BODY_KEYS: new Set(Object.keys(KEY_ALIASES)),
};
