/**
 * Extracts the US state abbreviation from a politician's bioguide_id.
 *
 * Seeded records use a 2-letter state prefix (e.g. "oh-franklin-county-...", "ca-los-angeles-...").
 * Florida records may use county-code prefixes ("pc-", "vc-", "fc-", etc.), UUIDs, or
 * the "fl-" prefix. Any ID that doesn't match a known state prefix is assumed to be Florida.
 */

const STATE_PREFIXES = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
  'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
  'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
  'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
  'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
  'dc',
]);

export function getStateFromId(bioguideId: string): string {
  const prefix = bioguideId.slice(0, 2).toLowerCase();
  const thirdChar = bioguideId[2];

  // Valid state prefix followed by a dash
  if (STATE_PREFIXES.has(prefix) && thirdChar === '-') {
    return prefix.toUpperCase();
  }

  // Everything else (UUIDs, county codes like "pc-", "vc-") is Florida
  return 'FL';
}

export function filterByState<T extends { id: string }>(
  items: T[],
  stateCode: string | null | undefined,
): T[] {
  if (!stateCode || stateCode === 'ALL') return items;
  const upper = stateCode.toUpperCase();
  return items.filter(item => getStateFromId(item.id) === upper);
}
