import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { computePackageBreakdown, finalDueDateFromEvent } from '../lib/bookingPricing';
import { ArrowLeft, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import ClientBookingFields from '../components/ClientBookingFields';
import { formatCurrency } from '../lib/formatCurrency';
import {
  stripPackagePriceDecorations,
  formatPackagePriceAsYouType,
  formatPackagePriceBlur,
  countDigitsBeforeIndex,
  caretIndexAfterFormat,
} from '../lib/packagePriceInputFormat';
import { useAuth } from '../contexts/AuthContext';
import { clientBookingPortalUrl } from '../lib/portalLinks';
import { DEFAULT_BOOKING_TERMS } from '../data/defaultBookingTerms';

export default function NewBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clientPortalBaseUrl } = useAuth();
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createdBooking, setCreatedBooking] = useState(null);

  const DEFAULT_FORM = {
    client_id: '',
    new_client_name: '',
    new_client_email: '',
    new_client_phone: '',
    event_type: '',
    event_date: '',
    package: '',
    package_template_id: null,
    event_time_range: '',
    venue_address: '',
    venue_not_applicable: false,
    package_price: '',
    terms_and_conditions: DEFAULT_BOOKING_TERMS,
  };

  const [form, setForm] = useState(DEFAULT_FORM);
  const packagePriceInputRef = useRef(null);
  const packagePriceCaretDigits = useRef(null);

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM });
  };

  useEffect(() => {
    Promise.all([api.getClients(), api.getPackages()])
      .then(([c, pk]) => {
        setClients(c);
        setPackages(pk);
      })
      .catch(() => {});
  }, []);

  // Native confirm() (e.g. old delete flow) can leave Electron/browser without keyboard focus; restore on enter
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.focus?.();
    });
    return () => cancelAnimationFrame(id);
  }, [location.key]);

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handlePackageNameChange = (e) => {
    setForm((f) => ({
      ...f,
      package: e.target.value,
      package_template_id: null,
    }));
  };

  const handleSavedPackageChange = (e) => {
    const v = e.target.value;
    if (!v) {
      setForm((f) => ({ ...f, package_template_id: null }));
      return;
    }
    const id = Number(v);
    const t = packages.find((p) => Number(p.id) === id);
    if (!t) return;
    setForm((f) => {
      const next = {
        ...f,
        package: t.label,
        package_template_id: id,
      };
      if (t.suggested_price != null && Number.isFinite(Number(t.suggested_price))) {
        next.package_price = formatPackagePriceBlur(String(t.suggested_price));
      }
      return next;
    });
  };

  const handlePackagePriceChange = (e) => {
    const incoming = e.target.value;
    const sel = e.target.selectionStart ?? incoming.length;
    packagePriceCaretDigits.current = countDigitsBeforeIndex(incoming, sel);
    const formatted = formatPackagePriceAsYouType(incoming);
    setForm((f) => ({ ...f, package_price: formatted }));
  };

  useLayoutEffect(() => {
    const digits = packagePriceCaretDigits.current;
    if (digits === null) return;
    const el = packagePriceInputRef.current;
    if (!el || document.activeElement !== el) {
      packagePriceCaretDigits.current = null;
      return;
    }
    const pos = caretIndexAfterFormat(form.package_price, digits);
    el.setSelectionRange(pos, pos);
    packagePriceCaretDigits.current = null;
  }, [form.package_price]);

  const handlePackagePriceBlur = () => {
    packagePriceCaretDigits.current = null;
    setForm((f) => ({
      ...f,
      package_price: formatPackagePriceBlur(f.package_price),
    }));
  };

  const pricing = useMemo(() => {
    const raw = stripPackagePriceDecorations(form.package_price);
    const parsed = raw === '' || raw === '.' ? 0 : Number.parseFloat(raw);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    const { packagePrice, depositAmount, remainingAmount } = computePackageBreakdown(amount);
    return {
      packagePrice,
      depositAmount,
      remainingAmount,
      finalDueDate: finalDueDateFromEvent(form.event_date),
    };
  }, [form.package_price, form.event_date]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id && !String(form.new_client_name || '').trim()) {
      return toast.error('Please enter a client name');
    }
    if (!String(form.event_type || '').trim()) {
      return toast.error('Enter an event type');
    }
    if (!pricing.packagePrice || pricing.packagePrice <= 0) {
      return toast.error('Enter a valid package price');
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        event_type: String(form.event_type).trim(),
        direct_price: String(pricing.packagePrice),
        client_id: form.client_id || null,
        package_template_id: form.package_template_id != null ? form.package_template_id : null,
      };
      delete payload.package_price;
      if (!String(payload.event_time_range || '').trim()) {
        payload.event_time_range = null;
      }
      if (!payload.venue_not_applicable && !String(payload.venue_address || '').trim()) {
        payload.venue_address = null;
      }
      {
        const t = String(payload.terms_and_conditions ?? '').trim();
        payload.terms_and_conditions = t === '' ? null : t;
      }
      const booking = await api.createBooking(payload);
      toast.success('Booking created!');
      setCreatedBooking(booking);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    const r = clientBookingPortalUrl(clientPortalBaseUrl, createdBooking.public_token);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    navigator.clipboard.writeText(r.url);
    toast.success('Client link copied!');
  };

  const createdLink = createdBooking
    ? clientBookingPortalUrl(clientPortalBaseUrl, createdBooking.public_token)
    : null;

  if (createdBooking) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="card text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <span className="text-3xl">✅</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Booking Created!</h2>
            <p className="text-slate-400 text-sm mt-1">Share this link with your client</p>
          </div>
          <div className="bg-surface-overlay border border-surface-border rounded-lg p-3 text-left text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Package</span>
              <span className="text-white font-medium">{formatCurrency(createdBooking.direct_price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Deposit (30%)</span>
              <span className="text-white font-medium">{formatCurrency(createdBooking.deposit_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Balance due</span>
              <span className="text-white font-medium">{formatCurrency(createdBooking.remaining_amount)}</span>
            </div>
            {createdBooking.final_due_date && (
              <div className="flex justify-between pt-1 border-t border-surface-border">
                <span className="text-slate-500">Balance due by</span>
                <span className="text-brand-light font-medium">{createdBooking.final_due_date}</span>
              </div>
            )}
          </div>
          <div className="bg-surface-overlay border border-surface-border rounded-lg p-3 text-left">
            <p className="text-xs text-slate-500 mb-1">Client booking link</p>
            {createdLink?.ok ? (
              <p className="text-sm text-brand-light break-all font-mono">{createdLink.url}</p>
            ) : (
              <p className="text-sm text-amber-400/90">
                {createdLink?.error || 'Configure your Client Portal URL in Settings to show the shareable link.'}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={copyLink}
              disabled={!createdLink?.ok}
              title={!createdLink?.ok ? 'Set Client Portal URL in Settings first' : undefined}
              className="btn-primary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Copy size={14} /> Copy Link
            </button>
            <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary flex-1 justify-center">
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-surface-overlay rounded-lg transition-colors">
          <ArrowLeft size={18} className="text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">New Booking</h1>
          <p className="text-slate-500 text-sm">Create a booking and generate a client link</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* Client Info — typeahead on full name */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-surface-border pb-3">Client Information</h2>
          <ClientBookingFields
            key={location.key}
            clients={clients}
            form={form}
            setForm={setForm}
          />
        </div>

        {/* Event Details */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-surface-border pb-3">Event Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Event Type *</label>
              <input
                name="event_type"
                type="text"
                required
                className="input"
                placeholder="Wedding"
                value={form.event_type}
                onChange={handle}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label">Event Date *</label>
              <input name="event_date" type="date" required className="input" value={form.event_date} onChange={handle} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Saved package</label>
              <select
                className="input"
                value={form.package_template_id != null ? String(form.package_template_id) : ''}
                onChange={handleSavedPackageChange}
              >
                <option value="">Custom (type package name below)</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600 mt-1">
                Choose a saved package to link deliverables for the client portal. Edit templates under Packages.
              </p>
            </div>
            <div>
              <label className="label">Package name</label>
              <input
                name="package"
                className="input"
                placeholder="e.g. Photo + Video (6 Hours)"
                value={form.package}
                onChange={handlePackageNameChange}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Event time</label>
            <input
              name="event_time_range"
              type="text"
              className="input"
              placeholder="e.g. 12pm to 5pm, or noon – 6:30pm"
              value={form.event_time_range}
              onChange={handle}
              autoComplete="off"
            />
            <p className="text-xs text-slate-600">Type the window your client asked for — any format you like.</p>
          </div>

          <div className="space-y-2">
            <label className="label">Venue address</label>
            <input
              name="venue_address"
              type="text"
              className="input"
              placeholder="Street, city, state / venue name"
              value={form.venue_address}
              onChange={handle}
              disabled={form.venue_not_applicable}
              autoComplete="street-address"
            />
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-400 hover:text-slate-300">
              <input
                type="checkbox"
                className="rounded border-surface-border bg-surface text-brand focus:ring-brand/40"
                checked={form.venue_not_applicable}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    venue_not_applicable: e.target.checked,
                    venue_address: e.target.checked ? '' : f.venue_address,
                  }))
                }
              />
              <span>Does not apply (N/A)</span>
            </label>
            <p className="text-xs text-slate-600">
              When N/A is checked, the booking stores “N/A” for venue (e.g. studio sessions or TBD later).
            </p>
          </div>
        </div>

        {/* Pricing */}
        <div className="card space-y-4">
          <div className="border-b border-surface-border pb-3">
            <h2 className="text-sm font-semibold text-slate-300">Pricing</h2>
            <p className="text-xs text-slate-500 mt-1">
              Deposit and remaining balance are shown at direct (bank) payment amounts.
            </p>
          </div>

          <div>
            <label className="label">Package price ($) — full service total</label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 select-none"
                aria-hidden
              >
                $
              </span>
              <input
                ref={packagePriceInputRef}
                name="package_price"
                type="text"
                inputMode="decimal"
                required
                className="input pl-7"
                placeholder="2,000.00"
                autoComplete="off"
                value={form.package_price}
                onChange={handlePackagePriceChange}
                onBlur={handlePackagePriceBlur}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Deposit is always 30% of this amount. Remaining balance is the other 70%.</p>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-overlay/50 p-4 space-y-4">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-sm">Package price</span>
              <span className="text-lg font-bold text-white">{formatCurrency(pricing.packagePrice)}</span>
            </div>

            <div className="border-t border-surface-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Deposit (due now)</p>
              <div className="rounded-md bg-surface-overlay p-3 border border-surface-border text-sm">
                <p className="text-xs text-slate-500 mb-0.5 leading-snug">Direct / Zelle (No fee)</p>
                <p className="text-base font-semibold text-white">{formatCurrency(pricing.depositAmount)}</p>
              </div>
            </div>

            <div className="border-t border-surface-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Remaining balance
                {pricing.finalDueDate ? (
                  <span className="normal-case font-normal text-slate-500"> (due {pricing.finalDueDate} — 7 days before event)</span>
                ) : (
                  <span className="normal-case font-normal text-slate-500"> (due 7 days before event)</span>
                )}
              </p>
              <div className="rounded-md bg-surface-overlay p-3 border border-surface-border text-sm">
                <p className="text-xs text-slate-500 mb-0.5 leading-snug">Direct / Zelle (No fee)</p>
                <p className="text-base font-semibold text-white">{formatCurrency(pricing.remainingAmount)}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-surface-border pt-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">Terms &amp; conditions</h2>
              <p className="text-xs text-slate-500 mt-1">
                This is the agreement: it appears on the client link below pricing, and clients can sign there — no
                separate contract file needed.
              </p>
            </div>
            <textarea
              name="terms_and_conditions"
              className="input min-h-[220px] resize-y font-sans leading-relaxed"
              rows={14}
              value={form.terms_and_conditions}
              onChange={handle}
              spellCheck
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={resetForm} className="btn-secondary">
            Reset Form
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Create Booking & Generate Link'}
          </button>
        </div>
      </form>
    </div>
  );
}
