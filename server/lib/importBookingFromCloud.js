const db = require('../db');
const { upsertBookingFromSync } = require('./bookingSyncUpsert');

/**
 * Pull a cloud-shaped booking snapshot into this SQLite DB for the given studio user.
 * Sets origin = 'cloud'. Skips if public_token already exists (safe for retries).
 *
 * @param {object} body Same shape as POST /api/public/bookings (public_token, client, booking, contract?)
 * @param {number} ownerUserId Authenticated local user id
 * @returns {{ ok: true, bookingId: number, public_token: string } | { ok: false, reason: string, existingBookingId?: number }}
 */
function importCloudBookingIntoLocal(body, ownerUserId) {
  try {
    const public_token = String(body?.public_token || '').trim();
    if (!public_token) {
      return { ok: false, reason: 'missing_token' };
    }
    if (!ownerUserId || Number.isNaN(Number(ownerUserId))) {
      return { ok: false, reason: 'invalid_owner' };
    }

    const dup = db.prepare('SELECT id FROM bookings WHERE public_token = ?').get(public_token);
    if (dup) {
      console.warn('[importCloudBookingIntoLocal] skip duplicate public_token=%s', public_token);
      return { ok: false, reason: 'duplicate_public_token', existingBookingId: dup.id };
    }

    const merged = {
      ...body,
      booking: {
        ...(body.booking || {}),
        origin: 'cloud',
      },
    };

    const result = upsertBookingFromSync(merged, ownerUserId);
    console.log(
      '[importCloudBookingIntoLocal] imported booking id=%s token=%s origin=cloud',
      result.bookingId,
      result.public_token
    );
    return { ok: true, bookingId: result.bookingId, public_token: result.public_token };
  } catch (err) {
    console.warn('[importCloudBookingIntoLocal] failed: %s', err?.message || err);
    return { ok: false, reason: 'import_error', error: String(err?.message || err) };
  }
}

module.exports = { importCloudBookingIntoLocal };
