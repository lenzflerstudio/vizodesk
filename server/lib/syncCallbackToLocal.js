const { getSetting } = require('./integrationSecrets');

/**
 * After a client action on the cloud (Render) app, notify the studio's local API so SQLite stays in sync.
 * Set on the **cloud** server only:
 *   LOCAL_SYNC_CALLBACK_URL=https://YOUR-TUNNEL/api/sync/callback
 * Uses the same SYNC_SECRET as inbound booking sync (Authorization header).
 */
async function notifyLocalApp(payload) {
  const url = process.env.LOCAL_SYNC_CALLBACK_URL?.trim();
  if (!url) return;

  const secret = getSetting('SYNC_SECRET');
  if (!secret) {
    console.warn('LOCAL_SYNC_CALLBACK_URL is set but SYNC_SECRET is missing; skip callback to local');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('Local sync callback failed:', res.status, t.slice(0, 500));
    } else {
      console.log('Local sync callback ok:', payload.event, payload.public_token);
    }
  } catch (err) {
    console.error('Local sync callback error:', err?.message || err);
  }
}

function notifyLocalAppFireAndForget(payload) {
  notifyLocalApp(payload).catch((e) => console.error('Local sync callback:', e));
}

module.exports = { notifyLocalApp, notifyLocalAppFireAndForget };
