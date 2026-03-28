const db = require('../db');
const fs = require('fs');
const path = require('path');
const { enrichBookingRow } = require('./bookingPricing');
const contractUploadService = require('../services/contractUploadService');
const { getPaymentPortalRow, serializePaymentPortal } = require('./paymentPortalHelper');
const { serializePackageDetailsPublic } = require('../routes/packages');

const RETAINER_NOTES_MARKER = '--- Retainer engagement ---';

/** Parse structured retainer lines from booking notes for the client portal. */
function parseRetainerEngagementFromNotes(notes) {
  const s = String(notes || '');
  const idx = s.indexOf(RETAINER_NOTES_MARKER);
  if (idx < 0) return null;
  let chunk = s.slice(idx + RETAINER_NOTES_MARKER.length).replace(/^\s*\n?/, '');
  const paraBreak = chunk.indexOf('\n\n');
  if (paraBreak >= 0) chunk = chunk.slice(0, paraBreak);
  const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (line.startsWith('---')) break;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const label = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (label && value) items.push({ label, value });
  }
  return items.length ? items : null;
}

/** Resolve from live package_templates only (no booking snapshot). */
function resolvePackageDetailsFromTemplate(booking) {
  const userId = booking?.user_id;
  if (userId == null) return null;

  if (booking?.package_template_id) {
    const pt = db
      .prepare('SELECT * FROM package_templates WHERE id = ? AND user_id = ?')
      .get(booking.package_template_id, userId);
    return serializePackageDetailsPublic(pt);
  }

  const pkgName = String(booking.package || '').trim();
  if (!pkgName) return null;

  const pt = db
    .prepare(
      `SELECT * FROM package_templates WHERE user_id = ?
       AND (
         LOWER(TRIM(COALESCE(label, ''))) = LOWER(?)
         OR LOWER(TRIM(COALESCE(display_title, ''))) = LOWER(?)
       )
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId, pkgName, pkgName);
  return serializePackageDetailsPublic(pt);
}

function packageDetailsFromSnapshotColumn(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * For the client portal: prefer frozen JSON saved on the booking (survives cloud sync when template ids differ).
 */
function packageDetailsForBooking(booking) {
  const snap = packageDetailsFromSnapshotColumn(booking?.portal_package_json);
  if (snap) return snap;
  return resolvePackageDetailsFromTemplate(booking);
}

/** Call after create/update booking so portal + sync always have tagline, features, etc. */
function persistPortalPackageSnapshot(bookingId) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!row) return;
  const details = resolvePackageDetailsFromTemplate(row);
  const json = details ? JSON.stringify(details) : null;
  db.prepare('UPDATE bookings SET portal_package_json = ? WHERE id = ?').run(json, bookingId);
}

/** Every booking is signable: the booking + terms are the agreement (no separate template/PDF required). */
function ensureDefaultContract(bookingId) {
  const existing = db.prepare('SELECT 1 FROM contracts WHERE booking_id = ?').get(bookingId);
  if (existing) return;
  const b = db.prepare('SELECT terms_and_conditions FROM bookings WHERE id = ?').get(bookingId);
  const terms = (b?.terms_and_conditions && String(b.terms_and_conditions).trim()) || '';
  const content =
    terms.length > 0
      ? terms
      : 'The terms and conditions shown on your client booking page are part of this agreement.';
  db.prepare(`
    INSERT INTO contracts (booking_id, template_id, template_name, content, pdf_path)
    VALUES (?, NULL, 'Booking agreement', ?, NULL)
  `).run(bookingId, content);
}

/**
 * Lookup by `bookings.public_token` only (never by numeric id).
 * Normalizes case/whitespace so links still work if the DB value differs slightly.
 */
function findBookingByPublicToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return db
    .prepare(`
    SELECT b.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    WHERE LOWER(TRIM(COALESCE(b.public_token, ''))) = LOWER(?)
  `)
    .get(token);
}

/**
 * Full portal JSON from a row returned by findBookingByPublicToken.
 * @param {object} booking joined row (includes public_token)
 */
function serializePublicBookingPayload(booking) {
  const tokenForUrls = String(booking.public_token || '').trim();
  ensureDefaultContract(booking.id);
  const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
  const payments = db.prepare("SELECT * FROM payments WHERE booking_id = ? AND status = 'Completed'").all(booking.id);
  const payment_portal = serializePaymentPortal(getPaymentPortalRow(booking.user_id));
  const { user_id, ...safeBooking } = booking;
  const package_details = packageDetailsForBooking(booking);
  const contractOut = contract
    ? {
        ...contract,
        pdf_preview_url:
          contract.pdf_path && tokenForUrls ? `/api/bookings/public/${tokenForUrls}/contract-pdf` : null,
      }
    : null;
  return {
    ...enrichBookingRow(safeBooking),
    package_details,
    retainer_engagement: parseRetainerEngagementFromNotes(safeBooking.notes),
    payment_portal,
    contract: contractOut,
    payments,
  };
}

/**
 * Same JSON shape as GET /api/public/bookings/:token (portal + hybrid cloud).
 * @param {string} token public_token from URL
 * @returns {object|null} payload or null if not found
 */
function buildPublicBookingJson(token) {
  const booking = findBookingByPublicToken(token);
  if (!booking) return null;
  return serializePublicBookingPayload(booking);
}

module.exports = {
  buildPublicBookingJson,
  findBookingByPublicToken,
  serializePublicBookingPayload,
  ensureDefaultContract,
  packageDetailsForBooking,
  persistPortalPackageSnapshot,
  parseRetainerEngagementFromNotes,
};
