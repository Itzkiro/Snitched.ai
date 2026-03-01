import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/legiscan?op=<operation>&...params
 *
 * Server-side proxy for the LegiScan API. Keeps the API key out of
 * client-side code and allows us to add caching / rate-limit handling
 * in one place.
 *
 * Supported operations (mirrors LegiScan REST API):
 *   getSessionList   — state (default FL)
 *   getMasterList     — id (session_id)
 *   getBill           — id (bill_id)
 *   getRollCall       — id (roll_call_id)
 *   getSponsoredList  — id (people_id)
 *   getSearch         — state, query, year (optional)
 */

const LEGISCAN_API_KEY = process.env.LEGISCAN_API_KEY || '';
const LEGISCAN_BASE = 'https://api.legiscan.com/';

// Allowed operations to prevent arbitrary API calls
const ALLOWED_OPS = new Set([
  'getSessionList',
  'getMasterList',
  'getBill',
  'getRollCall',
  'getSponsoredList',
  'getSearch',
]);

export async function GET(request: NextRequest) {
  if (!LEGISCAN_API_KEY) {
    return NextResponse.json(
      { error: 'LegiScan API key not configured. Set LEGISCAN_API_KEY in .env' },
      { status: 503 }
    );
  }

  const { searchParams } = request.nextUrl;
  const op = searchParams.get('op');

  if (!op || !ALLOWED_OPS.has(op)) {
    return NextResponse.json(
      { error: `Invalid or missing operation. Allowed: ${[...ALLOWED_OPS].join(', ')}` },
      { status: 400 }
    );
  }

  // Build LegiScan URL — forward all query params except 'op' is already included
  const legiscanParams = new URLSearchParams();
  legiscanParams.set('key', LEGISCAN_API_KEY);
  legiscanParams.set('op', op);

  // Forward relevant params
  for (const [key, value] of searchParams.entries()) {
    if (key === 'op') continue; // already set
    legiscanParams.set(key, value);
  }

  // Default state to FL for session list
  if (op === 'getSessionList' && !searchParams.has('state')) {
    legiscanParams.set('state', 'FL');
  }

  const url = `${LEGISCAN_BASE}?${legiscanParams.toString()}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `LegiScan API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // LegiScan returns status: "OK" on success, "ERROR" on failure
    if (data.status === 'ERROR') {
      return NextResponse.json(
        { error: data.alert?.message || 'LegiScan API returned an error' },
        { status: 400 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('LegiScan proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to reach LegiScan API' },
      { status: 502 }
    );
  }
}
