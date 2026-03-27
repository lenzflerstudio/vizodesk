/** Normalize for phone comparison (digits only) */
export function phoneDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Whether a client matches a search string (full name, email, or phone).
 */
export function clientMatchesQuery(client, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return false;

  const name = String(client.full_name || '').toLowerCase();
  const email = String(client.email || '').toLowerCase();
  if (name.includes(q) || email.includes(q)) return true;

  const qDigits = phoneDigits(rawQuery);
  if (qDigits.length >= 2) {
    const pDigits = phoneDigits(client.phone);
    if (pDigits.includes(qDigits)) return true;
  }

  return false;
}
