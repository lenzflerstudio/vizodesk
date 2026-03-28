/**
 * Client-side booking pricing (same rules as server).
 */

/** Card checkout total includes this markup (passed to client; same as server). */
export const CARD_MARKUP = 0.03;
export const DEPOSIT_RATE = 0.3;

export function roundMoney(n) {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100;
}

export function computePackageBreakdown(packagePrice) {
  const pkg = roundMoney(packagePrice);
  const depositAmount = roundMoney(pkg * DEPOSIT_RATE);
  const remainingAmount = roundMoney(pkg - depositAmount);
  return {
    packagePrice: pkg,
    depositAmount,
    remainingAmount,
  };
}

/** Mirrors server retainer pricing for New Booking preview. */
export function computeRetainerBreakdown(monthlyPrice, firstMonthDueNow) {
  const monthly = roundMoney(monthlyPrice);
  if (firstMonthDueNow) {
    return {
      packagePrice: monthly,
      depositAmount: monthly,
      remainingAmount: 0,
    };
  }
  return {
    packagePrice: monthly,
    depositAmount: 0,
    remainingAmount: monthly,
  };
}

export function withCardFee(amount) {
  return roundMoney(Math.max(0, Number(amount) || 0) * (1 + CARD_MARKUP));
}

export function finalDueDateFromEvent(eventDateStr) {
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
