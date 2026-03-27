import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy } from 'lucide-react';
import { formatCurrency } from '../lib/formatCurrency';
import { api } from '../lib/api';

/** Brand-colored tiles with simple marks (not official logos). */
function IconZelle({ className }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#6D1ED4" />
      <path fill="#fff" d="M16 14h16v3.5H21.5L30 26.5v3H16V26h10.5L16 17.5V14z" />
    </svg>
  );
}

function IconCashApp({ className }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#00D632" />
      <text
        x="24"
        y="31"
        textAnchor="middle"
        fill="#fff"
        style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'system-ui, sans-serif' }}
      >
        $
      </text>
    </svg>
  );
}

function IconVenmo({ className }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#008CFF" />
      <path fill="#fff" d="M15 14h6.5l5.5 14 5.5-14H34L26 34h-5L15 14z" />
    </svg>
  );
}

function IconSquareCard({ className, gradId }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#635BFF" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gradId})`} />
      <rect x="10" y="16" width="28" height="18" rx="3" fill="#fff" fillOpacity="0.95" />
      <rect x="10" y="21" width="28" height="3" fill="#635BFF" fillOpacity="0.35" />
      <rect x="14" y="28" width="10" height="2" rx="1" fill="#18181b" fillOpacity="0.25" />
    </svg>
  );
}

function pickTileClass(selected) {
  return [
    'flex items-center justify-center rounded-2xl border-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
    selected
      ? 'border-fuchsia-400/90 bg-fuchsia-500/15 shadow-[0_0_20px_-4px_rgba(232,121,249,0.45)]'
      : 'border-white/10 bg-white/[0.04] hover:border-white/18 hover:bg-white/[0.07]',
  ].join(' ');
}

const METHOD_LABEL = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' };

/** Flip to `true` when Square card checkout is ready for production */
const SQUARE_CARD_ENABLED = false;

const emptyPortal = () => ({
  zelle: { instructions: '', qr_data_url: null, copy_text: '' },
  cashapp: { instructions: '', qr_data_url: null, copy_text: '' },
  venmo: { instructions: '', qr_data_url: null, copy_text: '' },
});

function mergePortal(raw) {
  const d = emptyPortal();
  if (!raw || typeof raw !== 'object') return d;
  return {
    zelle: { ...d.zelle, ...raw.zelle },
    cashapp: { ...d.cashapp, ...raw.cashapp },
    venmo: { ...d.venmo, ...raw.venmo },
  };
}

