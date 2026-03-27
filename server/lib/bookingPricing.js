/**
 * Booking pricing — single source of truth for package, deposit (30%), balance, and card (+3% markup).
 */

const CARD_MARKUP = 0.03;
const DEPOSIT_RATE = 0.3;

function roundMoney(n) {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100;
}

/** Full package price → deposit (30%), remaining (70%), Square card totals, final due date */
function computeBookingPricing(packagePrice, eventDateStr) {
  const pkg = roundMoney(packagePrice);
  const depositAmount = roundMoney(pkg * DEPOSIT_RATE);
  const remainingAmount = roundMoney(pkg - depositAmount);
  const squareDeposit = roundMoney(depositAmount * (1 + CARD_MARKUP));
  const squareRemaining = roundMoney(remainingAmount * (1 + CARD_MARKUP));
  const squareTotal = roundMoney(squareDeposit + squareRemaining);
  const finalDueDate = finalDueDateFromEvent(eventDateStr);

  return {
    deposit_amount: depositAmount,
    remaining_amount: remainingAmount,
    square_deposit: squareDeposit,
    square_remaining: squareRemaining,
    square_price: squareTotal,
    final_due_date: finalDueDate,
  };
}

/** Event date (YYYY-MM-DD) → balance due date (7 days before), same format */
function finalDueDateFromEvent(eventDateStr) {
  if (!eventDateStr || typeof eventDateStr !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 7);
  return dt.toISOString().slice(0, 10);
}

function enrichBookingRow(row) {
  if (!row) return row;
  return {
    ...row,
    package_price: row.direct_price,
    packagePrice: row.direct_price,
    depositAmount: row.deposit_amount,
    remainingAmount: row.remaining_amount,
    finalDueDate: row.final_due_date,
    squareDeposit: row.square_deposit,
    squareRemaining: row.square_remaining,
    contractUploadId: row.contract_upload_id,
  };
}

module.exports = {
  CARD_MARKUP,
  DEPOSIT_RATE,
  roundMoney,
  computeBookingPricing,
  finalDueDateFromEvent,
  enrichBookingRow,
};
