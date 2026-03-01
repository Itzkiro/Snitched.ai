import { NextRequest, NextResponse } from 'next/server';

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

interface CongressBillListItem {
  congress: number;
  number: string;
  type: string;
  title: string;
  originChamber: string;
  originChamberCode: string;
  updateDate: string;
  updateDateIncludingText: string;
  latestAction: {
    actionDate: string;
    text: string;
    actionTime?: string;
  };
  url: string;
}

interface CongressBillDetail {
  congress: number;
  number: string;
  type: string;
  title: string;
  originChamber: string;
  originChamberCode: string;
  introducedDate: string;
  updateDate: string;
  legislationUrl?: string;
  policyArea?: {
    name: string;
  };
  sponsors: Array<{
    bioguideId: string;
    firstName: string;
    lastName: string;
    fullName: string;
    district?: number;
    isByRequest: string;
  }>;
  cosponsors?: {
    count: number;
    countIncludingWithdrawnCosponsors: number;
    url: string;
  };
  latestAction: {
    actionDate: string;
    text: string;
    actionTime?: string;
  };
  actions?: {
    count: number;
    url: string;
  };
  committees?: {
    count: number;
    url: string;
  };
  summaries?: {
    count: number;
    url: string;
  };
  relatedBills?: {
    count: number;
    url: string;
  };
  amendments?: {
    count: number;
    url: string;
  };
  constitutionalAuthorityStatementText?: string;
  cboCostEstimates?: Array<{
    title: string;
    url: string;
    pubDate: string;
    description: string;
  }>;
}

