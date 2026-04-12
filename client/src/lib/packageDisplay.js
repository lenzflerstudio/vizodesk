/**
 * Compare package feature lines to coverage heading (ignore trailing colons / case).
 * Stops "Incluye tomas:" from appearing as both a feature bullet and the coverage title.
 */
export function packageLineNormKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/:+\s*$/, '');
}

export function featuresWithoutCoverageHeadingDuplicate(features, coverageHeading) {
  const arr = Array.isArray(features) ? features : [];
  const hk = packageLineNormKey(coverageHeading);
  if (!hk) return arr;
  return arr.filter((f) => packageLineNormKey(f) !== hk);
}

export function coverageItemsArray(pkgOrRow) {
  const raw = pkgOrRow?.coverage_items;
  return Array.isArray(raw) ? raw : [];
}

function cleanOptionalLine(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (s === '' || s === 'null' || s === 'undefined') return '';
  return s;
}

/**
 * Newline-separated plain text for an invoice line item from a package template.
 */
export function buildInvoiceLineDescriptionFromPackage(pkg) {
  if (!pkg) return '';
  const lines = [];
  const title = cleanOptionalLine(pkg.display_title) || cleanOptionalLine(pkg.label);
  if (title) lines.push(title);
  const tag = cleanOptionalLine(pkg.tagline);
  if (tag) lines.push(tag);
  const feats = featuresWithoutCoverageHeadingDuplicate(pkg.features || [], pkg.coverage_heading);
  for (const f of feats) {
    const t = cleanOptionalLine(f);
    if (t) lines.push(`- ${t}`);
  }
  const covHead = cleanOptionalLine(pkg.coverage_heading);
  const cov = coverageItemsArray(pkg);
  if (covHead) lines.push(covHead);
  for (const c of cov) {
    const t = cleanOptionalLine(c);
    if (t) lines.push(`- ${t}`);
  }
  return lines.join('\n');
}
