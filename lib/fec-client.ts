/**
 * FEC API Client
 *
 * Shared utility for proxying requests to the FEC API (api.open.fec.gov).
 * All three FEC proxy routes use this client for consistent error handling,
 * rate-limit awareness, and response transformation.
 *
 * Rate limits: 1,000 requests/hour per API key.
 * Pagination: FEC uses page-based pagination for most endpoints and
 *             cursor-based pagination for Schedule A/E.
 */

const FEC_BASE_URL = 'https://api.open.fec.gov/v1';

export function getFecApiKey(): string {
  const key = process.env.FEC_API_KEY;
  if (!key) {
    throw new FecError('FEC_API_KEY is not configured in environment variables', 500);
  }
  return key;
}

export class FecError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'FecError';
    this.status = status;
  }
}

/**
 * Make a GET request to the FEC API.
 *
 * Automatically appends the API key and handles common error responses
 * including rate limiting (429) and upstream failures (5xx).
 */
export async function fecFetch(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<any> {
  const apiKey = getFecApiKey();

  const url = new URL(`${FEC_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', apiKey);

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, String(val));
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    // Next.js fetch: do not cache FEC responses by default
    next: { revalidate: 300 }, // cache for 5 minutes to stay under rate limits
  });

  if (response.status === 429) {
    throw new FecError(
      'FEC API rate limit exceeded (1,000 requests/hour). Please try again later.',
      429,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new FecError(
      `FEC API returned ${response.status}: ${response.statusText}. ${body}`.trim(),
      response.status >= 500 ? 502 : response.status,
    );
  }

  return response.json();
}

/**
 * Build a standard error response for FEC routes.
 */
export function fecErrorResponse(error: unknown) {
  if (error instanceof FecError) {
    return { error: error.message, status: error.status };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { error: message, status: 500 };
}

/**
 * Known Israel lobby PAC committee IDs.
 * Mirrors the list from data-ingestion/fetch-fec-data.ts so the proxy
 * routes can tag contributions on the fly.
 */
export const ISRAEL_LOBBY_COMMITTEE_IDS: Record<string, string> = {
  C00104414: 'AIPAC (American Israel Public Affairs Committee)',
  C00803833: 'United Democracy Project (AIPAC Super PAC)',
  C00776997: 'Democratic Majority for Israel PAC',
  C00765578: 'Pro-Israel America PAC',
  C00030718: 'NORPAC',
  C00236489: 'J Street PAC',
  C00368522: 'Joint Action Committee for Political Affairs (JACPAC)',
  C00095067: 'Washington PAC',
  C00386532: 'Americans for a Secure Israel',
};

export const ISRAEL_LOBBY_NAME_PATTERNS = [
  'AIPAC',
  'AMERICAN ISRAEL PUBLIC AFFAIRS',
  'UNITED DEMOCRACY PROJECT',
  'DEMOCRATIC MAJORITY FOR ISRAEL',
  'PRO-ISRAEL AMERICA',
  'NORPAC',
  'J STREET',
  'JSTREET',
  'JOINT ACTION COMMITTEE FOR POLITICAL',
  'WASHINGTON PAC',
  'ISRAEL BONDS',
  'FRIENDS OF ISRAEL',
  'ISRAEL ALLIES',
];

/**
 * Check if a contributor is an Israel lobby donor by committee ID or name.
 */
export function isIsraelLobbyDonor(donorName: string, committeeId?: string): boolean {
  if (committeeId && ISRAEL_LOBBY_COMMITTEE_IDS[committeeId]) {
    return true;
  }
  const upper = (donorName || '').toUpperCase();
  return ISRAEL_LOBBY_NAME_PATTERNS.some((pattern) => upper.includes(pattern));
}
