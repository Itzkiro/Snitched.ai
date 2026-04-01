import { NextRequest, NextResponse } from 'next/server';

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

interface CongressMemberListItem {
  bioguideId: string;
  name: string;
  partyName: string;
  state: string;
  district?: number;
  depiction?: {
    imageUrl: string;
    attribution: string;
  };
  terms: {
    item: Array<{
      chamber: string;
      startYear: number;
      endYear?: number;
    }>;
  };
  updateDate: string;
}

interface CongressMemberDetail {
  bioguideId: string;
  firstName: string;
  lastName: string;
  directOrderName: string;
  invertedOrderName: string;
  partyHistory: Array<{
    partyName: string;
    partyAbbreviation: string;
    startYear: number;
  }>;
  state: string;
  district?: number;
  birthYear?: string;
  currentMember: boolean;
  depiction?: {
    imageUrl: string;
    attribution: string;
  };
  addressInformation?: {
    officeAddress: string;
    city: string;
    district: string;
    zipCode: number;
    phoneNumber: string;
  };
  officialWebsiteUrl?: string;
  terms: Array<{
    chamber: string;
    congress: number;
    district?: number;
    startYear: number;
    endYear?: number;
    memberType: string;
    stateCode: string;
    stateName: string;
  }>;
  sponsoredLegislation?: {
    count: number;
    url: string;
  };
  cosponsoredLegislation?: {
    count: number;
    url: string;
  };
}

/**
 * GET /api/congress/members
 *
 * Search/lookup Congress members via the Congress.gov API.
 *
 * Query params:
 *   - bioguideId: Fetch a single member by their Bioguide ID (e.g., "B000825")
 *   - state: Two-letter state code to filter by (e.g., "FL", "TX")
 *   - currentMember: "true" to show only current members (default: true)
 *   - limit: Max results per page (default: 20, max: 250)
 *   - offset: Pagination offset (default: 0)
 *
 * Examples:
 *   /api/congress/members?bioguideId=B000825
 *   /api/congress/members?state=FL&currentMember=true
 *   /api/congress/members?limit=50&offset=100
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
  const bioguideId = searchParams.get('bioguideId');
  const state = searchParams.get('state');
  const currentMember = searchParams.get('currentMember') !== 'false'; // default true
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '20', 10), 250));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  try {
    // --- Single member by bioguideId ---
    if (bioguideId) {
      const url = `${CONGRESS_API_BASE}/member/${encodeURIComponent(bioguideId)}?api_key=${apiKey}&format=json`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json(
            { error: `Member not found: ${bioguideId}` },
            { status: 404 }
          );
        }
        return handleApiError(response);
      }

      const data = await response.json();
      const member = data.member as CongressMemberDetail;

      return NextResponse.json({
        member: transformMemberDetail(member),
      });
    }

    // --- List/search members ---
    // If state is provided, use the /member/{stateCode} endpoint
    // Otherwise, use the /member endpoint with query params
    let url: string;
    if (state) {
      url = `${CONGRESS_API_BASE}/member/${encodeURIComponent(state.toUpperCase())}?api_key=${apiKey}&format=json&limit=${limit}&offset=${offset}`;
      if (currentMember) {
        url += '&currentMember=true';
      }
    } else {
      url = `${CONGRESS_API_BASE}/member?api_key=${apiKey}&format=json&limit=${limit}&offset=${offset}`;
      if (currentMember) {
        url += '&currentMember=true';
      }
    }

    const response = await fetch(url);

    if (!response.ok) {
      return handleApiError(response);
    }

    const data = await response.json();
    const members = (data.members || []) as CongressMemberListItem[];

    return NextResponse.json({
      members: members.map(transformMemberListItem),
      pagination: {
        count: data.pagination?.count || 0,
        limit,
        offset,
        hasMore: !!data.pagination?.next,
      },
    });
  } catch (error) {
    console.error('Congress members API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from Congress.gov' },
      { status: 500 }
    );
  }
}

/** Transform a detailed member response into a clean shape */
function transformMemberDetail(member: CongressMemberDetail) {
  const currentParty =
    member.partyHistory?.[member.partyHistory.length - 1]?.partyName || 'Unknown';
  const latestTerm = member.terms?.[member.terms.length - 1];

  return {
    bioguideId: member.bioguideId,
    firstName: member.firstName,
    lastName: member.lastName,
    fullName: member.directOrderName,
    party: currentParty,
    state: member.state,
    district: member.district ?? latestTerm?.district ?? null,
    chamber: latestTerm?.chamber || null,
    birthYear: member.birthYear || null,
    currentMember: member.currentMember,
    photoUrl: member.depiction?.imageUrl || null,
    officialWebsiteUrl: member.officialWebsiteUrl || null,
    officeAddress: member.addressInformation?.officeAddress || null,
    phone: member.addressInformation?.phoneNumber || null,
    terms: (member.terms || []).map((t) => ({
      chamber: t.chamber,
      congress: t.congress,
      district: t.district ?? null,
      startYear: t.startYear,
      endYear: t.endYear ?? null,
      state: t.stateName,
      memberType: t.memberType,
    })),
    sponsoredLegislationCount: member.sponsoredLegislation?.count || 0,
    cosponsoredLegislationCount: member.cosponsoredLegislation?.count || 0,
  };
}

/** Transform a list-item member into a clean shape */
function transformMemberListItem(member: CongressMemberListItem) {
  const latestTerm = member.terms?.item?.[member.terms.item.length - 1];

  return {
    bioguideId: member.bioguideId,
    name: member.name,
    party: member.partyName,
    state: member.state,
    district: member.district ?? null,
    chamber: latestTerm?.chamber || null,
    photoUrl: member.depiction?.imageUrl || null,
    latestTermStart: latestTerm?.startYear || null,
    latestTermEnd: latestTerm?.endYear || null,
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
