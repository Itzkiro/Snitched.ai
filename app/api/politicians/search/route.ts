import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/politicians/search?q=scott&limit=10
 *
 * Lightweight search endpoint for autocomplete.
 * Returns only id, name, office, party — no heavy fields.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '10'), 20);

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const client = getServerSupabase();
    if (!client) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { data, error } = await client
      .from('politicians')
      .select('bioguide_id, name, office, office_level, party, corruption_score, total_funds, israel_lobby_total')
      .ilike('name', `%${q}%`)
      .eq('is_active', true)
      .order('name')
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      (data || []).map(row => ({
        id: row.bioguide_id,
        name: row.name,
        office: row.office,
        officeLevel: row.office_level,
        party: row.party,
        corruptionScore: row.corruption_score,
        totalFundsRaised: row.total_funds,
        israelLobbyTotal: row.israel_lobby_total,
      })),
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
