import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  CreditCard,
  Plus,
  FileText,
  Copy,
  DollarSign,
  X,
  Loader2,
  Eye,
  Pencil,
  Download,
  Mail,
  Trash2,
  PenLine,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { formatCurrency } from '../lib/formatCurrency';
import InvoiceEditorModal from '../components/InvoiceEditorModal';
import { useAuth } from '../contexts/AuthContext';
import { clientBookingPortalUrl, clientInvoicePortalUrl } from '../lib/portalLinks';
import {
  buildInvoicePrintHtml,
  openHtmlInBlobWindow,
  printWhenBlobWindowReady,
} from '../lib/invoicePrintDocument';
import SendClientDocumentsModal from '../components/SendClientDocumentsModal';
import {
  downloadBookingPaymentReceiptPdf as saveBookingReceiptPdf,
  getReceiptSummaryLines,
} from '../lib/bookingPaymentReceiptPdf';

const INVOICE_PAY_METHODS = [
  'Bank payment',
  'Bank transfer',
  'Zelle',
  'Cash App',
  'Venmo',
  'Card',
  'Check',
  'Other',
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** What this completed payment represents (uses notes + amounts when needed). */
function paymentKindLabel(p) {
  if (p.status !== 'Completed') return null;
  const n = String(p.notes || '');
  if (n.includes('Portal: retainer')) return 'Retainer paid';
  if (n.includes('Portal: remaining')) return 'Remaining balance paid';
  if (p.method === 'Square' || p.method === 'Stripe') {
    const gross = Number(p.amount) || 0;
    const sd = Number(p.square_deposit ?? p.stripe_deposit) || 0;
    const sr = Number(p.square_remaining ?? p.stripe_remaining) || 0;
    if (sd > 0 && Math.abs(gross - sd) < 0.02) return 'Retainer paid (card)';
    if (sr > 0 && Math.abs(gross - sr) < 0.02) return 'Balance paid (card)';
    return 'Card payment';
  }
  const dep = Number(p.deposit_amount) || 0;
  const amt = Number(p.amount) || 0;
  const pkg = Number(p.direct_price) || 0;
  if (dep > 0 && Math.abs(amt - dep) < 0.02) return 'Retainer paid';
  const rem = Math.max(0, roundMoney(pkg - dep));
  if (rem > 0 && Math.abs(amt - rem) < 0.02) return 'Remaining balance paid';
  return 'Payment received';
}

/** Booking-level balance state for this row (current snapshot). */
function bookingBalanceHint(p) {
  const s = String(p.booking_payment_status || 'Unpaid');
  if (s === 'Paid') return { text: 'Paid in full', className: 'text-emerald-400/85' };
  if (s === 'Deposit Paid') return { text: 'Balance remaining', className: 'text-amber-400/90' };
  return { text: 'Retainer due', className: 'text-slate-500' };
}

const ACTION_ICON =
  'inline-flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:text-white hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60';
const ACTION_ICON_DANGER =
  'inline-flex items-center justify-center rounded-lg p-2 bg-rose-500/15 text-rose-400 transition-colors hover:bg-rose-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40';

function RecordInvoicePaymentModal({ invoiceId, onClose, onSaved }) {
  const [inv, setInv] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [form, setForm] = useState({
    amount: '',
    method: 'Bank payment',
    paid_at: todayISO(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoadErr(null);
    api
      .getInvoice(invoiceId)
      .then(setInv)
      .catch((e) => setLoadErr(e.message || 'Failed to load invoice'));
  }, [invoiceId]);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      await api.recordInvoicePayment(invoiceId, {
        amount: amt,
        method: form.method,
        paid_at: form.paid_at,
        notes: form.notes.trim() || null,
      });
      toast.success('Payment recorded on invoice');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-400" />
            Record invoice payment
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-surface-overlay rounded-lg">
            <X size={16} className="text-slate-400" />
          </button>
        </div>
        {loadErr ? (
          <p className="text-sm text-red-400">{loadErr}</p>
        ) : !inv ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-7 h-7 text-brand animate-spin" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-xs text-slate-500">
              Invoice {inv.invoice_number || `#${inv.id}`} · Total {formatCurrency(inv.total)} · Remaining{' '}
              <span className="text-amber-200/90 font-medium">{formatCurrency(inv.amount_remaining)}</span>
            </p>
            <div>
              <label className="label">Amount ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                className="input"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Method (shown to client)</label>
              <select
                className="input"
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              >
                {INVOICE_PAY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Payment date</label>
              <input
                type="date"
                required
                className="input"
                value={form.paid_at}
                onChange={(e) => setForm((f) => ({ ...f, paid_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                placeholder="Reference #"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Payments() {
  const navigate = useNavigate();
  const { clientPortalBaseUrl, user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [settings, setSettings] = useState(null);
  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [recordPayInvoiceId, setRecordPayInvoiceId] = useState(null);
  const [emailDocs, setEmailDocs] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  const [portalSnapshotOpen, setPortalSnapshotOpen] = useState(false);
  const [portalSnapshotBooking, setPortalSnapshotBooking] = useState(null);
  const [portalSnapshotLoading, setPortalSnapshotLoading] = useState(false);
  /** In-app confirm (avoid window.confirm — native dialogs break keyboard focus in Electron after navigate). */
  const [paymentDeleteTarget, setPaymentDeleteTarget] = useState(null);
  const [invoiceDeleteTarget, setInvoiceDeleteTarget] = useState(null);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const showSpinner = useDelayedLoading(loading);

  const refresh = useCallback(() => {
    return Promise.all([
      api.getPayments(),
      api.getInvoices(),
      api.getBookings(),
      api.getClients(),
      api.getSettings(),
      api.getContracts(),
    ])
      .then(([p, inv, b, cl, s, ct]) => {
        setPayments(p);
        setInvoices(inv);
        setBookings(b);
        setClients(cl);
        setSettings(s);
        setContracts(ct);
      })
      .catch(() => toast.error('Failed to load data'));
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const handleInvoiceSaved = () => {
    refresh();
  };

  const openInvoiceView = (inv) => {
    navigate(`/invoice/${inv.id}`);
  };

  const downloadInvoicePdf = async (inv) => {
    try {
      const full = await api.getInvoice(inv.id);
      const html = buildInvoicePrintHtml(full, settings || {});
      const { ok, window: w } = openHtmlInBlobWindow(html);
      if (!ok || !w) {
        toast.error('Popup blocked — allow popups to print or save as PDF');
        return;
      }
      printWhenBlobWindowReady(w);
    } catch (e) {
      toast.error(e.message || 'Failed to open print view');
    }
  };

  const copyInvoiceLink = (inv) => {
    const tok = inv.public_token;
    if (!tok) {
      toast.error('This invoice has no share link yet — save a new copy from the server after update.');
      return;
    }
    const r = clientInvoicePortalUrl(clientPortalBaseUrl, tok);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    navigator.clipboard.writeText(r.url);
    toast.success('Client invoice link copied');
  };

  const total = payments.filter((p) => p.status === 'Completed').reduce((s, p) => s + p.amount, 0);

  function estTaxTotal(p) {
    if (p.status !== 'Completed') return null;
    return Math.round(
      (Number(p.est_sales_tax) || 0) +
        (Number(p.est_se_tax) || 0) +
        (Number(p.est_federal_tax) || 0) +
        (Number(p.est_state_tax) || 0)
    );
  }

  const contractForBookingId = (bookingId) => {
    if (bookingId == null) return null;
    return contracts.find((c) => Number(c.booking_id) === Number(bookingId)) || null;
  };

  const contractForInvoiceBooking = (inv) => contractForBookingId(inv.booking_id);

  const showSignatureModalForBooking = (bookingId, caption) => {
    const ct = contractForBookingId(bookingId);
    const data = ct?.signature_data && String(ct.signature_data).trim();
    if (!data) {
      toast.error('No signature on file for this booking yet.');
      return;
    }
    setSignaturePreview({
      src: data,
      caption,
      signedAt: ct.signed_at || null,
    });
  };

  const openInvoiceLinkedSignature = (inv) => {
    if (inv.booking_id == null) {
      toast.error('Link this invoice to a booking to view a client signature.');
      return;
    }
    showSignatureModalForBooking(inv.booking_id, `Invoice ${inv.invoice_number || `#${inv.id}`}`);
  };

  const openPaymentPortalSnapshot = async (p) => {
    setPortalSnapshotOpen(true);
    setPortalSnapshotLoading(true);
    setPortalSnapshotBooking(null);
    try {
      const data = await api.getBooking(p.booking_id);
      setPortalSnapshotBooking(data);
    } catch (e) {
      toast.error(e.message || 'Failed to load booking');
      setPortalSnapshotOpen(false);
    } finally {
      setPortalSnapshotLoading(false);
    }
  };

  const downloadBookingReceiptPdf = async () => {
    if (!portalSnapshotBooking) {
      toast.error('Nothing to export');
      return;
    }
    try {
      await saveBookingReceiptPdf(portalSnapshotBooking, settings || {}, user);
      toast.success('Receipt PDF download started');
    } catch (e) {
      console.error(e);
      toast.error('Could not create receipt PDF.');
    }
  };

  const copyPaymentBookingLink = (p) => {
    const r = clientBookingPortalUrl(clientPortalBaseUrl, p.public_token);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    navigator.clipboard.writeText(r.url);
    toast.success('Client booking link copied');
  };

  const deletePaymentRow = (p) => {
    setPaymentDeleteTarget(p);
  };

  const runDeletePayment = async () => {
    const p = paymentDeleteTarget;
    if (!p) return;
    setDeletingPayment(true);
    try {
      await api.deletePayment(p.id);
      toast.success('Payment deleted');
      setPaymentDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(e.message || 'Failed to delete');
    } finally {
      setDeletingPayment(false);
    }
  };

  const requestDeleteInvoice = (inv) => {
    const st = String(inv.status || '').toLowerCase();
    if (st !== 'draft') {
      toast.error('Only draft invoices can be deleted');
      return;
    }
    setInvoiceDeleteTarget(inv);
  };

  const runDeleteInvoice = async () => {
    const inv = invoiceDeleteTarget;
    if (!inv) return;
    setDeletingInvoice(true);
    try {
      await api.deleteInvoice(inv.id);
      toast.success('Invoice deleted');
      setInvoiceDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(e.message || 'Failed to delete');
    } finally {
      setDeletingInvoice(false);
    }
  };

  const openEmailForInvoice = (inv) => {
    const linked = contractForInvoiceBooking(inv);
    setEmailDocs({
      invoice: {
        id: inv.id,
        client_email: inv.client_email,
        invoice_number: inv.invoice_number,
        public_token: inv.public_token,
      },
      contract: linked
        ? {
            id: linked.id,
            client_email: linked.client_email,
            template_name: linked.template_name,
            pdf_path: linked.pdf_path,
            public_token: linked.public_token,
          }
        : null,
    });
  };

  const statusBadge = (st) => {
    const s = String(st || 'draft').toLowerCase();
    if (s === 'paid') return <span className="badge-paid">Paid</span>;
    if (s === 'sent') return <span className="badge-signed">Sent</span>;
    return <span className="badge-pending">Draft</span>;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments &amp; invoices</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Total collected: <span className="text-emerald-400 font-semibold">${total.toLocaleString()}</span>
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditingInvoiceId(null);
            setShowInvoiceModal(true);
          }}
        >
          <Plus size={16} /> Create invoice
        </button>
      </div>

      {showSpinner ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-slate-500" />
              <h2 className="text-lg font-semibold text-white">Invoices</h2>
            </div>
            {invoices.length === 0 ? (
              <div className="card text-center py-10 text-slate-600 text-sm">
                No invoices yet. Use <span className="text-slate-400">Create invoice</span> to build one for your client.
              </div>
            ) : (
              <div className="card overflow-hidden p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                  <thead className="border-b border-surface-border bg-surface">
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Customer</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Invoice #</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Due</th>
                      <th className="text-right text-xs font-medium text-slate-500 px-5 py-3">Total</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Status</th>
                      <th className="text-right text-xs font-medium text-slate-500 px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {invoices.map((inv) => {
                      const linkedContract = contractForInvoiceBooking(inv);
                      const hasSignedSignature = !!(
                        linkedContract?.signature_data && String(linkedContract.signature_data).trim()
                      );
                      return (
                      <tr key={inv.id} className="hover:bg-surface-overlay/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-slate-200">{inv.client_name || '—'}</td>
                        <td className="px-5 py-3.5 text-slate-400">{inv.invoice_number || `#${inv.id}`}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">{inv.invoice_date || '—'}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">{inv.payment_due_date || '—'}</td>
                        <td className="px-5 py-3.5 text-right text-emerald-400 font-semibold tabular-nums">
                          {formatCurrency(inv.total)}
                        </td>
                        <td className="px-5 py-3.5">{statusBadge(inv.status)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-0.5">
                            <button
                              type="button"
                              className={`${ACTION_ICON} text-brand-light hover:text-brand-light`}
                              title="View invoice"
                              aria-label="View invoice"
                              onClick={() => openInvoiceView(inv)}
                            >
                              <Eye size={16} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={`${ACTION_ICON} ${
                                inv.booking_id != null && hasSignedSignature
                                  ? 'text-fuchsia-300/90 hover:text-fuchsia-200'
                                  : 'opacity-40'
                              }`}
                              title={
                                inv.booking_id == null
                                  ? 'Link a booking on the invoice to view signature'
                                  : hasSignedSignature
                                    ? 'View client signature'
                                    : 'No signature yet — client signs on the booking link'
                              }
                              aria-label="View client signature for linked booking"
                              onClick={() => openInvoiceLinkedSignature(inv)}
                            >
                              <PenLine size={16} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={ACTION_ICON}
                              title="Edit invoice"
                              aria-label="Edit invoice"
                              onClick={() => {
                                setEditingInvoiceId(inv.id);
                                setShowInvoiceModal(true);
                              }}
                            >
                              <Pencil size={16} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={ACTION_ICON}
                              title="Download / print PDF"
                              aria-label="Download or print PDF"
                              onClick={() => downloadInvoicePdf(inv)}
                            >
                              <Download size={16} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={`${ACTION_ICON} hover:text-sky-300`}
                              title="Email to client"
                              aria-label="Email to client"
                              onClick={() => openEmailForInvoice(inv)}
                            >
                              <Mail size={16} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={`${ACTION_ICON} text-brand-light hover:text-brand-light`}
                              title="Copy invoice link"
                              aria-label="Copy invoice link"
                              onClick={() => copyInvoiceLink(inv)}
                            >
                              <Copy size={16} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={ACTION_ICON}
                              title="Record payment"
                              aria-label="Record payment"
                              onClick={() => setRecordPayInvoiceId(inv.id)}
                            >
                              <DollarSign size={16} strokeWidth={1.75} />
                            </button>
                            {String(inv.status || '').toLowerCase() === 'draft' ? (
                              <button
                                type="button"
                                className={ACTION_ICON_DANGER}
                                title="Delete draft invoice"
                                aria-label="Delete draft invoice"
                                onClick={() => requestDeleteInvoice(inv)}
                              >
                                <Trash2 size={16} strokeWidth={1.75} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={18} className="text-slate-500" />
              <h2 className="text-lg font-semibold text-white">Payment history</h2>
            </div>
            {payments.length === 0 ? (
              <div className="card text-center py-14 text-slate-600">
                <CreditCard size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No payments recorded yet.</p>
              </div>
            ) : (
              <div className="card overflow-hidden p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="border-b border-surface-border bg-surface">
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Client</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Amount</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Est. taxes</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Method</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Payment</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Booking</th>
                      <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Date</th>
                      <th className="text-right text-xs font-medium text-slate-500 px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {payments.map((p) => {
                      const taxT = estTaxTotal(p);
                      const kind = paymentKindLabel(p);
                      const hint = bookingBalanceHint(p);
                      return (
                        <tr key={p.id} className="hover:bg-surface-overlay/40 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-200">{p.client_name}</td>
                          <td className="px-5 py-3.5 text-emerald-400 font-semibold">${Number(p.amount).toLocaleString()}</td>
                          <td
                            className="px-5 py-3.5 text-slate-400 text-xs"
                            title="Sales + marginal SE, federal, state (see Taxes page)"
                          >
                            {taxT == null ? (
                              '—'
                            ) : (
                              <span className="text-amber-200/90 font-medium tabular-nums">${taxT.toLocaleString()}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400">{p.method}</td>
                          <td className="px-5 py-3.5">
                            {p.status === 'Completed' ? (
                              <span className="inline-flex rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400/95">
                                {kind || 'Received'}
                              </span>
                            ) : (
                              <span className="badge-pending">Pending</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className={`text-xs font-medium ${hint.className}`}>{hint.text}</p>
                            <p className="text-[10px] text-slate-600 mt-0.5">{p.package || '—'}</p>
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 text-xs">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                className={`${ACTION_ICON} text-fuchsia-300/90 hover:text-fuchsia-200`}
                                title="View payment receipt (download PDF)"
                                aria-label="View booking payment receipt"
                                onClick={() => openPaymentPortalSnapshot(p)}
                              >
                                <Eye size={16} strokeWidth={1.75} />
                              </button>
                              {p.public_token ? (
                                <button
                                  type="button"
                                  className={`${ACTION_ICON} text-brand-light hover:text-brand-light`}
                                  title="Copy client booking link"
                                  aria-label="Copy client booking link"
                                  onClick={() => copyPaymentBookingLink(p)}
                                >
                                  <Copy size={16} strokeWidth={1.75} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={ACTION_ICON_DANGER}
                                title="Delete payment"
                                aria-label="Delete payment"
                                onClick={() => deletePaymentRow(p)}
                              >
                                <Trash2 size={16} strokeWidth={1.75} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {showInvoiceModal && (
        <InvoiceEditorModal
          open={showInvoiceModal}
          invoiceId={editingInvoiceId}
          onClose={() => {
            setShowInvoiceModal(false);
            setEditingInvoiceId(null);
          }}
          onSaved={handleInvoiceSaved}
          clients={clients}
          bookings={bookings}
          settings={settings}
        />
      )}

      {recordPayInvoiceId != null && (
        <RecordInvoicePaymentModal
          invoiceId={recordPayInvoiceId}
          onClose={() => setRecordPayInvoiceId(null)}
          onSaved={refresh}
        />
      )}

      {emailDocs && (
        <SendClientDocumentsModal
          open={!!emailDocs}
          gmailReady={!!settings?.gmail_outbound_ready}
          invoice={emailDocs.invoice}
          contract={emailDocs.contract}
          onClose={() => setEmailDocs(null)}
          onSent={refresh}
        />
      )}

      {paymentDeleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-payment-title"
          onClick={() => !deletingPayment && setPaymentDeleteTarget(null)}
        >
          <div
            className="card w-full max-w-md border border-surface-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-payment-title" className="text-lg font-semibold text-white">
              Delete payment?
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Delete this {formatCurrency(paymentDeleteTarget.amount)} payment for{' '}
              <span className="text-slate-200">{paymentDeleteTarget.client_name}</span>? The booking’s payment status
              will be recalculated.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingPayment}
                onClick={() => setPaymentDeleteTarget(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary bg-rose-600 hover:bg-rose-500" disabled={deletingPayment} onClick={runDeletePayment}>
                {deletingPayment ? <Loader2 size={16} className="animate-spin" /> : 'Delete payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceDeleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-invoice-title"
          onClick={() => !deletingInvoice && setInvoiceDeleteTarget(null)}
        >
          <div
            className="card w-full max-w-md border border-surface-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-invoice-title" className="text-lg font-semibold text-white">
              Delete draft invoice?
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Delete draft invoice {invoiceDeleteTarget.invoice_number || `#${invoiceDeleteTarget.id}`}? This cannot be
              undone.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingInvoice}
                onClick={() => setInvoiceDeleteTarget(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary bg-rose-600 hover:bg-rose-500" disabled={deletingInvoice} onClick={runDeleteInvoice}>
                {deletingInvoice ? <Loader2 size={16} className="animate-spin" /> : 'Delete invoice'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {portalSnapshotOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-snapshot-title"
          onClick={() => {
            setPortalSnapshotOpen(false);
            setPortalSnapshotBooking(null);
          }}
        >
          <div
            className="card w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col border border-surface-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-surface-border shrink-0">
              <div>
                <h2 id="portal-snapshot-title" className="text-lg font-semibold text-white">
                  Payment receipt
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Plain receipt (like an invoice): retainer and paid-in-full dates, payment lines, and amount due — not a
                  full portal screenshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPortalSnapshotOpen(false);
                  setPortalSnapshotBooking(null);
                }}
                className="p-1.5 rounded-lg hover:bg-surface-overlay text-slate-400"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 bg-[#0a0a0f]">
              {portalSnapshotLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 text-brand animate-spin" />
                  <p className="text-sm text-slate-500">Loading booking…</p>
                </div>
              ) : portalSnapshotBooking ? (
                <div className="rounded-lg border border-surface-border bg-surface-overlay/50 p-4 text-sm text-slate-300 space-y-3">
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Preview — PDF will include</p>
                  <ul className="list-disc list-inside space-y-2 text-slate-200">
                    {getReceiptSummaryLines(portalSnapshotBooking).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500 pt-2 border-t border-surface-border">
                    {portalSnapshotBooking.client_name} · {portalSnapshotBooking.event_type || 'Event'} ·{' '}
                    {portalSnapshotBooking.event_date || '—'}
                  </p>
                </div>
              ) : null}
            </div>
            {portalSnapshotBooking && !portalSnapshotLoading ? (
              <div className="p-4 border-t border-surface-border flex flex-wrap gap-2 justify-end shrink-0">
                <button type="button" className="btn-secondary text-sm" onClick={downloadBookingReceiptPdf}>
                  <Download size={16} className="inline mr-1.5 -mt-0.5" />
                  Download receipt PDF
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {signaturePreview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-sig-preview-title"
          onClick={() => setSignaturePreview(null)}
        >
          <div
            className="card w-full max-w-lg border border-surface-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 id="invoice-sig-preview-title" className="text-lg font-semibold text-white">
                  Client signature
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {signaturePreview.caption}
                  {signaturePreview.signedAt
                    ? ` · Signed ${new Date(signaturePreview.signedAt).toLocaleString()}`
                    : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSignaturePreview(null)}
                className="p-1.5 rounded-lg hover:bg-surface-overlay text-slate-400"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rounded-xl border border-surface-border bg-white p-4">
              <img
                src={signaturePreview.src}
                alt="Client signature"
                className="max-h-56 w-full object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
