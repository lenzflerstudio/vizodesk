/**
 * Public client-portal API calls (no auth header, no login redirect).
 * Used only by embedded booking UI under /booking/:token.
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body = null) {
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

export const portalPublicApi = {
  getPublicBooking: (token) => request('GET', `/public/booking/${encodeURIComponent(token)}`, null),
  createSquareRemainingSession: (booking_token) =>
    request('POST', '/payments/square/remaining', { booking_token }),
  createSquareDepositSession: (booking_token) =>
    request('POST', '/payments/square/deposit', { booking_token }),
  confirmBankPayment: (booking_token, body) =>
    request('POST', '/payments/portal/confirm-bank', { booking_token, ...body }),
  signContract: (bookingToken, signature_data) =>
    request('PUT', `/contracts/${encodeURIComponent(bookingToken)}/sign`, { signature_data }),
  resetContractSignature: (bookingToken) =>
    request('DELETE', `/contracts/${encodeURIComponent(bookingToken)}/signature`, null),
};
