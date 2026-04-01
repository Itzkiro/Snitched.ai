import { NextRequest, NextResponse } from 'next/server';
import type { LDAFiling, LDAContributionReport, LDAPaginatedResponse } from '@/lib/types';

/**
 * GET /api/lobbying
 *
 * Proxies requests to the LDA (Lobbying Disclosure Act) Senate API.
 * This keeps the API key server-side and provides a unified interface.
 *
 * Note: The lda.senate.gov API is being deprecated. A successor API is
 * available at lda.gov. The senate API sunsets June 30, 2026.
 *
 * Query params:
 *   - endpoint:   "filings" | "contributions" (default: "filings")
 *   - year:       Filing year (e.g. 2025)
 *   - quarter:    Filing period: "first_quarter" | "second_quarter" | "third_quarter" | "fourth_quarter"
 *   - type:       Filing type code (e.g. "RR" for registration, "Q1" for 1st quarter report)
 *   - registrant: Registrant name (partial match)
 *   - client:     Client name (partial match)
 *   - clientState: Client state abbreviation (e.g. "FL")
 *   - lobbyist:   Lobbyist name (partial match)
 *   - issues:     Specific lobbying issues text search
 *   - minAmount:  Minimum reported income/expenses amount
 *   - maxAmount:  Maximum reported income/expenses amount
 *   - page:       Page number for pagination (default: 1)
 *   - pageSize:   Results per page (default: 25, max: 25 per LDA limits)
 *
 * For contributions endpoint:
 *   - contributionPayee: Payee name filter
 *   - contributionHonoree: Honoree name filter
 *   - contributionType: "feca" | "he" | "me" | "ple" | "pic"
 */

const LDA_BASE_URL = 'https://lda.senate.gov/api/v1';

function getLDAApiKey(): string {
  const key = process.env.LDA_API_KEY;
  if (!key) {
    throw new Error('LDA_API_KEY environment variable is not set');
  }
  return key;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const endpoint = searchParams.get('endpoint') || 'filings';
  const year = searchParams.get('year');
  const quarter = searchParams.get('quarter');
  const type = searchParams.get('type');
  const registrant = searchParams.get('registrant');
  const client = searchParams.get('client');
  const clientState = searchParams.get('clientState');
  const lobbyist = searchParams.get('lobbyist');
  const issues = searchParams.get('issues');
  const minAmount = searchParams.get('minAmount');
  const maxAmount = searchParams.get('maxAmount');
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '25';

  // Contribution-specific params
  const contributionPayee = searchParams.get('contributionPayee');
  const contributionHonoree = searchParams.get('contributionHonoree');
  const contributionType = searchParams.get('contributionType');

  try {
    const apiKey = getLDAApiKey();

    // Build the LDA API URL based on the endpoint
    const ldaParams = new URLSearchParams();
    ldaParams.set('page', page);
    ldaParams.set('page_size', Math.min(parseInt(pageSize, 10), 25).toString());

    if (year) ldaParams.set('filing_year', year);

    if (endpoint === 'filings') {
      if (quarter) ldaParams.set('filing_period', quarter);
      if (type) ldaParams.set('filing_type', type);
      if (registrant) ldaParams.set('registrant_name', registrant);
      if (client) ldaParams.set('client_name', client);
      if (clientState) ldaParams.set('client_state', clientState);
      if (lobbyist) ldaParams.set('lobbyist_name', lobbyist);
      if (issues) ldaParams.set('filing_specific_lobbying_issues', issues);
      if (minAmount) ldaParams.set('filing_amount_reported_min', minAmount);
      if (maxAmount) ldaParams.set('filing_amount_reported_max', maxAmount);
    } else if (endpoint === 'contributions') {
      if (quarter) ldaParams.set('filing_period', quarter);
      if (type) ldaParams.set('filing_type', type);
      if (registrant) ldaParams.set('registrant_name', registrant);
      if (lobbyist) ldaParams.set('lobbyist_name', lobbyist);
      if (contributionPayee) ldaParams.set('contribution_payee', contributionPayee);
      if (contributionHonoree) ldaParams.set('contribution_honoree', contributionHonoree);
      if (contributionType) ldaParams.set('contribution_type', contributionType);
    } else {
      return NextResponse.json(
        { error: `Invalid endpoint: ${endpoint}. Use "filings" or "contributions".` },
        { status: 400 }
      );
    }

    // Require at least one filter param (LDA API requirement for pagination).
    // Year alone is not sufficient — require year + at least one other filter,
    // or at least one non-year filter.
    const hasNonYearFilter = registrant || client || clientState || lobbyist ||
      type || quarter || issues || minAmount || maxAmount ||
      contributionPayee || contributionHonoree || contributionType;
    if (!year && !hasNonYearFilter) {
      return NextResponse.json(
        { error: 'At least one filter parameter is required (e.g. year, client, registrant, clientState).' },
        { status: 400 }
      );
    }
    if (year && !hasNonYearFilter) {
      return NextResponse.json(
        { error: 'Year alone is not sufficient. Please provide at least one additional filter (e.g. client, registrant, clientState, quarter).' },
        { status: 400 }
      );
    }

    const ldaUrl = `${LDA_BASE_URL}/${endpoint}/?${ldaParams.toString()}`;

    const response = await fetch(ldaUrl, {
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json',
      },
      // Cache for 5 minutes to reduce API calls (rate limit: 120/min)
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`LDA API error (${response.status}):`, errorText);
      return NextResponse.json(
        {
          error: `LDA API returned ${response.status}`,
          details: errorText,
          url: ldaUrl.replace(apiKey, '[REDACTED]'),
        },
        { status: response.status }
      );
    }

    const data: LDAPaginatedResponse<LDAFiling | LDAContributionReport> = await response.json();

    return NextResponse.json({
      count: data.count,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      totalPages: Math.ceil(data.count / parseInt(pageSize, 10)),
      results: data.results,
      // Include deprecation notice from the LDA API
      _meta: {
        source: 'lda.senate.gov',
        deprecationNotice: 'This API will be sunset on June 30, 2026. Migrate to lda.gov.',
        successorApi: 'https://lda.gov/api/v1/',
      },
    });
  } catch (error) {
    console.error('Lobbying API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch lobbying data', details: message },
      { status: 500 }
    );
  }
}
