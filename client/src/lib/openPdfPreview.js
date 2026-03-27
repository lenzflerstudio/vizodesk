/**
 * Open a PDF Blob in a new tab in the user's default browser (Chrome/Edge/etc.).
 *
 * IMPORTANT: Never use `window.open('', '_blank')` or `about:blank` here — on Windows 11
 * the OS can intercept that as an "about:" link and show "Get an app to open this link".
 *
 * We open the PDF `blob:` URL directly so the browser's built-in PDF viewer handles it.
 */

/** Leak guard — also revoke when the preview tab closes if we can observe it */
const REVOKE_LEAK_GUARD_MS = 24 * 60 * 60 * 1000;

/** Normalize to a PDF Blob so the browser uses the built-in PDF viewer. */
export function asPdfBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new TypeError('Expected a Blob');
  }
  if (blob.type === 'application/pdf') {
    return blob;
  }
  return new Blob([blob], { type: 'application/pdf' });
}

/**
 * Opens the PDF in a new browser tab via the blob URL (Chrome/Edge PDF viewer).
 * @returns {{ ok: true } | { ok: false, reason: 'popup_blocked' }}
 */
export function openPdfBlobInNewTab(blob) {
  const pdfBlob = asPdfBlob(blob);
  const objectUrl = URL.createObjectURL(pdfBlob);

  // Open the PDF URL directly — do not use '' or about:blank (Windows OS handler issue)
  const newTab = window.open(objectUrl, '_blank');
  if (!newTab) {
    URL.revokeObjectURL(objectUrl);
    return { ok: false, reason: 'popup_blocked' };
  }

  let revoked = false;
  const revokePdfUrl = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(objectUrl);
  };

  try {
    newTab.addEventListener('pagehide', revokePdfUrl, { once: true });
    newTab.addEventListener('beforeunload', revokePdfUrl, { once: true });
  } catch {
    /* cross-origin or restricted; rely on timeout */
  }

  window.setTimeout(revokePdfUrl, REVOKE_LEAK_GUARD_MS);

  return { ok: true };
}
