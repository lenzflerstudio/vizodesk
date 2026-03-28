const db = require('../db');
const fs = require('fs');
const path = require('path');
const { enrichBookingRow } = require('./bookingPricing');
const contractUploadService = require('../services/contractUploadService');
const { getPaymentPortalRow, serializePaymentPortal } = require('./paymentPortalHelper');
const { serializePackageDetailsPublic } = require('../routes/packages');

function packageDetailsForBooking(booking) {
  if (!booking?.package_template_id) return null;
  const pt = db
    .prepare('SELECT * FROM package_templates WHERE id = ? AND user_id = ?')
    .get(booking.package_template_id, booking.user_id);
  return serializePackageDetailsPublic(pt);
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
 * Same JSON shape as GET /api/bookings/public/:token (portal + hybrid cloud).
 * @param {string} token public_token
 * @returns {object|null} payload or null if not found
 */
function buildPublicBookingJson(token) {
  const booking = db.prepare(`
    SELECT b.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    WHERE b.public_token = ?
  `).get(token);
  if (!booking) return null;
  ensureDefaultContract(booking.id);
  const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
  const payments = db.prepare("SELECT * FROM payments WHERE booking_id = ? AND status = 'Completed'").all(booking.id);
  const payment_portal = serializePaymentPortal(getPaymentPortalRow(booking.user_id));
  const { user_id, ...safeBooking } = booking;
  const package_details = packageDetailsForBooking(booking);
  const contractOut = contract
    ? {
        ...contract,
        pdf_preview_url: contract.pdf_path ? `/api/bookings/public/${token}/contract-pdf` : null,
      }
    : null;
  return {
    ...enrichBookingRow(safeBooking),
    package_details,
    payment_portal,
    contract: contractOut,
    payments,
  };
}

module.exports = {
  buildPublicBookingJson,
  ensureDefaultContract,
  packageDetailsForBooking,
};
