const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body = null, isPublic = false) {
  const headers = { 'Content-Type': 'application/json' };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  getBookingByToken: (token) => request('GET', `/bookings/public/${token}`, null, true),
  getInvoiceByToken: (token) => request('GET', `/invoices/public/${token}`, null, true),
  createSquareRemainingSession: (booking_token) =>
    request('POST', '/payments/square/remaining', { booking_token }, true),
  /** Retainer (deposit) card checkout — uses square_deposit amount */
  createSquareDepositSession: (booking_token) =>
    request('POST', '/payments/square/deposit', { booking_token }, true),
  /** Client confirms bank/app payment — records completed payment on the booking */
  confirmBankPayment: (booking_token, body) =>
    request('POST', '/payments/portal/confirm-bank', { booking_token, ...body }, true),

  /** Save contract signature (PNG data URL) — public, uses booking token */
  signContract: (bookingToken, signature_data) =>
    request('PUT', `/contracts/${encodeURIComponent(bookingToken)}/sign`, { signature_data }, true),

  /** Clear saved signature (client can sign again) — public */
  resetContractSignature: (bookingToken) =>
    request('DELETE', `/contracts/${encodeURIComponent(bookingToken)}/signature`, null, true),
};
