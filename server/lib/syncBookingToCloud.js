const db = require('../db');
const { getSetting } = require('./integrationSecrets');

/**
 * Build the JSON body for POST /api/public/bookings (cloud mirror).
 * @param {number} bookingId local booking id
 */
function buildBookingSyncPayload(bookingId) {
  const row = db
    .prepare(
      `SELECT b.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
       FROM bookings b
       JOIN clients c ON c.id = b.client_id
       WHERE b.id = ?`
    )
    .get(bookingId);
  if (!row) return null;

  const contractRow = db.prepare('SELECT template_name, content, pdf_path, template_id FROM contracts WHERE booking_id = ?').get(bookingId);

  return {
    public_token: row.public_token,
    client: {
      full_name: row.client_name,
      email: row.client_email,
      phone: row.client_phone,
    },
    booking: {
      event_type: row.event_type,
      event_date: row.event_date,
      package: row.package,
      event_time_range: row.event_time_range,
      venue_address: row.venue_address,
      terms_and_conditions: row.terms_and_conditions,
      deposit_amount: row.deposit_amount,
      direct_price: row.direct_price,
      square_price: row.square_price,
      remaining_amount: row.remaining_amount,
      final_due_date: row.final_due_date,
      square_deposit: row.square_deposit,
      square_remaining: row.square_remaining,
      payment_method: row.payment_method,
      status: row.status,
      payment_status: row.payment_status,
      notes: row.notes,
      package_template_id: row.package_template_id,
      portal_package_json: row.portal_package_json != null ? String(row.portal_package_json) : null,
      origin: row.origin === 'cloud' || row.origin === 'local' ? row.origin : 'local',
    },
    contract: contractRow
      ? {
          template_name: contractRow.template_name,
          content: contractRow.content,
          has_pdf: Boolean(contractRow.pdf_path),
          has_template: Boolean(contractRow.template_id),
        }
      : null,
  };
}

/**
 * Push booking snapshot to cloud after local save (Electron / local SQLite).
 * Set CLOUD_BOOKING_SYNC_URL in the **local** environment, e.g.
 *   https://vizodesk.com/api/sync/booking
 * (or POST /api/public/bookings — same payload and auth).
 * SYNC_SECRET: same value on local + cloud (env or Settings → Integrations).
 * Do not set CLOUD_BOOKING_SYNC_URL on the public cloud server (only on local) or it would sync to itself.
 */
/**
 * @returns {Promise<{ synced: true, public_token: string } | { synced: false, reason: string }>}
 */
async function syncBookingToCloud(bookingId) {
  try {
    const url = process.env.CLOUD_BOOKING_SYNC_URL?.trim();
    const secret = getSetting('SYNC_SECRET');
    if (!url || !secret) {
      console.warn(
        'Cloud sync skipped: set CLOUD_BOOKING_SYNC_URL (e.g. https://vizodesk.com/api/sync/booking) and SYNC_SECRET on the local server (or SYNC_SECRET under Settings → Integrations).'
      );
      return { synced: false, reason: 'missing_config' };
    }

    const row = db.prepare('SELECT id, origin, public_token FROM bookings WHERE id = ?').get(bookingId);
    if (!row) {
      console.warn('[syncBookingToCloud] skip missing booking id=%s', bookingId);
      return { synced: false, reason: 'no_booking' };
    }
    if (String(row.origin || 'local') !== 'local') {
      console.warn(
        '[syncBookingToCloud] skip non-local origin booking=%s origin=%s',
        bookingId,
        row.origin
      );
      return { synced: false, reason: 'skipped_non_local_origin' };
    }

    console.log(
      '[syncBookingToCloud] start booking=%s origin=%s token=%s',
      bookingId,
      row.origin,
      row.public_token
    );

    const payload = buildBookingSyncPayload(bookingId);
    if (!payload) {
      console.warn('Cloud sync skipped: could not build payload for booking id', bookingId);
      return { synced: false, reason: 'no_payload' };
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: secret,
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      console.warn(
        '[syncBookingToCloud] network error booking=%s: %s',
        bookingId,
        netErr?.message || netErr
      );
      return { synced: false, reason: 'network_error', error: String(netErr?.message || netErr) };
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn(
        '[syncBookingToCloud] HTTP %s booking=%s: %s',
        res.status,
        bookingId,
        (text || '').slice(0, 500)
      );
      return {
        synced: false,
        reason: 'http_error',
        status: res.status,
        detail: text.slice(0, 500),
      };
    }
    console.log('[syncBookingToCloud] success booking=%s token=%s', bookingId, payload.public_token);
    return { synced: true, public_token: payload.public_token };
  } catch (err) {
    console.warn('[syncBookingToCloud] unexpected error booking=%s: %s', bookingId, err?.message || err);
    return { synced: false, reason: 'unexpected', error: String(err?.message || err) };
  }
}

module.exports = { syncBookingToCloud, buildBookingSyncPayload };
