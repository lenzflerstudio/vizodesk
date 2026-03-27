const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('vizo_token');
}

async function request(method, path, body = null, isPublic = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (!isPublic) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('vizo_token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function uploadForm(path, formData) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem('vizo_token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function fetchAuthorizedBlob(urlPath) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${urlPath}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    localStorage.removeItem('vizo_token');
    window.location.href = '/login';
    return null;
  }
  if (!res.ok) throw new Error('Failed to load file');
  const blob = await res.blob();
  // Force PDF MIME so Windows/browser use the inline PDF viewer, not a generic handler
  return new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
}

export const api = {
  // Auth
  login: (email, password) => request('POST', '/auth/login', { email, password }, true),
  register: (name, email, password) => request('POST', '/auth/register', { name, email, password }, true),
  me: () => request('GET', '/auth/me'),
  changePassword: (data) => request('PUT', '/auth/password', data),
  deleteAccount: (password) => request('DELETE', '/auth/account', { password }),

  // Settings (business, notifications, payments, portal URL)
  getSettings: () => request('GET', '/settings'),
  updateSettings: (data) => request('PUT', '/settings', data),
  getEmailTemplates: () => request('GET', '/settings/email-templates'),
  createEmailTemplate: (name) => request('POST', '/settings/email-templates', { name }),
  exportUserData: () => request('GET', '/settings/export'),

  // Clients
  getClients: () => request('GET', '/clients'),
  getClient: (id) => request('GET', `/clients/${id}`),
  createClient: (data) => request('POST', '/clients', data),
  updateClient: (id, data) => request('PUT', `/clients/${id}`, data),
  deleteClient: (id) => request('DELETE', `/clients/${id}`),

  // Package templates (saved offerings / deliverables for portal)
  getPackages: () => request('GET', '/packages'),
  createPackage: (data) => request('POST', '/packages', data),
  updatePackage: (id, data) => request('PUT', `/packages/${id}`, data),
  deletePackage: (id) => request('DELETE', `/packages/${id}`),

  // Bookings
  getBookings: () => request('GET', '/bookings'),
  getBooking: (id) => request('GET', `/bookings/${id}`),
  getBookingByToken: (token) => request('GET', `/bookings/public/${token}`, null, true),
  getStats: () => request('GET', '/bookings/stats'),
  createBooking: (data) => request('POST', '/bookings', data),
  updateBooking: (id, data) => request('PUT', `/bookings/${id}`, data),
  deleteBooking: (id) => request('DELETE', `/bookings/${id}`),

  // Contracts
  getContracts: () => request('GET', '/contracts'),
  getTemplates: () => request('GET', '/contracts/templates'),
  /** Uploaded PDF library (same as GET /contracts/files) */
  getContractUploads: () => request('GET', '/contracts/uploads'),
  uploadContract: (formData) => uploadForm('/contracts/upload', formData),
  deleteContractUpload: (id) => request('DELETE', `/contracts/uploads/${id}`),
  /** Raw PDF blob for previews (type application/pdf) */
  fetchContractUploadPdfBlob: async (uploadId) => {
    return fetchAuthorizedBlob(`/contracts/uploads/${uploadId}/file`);
  },
  createTemplate: (data) => request('POST', '/contracts/templates', data),
  signContract: (token, signature_data) =>
    request('PUT', `/contracts/${token}/sign`, { signature_data }, true),

  // Payments
  getPayments: () => request('GET', '/payments'),
  deletePayment: (id) => request('DELETE', `/payments/${id}`),
  recordManualPayment: (data) => request('POST', '/payments/manual', data),
  createSquareRemainingSession: (booking_token) =>
    request('POST', '/payments/square/remaining', { booking_token }, true),
  createSquareDepositSession: (booking_token) =>
    request('POST', '/payments/square/deposit', { booking_token }, true),

  // Invoices
  getInvoices: () => request('GET', '/invoices'),
  getInvoice: (id) => request('GET', `/invoices/${id}`),
  getInvoiceNextNumber: () => request('GET', '/invoices/next-number'),
  createInvoice: (data) => request('POST', '/invoices', data),
  updateInvoice: (id, data) => request('PUT', `/invoices/${id}`, data),
  deleteInvoice: (id) => request('DELETE', `/invoices/${id}`),
  recordInvoicePayment: (invoiceId, data) => request('POST', `/invoices/${invoiceId}/payments`, data),

  // Outbound email (Gmail SMTP — send only)
  sendClientDocumentsEmail: (data) => request('POST', '/email/send-documents', data),
};
