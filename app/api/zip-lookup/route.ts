import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getStateFromZip } from '@/lib/zip-lookup';
import { getStateFromId } from '@/lib/state-utils';
import type { Politician } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface CivicOffice {
  name: string;
  divisionId: string;
  levels?: string[];
  roles?: string[];
}
interface CivicOfficial {
  name: string;
  party?: string;
}
interface CivicResponse {
  offices?: CivicOffice[];
  officials?: CivicOfficial[];
  normalizedInput?: { state: string; zip: string };
}

/**
 * Extract district info from Google Civic API response.
 * Returns { state, congressionalDistrict, stateUpperDistrict, stateLowerDistrict, county }
 */
function parseDistricts(civic: CivicResponse) {
  const result: {
    state: string | null;
    congressionalDistrict: string | null;
    stateUpperDistrict: string | null;
    stateLowerDistrict: string | null;
    county: string | null;
    civicOfficials: Array<{ name: string; office: string; level: string; party: string }>;
  } = {
    state: null,
    congressionalDistrict: null,
    stateUpperDistrict: null,
    stateLowerDistrict: null,
    county: null,
    civicOfficials: [],
  };

  if (!civic.offices || !civic.officials) return result;

  for (const office of civic.offices) {
    const div = office.divisionId || '';

    // State
    const stateMatch = div.match(/\/state:(\w+)/);
    if (stateMatch && !result.state) {
      result.state = stateMatch[1].toUpperCase();
    }

    // Congressional district: ocd-division/country:us/state:xx/cd:N
    const cdMatch = div.match(/\/cd:(\d+)/);
    if (cdMatch) {
      result.congressionalDistrict = cdMatch[1];
    }

    // State upper (senate): sldl or sldu
    const slduMatch = div.match(/\/sldu:(\d+)/);
    if (slduMatch) {
      result.stateUpperDistrict = slduMatch[1];
    }

    // State lower (house)
    const sldlMatch = div.match(/\/sldl:(\d+)/);
    if (sldlMatch) {
      result.stateLowerDistrict = sldlMatch[1];
    }

    // County
    const countyMatch = div.match(/\/county:([^/]+)/);
    if (countyMatch) {
      result.county = decodeURIComponent(countyMatch[1]).replace(/_/g, ' ');
    }
  }

  // Extract officials with their offices
  for (const office of civic.offices) {
    const indices = (office as unknown as { officialIndices?: number[] }).officialIndices || [];
    const level = office.levels?.[0] || 'unknown';
    for (const idx of indices) {
      const official = civic.officials[idx];
      if (official) {
        result.civicOfficials.push({
          name: official.name,
          office: office.name,
          level,
          party: official.party || 'Unknown',
        });
      }
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get('zip');
  if (!zip || zip.replace(/\D/g, '').length < 5) {
    return NextResponse.json({ error: 'Valid 5-digit ZIP code required' }, { status: 400 });
  }

  const cleanZip = zip.replace(/\D/g, '').slice(0, 5);

  // Step 1: Call Google Civic API to get exact districts
  const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
  let districts: ReturnType<typeof parseDistricts> | null = null;

  if (apiKey) {
    try {
      const civicUrl = `https://www.googleapis.com/civicinfo/v2/representatives?address=${cleanZip}&key=${apiKey}`;
      const civicRes = await fetch(civicUrl, { next: { revalidate: 86400 } }); // cache 24h
      if (civicRes.ok) {
        const civicData: CivicResponse = await civicRes.json();
        districts = parseDistricts(civicData);
      }
    } catch (err) {
      console.error('Civic API error:', err);
    }
  }

  // Determine state from Civic API or fallback to ZIP prefix
  const stateCode = districts?.state || getStateFromZip(cleanZip);
  if (!stateCode) {
    return NextResponse.json({ error: 'Could not determine state from ZIP code' }, { status: 404 });
  }

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

  const statePoliticians = allRows.filter(row =>
    getStateFromId(row.bioguide_id as string) === stateCode
  );

  // Step 3: Filter to district-level matches
  const cd = districts?.congressionalDistrict;
  const sldu = districts?.stateUpperDistrict;
  const sldl = districts?.stateLowerDistrict;
  const county = districts?.county;

  const districtMatched = statePoliticians.filter(row => {
    const level = row.office_level as string;
    const dist = row.district as string | null;
    const juris = (row.jurisdiction as string || '').toLowerCase();

    // US Senators — always included for the state
    if (level === 'US Senator') return true;

    // Governor — always included
    if (level === 'Governor') return true;

    // US Representative — match congressional district
    if (level === 'US Representative') {
      if (!cd) return true; // show all if we couldn't determine district
      return dist === cd || dist === String(Number(cd));
    }

    // State Senator — match state upper district
    if (level === 'State Senator') {
      if (!sldu) return true;
      return dist === sldu || dist === String(Number(sldu));
    }

    // State Representative — match state lower district
    if (level === 'State Representative') {
      if (!sldl) return true;
      return dist === sldl || dist === String(Number(sldl));
    }

    // County/local — match county name
    if (county) {
      const countyLower = county.toLowerCase();
      if (juris.includes(countyLower) || countyLower.includes(juris.replace(' county', ''))) {
        return true;
      }
    }

    // If no district info from Civic API, don't include local officials
    // (too many results without filtering)
    return !cd;
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

  return NextResponse.json({
    zip: cleanZip,
    state: stateCode,
    districtInfo: districts ? {
      congressionalDistrict: cd || null,
      stateUpperDistrict: sldu || null,
      stateLowerDistrict: sldl || null,
      county: county || null,
    } : null,
    civicOfficials: districts?.civicOfficials || [],
    total: politicians.length,
    officials,
    candidates,
  });
}
