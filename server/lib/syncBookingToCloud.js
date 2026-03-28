const db = require('../db');
const { getSetting } = require('./integrationSecrets');

/**
 * Build the JSON body for POST /api/public/bookings (Render / cloud mirror).
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
 *   https://your-app.onrender.com/api/sync/booking
 * (or POST /api/public/bookings — same payload and auth).
 * SYNC_SECRET: same value on local + Render (env or Settings → Integrations).
 * Do not set CLOUD_BOOKING_SYNC_URL on Render — avoids syncing the cloud to itself.
 */
/**
 * @returns {Promise<{ synced: true, public_token: string } | { synced: false, reason: string }>}
 */
async function syncBookingToCloud(bookingId) {
  const url = process.env.CLOUD_BOOKING_SYNC_URL?.trim();
  const secret = getSetting('SYNC_SECRET');
  if (!url || !secret) {
    console.warn(
      'Cloud sync skipped: set CLOUD_BOOKING_SYNC_URL (e.g. https://your-app.onrender.com/api/sync/booking) and SYNC_SECRET on the local server (or SYNC_SECRET under Settings → Integrations).'
    );
    return { synced: false, reason: 'missing_config' };
  }

  const payload = buildBookingSyncPayload(bookingId);
  if (!payload) {
    console.warn('Cloud sync skipped: could not build payload for booking id', bookingId);
    return { synced: false, reason: 'no_payload' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`);
  }
  return { synced: true, public_token: payload.public_token };
}

module.exports = { syncBookingToCloud, buildBookingSyncPayload };
