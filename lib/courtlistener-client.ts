/**
 * CourtListener API Client
 * Free REST API for federal + state court records.
 * Docs: https://www.courtlistener.com/help/api/rest/
 * Rate limit: 5,000 queries/hour (authenticated)
 */

const BASE_URL = 'https://www.courtlistener.com/api/rest/v4';

// CourtListener doesn't require auth for basic searches,
// but authenticated users get higher rate limits.
// Token can be obtained at https://www.courtlistener.com/sign-in/
const AUTH_TOKEN = process.env.COURTLISTENER_TOKEN || '';

interface CourtListenerDocket {
  id: number;
  case_name: string;
  case_name_short: string;
  court: string;
  court_id: string;
  docket_number: string;
  date_filed: string | null;
  date_terminated: string | null;
  date_last_filing: string | null;
  cause: string | null;
  nature_of_suit: string | null;
  jury_demand: string | null;
  jurisdiction_type: string | null;
  absolute_url: string;
}

interface CourtListenerSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: CourtListenerDocket[];
}

interface CourtListenerOpinion {
  id: number;
  absolute_url: string;
  case_name: string;
  case_name_short: string;
  court: string;
  court_id: string;
  date_filed: string;
  status: string;
  citation_count: number;
  snippet: string;
}

interface CourtListenerSearchResponse {
  count: number;
  next: string | null;
  results: CourtListenerOpinion[];
}

export interface CourtRecord {
  id: string;
  caseName: string;
  caseNameShort: string;
  court: string;
  courtId: string;
  docketNumber: string;
  dateFiled: string | null;
  dateTerminated: string | null;
  cause: string | null;
  natureOfSuit: string | null;
  jurisdictionType: string | null;
  url: string;
  source: 'courtlistener';
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Token ${AUTH_TOKEN}`;
  }
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Search for dockets (court cases) involving a person by name.
 * Uses the RECAP archive which covers federal courts.
 */
export async function searchDocketsByName(
  name: string,
  options: { maxResults?: number; courtType?: 'federal' | 'state' | 'all' } = {},
): Promise<CourtRecord[]> {
  const { maxResults = 20, courtType = 'all' } = options;
  const records: CourtRecord[] = [];

  try {
    // Search dockets by case name (party name appears in case names)
    const params = new URLSearchParams({
      q: name,
      type: 'r', // RECAP/docket search
      order_by: 'score desc',
    });

    // Add court filter for Florida
    if (courtType === 'federal') {
      params.set('court', 'flsd flmd flnd'); // FL Southern, Middle, Northern districts
    }

    const url = `https://www.courtlistener.com/api/rest/v4/search/?${params.toString()}`;
    const res = await fetch(url, { headers: getHeaders() });

    if (!res.ok) {
      if (res.status === 429) throw new Error('Rate limited by CourtListener');
      return records;
    }

    const data = await res.json();
    const results = data.results || [];

    for (const r of results.slice(0, maxResults)) {
      records.push({
        id: `cl-${r.docket_id || r.id}`,
        caseName: r.caseName || r.case_name || '',
        caseNameShort: r.caseNameShort || r.case_name_short || '',
        court: r.court || '',
        courtId: r.court_id || '',
        docketNumber: r.docketNumber || r.docket_number || '',
        dateFiled: r.dateFiled || r.date_filed || null,
        dateTerminated: r.dateTerminated || r.date_terminated || null,
        cause: r.cause || null,
        natureOfSuit: r.natureOfSuit || r.nature_of_suit || null,
        jurisdictionType: r.jurisdictionType || r.jurisdiction_type || null,
        url: r.absolute_url
          ? `https://www.courtlistener.com${r.absolute_url}`
          : `https://www.courtlistener.com/docket/${r.docket_id || r.id}/`,
        source: 'courtlistener',
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rate limited')) throw err;
    // Silently fail for other errors — court records are best-effort
  }

  return records;
}

/**
 * Search for opinions (case law) mentioning a person.
 */
export async function searchOpinionsByName(
  name: string,
  options: { maxResults?: number } = {},
): Promise<CourtRecord[]> {
  const { maxResults = 10 } = options;
  const records: CourtRecord[] = [];

  try {
    const params = new URLSearchParams({
      q: `"${name}"`,
      type: 'o', // opinions
      order_by: 'score desc',
      stat_Precedential: 'on',
    });

    const url = `https://www.courtlistener.com/api/rest/v4/search/?${params.toString()}`;
    const res = await fetch(url, { headers: getHeaders() });

    if (!res.ok) {
      if (res.status === 429) throw new Error('Rate limited by CourtListener');
      return records;
    }

    const data = await res.json();
    const results = data.results || [];

    for (const r of results.slice(0, maxResults)) {
      records.push({
        id: `cl-op-${r.id}`,
        caseName: r.caseName || r.case_name || '',
        caseNameShort: r.caseNameShort || r.case_name_short || '',
        court: r.court || '',
        courtId: r.court_id || '',
        docketNumber: '',
        dateFiled: r.dateFiled || r.date_filed || null,
        dateTerminated: null,
        cause: null,
        natureOfSuit: null,
        jurisdictionType: null,
        url: r.absolute_url
          ? `https://www.courtlistener.com${r.absolute_url}`
          : '',
        source: 'courtlistener',
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rate limited')) throw err;
  }

  return records;
}

/**
 * Full court record search — combines dockets + opinions for a person.
 */
export async function searchCourtRecords(
  name: string,
  log: string[] = [],
): Promise<CourtRecord[]> {
  log.push(`  Searching CourtListener for "${name}"...`);

  const dockets = await searchDocketsByName(name, { maxResults: 15 });
  await sleep(300); // Rate limit buffer
  const opinions = await searchOpinionsByName(name, { maxResults: 10 });

  const all = [...dockets, ...opinions];
  log.push(`  Found ${dockets.length} dockets, ${opinions.length} opinions`);

  return all;
}