/**
 * GET /api/congress/bills
 *
 * Browse and lookup bills from the Congress.gov API.
 * NOTE: Congress.gov does not support keyword search on bills.
 * Bills are browsed by congress session and optionally bill type.
 *
 * Query params:
 *   - congress: Congress session number (e.g., "119" for current, "118" for previous)
 *   - type: Bill type filter — "hr", "s", "hres", "sres", "hjres", "sjres", "hconres", "sconres"
 *   - number: Specific bill number (requires congress + type)
 *   - sponsor: Bioguide ID of sponsor — fetches their sponsored legislation
 *   - sort: "updateDate+desc" or "updateDate+asc" (default: updateDate+desc)
 *   - fromDateTime: Filter by update date start (ISO format, e.g., "2024-01-01T00:00:00Z")
 *   - toDateTime: Filter by update date end
 *   - limit: Max results per page (default: 20, max: 250)
 *   - offset: Pagination offset (default: 0)
 *
 * Examples:
 *   /api/congress/bills?congress=119&type=hr&limit=10
 *   /api/congress/bills?congress=118&type=hr&number=1
 *   /api/congress/bills?sponsor=B000825&limit=20
 *   /api/congress/bills?congress=119&sort=updateDate+desc
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Congress.gov API key not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = request.nextUrl;
  const congress = searchParams.get('congress');
  const type = searchParams.get('type');
  const number = searchParams.get('number');
  const sponsor = searchParams.get('sponsor');
  const sort = searchParams.get('sort') || 'updateDate+desc';
  const fromDateTime = searchParams.get('fromDateTime');
  const toDateTime = searchParams.get('toDateTime');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 250);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    // --- Specific bill by congress/type/number ---
    if (congress && type && number) {
      const url =
        `${CONGRESS_API_BASE}/bill/${congress}/${encodeURIComponent(type.toLowerCase())}/${number}` +
        `?api_key=${apiKey}&format=json`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json(
            { error: `Bill not found: ${type.toUpperCase()} ${number} (Congress ${congress})` },
            { status: 404 }
          );
        }
        return handleApiError(response);
      }

      const data = await response.json();
      const bill = data.bill as CongressBillDetail;

      return NextResponse.json({
        bill: transformBillDetail(bill),
      });
    }

    // --- Sponsored legislation by member bioguideId ---
    if (sponsor) {
      const url =
        `${CONGRESS_API_BASE}/member/${encodeURIComponent(sponsor)}/sponsored-legislation` +
        `?api_key=${apiKey}&format=json&limit=${limit}&offset=${offset}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json(
            { error: `Member not found: ${sponsor}` },
            { status: 404 }
          );
        }
        return handleApiError(response);
      }

      const data = await response.json();
      const bills = (data.sponsoredLegislation || []) as CongressBillListItem[];

      return NextResponse.json({
        bills: bills.map(transformBillListItem),
        pagination: {
          count: data.pagination?.count || 0,
          limit,
          offset,
          hasMore: !!data.pagination?.next,
        },
        source: 'sponsored-legislation',
        bioguideId: sponsor,
      });
    }

    // --- Browse bills by congress session (and optional type) ---
    let pathSegment = '/bill';
    if (congress) {
      pathSegment += `/${congress}`;
      if (type) {
        pathSegment += `/${type.toLowerCase()}`;
      }
    }

    let url = `${CONGRESS_API_BASE}${pathSegment}?api_key=${apiKey}&format=json&limit=${limit}&offset=${offset}&sort=${encodeURIComponent(sort)}`;

    if (fromDateTime) {
      url += `&fromDateTime=${encodeURIComponent(fromDateTime)}`;
    }
    if (toDateTime) {
      url += `&toDateTime=${encodeURIComponent(toDateTime)}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      return handleApiError(response);
    }

    const data = await response.json();
    const bills = (data.bills || []) as CongressBillListItem[];

    return NextResponse.json({
      bills: bills.map(transformBillListItem),
      pagination: {
        count: data.pagination?.count || 0,
        limit,
        offset,
        hasMore: !!data.pagination?.next,
      },
    });
  } catch (error) {
    console.error('Congress bills API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from Congress.gov' },
      { status: 500 }
    );
  }
}

/** Transform a detailed bill response into a clean shape */
function transformBillDetail(bill: CongressBillDetail) {
  return {
    congress: bill.congress,
    number: bill.number,
    type: bill.type,
    title: bill.title,
    originChamber: bill.originChamber,
    introducedDate: bill.introducedDate,
    updateDate: bill.updateDate,
    policyArea: bill.policyArea?.name || null,
    legislationUrl: bill.legislationUrl || null,
    sponsors: (bill.sponsors || []).map((s) => ({
      bioguideId: s.bioguideId,
      name: s.fullName,
      firstName: s.firstName,
      lastName: s.lastName,
      district: s.district ?? null,
    })),
    cosponsorsCount: bill.cosponsors?.count || 0,
    actionsCount: bill.actions?.count || 0,
    committeesCount: bill.committees?.count || 0,
    amendmentsCount: bill.amendments?.count || 0,
    relatedBillsCount: bill.relatedBills?.count || 0,
    latestAction: {
      date: bill.latestAction.actionDate,
      text: bill.latestAction.text,
    },
  };
}

/** Transform a bill list item into a clean shape */
function transformBillListItem(bill: CongressBillListItem) {
  return {
    congress: bill.congress,
    number: bill.number,
    type: bill.type,
    title: bill.title,
    originChamber: bill.originChamber,
    updateDate: bill.updateDate,
    latestAction: {
      date: bill.latestAction.actionDate,
      text: bill.latestAction.text,
    },
  };
}

/** Map Congress.gov HTTP errors to user-friendly responses */
async function handleApiError(response: Response) {
  if (response.status === 429) {
    return NextResponse.json(
      {
        error: 'Congress.gov API rate limit exceeded. Please try again later.',
      },
      { status: 429 }
    );
  }

  if (response.status === 403) {
    return NextResponse.json(
      { error: 'Congress.gov API key is invalid or expired.' },
      { status: 403 }
    );
  }

  const text = await response.text().catch(() => '');
  console.error(`Congress.gov API error ${response.status}: ${text}`);
  return NextResponse.json(
    { error: `Congress.gov API returned status ${response.status}` },
    { status: response.status }
  );
}
