import { forwardRef } from 'react';
import {
  Calendar,
  MapPin,
  User,
  Sparkles,
  Check,
  FileText,
  Wallet,
  Clapperboard,
} from 'lucide-react';
import { formatCurrency } from '../lib/formatCurrency';
import { effectivePackagePaid } from '../lib/effectivePaid';

const cardShadow = 'shadow-[0_0_0_1px_rgba(255,255,255,0.04)]';

function isStandaloneTermsHeading(line) {
  return /^terms\s*&\s*conditions\s*:?\s*$/i.test(String(line || '').trim());
}

/** Same rendering as client portal: highlight text before “:” on each line (fuchsia), body in zinc-400. */
function TermsBodySnapshot({ text }) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => !isStandaloneTermsHeading(line));
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-4 sm:p-5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const raw = line.trimEnd();
        const idx = raw.indexOf(':');
        const hasHeading =
          idx > 0 && idx < raw.length - 1 && raw.slice(0, idx).trim().length > 0;
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

function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0 border-b border-white/[0.06] last:border-0">
      {Icon ? (
        <span className="mt-0.5 text-zinc-500 shrink-0">
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

function Section({ eyebrow, title, icon: Icon, children }) {
  return (
    <section
      className={`rounded-[1.35rem] border border-white/[0.07] bg-zinc-900/40 p-5 sm:p-6 backdrop-blur-sm ${cardShadow}`}
    >
      <header className="mb-4 flex flex-wrap items-start gap-3">
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
            <Icon size={18} strokeWidth={1.75} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{eyebrow}</p>
          ) : null}
          {title ? <h2 className="mt-1 text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h2> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * Static replica of the client portal booking summary (no interactive blocks) for PNG export.
 */
const BookingPortalSnapshot = forwardRef(function BookingPortalSnapshot({ booking }, ref) {
  if (!booking) return null;

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

  const packagePrice = Number(booking.direct_price) || 0;
  const depositDirect = Number(booking.deposit_amount) || 0;
  const scheduledRemainingDirect = Number(booking.remaining_amount) || 0;
  const cardDepositTotal = Number(booking.square_deposit ?? booking.stripe_deposit) || 0;
  const payments = booking.payments || [];
  const paidNet = effectivePackagePaid(payments);
  const retainerPaid = depositDirect > 0 && paidNet + 0.005 >= depositDirect;
  const fullyPaid = packagePrice > 0 && paidNet + 0.005 >= packagePrice;
  const remainingOwedDirect = Math.max(0, Math.round((packagePrice - paidNet) * 100) / 100);
  const showRemainingScheduled = !retainerPaid;
  const remainingDirectDisplay = showRemainingScheduled ? scheduledRemainingDirect : remainingOwedDirect;

  const contract = booking.contract;
  const signed =
    contract?.status === 'Signed' && contract?.signature_data && String(contract.signature_data).trim();

  const terms = String(booking.terms_and_conditions || '').trim();

  return (
    <div
      ref={ref}
      className="w-[420px] max-w-full bg-[#050508] text-zinc-100 p-6 sm:p-8 space-y-6"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="text-center sm:text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Client portal</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Booking summary</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Review your event details, package, and pricing in one place.
        </p>
      </div>

      <Section eyebrow="Event" title="Details" icon={Calendar}>
        <DetailRow icon={User} label="Client" value={booking.client_name} />
        <DetailRow icon={Clapperboard} label="Event" value={booking.event_type} />
        <DetailRow icon={Calendar} label="Date" value={booking.event_date} />
        {booking.event_time_range ? (
          <DetailRow icon={Calendar} label="Event time" value={booking.event_time_range} />
        ) : null}
        {booking.venue_address ? <DetailRow icon={MapPin} label="Venue" value={booking.venue_address} /> : null}
      </Section>

      {showPackageBlock ? (
        <Section eyebrow="Your selection" title="Package" icon={Sparkles}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              {pkg?.icon ? (
                <span className="text-3xl leading-none" aria-hidden>
                  {pkg.icon}
                </span>
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-lg font-semibold tracking-tight text-white">
                  {packageName || pkg?.display_title || 'Your package'}
                </h3>
                {pkg?.display_title && packageName && pkg.display_title.trim() !== packageName ? (
                  <p className="text-sm font-medium text-brand-light/90">{pkg.display_title}</p>
                ) : null}
                {taglineText ? <p className="text-sm leading-relaxed text-zinc-400">{taglineText}</p> : null}
              </div>
            </div>

            {pkg?.features?.length ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Included</p>
                <ul className="mt-2 space-y-2">
                  {pkg.features.map((item) => (
                    <li key={item} className="flex gap-2 text-sm leading-snug text-zinc-200">
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
              <div className="border-t border-white/[0.06] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {pkg.coverage_heading}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm leading-snug text-zinc-400">
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
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4 border-b border-white/[0.06] pb-3">
            <span className="text-sm text-zinc-500">Package total</span>
            <span className="text-xl font-semibold tabular-nums text-white">{formatCurrency(packagePrice)}</span>
          </div>

          {/* Retainer — matches portal: Paid badge + emerald row when retainer is covered */}
          <div>
            <p className="text-xs font-semibold text-zinc-400">{retainerPaid ? 'Retainer' : 'Retainer — due now'}</p>
            <div className="mt-2">
              {retainerPaid ? (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium leading-snug text-zinc-500">Direct / Zelle (no fee)</p>
                      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-white/90">
                        {formatCurrency(depositDirect)}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                      Paid
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
                  <p className="text-[11px] font-medium leading-snug text-zinc-500">Direct / Zelle (no fee)</p>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-white">
                    {formatCurrency(depositDirect)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Remaining — matches portal: Paid in full box, or amount due */}
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
            <div className="mt-2">
              {fullyPaid ? (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-3 text-center">
                  <p className="text-sm font-semibold text-emerald-400">Paid in full</p>
                  <p className="mt-1 text-xs text-zinc-500">No balance due on this booking.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
                  <p className="text-[11px] font-medium leading-snug text-zinc-500">Direct / Zelle (no fee)</p>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-white">
                    {formatCurrency(remainingDirectDisplay)}
                  </p>
                </div>
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

          {cardDepositTotal > 0 ? (
            <p className="text-xs text-zinc-600">Card option (Square) includes a 3% processing fee on the portal.</p>
          ) : null}
        </div>
      </Section>

      {terms ? (
        <Section eyebrow="Legal" title="Terms & conditions" icon={FileText}>
          <TermsBodySnapshot text={terms} />
        </Section>
      ) : null}

      {signed ? (
        <Section eyebrow="Agreement" title="Signature" icon={FileText}>
          <p className="text-xs text-emerald-400/90 mb-3">Signed on the client portal.</p>
          <div className="rounded-xl border border-white/[0.1] bg-white p-3">
            <img src={contract.signature_data} alt="Signature" className="max-h-28 w-full object-contain mx-auto" />
          </div>
          {contract.signed_at ? (
            <p className="text-xs text-zinc-500 mt-2">
              {new Date(contract.signed_at).toLocaleString()}
            </p>
          ) : null}
        </Section>
      ) : null}

      <p className="text-center text-[10px] text-zinc-600 pt-2 border-t border-white/[0.06]">
        Snapshot generated {new Date().toLocaleString()} · VizoDesk
      </p>
    </div>
  );
});

export default BookingPortalSnapshot;
