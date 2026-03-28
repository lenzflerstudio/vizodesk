import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portalPublicApi as api } from '../lib/portalPublicApi';
import { formatCurrency } from '../lib/formatCurrency';
import { Calendar, MapPin, User, Sparkles, Check, FileText, Wallet, Clapperboard } from 'lucide-react';
import DepositPayPicker from '../components/portal/DepositPayPicker.jsx';
import ContractSignatureSection from '../components/portal/ContractSignatureSection.jsx';
import { effectivePackagePaid } from '../lib/effectivePaid';

function PortalShell({ children }) {
  return (
    <div className="min-h-screen relative text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-[40%] left-1/2 h-[min(90vh,720px)] w-[min(140vw,900px)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(192,38,211,0.12)_0%,transparent_58%)]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[min(70vh,560px)] w-[min(90vw,640px)] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.07)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,8,0)_0%,#050508_85%)]" />
      </div>
      <div className="relative z-10 px-4 py-10 sm:px-6 sm:py-14">{children}</div>
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

  useEffect(() => {
    if (!token) {
      setLoadError(true);
      setBooking(null);
      return;
    }
    setLoadError(false);
    setBooking(null);
    api
      .getBookingByToken(token)
      .then(setBooking)
      .catch(() => setLoadError(true));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const q = new URLSearchParams(location.search);
    if (q.get('recorded') !== '1') return;
    api
      .getBookingByToken(token)
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
  const retainerPaid = depositDirect > 0 && paidNet + 0.005 >= depositDirect;
  const fullyPaid = packagePrice > 0 && paidNet + 0.005 >= packagePrice;
  const remainingOwedDirect = Math.max(0, Math.round((packagePrice - paidNet) * 100) / 100);
  const remainingOwedSquare = Math.round(remainingOwedDirect * 1.03 * 100) / 100;

  const showRemainingScheduled = !retainerPaid;
  const remainingDirectDisplay = showRemainingScheduled ? scheduledRemainingDirect : remainingOwedDirect;

  const pkg = booking.package_details;
  const packageName = String(booking.package || '').trim();
  const showPackageBlock =
    Boolean(packageName) ||
    Boolean(
      pkg &&
        (pkg.display_title ||
          pkg.tagline ||
          (pkg.features && pkg.features.length) ||
          (pkg.coverage_items && pkg.coverage_items.length))
    );

  const taglineText = pkg?.tagline?.trim() || null;

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
            <DetailRow icon={Clapperboard} label="Event" value={booking.event_type} />
            <DetailRow icon={Calendar} label="Date" value={booking.event_date} />
            {booking.event_time_range ? (
              <DetailRow icon={Calendar} label="Event time" value={booking.event_time_range} />
            ) : null}
            {booking.venue_address ? (
              <DetailRow icon={MapPin} label="Venue" value={booking.venue_address} />
            ) : null}
          </div>
        </Section>

        {showPackageBlock ? (
          <Section eyebrow="Your selection" title="Package" icon={Sparkles}>
            <div className="space-y-5">
              <div className="flex flex-wrap items-start gap-4">
                {pkg?.icon ? (
                  <span className="text-4xl leading-none" aria-hidden>
                    {pkg.icon}
                  </span>
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {packageName || pkg?.display_title || 'Your package'}
                  </h3>
                  {pkg?.display_title && packageName && pkg.display_title.trim() !== packageName ? (
                    <p className="text-sm font-medium text-brand-light/90">{pkg.display_title}</p>
                  ) : null}
                  {taglineText ? (
                    <p className="text-sm leading-relaxed text-zinc-400">{taglineText}</p>
                  ) : null}
                </div>
              </div>

              {pkg?.features?.length ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Included</p>
                  <ul className="mt-3 space-y-2.5">
                    {pkg.features.map((item) => (
                      <li key={item} className="flex gap-3 text-[15px] leading-snug text-zinc-200">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                          <Check size={12} strokeWidth={2.5} />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {pkg?.coverage_heading && pkg?.coverage_items?.length ? (
                <div className="border-t border-white/[0.06] pt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {pkg.coverage_heading}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm leading-snug text-zinc-400">
                    {pkg.coverage_items.map((item) => (
                      <li key={item} className="flex gap-2 pl-1">
                        <span className="text-zinc-600">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        <Section eyebrow="Investment" title="Pricing" icon={Wallet}>
          <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 border-b border-white/[0.06] pb-4">
              <span className="text-sm text-zinc-500">Package total</span>
              <span className="text-2xl font-semibold tabular-nums text-white">{formatCurrency(packagePrice)}</span>
            </div>

            <div>
              <p className="text-xs font-semibold text-zinc-400">
                {retainerPaid ? 'Retainer' : 'Retainer — due now'}
              </p>
              <div className="mt-3">
                {retainerPaid ? (
                  <PaidPriceRow label="Direct / Zelle (no fee)" amount={formatCurrency(depositDirect)} />
                ) : (
                  <PriceTile label="Direct / Zelle (no fee)" amount={formatCurrency(depositDirect)} />
                )}
              </div>
            </div>

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

            <p className="text-xs leading-relaxed text-zinc-600">
              {fullyPaid ? (
                <>Your package is paid in full.</>
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
            api.getBookingByToken(token).then(setBooking).catch(() => toast.error('Could not refresh booking'))
          }
        />

        <Section eyebrow="Pay" title="Payment" icon={Wallet}>
          <DepositPayPicker
            paymentPhase={fullyPaid ? 'complete' : retainerPaid ? 'remaining' : 'retainer'}
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
