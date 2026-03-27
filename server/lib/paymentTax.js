const db = require('../db');
const { estimateTotalTaxes } = require('./taxEstimator');
const { getStateRate } = require('../data/usStateTaxRates');

const CARD_MARKUP = 0.03;

function paymentNetForIncomeTax(p) {
  const amt = parseFloat(p.amount) || 0;
  if (p.method === 'Square' || p.method === 'Stripe') return Math.round((amt / (1 + CARD_MARKUP)) * 100) / 100;
  return amt;
}

function getUserTaxPrefs(userId) {
  const row = db
    .prepare(
      `SELECT tax_home_state, tax_ytd_expenses, tax_filing_status, tax_entity_type, tax_sales_tax_rate
       FROM user_settings WHERE user_id = ?`
    )
    .get(userId);
  return {
    homeState: row?.tax_home_state || '',
    expenses: Number(row?.tax_ytd_expenses) || 0,
    filingStatus: row?.tax_filing_status === 'married_joint' ? 'married_joint' : 'single',
    entityType: row?.tax_entity_type === 's_corp' ? 's_corp' : 'sole_prop',
    salesRate: Math.max(0, Math.min(0.25, Number(row?.tax_sales_tax_rate) || 0)),
  };
}

function sumNetCompletedForUser(userId, excludePaymentId) {
  let sql = `
    SELECT p.id, p.amount, p.method FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    WHERE b.user_id = ? AND p.status = 'Completed'
  `;
  const args = [userId];
  if (excludePaymentId != null) {
    sql += ' AND p.id != ?';
    args.push(excludePaymentId);
  }
  const rows = db.prepare(sql).all(...args);
  return rows.reduce((s, r) => s + paymentNetForIncomeTax(r), 0);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * After a payment is marked Completed, store estimated tax deltas for this payment.
 */
function applyPaymentTax(paymentId) {
  const row = db
    .prepare(
      `SELECT p.*, b.user_id FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.id = ?`
    )
    .get(paymentId);
  if (!row || row.status !== 'Completed') return;

  const uid = row.user_id;
  const prefs = getUserTaxPrefs(uid);
  const stateRate = getStateRate(prefs.homeState);

  const currentNet = paymentNetForIncomeTax(row);
  const grossBefore = sumNetCompletedForUser(uid, paymentId);
  const grossAfter = grossBefore + currentNet;

  const opts = (gross) => ({
    grossBusinessIncome: gross,
    businessExpenses: prefs.expenses,
    stateRate,
    filingStatus: prefs.filingStatus,
    entityType: prefs.entityType,
  });

  const before = estimateTotalTaxes(opts(grossBefore));
  const after = estimateTotalTaxes(opts(grossAfter));

  const grossFace = parseFloat(row.amount) || 0;
  const salesTax = round2(grossFace * prefs.salesRate);

  const estSe = round2(after.selfEmploymentTax.total - before.selfEmploymentTax.total);
  const estFederal = round2(after.federalIncomeTax - before.federalIncomeTax);
  const estState = round2(after.stateIncomeTax - before.stateIncomeTax);

  db.prepare(
    `UPDATE payments SET
      est_sales_tax = ?,
      est_se_tax = ?,
      est_federal_tax = ?,
      est_state_tax = ?
     WHERE id = ?`
  ).run(salesTax, estSe, estFederal, estState, paymentId);
}

module.exports = { applyPaymentTax, paymentNetForIncomeTax };
