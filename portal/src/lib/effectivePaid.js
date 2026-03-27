const CARD_MARKUP = 0.03;

export function cardPaymentNet(gross) {
  return Math.round((parseFloat(gross) / (1 + CARD_MARKUP)) * 100) / 100;
}

function isCardProcessorMethod(m) {
  return m === 'Square' || m === 'Stripe';
}

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
