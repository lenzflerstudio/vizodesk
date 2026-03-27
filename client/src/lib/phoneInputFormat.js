/** Digits only, max 10 US national; strips leading 1 for 11-digit input */
export function normalizeUSPhoneDigits(s) {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Display as (555) 010-0199 while typing */
export function formatUSPhoneDisplay(raw) {
  const d = normalizeUSPhoneDigits(raw);
  if (!d.length) return '';
  if (d.length < 3) return `(${d}`;
  if (d.length === 3) return `(${d})`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function phoneDigitsEqual(a, b) {
  return normalizeUSPhoneDigits(a) === normalizeUSPhoneDigits(b);
}

export function countDigitsBeforeIndex(str, index) {
  let c = 0;
  const end = Math.min(index, str.length);
  for (let i = 0; i < end; i++) {
    if (/\d/.test(str[i])) c += 1;
  }
  return c;
}

export function caretAfterUSPhoneFormat(formatted, digitsBeforeCaret) {
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
