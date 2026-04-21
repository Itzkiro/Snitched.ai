import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { searchCourtRecords } from '@/lib/courtlistener-client';
import { deepResearch } from '@/lib/research-agent';

/**
 * POST /api/admin
 *
 * Admin API for on-demand research, DB writes, and data export.
 * Protected by ADMIN_SECRET env var.
 *
 * Actions:
 *   - list-politicians: List all politicians (for search/select)
 *   - research: Run 4-pillar research on a specific politician
 *   - push-to-db: Write research results to Supabase
 *   - export: Return politician data as JSON (client formats to CSV/PDF)
 */

const FEC_API_KEY = process.env.FEC_API_KEY || '';
const FEC_BASE = 'https://api.open.fec.gov/v1';
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET || '';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function verifyAdmin(request: NextRequest): NextResponse | null {
  if (!ADMIN_SECRET) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
  }
  const auth = request.headers.get('x-admin-secret');
  if (!auth || auth !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fecFetch(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const url = new URL(`${FEC_BASE}${path}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FEC ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Research pipeline
// ---------------------------------------------------------------------------

interface ResearchResult {
  politician: Record<string, unknown>;
  financials: {
    fecId: string | null;
    totalFunds: number;
    top5Donors: Array<{ name: string; amount: number; type: string }>;
    contributionBreakdown: Record<string, number> | null;
  };
  courtRecords: Array<Record<string, unknown>>;
  votingRecords: Array<Record<string, unknown>>;
  socialPosts: Array<Record<string, unknown>>;
  log: string[];
}

async function researchPolitician(bioguideId: string): Promise<ResearchResult> {
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error('No database access');

  const log: string[] = [];

  // Load full politician data
  const { data: pol, error: polErr } = await supabase
    .from('politicians')
    .select('*')
    .eq('bioguide_id', bioguideId)
    .single();

  if (polErr || !pol) throw new Error(`Politician not found: ${polErr?.message || bioguideId}`);

  log.push(`Researching: ${pol.name} (${pol.office})`);

  // ===== PILLAR 1: FINANCIALS =====
  let fecId = pol.source_ids?.fec_candidate_id || null;
  let totalFunds = Number(pol.total_funds) || 0;
  let top5Donors = pol.top5_donors || [];
  let contributionBreakdown = pol.contribution_breakdown || null;

  if (FEC_API_KEY) {
    if (!fecId) {
      log.push('[FEC] Looking up candidate ID...');
      try {
        const data = await fecFetch('/candidates/search/', { q: pol.name, state: 'FL', per_page: 5 }) as {
          results?: Array<{ candidate_id: string; name: string }>;
        };
        if (data.results?.[0]) {
          fecId = data.results[0].candidate_id;
          log.push(`[FEC] Found: ${data.results[0].name} (${fecId})`);
        } else {
          log.push('[FEC] No match found');
        }
      } catch (e) {
        log.push(`[FEC] Lookup error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(500);
    }

    if (fecId) {
      log.push(`[FEC] Fetching totals for ${fecId}...`);
      try {
        const data = await fecFetch(`/candidate/${fecId}/totals/`, { per_page: 1, cycle: 2026 }) as {
          results?: Array<{ receipts: number; individual_contributions: number; other_political_committee_contributions: number }>;
        };
        const t = data.results?.[0];
        if (t) {
          totalFunds = t.receipts || 0;
          contributionBreakdown = {
            individuals: t.individual_contributions || 0,
            otherPACs: t.other_political_committee_contributions || 0,
            corporate: (t.receipts || 0) - (t.individual_contributions || 0) - (t.other_political_committee_contributions || 0),
            aipac: 0,
          };
          log.push(`[FEC] Total raised: $${Math.round(totalFunds).toLocaleString('en-US')}`);
        }
      } catch (e) {
        log.push(`[FEC] Totals error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(500);

      // Top donors
      try {
        const data = await fecFetch('/schedules/schedule_a/', {
          candidate_id: fecId, per_page: 10, sort: '-contribution_receipt_amount', two_year_transaction_period: 2026,
        }) as { results?: Array<{ contributor_name: string; contribution_receipt_amount: number; entity_type: string }> };
        if (data.results?.length) {
          top5Donors = data.results.slice(0, 5).map(d => ({
            name: d.contributor_name,
            amount: d.contribution_receipt_amount,
            type: d.entity_type === 'IND' ? 'Individual' : d.entity_type === 'COM' ? 'PAC' : 'Corporate',
            is_israel_lobby: false,
          }));
          log.push(`[FEC] Top donors: ${top5Donors.length}`);
        }
      } catch (e) {
        log.push(`[FEC] Donors error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    log.push('[FEC] No API key configured — skipping financials');
  }

  // ===== PILLAR 2: COURT RECORDS =====
  log.push('[COURT] Searching CourtListener...');
  let courtRecords: Array<Record<string, unknown>> = [];
  try {
    const records = await searchCourtRecords(pol.name, log);
    courtRecords = records.map(r => ({
      id: r.id, case_name: r.caseName, case_name_short: r.caseNameShort,
      court: r.court, court_id: r.courtId, docket_number: r.docketNumber,
      date_filed: r.dateFiled, date_terminated: r.dateTerminated,
      cause: r.cause, nature_of_suit: r.natureOfSuit, url: r.url, source: r.source,
    }));
  } catch (e) {
    log.push(`[COURT] Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ===== PILLAR 3: VOTING RECORDS =====
  const votingRecords = pol.voting_records || [];
  log.push(`[VOTES] ${votingRecords.length} existing records`);

  // ===== PILLAR 4: SOCIAL POSTS =====
  let socialPosts: Array<Record<string, unknown>> = [];
  const { data: posts } = await supabase
    .from('social_posts')
    .select('*')
    .eq('politician_id', bioguideId)
    .order('posted_at', { ascending: false })
    .limit(20);
  socialPosts = posts || [];
  log.push(`[SOCIAL] ${socialPosts.length} posts`);

  return {
    politician: pol,
    financials: { fecId, totalFunds, top5Donors, contributionBreakdown },
    courtRecords,
    votingRecords,
    socialPosts,
    log,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authError = verifyAdmin(request);
  if (authError) return authError;

  const body = await request.json();
  const { action } = body;

  const supabase = getServiceRoleSupabase();

  switch (action) {
    // --- List politicians for search/select ---
    case 'list-politicians': {
      if (!supabase) return NextResponse.json({ error: 'No DB — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 });
      const allRows: Record<string, unknown>[] = [];
      let pg = 0;
      while (true) {
        const { data: batch, error: batchErr } = await supabase
          .from('politicians')
          .select('*')
          .order('name')
          .range(pg * 1000, (pg + 1) * 1000 - 1);
        if (batchErr) return NextResponse.json({ error: `DB query failed: ${batchErr.message}`, politicians: [] }, { status: 500 });
        if (!batch) break;
        allRows.push(...batch);
        if (batch.length < 1000) break;
        pg++;
      }
      const data = allRows;
      const politicians = (data || []).map((p: Record<string, unknown>) => ({
        bioguide_id: p.bioguide_id,
        name: p.name,
        office: p.office,
        party: p.party,
        is_active: p.is_active,
        is_candidate: p.is_candidate ?? false,
        running_for: p.running_for ?? null,
        corruption_score: p.corruption_score,
        total_funds: p.total_funds,
      }));
      return NextResponse.json({ politicians });
    }

    // --- Run deep research on a politician ---
    case 'research': {
      if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });
      const { bioguideId } = body;
      if (!bioguideId) return NextResponse.json({ error: 'bioguideId required' }, { status: 400 });

      try {
        // Load full politician record
        const { data: pol, error: polErr } = await supabase
          .from('politicians')
          .select('*')
          .eq('bioguide_id', bioguideId)
          .single();
        if (polErr || !pol) return NextResponse.json({ error: `Not found: ${polErr?.message || bioguideId}` }, { status: 404 });

        const result = await deepResearch(pol, supabase);
        return NextResponse.json({ success: true, result });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    }

    // --- Push research to live DB ---
    case 'push-to-db': {
      if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });
      const { bioguideId, updates } = body;
      if (!bioguideId || !updates) return NextResponse.json({ error: 'bioguideId and updates required' }, { status: 400 });

      const safeUpdates: Record<string, unknown> = {};
      const allowedFields = [
        'total_funds', 'top5_donors', 'contribution_breakdown', 'court_records',
        'source_ids', 'aipac_funding', 'israel_lobby_total', 'israel_lobby_breakdown',
        'corruption_score', 'bio', 'social_media', 'is_candidate', 'running_for',
        'lobbying_records', 'voting_records', 'name', 'office', 'party',
      ];
      for (const key of allowedFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }
      safeUpdates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('politicians')
        .update(safeUpdates)
        .eq('bioguide_id', bioguideId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, fieldsUpdated: Object.keys(safeUpdates).length - 1 });
    }

    // --- Export politician data ---
    case 'export': {
      if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });
      const { bioguideId: exportId, format } = body;

      const query = supabase.from('politicians').select('*');
      if (exportId) query.eq('bioguide_id', exportId);

      const { data: exportData } = await query.order('name');
      if (!exportData) return NextResponse.json({ error: 'No data' }, { status: 404 });

      // Flatten for export
      const flat = exportData.map(p => ({
        name: p.name,
        office: p.office,
        party: p.party,
        is_active: p.is_active,
        is_candidate: p.is_candidate,
        running_for: p.running_for || '',
        corruption_score: p.corruption_score,
        total_funds: p.total_funds,
        aipac_funding: p.aipac_funding,
        israel_lobby_total: p.israel_lobby_total,
        top_donors: (p.top5_donors || []).map((d: { name: string; amount: number }) => `${d.name}: $${d.amount}`).join('; '),
        court_records_count: (p.court_records || []).length,
        voting_records_count: (p.voting_records || []).length,
        lobbying_records_count: (p.lobbying_records || []).length,
        jurisdiction: p.jurisdiction,
        district: p.district,
        bio: p.bio || '',
        twitter: p.social_media?.twitterHandle || '',
        instagram: p.social_media?.instagramHandle || '',
        data_source: p.data_source,
        updated_at: p.updated_at,
      }));

      if (format === 'csv') {
        if (flat.length === 0) return NextResponse.json({ error: 'No data' }, { status: 404 });
        const headers = Object.keys(flat[0]);
        const csvRows = [
          headers.join(','),
          ...flat.map(row => headers.map(h => {
            const val = String((row as Record<string, unknown>)[h] ?? '');
            return val.includes(',') || val.includes('"') || val.includes('\n')
              ? `"${val.replace(/"/g, '""')}"` : val;
          }).join(',')),
        ];
        return new NextResponse(csvRows.join('\n'), {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="snitched-export-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      return NextResponse.json({ data: flat, count: flat.length });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
