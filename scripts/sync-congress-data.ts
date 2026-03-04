/**
 * Sync Congress.gov member data for FL federal politicians in Supabase.
 *
 * Fetches all current FL members from Congress.gov, retrieves detailed info
 * (official photo, bio data, terms served), and updates matching Supabase
 * records by bioguide_id.
 *
 * Usage:
 *   npx tsx scripts/sync-congress-data.ts
 *
 * Environment:
 *   Uses hardcoded Vercel Supabase credentials and Congress.gov API key
 *   (can be overridden via CONGRESS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONGRESS_API_KEY =
  process.env.CONGRESS_API_KEY || 'PO9bVTF8mjV0tGvugG7HAT3TcZUf4P09iPOnjUym';
const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://uqjfxhpyitleeleazzow.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxamZ4aHB5aXRsZWVsZWF6em93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc2NzQzOCwiZXhwIjoyMDg3MzQzNDM4fQ.abK_AJ-qataXyYn59I2w2rTxP4dIyl1UjCAMkw_6JPw';

// Rate-limit delay between API requests (ms)
const DELAY_MS = 250;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CongressListMember {
  bioguideId: string;
  name: string; // "Last, First"
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
  url: string;
}

interface CongressDetailMember {
  bioguideId: string;
  firstName: string;
  lastName: string;
  directOrderName: string;
  invertedOrderName: string;
  birthYear?: string;
  currentMember: boolean;
  state: string;
  district?: number;
  depiction?: {
    imageUrl: string;
    attribution: string;
  };
  officialWebsiteUrl?: string;
  addressInformation?: {
    officeAddress: string;
    city: string;
    district: string;
    zipCode: number;
    phoneNumber: string;
  };
  partyHistory: Array<{
    partyName: string;
    partyAbbreviation: string;
    startYear: number;
  }>;
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
  sponsoredLegislation?: { count: number };
  cosponsoredLegislation?: { count: number };
}

interface SupabasePolitician {
  bioguide_id: string; // UUID primary key
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: string | null;
  photo_url: string | null;
  bio: string | null;
  source_ids: Record<string, string> | null;
  term_start: string | null;
  term_end: string | null;
  years_in_office: number | null;
  social_media: Record<string, string> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch with basic retry on 429 */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.log(`  Rate limited (429). Waiting ${waitMs / 1000}s before retry...`);
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  // Final attempt
  return fetch(url);
}

/** Calculate years in office from terms array */
function calculateYearsInOffice(terms: CongressDetailMember['terms']): number {
  if (!terms || terms.length === 0) return 0;
  const earliestStart = Math.min(...terms.map((t) => t.startYear));
  const currentYear = new Date().getFullYear();
  return Math.round((currentYear - earliestStart) * 10) / 10;
}

/** Get the latest (current) term from the terms array */
function getLatestTerm(terms: CongressDetailMember['terms']) {
  if (!terms || terms.length === 0) return null;
  // Sort by congress number descending, then by startYear descending
  const sorted = [...terms].sort((a, b) => {
    if (b.congress !== a.congress) return b.congress - a.congress;
    return b.startYear - a.startYear;
  });
  return sorted[0];
}

/** Build a richer bio string from member detail data */
function buildBio(member: CongressDetailMember): string {
  const latestTerm = getLatestTerm(member.terms);
  const chamber = latestTerm?.chamber || 'Congress';
  const party =
    member.partyHistory?.[member.partyHistory.length - 1]?.partyName || 'Unknown';

  let bio = `${member.directOrderName} is a ${party} member of the ${chamber}`;
  if (member.state) {
    bio += `, representing Florida`;
    if (member.district) {
      bio += `'s ${getOrdinal(member.district)} congressional district`;
    }
  }
  bio += '.';

  if (member.birthYear) {
    bio += ` Born in ${member.birthYear}.`;
  }

  const totalTerms = member.terms?.length || 0;
  if (totalTerms > 1) {
    const earliestYear = Math.min(...member.terms.map((t) => t.startYear));
    bio += ` First elected in ${earliestYear}, currently serving their ${getOrdinal(totalTerms)} term.`;
  } else if (totalTerms === 1) {
    bio += ` First elected in ${member.terms[0].startYear}, currently serving their first term.`;
  }

  if (member.sponsoredLegislation?.count) {
    bio += ` Has sponsored ${member.sponsoredLegislation.count} pieces of legislation`;
    if (member.cosponsoredLegislation?.count) {
      bio += ` and co-sponsored ${member.cosponsoredLegislation.count}`;
    }
    bio += '.';
  }

  return bio;
}

