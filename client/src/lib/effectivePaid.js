/** Mirrors portal `effectivePackagePaid` — card gross → net of 3% fee. */
const CARD_MARKUP = 0.03;

export function cardPaymentNet(gross) {
  return Math.round((parseFloat(gross) / (1 + CARD_MARKUP)) * 100) / 100;
}

function isCardProcessorMethod(m) {
  return m === 'Square' || m === 'Stripe';
}

/** Sum of completed payments toward package (direct = face value; card = net of fee). */
export function effectivePackagePaid(payments) {
  if (!payments || !payments.length) return 0;
  let sum = 0;
  for (const p of payments) {
    if (p.status !== 'Completed') continue;
    const a = parseFloat(p.amount) || 0;
    sum += isCardProcessorMethod(p.method) ? cardPaymentNet(a) : a;
  }
  return Math.round(sum * 100) / 100;
}
