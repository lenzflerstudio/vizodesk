import { useLayoutEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { PenLine, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

function Section({ eyebrow, title, icon: Icon, children }) {
  return (
    <section className="rounded-[1.35rem] border border-white/[0.07] bg-zinc-900/40 p-6 sm:p-7 backdrop-blur-2xl shadow-portal-card">
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
      {children}
    </section>
  );
}

export default function ContractSignatureSection({ bookingToken, contract, onSigned }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const signed = Boolean(contract?.status === 'Signed' && contract?.signature_data);

  useLayoutEffect(() => {
    if (signed || !contract) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let pad = null;
    let ro = null;
    let resizeFn = null;

    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      pad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(17, 24, 39)',
        minWidth: 0.65,
        maxWidth: 2.75,
      });
      padRef.current = pad;

      resizeFn = () => {
        if (!pad || cancelled) return;
        const wrapper = canvas.parentElement;
        if (!wrapper) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = Math.max(wrapper.clientWidth, 1);
        const h = Math.max(wrapper.clientHeight, 1);
        canvas.width = Math.floor(w * ratio);
        canvas.height = Math.floor(h * ratio);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
        pad.clear();
      };

      ro = new ResizeObserver(() => resizeFn());
      ro.observe(canvas.parentElement);
      resizeFn();
      window.addEventListener('orientationchange', resizeFn);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (resizeFn) window.removeEventListener('orientationchange', resizeFn);
      if (ro) ro.disconnect();
      if (pad) pad.off();
      padRef.current = null;
    };
  }, [signed, bookingToken, contract?.id]);

  const handleClear = () => {
    padRef.current?.clear();
  };

  const handleSave = async () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error('Please sign in the box first');
      return;
    }
    setSaving(true);
    try {
      const dataUrl = pad.toDataURL('image/png');
      await api.signContract(bookingToken, dataUrl);
      toast.success('Signature saved');
      onSigned();
    } catch (e) {
      toast.error(e?.message || 'Could not save signature');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSavedSignature = async () => {
    if (
      !window.confirm(
        'Clear your saved signature? You can draw a new one and save again. Only do this if you need to change your signature.'
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      await api.resetContractSignature(bookingToken);
      toast.success('Signature cleared — you can sign again below.');
      onSigned();
    } catch (e) {
      toast.error(e?.message || 'Could not reset signature');
    } finally {
      setResetting(false);
    }
  };

  if (!contract) return null;

  if (signed) {
    const when = contract.signed_at ? new Date(contract.signed_at).toLocaleString() : null;
    return (
      <Section eyebrow="Next step" title="Signature" icon={PenLine}>
        <p className="mb-4 text-sm text-emerald-400/90">Your signature is on file. Thank you.</p>
        <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-white p-3">
          <img
            src={contract.signature_data || undefined}
            alt="Your signature"
            className="mx-auto max-h-32 w-full max-w-md object-contain"
          />
        </div>
        {when ? <p className="mt-3 text-xs text-zinc-500">Signed {when}</p> : null}
        <button
          type="button"
          onClick={handleResetSavedSignature}
          disabled={resetting}
          className="mt-4 w-full rounded-2xl border border-amber-500/35 bg-amber-500/10 py-3 text-sm font-semibold text-amber-200/95 transition hover:bg-amber-500/15 disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {resetting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Clearing…
            </span>
          ) : (
            'Clear signature & sign again'
          )}
        </button>
      </Section>
    );
  }

  return (
    <Section eyebrow="Next step" title="Signature" icon={PenLine}>
      <p className="mb-4 text-sm text-zinc-500">
        Sign to confirm you have read and agree to the contract. Use your finger on a phone or click and drag on a
        computer.
      </p>
      <div
        className="relative h-40 w-full overflow-hidden rounded-2xl border border-zinc-600/50 bg-white shadow-inner sm:h-44"
        style={{ touchAction: 'none' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 disabled:opacity-60 sm:w-auto sm:min-w-[10rem] sm:px-8"
        >
          {saving ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            'Save signature'
          )}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={saving}
          className="w-full rounded-2xl border border-white/15 bg-white/[0.04] py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50 sm:w-auto sm:px-6"
        >
          Reset
        </button>
      </div>
    </Section>
  );
}
