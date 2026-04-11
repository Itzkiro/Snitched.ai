import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getStateFromZip } from '@/lib/zip-lookup';
import { getStateFromId } from '@/lib/state-utils';
import type { Politician } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get('zip');
  if (!zip || zip.replace(/\D/g, '').length < 5) {
    return NextResponse.json({ error: 'Valid 5-digit ZIP code required' }, { status: 400 });
  }

  const stateCode = getStateFromZip(zip);
  if (!stateCode) {
    return NextResponse.json({ error: 'Could not determine state from ZIP code' }, { status: 404 });
  }

  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  // Fetch all politicians, filter by state
  const allRows: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    const { data: batch, error } = await client
      .from('politicians')
      .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, corruption_score, aipac_funding, juice_box_tier, total_funds, israel_lobby_total, is_active, is_candidate, running_for')
      .order('name')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !batch) break;
    allRows.push(...batch);
    if (batch.length < 1000) break;
    page++;
  }

  // Filter to matching state
  const statePoliticians = allRows.filter(row =>
    getStateFromId(row.bioguide_id as string) === stateCode
  );

  const politicians: Politician[] = statePoliticians.map((row) => ({
    id: row.bioguide_id as string,
    name: row.name as string,
    office: row.office as string,
    officeLevel: row.office_level as Politician['officeLevel'],
    party: row.party as Politician['party'],
    district: row.district as string | undefined,
    jurisdiction: row.jurisdiction as string,
    jurisdictionType: row.jurisdiction_type as Politician['jurisdictionType'],
    corruptionScore: Number(row.corruption_score) || 0,
    aipacFunding: Number(row.aipac_funding) || 0,
    juiceBoxTier: (row.juice_box_tier as Politician['juiceBoxTier']) || 'none',
    totalFundsRaised: Number(row.total_funds) || 0,
    israelLobbyTotal: Number(row.israel_lobby_total) || 0,
    isActive: row.is_active as boolean,
    isCandidate: row.is_candidate as boolean,
    runningFor: row.running_for as string | undefined,
  })) as Politician[];

  // Group by type
  const officials = politicians.filter(p => p.isActive && !p.isCandidate);
  const candidates = politicians.filter(p => p.isCandidate);

  return NextResponse.json({
    zip,
    state: stateCode,
    total: politicians.length,
    officials,
    candidates,
  });
}
