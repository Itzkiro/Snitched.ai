import { NextRequest, NextResponse } from 'next/server';
import { fecFetch, fecErrorResponse } from '@/lib/fec-client';

/**
 * GET /api/fec/candidates
 *
 * Search FEC candidates by name, state, party, and office.
 * Proxies to: https://api.open.fec.gov/v1/candidates/search/
 *
 * Query params:
 *   q          - Candidate name search (partial match)
 *   state      - Two-letter state code (e.g. "FL")
 *   party      - Party code: "DEM", "REP", "LIB", "IND", etc.
 *   office     - Office code: "H" (House), "S" (Senate), "P" (President)
 *   cycle      - Election cycle year (e.g. 2024). Can be repeated.
 *   is_active  - "true" to show only active candidates
 *   sort       - Sort field (default: "name"). Prefix with "-" for desc.
 *   page       - Page number (1-based, default: 1)
 *   per_page   - Results per page (max 100, default: 20)
 *
 * Response shape:
 *   {
 *     candidates: [{
 *       candidate_id, name, party, party_full, state, office, office_full,
 *       district, incumbent_challenge, incumbent_challenge_full,
 *       has_raised_funds, cycles, active_through,
 *       principal_committees: [{ committee_id, name }]
 *     }],
 *     pagination: { count, page, pages, per_page }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const q = searchParams.get('q') || undefined;
    const state = searchParams.get('state') || undefined;
    const party = searchParams.get('party') || undefined;
    const office = searchParams.get('office') || undefined;
    const cycle = searchParams.get('cycle') || undefined;
    const isActive = searchParams.get('is_active') || undefined;
    const sort = searchParams.get('sort') || 'name';
    const page = String(Math.max(1, parseInt(searchParams.get('page') || '1', 10)));
    const perPage = Math.max(1, Math.min(Number(searchParams.get('per_page') || '20'), 100));

    // Build FEC API params
    const params: Record<string, string | number | undefined> = {
      sort,
      page,
      per_page: perPage,
    };

    if (q) params['name'] = q;
    if (state) params['state'] = state;
    if (party) params['party'] = party;
    if (office) params['office'] = office;
    if (cycle) params['cycle'] = cycle;
    if (isActive === 'true') {
      params['candidate_status'] = 'C'; // C = active candidate
    }

    const data = await fecFetch('/candidates/search/', params);

    // Transform to a cleaner shape
    const candidates = (data.results || []).map((c: any) => ({
      candidate_id: c.candidate_id,
      name: c.name,
      party: c.party,
      party_full: c.party_full,
      state: c.state,
      office: c.office,
      office_full: c.office_full,
      district: c.district,
      district_number: c.district_number,
      incumbent_challenge: c.incumbent_challenge,
      incumbent_challenge_full: c.incumbent_challenge_full,
      candidate_status: c.candidate_status,
      has_raised_funds: c.has_raised_funds,
      federal_funds_flag: c.federal_funds_flag,
      cycles: c.cycles,
      active_through: c.active_through,
      first_file_date: c.first_file_date,
      last_file_date: c.last_file_date,
      principal_committees: (c.principal_committees || []).map((pc: any) => ({
        committee_id: pc.committee_id,
        name: pc.name,
        designation: pc.designation,
        designation_full: pc.designation_full,
        party: pc.party,
        party_full: pc.party_full,
        state: pc.state,
        treasurer_name: pc.treasurer_name,
      })),
    }));

    return NextResponse.json({
      candidates,
      pagination: {
        count: data.pagination?.count ?? 0,
        page: data.pagination?.page ?? 1,
        pages: data.pagination?.pages ?? 1,
        per_page: data.pagination?.per_page ?? perPage,
      },
    });
  } catch (error) {
    const { error: message, status } = fecErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
