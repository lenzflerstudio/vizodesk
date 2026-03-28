import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, Copy, ExternalLink, DollarSign, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/formatCurrency';
import { useAuth } from '../contexts/AuthContext';
import { clientBookingPortalUrl } from '../lib/portalLinks';

const MANUAL_PAY_METHODS = ['Zelle', 'Cash App', 'Venmo', 'Bank transfer', 'Cash', 'Check', 'Card', 'Other'];

export default function BookingDetail() {
  const { clientPortalBaseUrl } = useAuth();
  const { token } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordForm, setRecordForm] = useState({ amount: '', method: 'Zelle', notes: '' });

  const loadBooking = useCallback(() => {
    return api
      .getBooking(id)
      .then(setBooking)
      .catch(() => toast.error('Booking not found'));
  }, [id]);

  useEffect(() => {
    loadBooking().finally(() => setLoading(false));
  }, [loadBooking]);

  const copyLink = () => {
    const r = clientBookingPortalUrl(clientPortalBaseUrl, booking?.public_token);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    navigator.clipboard.writeText(r.url);
    toast.success('Link copied!');
  };

  const openRecordPayment = () => {
    const dep = booking?.deposit_amount != null ? Number(booking.deposit_amount) : 0;
    setRecordForm({
      amount: dep > 0 ? String(dep) : '',
      method: 'Zelle',
      notes: '',
    });
    setRecordOpen(true);
  };

  const submitRecordPayment = async (e) => {
    e.preventDefault();
    const amt = parseFloat(recordForm.amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setRecordSaving(true);
    try {
      await api.recordManualPayment({
        booking_id: booking.id,
        amount: amt,
        method: recordForm.method,
        notes: recordForm.notes.trim() || null,
      });
      toast.success('Payment recorded — dashboard totals will update');
      setRecordOpen(false);
      await loadBooking();
    } catch (err) {
      toast.error(err.message || 'Failed to record');
    } finally {
      setRecordSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  );

  if (!booking) return <div className="text-slate-400 text-center mt-16">Booking not found</div>;

  const portalLink = clientBookingPortalUrl(clientPortalBaseUrl, booking.public_token);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-overlay rounded-lg">
          <ArrowLeft size={18} className="text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">Booking #{booking.id}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2 justify-end">
          {booking.payment_status ? (
            <span className="text-xs font-medium text-slate-400 border border-surface-border rounded-full px-2.5 py-0.5">
              Payment: {booking.payment_status}
            </span>
          ) : null}
          <span className={`${booking.status === 'Paid' ? 'badge-paid' : booking.status === 'Signed' || booking.status === 'Deposit Paid' ? 'badge-signed' : 'badge-pending'}`}>
            {booking.status}
          </span>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Client</h2>
        <p className="text-white font-medium">{booking.client_name}</p>
        <p className="text-slate-400 text-sm">{booking.client_email} · {booking.client_phone}</p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Event</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div><p className="label">Type</p><p className="text-slate-200">{booking.event_type}</p></div>
          <div><p className="label">Date</p><p className="text-slate-200">{booking.event_date}</p></div>
          <div><p className="label">Package</p><p className="text-slate-200">{booking.package}</p></div>
        </div>
        {booking.package_details ? (
          <div className="rounded-lg border border-surface-border bg-surface-overlay/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Client portal — package details</p>
            {booking.package_details.display_title ? (
              <p className="text-slate-200 font-medium">{booking.package_details.display_title}</p>
            ) : null}
            {booking.package_details.tagline ? (
              <p className="text-slate-500 text-sm">{booking.package_details.tagline}</p>
            ) : null}
            {booking.package_details.features?.length ? (
              <ul className="text-sm text-slate-400 list-disc list-inside space-y-0.5">
                {booking.package_details.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div>
          <p className="label">Event time</p>
          <p className="text-slate-200 text-sm">{booking.event_time_range || '—'}</p>
        </div>
        <div>
          <p className="label">Venue address</p>
          <p className="text-slate-200 text-sm">{booking.venue_address || '—'}</p>
        </div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="label">Package price</p><p className="text-slate-200 font-semibold">{formatCurrency(booking.direct_price)}</p></div>
            <div><p className="label">Balance due by</p><p className="text-brand-light font-semibold">{booking.final_due_date || '—'}</p></div>
          </div>
          <div className="rounded-lg border border-surface-border bg-surface-overlay/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Deposit (due now)</p>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Direct / Zelle (No fee)</span>
              <span className="text-white font-medium">{formatCurrency(booking.deposit_amount)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Card payment (Square +3%)</span>
              <span className="text-white font-medium">{formatCurrency(booking.square_deposit)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-surface-border bg-surface-overlay/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Remaining balance</p>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Direct / Zelle (No fee)</span>
              <span className="text-white font-medium">{formatCurrency(booking.remaining_amount)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Card payment (Square +3%)</span>
              <span className="text-white font-medium">{formatCurrency(booking.square_remaining)}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            If the client pays entirely with Square, total card charges: {formatCurrency(booking.square_price)} (deposit + balance, each includes 3%).
          </p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Payments</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              When a client confirms in the portal (&quot;I&apos;ve sent the payment&quot;), the retainer or remaining balance
              is recorded automatically. Use Record payment here if you need to add or adjust an entry manually.
            </p>
          </div>
          <button type="button" onClick={openRecordPayment} className="btn-primary text-sm shrink-0">
            <DollarSign size={14} /> Record payment
          </button>
        </div>
        {Array.isArray(booking.payments) && booking.payments.length > 0 ? (
          <ul className="divide-y divide-surface-border rounded-lg border border-surface-border">
            {booking.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="text-slate-300">
                  {formatCurrency(p.amount)} <span className="text-slate-500">· {p.method || '—'}</span>
                </span>
                <span className="text-xs text-slate-500">
                  {p.status === 'Completed' ? (
                    <span className="text-emerald-400/90">Completed</span>
                  ) : (
                    <span className="text-amber-400/90">{p.status || '—'}</span>
                  )}
                  {p.created_at ? ` · ${new Date(p.created_at).toLocaleString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Terms &amp; conditions</h2>
        <p className="text-xs text-slate-500">Shown to the client on their booking link below pricing.</p>
        <div className="text-sm text-slate-300 whitespace-pre-wrap rounded-lg border border-surface-border bg-surface-overlay/40 p-4 max-h-[min(50vh,28rem)] overflow-y-auto">
          {booking.terms_and_conditions || '—'}
        </div>
      </div>

      {booking.contract && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Contract</h2>
            <span className={booking.contract.status === 'Signed' ? 'badge-signed' : 'badge-pending'}>
              {booking.contract.status}
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            {booking.contract.template_name}
            {booking.contract.pdf_path ? <span className="text-brand-light ml-2">(PDF)</span> : null}
          </p>
          {booking.contract.pdf_preview_url && (
            <a
              href={booking.contract.pdf_preview_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-sm text-brand-light hover:underline"
            >
              Open contract PDF (client view)
            </a>
          )}
          {booking.contract.signed_at && (
            <p className="text-xs text-slate-500">Signed: {new Date(booking.contract.signed_at).toLocaleString()}</p>
          )}
          {booking.contract.signature_data ? (
            <div className="mt-4 rounded-lg border border-surface-border bg-white p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Client signature</p>
              <img
                src={booking.contract.signature_data}
                alt="Client signature"
                className="max-h-40 w-full max-w-md object-contain object-left"
              />
            </div>
          ) : null}
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Client Booking Link</h2>
        <div className="bg-surface-overlay rounded-lg p-3 text-xs font-mono text-brand-light break-all">
          {portalLink.ok ? portalLink.url : <span className="text-amber-400/90">{portalLink.error}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink} className="btn-secondary text-sm">
            <Copy size={13} /> Copy Link
          </button>
          {portalLink.ok ? (
            <a href={portalLink.url} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
              <ExternalLink size={13} /> Open
            </a>
          ) : null}
        </div>
      </div>

      {recordOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-400" />
                Record payment
              </h2>
              <button type="button" onClick={() => setRecordOpen(false)} className="p-1.5 hover:bg-surface-overlay rounded-lg">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Booking #{booking.id} · Retainer {formatCurrency(booking.deposit_amount)} · Package {formatCurrency(booking.direct_price)}
            </p>
            <form onSubmit={submitRecordPayment} className="space-y-4">
              <div>
                <label className="label">Amount ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="input"
                  value={recordForm.amount}
                  onChange={(e) => setRecordForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Method</label>
                <select
                  className="input"
                  value={recordForm.method}
                  onChange={(e) => setRecordForm((f) => ({ ...f, method: e.target.value }))}
                >
                  {MANUAL_PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input
                  className="input"
                  placeholder="Memo, confirmation #"
                  value={recordForm.notes}
                  onChange={(e) => setRecordForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setRecordOpen(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={recordSaving}>
                  {recordSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
