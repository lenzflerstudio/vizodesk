import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { clientMatchesQuery } from '../lib/clientSearch';
import {
  formatUSPhoneDisplay,
  countDigitsBeforeIndex,
  caretAfterUSPhoneFormat,
} from '../lib/phoneInputFormat';

const SEARCH_DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 8;

/**
 * @param {object} props
 * @param {Array} props.clients
 * @param {object} props.form
 * @param {function} props.setForm
 */
export default function ClientBookingFields({ clients, form, setForm }) {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const blurCloseTimer = useRef(null);
  /** After picking from the list, block auto-reopen (input stays focused + query still matches). */
  const pickedFromListRef = useRef(false);
  const listRef = useRef(null);
  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const phoneCaretDigits = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(form.new_client_name || ''), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [form.new_client_name]);

  const filteredClients = useMemo(() => {
    const q = debouncedQuery.trim();
    if (q.length === 0) return [];
    return clients.filter((c) => clientMatchesQuery(c, q)).slice(0, MAX_SUGGESTIONS);
  }, [clients, debouncedQuery]);

  useEffect(() => {
    setHighlightIndex((i) => {
      if (filteredClients.length === 0) return -1;
      if (i < 0) return -1;
      return Math.min(i, filteredClients.length - 1);
    });
  }, [filteredClients.length]);

  const clearBlurTimer = () => {
    if (blurCloseTimer.current) {
      clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
  };

  useEffect(() => () => clearBlurTimer(), []);

  const scheduleCloseSuggestions = () => {
    clearBlurTimer();
    blurCloseTimer.current = setTimeout(() => {
      setSuggestionsOpen(false);
      setHighlightIndex(-1);
    }, 150);
  };

  const applyClient = useCallback(
    (c) => {
      clearBlurTimer();
      pickedFromListRef.current = true;
      const rawPhone = String(c.phone || '').trim();
      const displayPhone = formatUSPhoneDisplay(rawPhone) || rawPhone;
      setForm((f) => ({
        ...f,
        client_id: String(c.id),
        new_client_name: String(c.full_name || '').trim(),
        new_client_email: String(c.email || '').trim(),
        new_client_phone: displayPhone,
      }));
      setSuggestionsOpen(false);
      setHighlightIndex(-1);
      setDebouncedQuery(String(c.full_name || ''));
    },
    [setForm],
  );

  const handleNameChange = (e) => {
    const value = e.target.value;
    pickedFromListRef.current = false;
    setForm((f) => ({
      ...f,
      new_client_name: value,
      ...(f.client_id ? { client_id: '' } : {}),
    }));
    if (String(value).trim().length > 0) {
      setSuggestionsOpen(true);
    }
  };

  const handleEmailChange = (e) => {
    setForm((f) => ({ ...f, new_client_email: e.target.value }));
  };

  const handlePhoneChange = (e) => {
    const incoming = e.target.value;
    const sel = e.target.selectionStart ?? incoming.length;
    const formatted = formatUSPhoneDisplay(incoming);
    phoneCaretDigits.current = countDigitsBeforeIndex(incoming, sel);
    setForm((f) => ({ ...f, new_client_phone: formatted }));
  };

  useLayoutEffect(() => {
    const digits = phoneCaretDigits.current;
    if (digits === null) return;
    const el = phoneInputRef.current;
    if (!el || document.activeElement !== el) {
      phoneCaretDigits.current = null;
      return;
    }
    const pos = caretAfterUSPhoneFormat(form.new_client_phone, digits);
    el.setSelectionRange(pos, pos);
    phoneCaretDigits.current = null;
  }, [form.new_client_phone]);

  const handleNameFocus = () => {
    clearBlurTimer();
    pickedFromListRef.current = false;
    if ((form.new_client_name || '').trim().length > 0) setSuggestionsOpen(true);
  };

  // When debounced results arrive while the name field is focused, show the list
  useEffect(() => {
    if (pickedFromListRef.current) return;
    if (
      filteredClients.length > 0 &&
      (form.new_client_name || '').trim().length > 0 &&
      nameInputRef.current === document.activeElement
    ) {
      setSuggestionsOpen(true);
    }
  }, [filteredClients, form.new_client_name]);

  const handleNameBlur = () => {
    scheduleCloseSuggestions();
  };

  const handleNameKeyDown = (e) => {
    if (!suggestionsOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && filteredClients.length > 0) {
      setSuggestionsOpen(true);
      setHighlightIndex(0);
      e.preventDefault();
      return;
    }

    if (!suggestionsOpen || filteredClients.length === 0) {
      if (e.key === 'Escape') {
        setSuggestionsOpen(false);
        setHighlightIndex(-1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % filteredClients.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? filteredClients.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      const listVisible = suggestionsOpen && filteredClients.length > 0;
      if (listVisible) {
        e.preventDefault();
        const idx = highlightIndex >= 0 ? highlightIndex : 0;
        applyClient(filteredClients[idx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestionsOpen(false);
      setHighlightIndex(-1);
    }
  };

  useEffect(() => {
    if (suggestionsOpen && highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, suggestionsOpen]);

  const showList = suggestionsOpen && filteredClients.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Start typing to search existing clients or enter a new one.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-1">
          <label className="label" htmlFor="new_client_name">
            Full Name *
          </label>
          <input
            ref={nameInputRef}
            id="new_client_name"
            name="new_client_name"
            required
            className="input"
            placeholder="Client name"
            value={form.new_client_name}
            onChange={handleNameChange}
            onFocus={handleNameFocus}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-controls="client-suggestions-list"
            aria-autocomplete="list"
          />
          {showList && (
            <ul
              ref={listRef}
              id="client-suggestions-list"
              role="listbox"
              className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-[#16161d] shadow-xl py-1"
            >
              {filteredClients.map((c, idx) => (
                <li key={c.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={highlightIndex === idx}
                    data-index={idx}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors border-0 cursor-pointer ${
                      highlightIndex === idx
                        ? 'bg-brand/25 text-white'
                        : 'text-slate-200 hover:bg-surface-overlay'
                    }`}
                    onPointerDown={(ev) => {
                      ev.preventDefault();
                      applyClient(c);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <span className="font-medium block truncate">{c.full_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="label" htmlFor="new_client_email">
            Email
          </label>
          <input
            id="new_client_email"
            name="new_client_email"
            type="email"
            className="input"
            placeholder="client@example.com"
            value={form.new_client_email}
            onChange={handleEmailChange}
          />
        </div>
        <div>
          <label className="label" htmlFor="new_client_phone">
            Phone
          </label>
          <input
            ref={phoneInputRef}
            id="new_client_phone"
            name="new_client_phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            className="input"
            placeholder="(555) 010-0199"
            value={form.new_client_phone}
            onChange={handlePhoneChange}
          />
        </div>
      </div>
    </div>
  );
}
