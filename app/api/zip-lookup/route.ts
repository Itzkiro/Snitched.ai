import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getStateFromZip } from '@/lib/zip-lookup';
import { getStateFromId, getStateName } from '@/lib/state-utils';
import type { Politician } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface DistrictInfo {
  state: string;
  stateName: string;
  congressionalDistrict: string | null;
  stateSenateDistrict: string | null;
  stateHouseDistrict: string | null;
  county: string | null;
  city: string | null;
  schoolDistrict: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Step 1: ZIP → lat/lng via OpenStreetMap Nominatim (free, no key)
 * Step 2: lat/lng → districts via Census Bureau Geocoder (free, no key)
 */
async function getDistrictsFromZip(zip: string): Promise<DistrictInfo | null> {
  try {
    // Get coordinates from ZIP
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`,
      { headers: { 'User-Agent': 'snitched.ai/1.0' }, next: { revalidate: 86400 } },
    );
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    if (!geoData || geoData.length === 0) return null;

    const lat = geoData[0].lat;
    const lng = geoData[0].lon;

    // Get districts from Census geocoder
    const censusRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json&layers=all`,
      { next: { revalidate: 86400 } },
    );
    if (!censusRes.ok) return null;
    const censusData = await censusRes.json();
    const geo = censusData?.result?.geographies || {};

    // Extract district info
    let state = '';
    let congressionalDistrict: string | null = null;
    let stateSenateDistrict: string | null = null;
    let stateHouseDistrict: string | null = null;
    let county: string | null = null;
    let city: string | null = null;
    let schoolDistrict: string | null = null;

    // State
    const states = geo['States'];
    if (states?.[0]) {
      state = states[0].STUSAB || '';
    }

    // Congressional district
    const cdKey = Object.keys(geo).find(k => k.includes('Congressional'));
    if (cdKey && geo[cdKey]?.[0]) {
      const cdVal = geo[cdKey][0].CD119 || geo[cdKey][0].BASENAME;
      congressionalDistrict = cdVal ? String(Number(cdVal)) : null;
    }

    // State Senate (upper)
    const slduKey = Object.keys(geo).find(k => k.includes('Upper'));
    if (slduKey && geo[slduKey]?.[0]) {
      const val = geo[slduKey][0].SLDU || geo[slduKey][0].BASENAME;
      stateSenateDistrict = val ? String(Number(val)) : null;
    }

    // State House (lower)
    const sldlKey = Object.keys(geo).find(k => k.includes('Lower'));
    if (sldlKey && geo[sldlKey]?.[0]) {
      const val = geo[sldlKey][0].SLDL || geo[sldlKey][0].BASENAME;
      stateHouseDistrict = val ? String(Number(val)) : null;
    }

    // County
    const counties = geo['Counties'];
    if (counties?.[0]) {
      county = counties[0].BASENAME || counties[0].NAME || null;
    }

    // City
    const places = geo['Incorporated Places'];
    if (places?.[0]) {
      city = places[0].BASENAME || places[0].NAME || null;
    }

    // School district
    const schools = geo['Unified School Districts'];
    if (schools?.[0]) {
      schoolDistrict = schools[0].BASENAME || schools[0].NAME || null;
    }

    if (!state) return null;

    return {
      state,
      stateName: getStateName(state),
      congressionalDistrict,
      stateSenateDistrict,
      stateHouseDistrict,
      county,
      city,
      schoolDistrict,
      lat: Number(lat),
      lng: Number(lng),
    };
  } catch (err) {
    console.error('District lookup error:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get('zip');
  if (!zip || zip.replace(/\D/g, '').length < 5) {
    return NextResponse.json({ error: 'Valid 5-digit ZIP code required' }, { status: 400 });
  }

  const cleanZip = zip.replace(/\D/g, '').slice(0, 5);

  // Step 1: Get exact districts from Census Bureau
  const districts = await getDistrictsFromZip(cleanZip);
  const stateCode = districts?.state || getStateFromZip(cleanZip);

  if (!stateCode) {
    return NextResponse.json({ error: 'Could not determine location from ZIP code' }, { status: 404 });
  }

  const cd = districts?.congressionalDistrict;
  const sldu = districts?.stateSenateDistrict;
  const sldl = districts?.stateHouseDistrict;
  const county = districts?.county;

  // Step 2: Fetch politicians from DB
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

  // Filter to state
  const statePols = allRows.filter(row =>
    getStateFromId(row.bioguide_id as string) === stateCode
  );

  const city = districts?.city;

  /**
   * Check if a DB district field matches a Census district number.
   * DB stores districts in various formats: "7", "FL-7", "FL State Senate District 7", etc.
   */
  function districtMatches(dbDist: string | null, censusNum: string): boolean {
    if (!dbDist) return false;
    const num = String(Number(censusNum)); // strip leading zeros: "08" → "8"
    // Exact: "7"
    if (dbDist === num || dbDist === censusNum) return true;
    // Prefixed: "FL-7", "OH-7"
    if (dbDist.includes(`-${num}`) && dbDist.match(new RegExp(`-${num}$`))) return true;
    // Full text: "FL State Senate District 7", "District 7"
    if (dbDist.includes(`District ${num}`) || dbDist.includes(`district ${num}`)) return true;
    return false;
  }

  // Step 3: Match ONLY to user's specific districts
  const COUNTY_WIDE_OFFICES = new Set([
    'County Commissioner', 'Sheriff', 'Clerk of Court', 'Clerk of Courts',
    'Property Appraiser', 'Tax Collector', 'Supervisor of Elections',
    'State Attorney', 'Public Defender', 'County Auditor', 'County Treasurer',
    'County Recorder', 'County Engineer', 'County Coroner', 'Prosecutor',
    'School Board',
  ]);

  const matched = statePols.filter(row => {
    const level = row.office_level as string;
    const dist = row.district as string | null;
    const juris = (row.jurisdiction as string || '').toLowerCase();
    const office = (row.office as string || '').toLowerCase();

    // Statewide offices — always include
    if (level === 'US Senator' || level === 'Governor') return true;

    // US Representative — only YOUR congressional district
    if (level === 'US Representative') {
      if (!cd) return false;
      return districtMatches(dist, cd);
    }

    // State Senator — only YOUR state senate district
    if (level === 'State Senator') {
      if (!sldu) return false;
      return districtMatches(dist, sldu);
    }

    // State Representative — only YOUR state house district
    if (level === 'State Representative') {
      if (!sldl) return false;
      return districtMatches(dist, sldl);
    }

    // County-level: match county name
    if (county) {
      const countyLower = county.toLowerCase();
      const isCountyJuris = juris === `${countyLower} county` || juris === countyLower || juris === `${countyLower} parish`;

      if (isCountyJuris) {
        // County-wide offices (sheriff, commissioners, etc.)
        if (COUNTY_WIDE_OFFICES.has(level) || [...COUNTY_WIDE_OFFICES].some(o => level.includes(o))) return true;
      }
    }

    // City-level: only if Census returned a specific city AND the official's office mentions that city
    if (city) {
      const cityLower = city.toLowerCase();
      if (
        juris.includes(cityLower) ||
        office.includes(cityLower) ||
        (level === 'Mayor' && juris.includes(county?.toLowerCase() || '___') && office.includes(cityLower)) ||
        (level === 'City Council' && office.includes(cityLower)) ||
        (level === 'City Commissioner' && office.includes(cityLower))
      ) {
        return true;
      }
    }

    return false;
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

  const politicians = matched.map(mapRow);
  // For ballot view: seated officials = anyone who is_active (regardless of candidate status)
  // Challengers = candidates who are NOT currently seated
  const officials = politicians.filter(p => p.isActive);
  const candidates = politicians.filter(p => p.isCandidate && !p.isActive);

  return NextResponse.json({
    zip: cleanZip,
    state: stateCode,
    districtInfo: districts || { state: stateCode, stateName: getStateName(stateCode), congressionalDistrict: null, stateSenateDistrict: null, stateHouseDistrict: null, county: null, city: null, schoolDistrict: null, lat: null, lng: null },
    total: politicians.length,
    officials,
    candidates,
  });
}
