import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portalPublicApi as api } from '../lib/portalPublicApi';
import { formatCurrency } from '../lib/formatCurrency';
import { Calendar, MapPin, User, Sparkles, FileText, Wallet, Clapperboard, ListChecks } from 'lucide-react';
import DepositPayPicker from '../components/portal/DepositPayPicker.jsx';
import ContractSignatureSection from '../components/portal/ContractSignatureSection.jsx';
import { effectivePackagePaid } from '../lib/effectivePaid';
import {
  coverageItemsArray,
  featuresWithoutCoverageHeadingDuplicate,
} from '../lib/packageDisplay';

function PortalShell({ children }) {
  return (
    <div className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#050508] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-[40%] left-1/2 h-[min(90vh,720px)] w-[min(140vw,900px)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(192,38,211,0.12)_0%,transparent_58%)]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[min(70vh,560px)] w-[min(90vw,640px)] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.07)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,8,0)_0%,#050508_85%)]" />
      </div>
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </div>
    </div>
  );
}

function Section({ eyebrow, title, icon: Icon, children, className = '' }) {
  return (
    <section
      className={`rounded-[1.35rem] border border-white/[0.07] bg-zinc-900/40 p-6 sm:p-7 backdrop-blur-2xl shadow-portal-card ${className}`}
    >
      {(eyebrow || title || Icon) && (
        <header className="mb-5 flex flex-wrap items-start gap-3">
          {Icon ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Icon size={20} strokeWidth={1.75} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{eyebrow}</p>
            ) : null}
            {title ? <h2 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2> : null}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      {Icon ? (
        <span className="mt-0.5 text-zinc-500">
          <Icon size={16} strokeWidth={1.75} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="mt-0.5 text-[15px] leading-snug text-zinc-100">{value}</p>
      </div>
    </div>
  );
}

function PriceTile({ label, amount }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3.5 transition-colors hover:border-white/[0.1]">
      <p className="text-[11px] font-medium leading-snug text-zinc-500">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-white">{amount}</p>
    </div>
  );
}

function PaidPriceRow({ label, amount }) {
  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium leading-snug text-zinc-500">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-white/90">{amount}</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
          Paid
        </span>
      </div>
    </div>
  );
}

function isStandaloneTermsHeading(line) {
  return /^terms\s*&\s*conditions\s*:?\s*$/i.test(String(line || '').trim());
}

function TermsBody({ text }) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => !isStandaloneTermsHeading(line));
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-4 sm:p-5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const raw = line.trimEnd();
        const idx = raw.indexOf(':');
        const hasHeading =
          idx > 0 &&
          idx < raw.length - 1 &&
          raw.slice(0, idx).trim().length > 0;
        if (hasHeading) {
          const body = raw.slice(idx + 1);
          if (body.startsWith('//')) {
            return (
              <p key={i} className="mb-3.5 last:mb-0 text-zinc-400">
                {raw}
              </p>
            );
          }
          const heading = `${raw.slice(0, idx).trim()}:`;
          return (
            <p key={i} className="mb-3.5 last:mb-0">
              <span className="font-semibold text-fuchsia-400">{heading}</span>
              <span className="text-zinc-400">{body}</span>
            </p>
          );
        }
        if (raw === '') {
          return <div key={i} className="h-3 last:hidden" aria-hidden />;
        }
        return (
          <p key={i} className="mb-3.5 last:mb-0 text-zinc-400">
            {raw}
          </p>
        );
      })}
    </div>
  );
}

