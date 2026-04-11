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

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington D.C.',
};

export function getStateName(code: string | null | undefined): string {
  if (!code || code === 'ALL') return 'National';
  return STATE_NAMES[code.toUpperCase()] || code.toUpperCase();
}

export function filterByState<T extends { id: string }>(
  items: T[],
  stateCode: string | null | undefined,
): T[] {
  if (!stateCode || stateCode === 'ALL') return items;
  const upper = stateCode.toUpperCase();
  return items.filter(item => getStateFromId(item.id) === upper);
}
