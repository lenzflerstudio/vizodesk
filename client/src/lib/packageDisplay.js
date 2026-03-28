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