/** Convert number to ordinal string (1st, 2nd, 3rd, etc.) */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Map Congress.gov party name to our party format */
function mapPartyName(partyName: string): string {
  if (partyName === 'Democratic') return 'Democrat';
  if (partyName === 'Republican') return 'Republican';
  if (partyName === 'Independent') return 'Independent';
  return 'Other';
}

// ---------------------------------------------------------------------------
// Main sync logic
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Congress.gov Data Sync for FL Federal Politicians ===\n');

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -------------------------------------------------------------------------
  // Step 1: Load existing federal politicians from Supabase
  // -------------------------------------------------------------------------
  console.log('Step 1: Loading federal politicians from Supabase...');
  const { data: politicians, error: fetchError } = await supabase
    .from('politicians')
    .select(
      'bioguide_id, name, office, office_level, party, district, photo_url, bio, source_ids, term_start, term_end, years_in_office, social_media'
    )
    .or('office_level.eq.US Senator,office_level.eq.US Representative')
    .order('name');

  if (fetchError) {
    console.error('Failed to load politicians from Supabase:', fetchError.message);
    process.exit(1);
  }

  console.log(`  Found ${politicians.length} federal politicians in Supabase\n`);

  // Build a lookup map: bioguide_id (from source_ids) -> politician row
  const bioguideMap = new Map<string, SupabasePolitician>();
  const nameMap = new Map<string, SupabasePolitician>(); // fallback: lowercase name -> row

  for (const p of politicians as SupabasePolitician[]) {
    const bgId = p.source_ids?.bioguide_id;
    if (bgId) {
      bioguideMap.set(bgId, p);
    }
    // Also index by lowercase name for fallback matching
    nameMap.set(p.name.toLowerCase().trim(), p);
  }

  console.log(`  Indexed ${bioguideMap.size} politicians by bioguide_id`);
  console.log(`  Indexed ${nameMap.size} politicians by name (fallback)\n`);

  // -------------------------------------------------------------------------
  // Step 2: Fetch all current FL members from Congress.gov
  // -------------------------------------------------------------------------
  console.log('Step 2: Fetching current FL members from Congress.gov...');
  const listUrl = `${CONGRESS_API_BASE}/member/FL?api_key=${CONGRESS_API_KEY}&format=json&limit=250&currentMember=true`;
  const listRes = await fetchWithRetry(listUrl);

  if (!listRes.ok) {
    console.error(`Failed to fetch FL members: HTTP ${listRes.status}`);
    const text = await listRes.text();
    console.error(text);
    process.exit(1);
  }

  const listData = await listRes.json();
  const apiMembers: CongressListMember[] = listData.members || [];
  console.log(`  Got ${apiMembers.length} current FL members from API\n`);

  // -------------------------------------------------------------------------
  // Step 3: For each API member, fetch details and update Supabase
  // -------------------------------------------------------------------------
  console.log('Step 3: Fetching details and updating Supabase...\n');

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  let errors = 0;
  const unmatchedMembers: string[] = [];

  for (const listMember of apiMembers) {
    const bgId = listMember.bioguideId;

    // Match to Supabase politician by bioguide_id
    let politician = bioguideMap.get(bgId);

    // Fallback: try matching by name
    if (!politician) {
      // Congress.gov name format: "Last, First M." -> convert to "First M. Last"
      const parts = listMember.name.split(', ');
      const directName = parts.length >= 2 ? `${parts[1]} ${parts[0]}` : listMember.name;
      const normalizedName = directName.toLowerCase().trim();

      // Try exact match
      politician = nameMap.get(normalizedName);

      // Try partial match (last name + first name start)
      if (!politician) {
        for (const [key, val] of nameMap) {
          const lastName = (parts[0] || '').toLowerCase();
          const firstName = (parts[1] || '').split(' ')[0].toLowerCase();
          if (key.includes(lastName) && key.includes(firstName)) {
            politician = val;
            break;
          }
        }
      }
    }

    if (!politician) {
      console.log(`  [SKIP] No match for ${listMember.name} (${bgId})`);
      unmatchedMembers.push(`${listMember.name} (${bgId})`);
      noMatch++;
      continue;
    }

    // Fetch detailed member info
    await sleep(DELAY_MS);
    const detailUrl = `${CONGRESS_API_BASE}/member/${bgId}?api_key=${CONGRESS_API_KEY}&format=json`;
    const detailRes = await fetchWithRetry(detailUrl);

    if (!detailRes.ok) {
      console.log(`  [ERROR] Failed to fetch detail for ${listMember.name}: HTTP ${detailRes.status}`);
      errors++;
      continue;
    }

    const detailData = await detailRes.json();
    const member: CongressDetailMember = detailData.member;

    if (!member) {
      console.log(`  [ERROR] No member data in response for ${bgId}`);
      errors++;
      continue;
    }

    // Build the update payload
    const latestTerm = getLatestTerm(member.terms);
    const yearsInOffice = calculateYearsInOffice(member.terms);
    const bio = buildBio(member);
    const photoUrl = member.depiction?.imageUrl || null;

    // Determine term_start and term_end for the current term
    let termStart: string | null = null;
    let termEnd: string | null = null;
    if (latestTerm) {
      // Convert year to Jan 3 date (when Congress convenes)
      termStart = `${latestTerm.startYear}-01-03`;
      if (latestTerm.endYear) {
        termEnd = `${latestTerm.endYear}-01-03`;
      } else {
        // Estimate: House terms are 2 years, Senate terms are 6 years
        const termLength = latestTerm.chamber === 'Senate' ? 6 : 2;
        termEnd = `${latestTerm.startYear + termLength}-01-03`;
      }
    }

    // Merge source_ids - preserve existing, add bioguide_id if missing
    const existingSourceIds = politician.source_ids || {};
    const updatedSourceIds = {
      ...existingSourceIds,
      bioguide_id: bgId,
    };

    // Build social_media update - preserve existing, add website if available
    const existingSocial = politician.social_media || {};
    const updatedSocial = {
      ...existingSocial,
      ...(member.officialWebsiteUrl ? { officialWebsite: member.officialWebsiteUrl } : {}),
    };

    // Build the Supabase update
    const updatePayload: Record<string, unknown> = {
      photo_url: photoUrl,
      bio,
      years_in_office: yearsInOffice,
      source_ids: updatedSourceIds,
      social_media: updatedSocial,
      is_active: true,
      data_source: 'congress.gov',
      updated_at: new Date().toISOString(),
    };

    // Only update term dates if we computed them
    if (termStart) updatePayload.term_start = termStart;
    if (termEnd) updatePayload.term_end = termEnd;

    // Update in Supabase
    const { error: updateError } = await supabase
      .from('politicians')
      .update(updatePayload)
      .eq('bioguide_id', politician.bioguide_id);

    if (updateError) {
      console.log(`  [ERROR] Failed to update ${politician.name}: ${updateError.message}`);
      errors++;
      continue;
    }

    // Log what changed
    const changes: string[] = [];
    if (photoUrl && photoUrl !== politician.photo_url) changes.push('photo');
    if (bio !== politician.bio) changes.push('bio');
    if (termStart && termStart !== politician.term_start) changes.push('term_start');
    if (termEnd && termEnd !== politician.term_end) changes.push('term_end');
    if (yearsInOffice !== politician.years_in_office) changes.push('years_in_office');

    if (changes.length > 0) {
      console.log(`  [UPDATED] ${politician.name} (${bgId}): ${changes.join(', ')}`);
      updated++;
    } else {
      console.log(`  [NO CHANGE] ${politician.name} (${bgId})`);
      skipped++;
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Sync Summary ===');
  console.log(`API members fetched:    ${apiMembers.length}`);
  console.log(`Updated:                ${updated}`);
  console.log(`No changes needed:      ${skipped}`);
  console.log(`No match in Supabase:   ${noMatch}`);
  console.log(`Errors:                 ${errors}`);

  if (unmatchedMembers.length > 0) {
    console.log('\nUnmatched API members (not in our database):');
    for (const name of unmatchedMembers) {
      console.log(`  - ${name}`);
    }
  }

  // -------------------------------------------------------------------------
  // Verification: re-read and show updated data
  // -------------------------------------------------------------------------
  console.log('\n=== Verification: Updated Records ===\n');
  const { data: verifyData, error: verifyError } = await supabase
    .from('politicians')
    .select('name, photo_url, bio, term_start, term_end, years_in_office, source_ids, data_source')
    .or('office_level.eq.US Senator,office_level.eq.US Representative')
    .order('name');

  if (verifyError) {
    console.error('Verification query failed:', verifyError.message);
  } else {
    for (const p of verifyData) {
      const hasPhoto = p.photo_url ? 'YES' : 'NO';
      const hasBio = p.bio && p.bio.length > 50 ? 'YES' : 'NO';
      const bgId = (p.source_ids as Record<string, string>)?.bioguide_id || 'N/A';
      console.log(
        `  ${p.name.padEnd(35)} photo:${hasPhoto}  bio:${hasBio}  ` +
        `term:${p.term_start || 'N/A'} -> ${p.term_end || 'N/A'}  ` +
        `years:${p.years_in_office || 0}  bioguide:${bgId}  source:${p.data_source || 'N/A'}`
      );
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
