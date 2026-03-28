const db = require('../db');

/** Client-visible card markup (passed through to card total). */
const CARD_MARKUP = 0.03;

function cardPaymentNet(gross) {
  return Math.round((parseFloat(gross) / (1 + CARD_MARKUP)) * 100) / 100;
}

function isCardProcessorMethod(m) {
  return m === 'Square' || m === 'Stripe';
}

/** Sum of completed payments toward package total (direct $ = face value; card = net of fee). */
function effectivePackagePaid(bookingId) {
  const rows = db.prepare(
    "SELECT amount, method FROM payments WHERE booking_id = ? AND status = 'Completed'"
  ).all(bookingId);
  let sum = 0;
  for (const p of rows) {
    const a = parseFloat(p.amount) || 0;
    sum += isCardProcessorMethod(p.method) ? cardPaymentNet(a) : a;
  }
  return Math.round(sum * 100) / 100;
}

function updateBookingPaymentStatus(booking) {
  const packageTotal = parseFloat(booking.direct_price) || 0;
  const deposit = parseFloat(booking.deposit_amount) || 0;
  const paid = effectivePackagePaid(booking.id);

  if (packageTotal > 0 && paid + 0.005 >= packageTotal) {
    db.prepare(`UPDATE bookings SET payment_status = 'Paid', status = 'Paid' WHERE id = ?`).run(booking.id);
  } else if (deposit > 0 && paid + 0.005 >= deposit) {
    db.prepare(`UPDATE bookings SET payment_status = 'Deposit Paid', status = 'Deposit Paid' WHERE id = ?`).run(booking.id);
  } else {
    db.prepare(
      `UPDATE bookings SET payment_status = 'Unpaid',
        status = CASE WHEN status IN ('Paid', 'Deposit Paid') THEN 'Pending' ELSE status END
       WHERE id = ?`
    ).run(booking.id);
  }
}

module.exports = {
  CARD_MARKUP,
  cardPaymentNet,
  isCardProcessorMethod,
  effectivePackagePaid,
  updateBookingPaymentStatus,
};