/** Shared client booking portal UI (used by standalone portal app and admin `/booking/:token`). */
export default function PortalBookingView({ token }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selectionFeaturesExpanded, setSelectionFeaturesExpanded] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError(true);
      setBooking(null);
      return;
    }
    setLoadError(false);
    setBooking(null);
    api
      .getPublicBooking(token)
      .then(setBooking)
      .catch(() => setLoadError(true));
  }, [token]);

  useEffect(() => {
    setSelectionFeaturesExpanded(false);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const q = new URLSearchParams(location.search);
    if (q.get('recorded') !== '1') return;
    api
      .getPublicBooking(token)
      .then(setBooking)
      .catch(() => {});
    toast.success('Payment recorded. Thank you!');
    navigate(`/payment/${token}`, { replace: true });
  }, [location.search, token, navigate]);

  if (loadError || !token) {
    return (
      <PortalShell>
        <div className="mx-auto max-w-md py-24 text-center text-sm text-zinc-500">
          <p className="text-zinc-300">This booking link is invalid or no longer available.</p>
        </div>
      </PortalShell>
    );
  }

  if (!booking) {
    return (
      <PortalShell>
        <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm text-zinc-500">Loading your booking…</p>
        </div>
      </PortalShell>
    );
  }

  const depositDirect = Number(booking.deposit_amount) || 0;
  const scheduledRemainingDirect = Number(booking.remaining_amount) || 0;
  const depositSquare = Number(booking.square_deposit ?? booking.stripe_deposit) || 0;
  const packagePrice = Number(booking.direct_price) || 0;

  const paidNet = effectivePackagePaid(booking.payments);
  /** If there is no deposit row (e.g. retainer “first month not due now”), skip straight to balance phase. */
  const depositDue = depositDirect > 0.005;
  const depositPaid = !depositDue || paidNet + 0.005 >= depositDirect;
  const fullyPaid = packagePrice > 0 && paidNet + 0.005 >= packagePrice;
  const remainingOwedDirect = Math.max(0, Math.round((packagePrice - paidNet) * 100) / 100);
  const remainingOwedSquare = Math.round(remainingOwedDirect * 1.03 * 100) / 100;

  const showRemainingScheduled = !depositPaid;
  const remainingDirectDisplay = showRemainingScheduled ? scheduledRemainingDirect : remainingOwedDirect;

  const paymentPhase = fullyPaid ? 'complete' : !depositPaid ? 'retainer' : 'remaining';

  const pkg = booking.package_details;
  const packageName = String(booking.package || '').trim();
  const featuresList = featuresWithoutCoverageHeadingDuplicate(pkg?.features, pkg?.coverage_heading);
  const coverageItemsList = coverageItemsArray(pkg);
  const coverageHeadingText = String(pkg?.coverage_heading || '').trim() || null;
  const showPackageBlock =
    Boolean(packageName) ||
    Boolean(
      pkg &&
        (pkg.display_title ||
          pkg.tagline ||
          featuresList.length > 0 ||
          coverageItemsList.length > 0 ||
          coverageHeadingText)
    );

  const taglineText = pkg?.tagline?.trim() || null;

  const retainerPlan = Array.isArray(booking.retainer_engagement) ? booking.retainer_engagement : null;
  const isRetainerBooking = Boolean(retainerPlan?.length);

  return (
    <PortalShell>
      <div className="mx-auto max-w-lg space-y-7 sm:space-y-8">
        <div className="text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Client portal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-[2rem] sm:leading-tight">
            Booking summary
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
            Review your event details, package, and pricing in one place.
          </p>
        </div>

        <Section eyebrow="Event" title="Details" icon={Calendar}>
          <div className="divide-y divide-white/[0.06]">
            <DetailRow icon={User} label="Client" value={booking.client_name} />
            <DetailRow
              icon={Clapperboard}
              label={retainerPlan ? 'Service title' : 'Event'}
              value={booking.event_type}
            />
            <DetailRow icon={Calendar} label={retainerPlan ? 'Start date' : 'Date'} value={booking.event_date} />
            {booking.event_time_range ? (
              <DetailRow
                icon={Calendar}
                label={retainerPlan ? 'Shoot window' : 'Event time'}
                value={booking.event_time_range}
              />
            ) : null}
            {booking.venue_address ? (
              <DetailRow
                icon={MapPin}
                label={retainerPlan ? 'Location' : 'Venue'}
                value={booking.venue_address}
              />
            ) : null}
          </div>
        </Section>

        {retainerPlan?.length ? (
          <Section eyebrow="Your plan" title="What you're getting" icon={ListChecks}>
            <div className="divide-y divide-white/[0.06]">
              {retainerPlan.map((row, i) => (
                <DetailRow key={`${i}-${row.label}`} label={row.label} value={row.value} />
              ))}
            </div>
          </Section>
        ) : null}

        {showPackageBlock ? (
          <Section eyebrow="Your selection" icon={Sparkles}>
            <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-5 sm:p-6">
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Package type</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {pkg?.icon ? (
                      <span className="text-3xl leading-none" aria-hidden>
                        {pkg.icon}
                      </span>
                    ) : null}
                    <p className="min-w-0 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                      {pkg?.display_title || packageName || pkg?.label || 'Your package'}
                    </p>
                  </div>
                </div>

                {taglineText ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Description</p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{taglineText}</p>
                  </div>
                ) : null}

                {featuresList.length ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">What&apos;s included</p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-snug text-zinc-300 marker:text-zinc-600">
                      {(selectionFeaturesExpanded ? featuresList : featuresList.slice(0, 6)).map((item) => (
                        <li key={String(item)}>{item}</li>
                      ))}
                    </ul>
                    {featuresList.length > 6 ? (
                      <button
                        type="button"
                        onClick={() => setSelectionFeaturesExpanded((e) => !e)}
                        className="mt-3 text-sm font-medium text-brand-light transition hover:text-brand-light/85"
                      >
                        {selectionFeaturesExpanded
                          ? 'Show less'
                          : `+${featuresList.length - 6} more…`}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {coverageHeadingText || coverageItemsList.length > 0 ? (
                  <div className="border-t border-white/[0.06] pt-5">
                    <p className="text-sm font-semibold leading-snug text-zinc-200">
                      {coverageHeadingText || 'Coverage'}
                    </p>
                    {coverageItemsList.length > 0 ? (
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400 marker:text-zinc-600">
                        {coverageItemsList.map((item) => (
                          <li key={String(item)}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Section>
        ) : null}

        <Section eyebrow="Investment" title="Pricing" icon={Wallet}>
          <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 border-b border-white/[0.06] pb-4">
              <span className="text-sm text-zinc-500">Package total</span>
              <span className="text-2xl font-semibold tabular-nums text-white">{formatCurrency(packagePrice)}</span>
            </div>

            {isRetainerBooking ? (
              <>
                {depositDue ? (
                  <div>
                    <p className="text-xs font-semibold text-zinc-400">
                      {depositPaid ? 'Retainer' : 'Retainer — due now'}
                    </p>
                    <div className="mt-3">
                      {depositPaid ? (
                        <PaidPriceRow label="Direct / Zelle (no fee)" amount={formatCurrency(depositDirect)} />
                      ) : (
                        <PriceTile label="Direct / Zelle (no fee)" amount={formatCurrency(depositDirect)} />
                      )}
                    </div>
                  </div>
                ) : !fullyPaid ? (
                  <div>
                    <p className="text-xs font-semibold text-zinc-400">Payment due</p>
                    <div className="mt-3">
                      <PriceTile label="Direct / Zelle (no fee)" amount={formatCurrency(remainingDirectDisplay)} />
                    </div>
                    {booking.final_due_date ? (
                      <p className="mt-2 text-xs text-zinc-500">Due by {booking.final_due_date}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {depositDue ? (
                  <div>
                    <p className="text-xs font-semibold text-zinc-400">
                      {depositPaid ? 'Deposit' : 'Deposit — due now'}
                    </p>
                    <div className="mt-3">
                      {depositPaid ? (
                        <PaidPriceRow label="Direct / Zelle (no fee)" amount={formatCurrency(depositDirect)} />
                      ) : (
                        <PriceTile label="Direct / Zelle (no fee)" amount={formatCurrency(depositDirect)} />
                      )}
                    </div>
                  </div>
                ) : null}

                <div>
                  <p className="text-xs font-semibold text-zinc-400">
                    Remaining balance
                    {!fullyPaid && booking.final_due_date ? (
                      <span className="font-normal text-zinc-500">
                        {' '}
                        · due {booking.final_due_date} (7 days before event)
                      </span>
                    ) : !fullyPaid ? (
                      <span className="font-normal text-zinc-500"> · due 7 days before event</span>
                    ) : null}
                  </p>
                  <div className="mt-3">
                    {fullyPaid ? (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-4 text-center">
                        <p className="text-sm font-semibold text-emerald-400">Paid in full</p>
                        <p className="mt-1 text-xs text-zinc-500">No balance due on this booking.</p>
                      </div>
                    ) : (
                      <PriceTile label="Direct / Zelle (no fee)" amount={formatCurrency(remainingDirectDisplay)} />
                    )}
                  </div>
                </div>
              </>
            )}

            <p className="text-xs leading-relaxed text-zinc-600">
              {fullyPaid ? (
                <>Your package is paid in full.</>
              ) : isRetainerBooking ? (
                <>Bank transfers have no fee. Amounts above reflect what you owe on this booking.</>
              ) : (
                <>Bank transfers have no fee. Package total is shown above.</>
              )}
            </p>
          </div>
        </Section>

        {booking.terms_and_conditions ? (
          <Section eyebrow="Legal" title="Terms & conditions" icon={FileText}>
            <TermsBody text={booking.terms_and_conditions} />
          </Section>
        ) : null}

        {booking.contract?.pdf_preview_url && (
          <Section eyebrow="Agreement" title={`Contract (${booking.contract.template_name || 'PDF'})`} icon={FileText}>
            <p className="mb-4 text-sm text-zinc-500">Review below, or open in a new tab.</p>
            <div
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40"
              style={{ height: 'min(70vh, 520px)' }}
            >
              <iframe title="Contract PDF" src={booking.contract.pdf_preview_url} className="h-full w-full border-0" />
            </div>
            <a
              href={booking.contract.pdf_preview_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-brand-light hover:text-brand-light/80"
            >
              Open PDF in new tab →
            </a>
          </Section>
        )}

        <ContractSignatureSection
          bookingToken={token}
          contract={booking.contract}
          onSigned={() =>
            api.getPublicBooking(token).then(setBooking).catch(() => toast.error('Could not refresh booking'))
          }
        />

        <Section eyebrow="Pay" title="Payment" icon={Wallet}>
          <DepositPayPicker
            paymentPhase={paymentPhase}
            firstPhaseWording={isRetainerBooking ? 'retainer' : 'deposit'}
            depositDirect={depositDirect}
            depositSquare={depositSquare}
            remainingDirect={remainingOwedDirect}
            remainingSquare={remainingOwedSquare}
            bookingToken={booking.public_token}
            paymentPortal={booking.payment_portal}
          />
        </Section>
      </div>
    </PortalShell>
  );
}
