const { getResolvedClientPortalBaseUrl } = require('./clientPortalUrl');

let cache = { at: 0, origins: null };
const TTL_MS = 60_000;

function envOrigins() {
  const set = new Set(['http://localhost:5173', 'http://localhost:5174']);
  for (const key of ['CLIENT_URL', 'PORTAL_URL']) {
    const v = process.env[key]?.trim();
    if (v) {
      try {
        set.add(new URL(v).origin);
      } catch {
        /* ignore */
      }
    }
  }
  return set;
}

function collectOrigins() {
  const set = envOrigins();
  const configured = getResolvedClientPortalBaseUrl();
  if (configured) {
    try {
      set.add(new URL(configured).origin);
    } catch {
      /* ignore */
    }
  }
  return set;
}

/**
 * Express cors origin callback
 */
function verifyOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  if (Date.now() - cache.at > TTL_MS || !cache.origins) {
    cache.origins = collectOrigins();
    cache.at = Date.now();
  }
  return cb(null, cache.origins.has(origin));
}

function invalidateCorsOriginCache() {
  cache.at = 0;
}

module.exports = { verifyOrigin, invalidateCorsOriginCache };
