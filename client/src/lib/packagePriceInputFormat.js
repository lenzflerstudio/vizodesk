/** Strip currency decorations for parsing */
export function stripPackagePriceDecorations(s) {
  return String(s ?? '').replace(/[$,\s]/g, '');
}

/**
 * Format package price as the user types: thousands commas, optional decimals (max 2).
 * Does not include $. Use with a separate $ prefix in the UI.
 */
export function formatPackagePriceAsYouType(raw) {
  const v = stripPackagePriceDecorations(raw);
  if (v === '') return '';

  const dotIdx = v.indexOf('.');
  if (dotIdx === -1) {
    const whole = v.replace(/\D/g, '');
    if (whole === '') return '';
    return Number(whole).toLocaleString('en-US');
  }

  let whole = v.slice(0, dotIdx).replace(/\D/g, '');
  let frac = v.slice(dotIdx + 1).replace(/\D/g, '').slice(0, 2);
  const trailingDot = v.endsWith('.') && frac.length === 0;

  if (whole === '' && frac.length > 0) {
    whole = '0';
  }
  if (whole === '' && trailingDot) {
    return '0.';
  }

  const wholeFmt = whole === '' ? '0' : Number(whole).toLocaleString('en-US');
  if (trailingDot) {
    return `${wholeFmt}.`;
  }
  if (frac.length > 0) {
    return `${wholeFmt}.${frac}`;
  }
  return wholeFmt;
}

export function formatPackagePriceBlur(s) {
  const v = stripPackagePriceDecorations(s);
  if (v === '' || v === '.') return '';
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function countDigitsBeforeIndex(str, index) {
  let c = 0;
  const end = Math.min(index, str.length);
  for (let i = 0; i < end; i++) {
    if (/\d/.test(str[i])) c += 1;
  }
  return c;
}

/** Cursor position after formatting so the same number of digits lie to the left of the caret */
export function caretIndexAfterFormat(formatted, digitsBeforeCaret) {
  if (digitsBeforeCaret <= 0) return 0;
  let c = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      c += 1;
      if (c === digitsBeforeCaret) return i + 1;
    }
  }
  return formatted.length;
}
