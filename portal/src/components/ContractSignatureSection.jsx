import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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

/** Map pointer position to canvas bitmap coordinates (handles CSS size vs backing store). */
function getCanvasPoint(canvas, clientX, clientY) {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function applyStrokeStyle(ctx, canvas) {
  if (!ctx || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / Math.max(rect.width, 1);
  ctx.strokeStyle = 'rgb(17, 24, 39)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, 2 * dpr);
}

function fillWhite(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export default function ContractSignatureSection({ bookingToken, contract, onSigned }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const signed = Boolean(contract?.status === 'Signed' && contract?.signature_data);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ratio = Math.max(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1);
    const w = Math.max(wrapper.clientWidth, 1);
    const h = Math.max(wrapper.clientHeight, 1);
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    fillWhite(canvas);
    applyStrokeStyle(ctx, canvas);
    hasInkRef.current = false;
    drawingRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (signed || !contract) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let ro = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      resizeCanvas();
      ro = new ResizeObserver(() => resizeCanvas());
      ro.observe(wrapper);
      window.addEventListener('orientationchange', resizeCanvas);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('orientationchange', resizeCanvas);
      if (ro) ro.disconnect();
    };
  }, [signed, bookingToken, contract?.id, resizeCanvas]);

  const handlePointerDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    applyStrokeStyle(ctx, canvas);
    const { x, y } = getCanvasPoint(canvas, e.clientX, e.clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(canvas, e.clientX, e.clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    hasInkRef.current = true;
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    drawingRef.current = false;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fillWhite(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) applyStrokeStyle(ctx, canvas);
    hasInkRef.current = false;
    drawingRef.current = false;
  }, []);

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast.error('Signature area is not ready');
      return;
    }
    if (!hasInkRef.current) {
      toast.error('Please sign in the box first');
      return;
    }
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
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
        ref={wrapperRef}
        className="relative h-40 w-full overflow-hidden rounded-2xl border border-zinc-600/50 bg-white shadow-inner sm:h-44"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={(e) => {
            if (drawingRef.current) handlePointerUp(e);
          }}
        />
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
          Clear signature
        </button>
      </div>
    </Section>
  );
}
