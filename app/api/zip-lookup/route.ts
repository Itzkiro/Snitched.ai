import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getStateFromZip } from '@/lib/zip-lookup';
import { getStateFromId } from '@/lib/state-utils';
import type { Politician } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface WIMRMember {
  name: string;
  party: string;
  state: string;
  district: string;
  phone: string;
  office: string;
  link: string;
}

/**
 * Lookup representatives via whoismyrepresentative.com (free, no key).
 * Returns state, congressional district, and member list.
 */
async function lookupDistrict(zip: string): Promise<{
  state: string | null;
  congressionalDistrict: string | null;
  members: WIMRMember[];
}> {
  try {
    const res = await fetch(
      `https://whoismyrepresentative.com/getall_mems.php?zip=${zip}&output=json`,
      { next: { revalidate: 86400 } }, // cache 24h
    );
    if (!res.ok) return { state: null, congressionalDistrict: null, members: [] };

    const text = await res.text();
    // Response sometimes has garbage before the JSON
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) return { state: null, congressionalDistrict: null, members: [] };

    const data = JSON.parse(text.slice(jsonStart)) as { results: WIMRMember[] };
    const members = data.results || [];

    const state = members[0]?.state || null;
    // Find the House member to get district
    const houseRep = members.find(m => m.district && m.district !== '');
    const congressionalDistrict = houseRep?.district || null;

    return { state, congressionalDistrict, members };
  } catch {
    return { state: null, congressionalDistrict: null, members: [] };
  }
}

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get('zip');
  if (!zip || zip.replace(/\D/g, '').length < 5) {
    return NextResponse.json({ error: 'Valid 5-digit ZIP code required' }, { status: 400 });
  }

  const cleanZip = zip.replace(/\D/g, '').slice(0, 5);

  // Step 1: Lookup district from ZIP
  const lookup = await lookupDistrict(cleanZip);
  const stateCode = lookup.state || getStateFromZip(cleanZip);

  if (!stateCode) {
    return NextResponse.json({ error: 'Could not determine state from ZIP code' }, { status: 404 });
  }

  const cd = lookup.congressionalDistrict;

  // Step 2: Fetch politicians from DB for this state
  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

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

  // Step 3: Filter to district-level matches
  const districtMatched = statePoliticians.filter(row => {
    const level = row.office_level as string;
    const dist = row.district as string | null;

    // Statewide officials — always included
    if (level === 'US Senator' || level === 'Governor') return true;

    // US Representative — match congressional district
    if (level === 'US Representative') {
      if (!cd) return true; // show all if we couldn't determine district
      return dist === cd || dist === String(Number(cd));
    }

    // State legislators — include all for now (would need state legislative district mapping)
    if (level === 'State Senator' || level === 'State Representative') return true;

    // County/local — include all for this state (user can browse)
    return true;
  });

  const mapRow = (row: Record<string, unknown>): Politician => ({
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
  }) as Politician;

  const politicians = districtMatched.map(mapRow);
  const officials = politicians.filter(p => p.isActive && !p.isCandidate);
  const candidates = politicians.filter(p => p.isCandidate);

  // Format representatives from WIMR for display
  const federalReps = lookup.members.map(m => ({
    name: m.name,
    office: m.district ? `US Representative, District ${m.district}` : 'US Senator',
    level: m.district ? 'federal-house' : 'federal-senate',
    party: m.party,
  }));

  return NextResponse.json({
    zip: cleanZip,
    state: stateCode,
    districtInfo: {
      congressionalDistrict: cd || null,
    },
    federalReps,
    total: politicians.length,
    officials,
    candidates,
  });
}