export default function DepositPayPicker({
  paymentPhase = 'retainer',
  depositDirect,
  depositSquare,
  remainingDirect,
  remainingSquare,
  bookingToken,
  paymentPortal: paymentPortalProp,
}) {
  const navigate = useNavigate();
  const paymentPortal = mergePortal(paymentPortalProp);
  const squareGradId = useId().replace(/:/g, '');

  const [method, setMethod] = useState(null);
  const [step, setStep] = useState('pick'); // pick | bank_detail
  const [busy, setBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const phase = paymentPhase === 'complete' || paymentPhase === 'remaining' ? paymentPhase : 'retainer';
  const directAmount = phase === 'remaining' ? Number(remainingDirect) || 0 : Number(depositDirect) || 0;
  const squareAmount = phase === 'remaining' ? Number(remainingSquare) || 0 : Number(depositSquare) || 0;
  const direct = formatCurrency(directAmount);
  const card = formatCurrency(squareAmount);
  const isRemaining = phase === 'remaining';

  const resetFlow = () => {
    setStep('pick');
    setMethod(null);
  };

  const handleProceed = async () => {
    if (!method || !bookingToken) return;
    if (method === 'square' && !SQUARE_CARD_ENABLED) return;
    if (method === 'square') {
      setBusy(true);
      try {
        const sessionFn = isRemaining ? api.createSquareRemainingSession : api.createSquareDepositSession;
        const { url } = await sessionFn(bookingToken);
        if (url) {
          window.location.href = url;
          return;
        }
        toast.error('Could not start checkout.');
      } catch (err) {
        toast.error(err?.message || 'Something went wrong.');
      } finally {
        setBusy(false);
      }
      return;
    }
    setStep('bank_detail');
  };

  const handleSentPayment = async () => {
    if (!method || method === 'square' || !bookingToken) return;
    setConfirmBusy(true);
    try {
      await api.confirmBankPayment(bookingToken, {
        phase: isRemaining ? 'remaining' : 'retainer',
        method,
      });
      navigate(`/payment/${bookingToken}?recorded=1`, { replace: true });
    } catch (err) {
      toast.error(err?.message || 'Could not record payment');
    } finally {
      setConfirmBusy(false);
    }
  };

  const bankDetail = method && method !== 'square' ? paymentPortal[method] : null;
  const hasQr = Boolean(bankDetail?.qr_data_url);
  const hasText = Boolean(bankDetail?.instructions?.trim());
  const copyValue = bankDetail?.copy_text?.trim() ?? '';
  const hasCopy = Boolean(copyValue);
  const hasAnyDetail = hasQr || hasText || hasCopy;

  const copyPayeeToClipboard = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  if (phase === 'complete') {
    return (
      <p className="text-sm leading-relaxed text-zinc-500">
        All payments for this booking are complete. Thank you!
      </p>
    );
  }

  if (step === 'bank_detail' && method && method !== 'square') {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setStep('pick')}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Pay with {METHOD_LABEL[method]}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{direct}</p>
          <p className="mt-1 text-xs text-zinc-600">Send exactly this amount so we can match your payment.</p>
        </div>

        {hasCopy ? (
          <div className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.06] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300/90">Payee / username</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100">
                {copyValue}
              </code>
              <button
                type="button"
                onClick={copyPayeeToClipboard}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12]"
              >
                <Copy size={16} strokeWidth={2} aria-hidden />
                Copy
              </button>
            </div>
          </div>
        ) : null}

        {hasQr ? (
          <div className="flex justify-center">
            <div className="rounded-2xl border border-white/10 bg-white p-3 shadow-lg">
              <img
                src={bankDetail.qr_data_url}
                alt={`${METHOD_LABEL[method]} QR code`}
                className="mx-auto max-h-56 w-auto max-w-full object-contain"
              />
            </div>
          </div>
        ) : null}

        {hasText ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Instructions</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{bankDetail.instructions}</p>
          </div>
        ) : null}

        {!hasAnyDetail ? (
          <p className="text-sm text-zinc-500">
            Your photographer hasn&apos;t added {METHOD_LABEL[method]} details here yet. Reach out to them for the email,
            phone, or $Cashtag to send your {isRemaining ? 'payment' : 'retainer'}.
          </p>
        ) : null}

        <button
          type="button"
          disabled={confirmBusy}
          onClick={handleSentPayment}
          className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirmBusy ? 'Recording…' : "I've sent the payment"}
        </button>
      </div>
    );
  }

  const pickTitle = isRemaining ? 'Remaining balance — choose a method:' : 'Retainer — choose a method:';
  const pickSub = isRemaining
    ? SQUARE_CARD_ENABLED
      ? 'Pay the remaining balance by bank/app transfer or card.'
      : 'Pay the remaining balance by bank or app transfer.'
    : 'A non-refundable retainer is required to secure your date.';
  const radioLabel = isRemaining ? 'Remaining balance payment method' : 'Retainer payment method';

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-500">{pickTitle}</p>
      <p className="text-xs leading-relaxed text-zinc-600">{pickSub}</p>

      <div
        role="radiogroup"
        aria-label={radioLabel}
        className="space-y-8"
      >
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-zinc-200">Zelle, Cash App, or Venmo</p>
              <p className="text-xs text-zinc-500">Bank or app transfer — no processing fee</p>
            </div>
            <p className="text-lg font-semibold tabular-nums text-white">{direct}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              role="radio"
              aria-checked={method === 'zelle'}
              aria-label={`Zelle, ${isRemaining ? 'remaining balance' : 'retainer'} ${direct}`}
              onClick={() => setMethod('zelle')}
              className={`${pickTileClass(method === 'zelle')} h-[4.25rem] w-[4.25rem] sm:h-[4.5rem] sm:w-[4.5rem] p-2.5`}
            >
              <IconZelle className="h-full w-full" />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === 'cashapp'}
              aria-label={`Cash App, ${isRemaining ? 'remaining balance' : 'retainer'} ${direct}`}
              onClick={() => setMethod('cashapp')}
              className={`${pickTileClass(method === 'cashapp')} h-[4.25rem] w-[4.25rem] sm:h-[4.5rem] sm:w-[4.5rem] p-2.5`}
            >
              <IconCashApp className="h-full w-full" />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === 'venmo'}
              aria-label={`Venmo, ${isRemaining ? 'remaining balance' : 'retainer'} ${direct}`}
              onClick={() => setMethod('venmo')}
              className={`${pickTileClass(method === 'venmo')} h-[4.25rem] w-[4.25rem] sm:h-[4.5rem] sm:w-[4.5rem] p-2.5`}
            >
              <IconVenmo className="h-full w-full" />
            </button>
          </div>
        </div>

        <div className="border-t border-white/[0.08] pt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-zinc-200">Square / Credit Card</p>
              <p className="text-xs text-zinc-500">
                {SQUARE_CARD_ENABLED ? 'Card checkout — includes 3% processing fee' : 'Coming soon'}
              </p>
            </div>
            <p
              className={`text-lg font-semibold tabular-nums ${SQUARE_CARD_ENABLED ? 'text-white' : 'text-zinc-600'}`}
            >
              {card}
            </p>
          </div>
          {SQUARE_CARD_ENABLED ? (
            <button
              type="button"
              role="radio"
              aria-checked={method === 'square'}
              aria-label={`Square or credit card, ${isRemaining ? 'remaining balance' : 'retainer'} ${card}`}
              onClick={() => setMethod('square')}
              className={`${pickTileClass(method === 'square')} flex w-full flex-row gap-4 px-4 py-3.5 sm:py-4`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
                <IconSquareCard gradId={squareGradId} className="h-full w-full" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[15px] font-semibold text-white">Square / Credit Card</span>
                <span className="mt-0.5 block text-xs text-zinc-500">Pay securely with debit or credit card</span>
              </span>
            </button>
          ) : (
            <div
              role="presentation"
              aria-disabled="true"
              className="flex w-full cursor-not-allowed flex-row gap-4 rounded-2xl border-2 border-white/[0.06] bg-white/[0.02] px-4 py-3.5 opacity-55 sm:py-4"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center grayscale sm:h-14 sm:w-14">
                <IconSquareCard gradId={squareGradId} className="h-full w-full" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="block text-[15px] font-semibold text-zinc-500">Square / Credit Card</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Coming soon
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">Card payments will be available here soon.</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {method ? (
        <div className="pt-6">
          <button
            type="button"
            disabled={busy}
            onClick={handleProceed}
            className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Please wait…' : 'Proceed to payment'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
