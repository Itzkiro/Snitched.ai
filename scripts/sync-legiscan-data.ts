#!/usr/bin/env npx tsx
/**
 * Sync LegiScan FL State Voting Records to Snitched.ai
 *
 * This script:
 *   1. Fetches current + prior FL legislative sessions from LegiScan
 *   2. Uses getSessionPeople to get full legislator info (people_id, name, district)
 *   3. Matches LegiScan people to our Supabase politicians by name/district
 *   4. Fetches bills with floor votes via getMasterList + getBill
 *   5. For top bills with roll calls, fetches individual vote records via getRollCall
 *   6. Saves vote data to data-ingestion/legiscan-votes.json
 *   7. Updates politicians' source_ids in Supabase with their LegiScan people_id
 *
 * Usage:
 *   npx tsx scripts/sync-legiscan-data.ts
 *   npx tsx scripts/sync-legiscan-data.ts --max-bills 30    (limit bills per session)
 *   npx tsx scripts/sync-legiscan-data.ts --sessions 1      (only current session)
 *   npx tsx scripts/sync-legiscan-data.ts --delay 3000      (ms between API calls)
 *
 * Rate limits: LegiScan free tier allows ~30 req/min. Default delay is 2000ms.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEGISCAN_API_KEY = process.env.LEGISCAN_API_KEY || 'fbc52a91193b50dd0330a1521d8b155d';
const LEGISCAN_BASE = 'https://api.legiscan.com/';
const STATE = 'FL';

const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL
  || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

// CLI args
const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const MAX_BILLS_PER_SESSION = parseInt(getArg('--max-bills') || '50', 10);
const SESSIONS_TO_FETCH = parseInt(getArg('--sessions') || '2', 10);
const DELAY_MS = parseInt(getArg('--delay') || '2000', 10);

// Output paths
const OUTPUT_DIR = path.join(__dirname, '..', 'data-ingestion');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'legiscan-votes.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LegiScanSession {
  session_id: number;
  state_id: number;
  state_abbr: string;
  year_start: number;
  year_end: number;
  special: number;
  session_tag: string;
  session_title: string;
  session_name: string;
  sine_die: number;
  prior: number;
}

interface SessionPerson {
  people_id: number;
  person_hash: string;
  party_id: string;
  party: string;       // "D", "R", "I"
  role_id: number;
  role: string;        // "Sen", "Rep"
  name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  nickname: string;
  district: string;    // "SD-024", "HD-042"
  votesmart_id: number;
  opensecrets_id: string;
  ballotpedia: string;
}

interface MasterListBill {
  bill_id: number;
  number: string;
  change_hash: string;
  url: string;
  status_date: string;
  status: number;
  last_action_date: string;
  last_action: string;
  title: string;
  description: string;
}

interface BillVoteMeta {
  roll_call_id: number;
  date: string;
  desc: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: number;
  chamber: string;
  chamber_id: number;
}

interface BillDetail {
  bill_id: number;
  bill_number: string;
  bill_type: string;
  title: string;
  description: string;
  state: string;
  session_id: number;
  status: number;
  url: string;
  state_link: string;
  sponsors: Array<{
    people_id: number;
    party: string;
    role: string;
    name: string;
    first_name: string;
    last_name: string;
    district: string;
    sponsor_type_id: number;
    sponsor_order: number;
  }>;
  votes: BillVoteMeta[];
}

interface IndividualVote {
  people_id: number;
  vote_id: number;    // 1=Yea, 2=Nay, 3=NV, 4=Absent
  vote_text: string;
}

interface RollCallDetail {
  roll_call_id: number;
  bill_id: number;
  date: string;
  desc: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: number;
  chamber: string;
  votes: IndividualVote[];
}

interface SupabasePolitician {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: string | null;
  source_ids: Record<string, unknown>;
}

interface PeopleMatch {
  people_id: number;
  legiscan_name: string;
  legiscan_party: string;
  legiscan_role: string;
  legiscan_district: string;
  supabase_bioguide_id: string | null;
  supabase_name: string | null;
  match_method: string;
}

interface ProcessedVoteRecord {
  politician_people_id: number;
  politician_bioguide_id: string | null;
  politician_name: string;
  bill_id: number;
  bill_number: string;
  bill_title: string;
  bill_description: string;
  bill_url: string;
  vote_date: string;
  vote_position: 'Yea' | 'Nay' | 'NV' | 'Absent';
  roll_call_id: number;
  roll_call_desc: string;
  chamber: string;
  passed: boolean;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  session_id: number;
  session_title: string;
}

interface OutputData {
  state: string;
  sessions_fetched: string[];
  total_bills_with_votes: number;
  total_roll_calls: number;
  total_individual_votes: number;
  unique_legislators_matched: number;
  unique_legislators_total: number;
  api_calls_made: number;
  timestamp: string;
  duration_seconds: number;
  people_mapping: PeopleMatch[];
  votes: ProcessedVoteRecord[];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

let apiCallCount = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function legiscanRequest(params: Record<string, string>): Promise<any> {
  const url = new URL(LEGISCAN_BASE);
  url.searchParams.set('key', LEGISCAN_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  apiCallCount++;
  if (apiCallCount % 10 === 0) {
    console.log(`  [API] ${apiCallCount} calls made so far...`);
  }

  const response = await fetch(url.toString());

  if (response.status === 429) {
    console.log('  [API] Rate limited! Waiting 60 seconds...');
    await sleep(60000);
    // Retry once
    const retry = await fetch(url.toString());
    apiCallCount++;
    if (!retry.ok) {
      throw new Error(`LegiScan API HTTP ${retry.status} after rate-limit retry`);
    }
    const retryData = await retry.json();
    if (retryData.status === 'ERROR') {
      throw new Error(`LegiScan API error: ${JSON.stringify(retryData.alert)}`);
    }
    await sleep(DELAY_MS);
    return retryData;
  }

  if (!response.ok) {
    throw new Error(`LegiScan API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.status === 'ERROR') {
    throw new Error(`LegiScan API error: ${JSON.stringify(data.alert)}`);
  }

  await sleep(DELAY_MS);
  return data;
}

/**
 * Normalize a name for matching: lowercase, strip suffixes, handle common
 * nickname variants, return "firstname_lastname".
 */
function normalizeName(name: string): string {
  let n = name.toLowerCase().trim();
  // Remove suffixes
  n = n.replace(/,?\s*(jr\.?|sr\.?|ii|iii|iv|esq\.?)$/i, '').trim();
  // Remove periods from initials
  n = n.replace(/\./g, '');
  const parts = n.split(/\s+/);
  if (parts.length < 2) return n;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first}_${last}`;
}

/**
 * Extract district number from various formats:
 * "District 42" -> 42, "HD-042" -> 42, "SD-024" -> 24
 */
function extractDistrictNumber(district: string | null | undefined): number | null {
  if (!district) return null;
  const match = district.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Map party abbreviation: "D" -> "Democrat", "R" -> "Republican"
 */
function mapPartyToFull(abbrev: string): string {
  const map: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  return map[abbrev] || abbrev;
}

/**
 * Check if a roll call is a floor vote (full chamber vote, not committee).
 */
function isFloorVote(vote: BillVoteMeta): boolean {
  const desc = vote.desc.toLowerCase();
  return (
    vote.total >= 30 ||
    desc.includes('third reading') ||
    desc.includes('final passage') ||
    desc.includes('passage') ||
    desc.includes('conference committee report')
  );
}

const VOTE_TEXT_MAP: Record<number, 'Yea' | 'Nay' | 'NV' | 'Absent'> = {
  1: 'Yea',
  2: 'Nay',
  3: 'NV',
  4: 'Absent',
};

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(70));
  console.log('  Snitched.ai — LegiScan FL Voting Records Sync');
  console.log('='.repeat(70));
  console.log(`Sessions to fetch:     ${SESSIONS_TO_FETCH}`);
  console.log(`Max bills per session: ${MAX_BILLS_PER_SESSION}`);
  console.log(`Delay between calls:   ${DELAY_MS}ms`);
  console.log(`Output file:           ${OUTPUT_FILE}`);
  console.log();

  const startTime = Date.now();

  // =========================================================================
  // Step 0: Connect to Supabase and load our politicians
  // =========================================================================
  console.log('Step 0: Loading politicians from Supabase...');

  let supabase: SupabaseClient | null = null;
  let supabasePoliticians: SupabasePolitician[] = [];

  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('politicians')
      .select('bioguide_id, name, office, office_level, party, district, source_ids')
      .in('office_level', ['State Senator', 'State Representative'])
      .order('name');

    if (error) {
      console.error('  Supabase error:', error.message);
      console.log('  Continuing without Supabase data...');
    } else {
      supabasePoliticians = (data || []) as SupabasePolitician[];
      console.log(`  Loaded ${supabasePoliticians.length} state legislators from Supabase`);
    }
  } else {
    console.log('  No Supabase credentials found. Will save to file only.');
  }

  // Build lookup maps for matching
  // Primary: normalized "first_last" name
  // Secondary: district number + party
  const byNormalizedName = new Map<string, SupabasePolitician[]>();
  const byDistrictAndParty = new Map<string, SupabasePolitician>();

  for (const pol of supabasePoliticians) {
    const key = normalizeName(pol.name);
    if (!byNormalizedName.has(key)) {
      byNormalizedName.set(key, []);
    }
    byNormalizedName.get(key)!.push(pol);

    const distNum = extractDistrictNumber(pol.district);
    if (distNum !== null) {
      const dKey = `${distNum}_${pol.party}`;
      byDistrictAndParty.set(dKey, pol);
    }
  }

  // =========================================================================
  // Step 1: Get FL session list
  // =========================================================================
  console.log('\nStep 1: Fetching FL session list...');
  const sessionData = await legiscanRequest({ op: 'getSessionList', state: STATE });
  const allSessions: LegiScanSession[] = sessionData.sessions || [];

  // Pick most recent regular sessions
  const regularSessions = allSessions
    .filter(s => s.special === 0)
    .sort((a, b) => b.year_start - a.year_start)
    .slice(0, SESSIONS_TO_FETCH);

  console.log(`  Found ${allSessions.length} total sessions, using ${regularSessions.length} regular sessions:`);
  for (const s of regularSessions) {
    console.log(`    - ${s.session_name} (ID: ${s.session_id}, sine_die: ${s.sine_die})`);
  }

  // =========================================================================
  // Step 2: Get session people for all sessions to build people mapping
  // =========================================================================
  console.log('\nStep 2: Fetching session people to build people_id mapping...');

  const allPeopleById = new Map<number, SessionPerson>();
  const peopleMatches: PeopleMatch[] = [];

  for (const session of regularSessions) {
    console.log(`  Fetching people for ${session.session_name}...`);
    const peopleData = await legiscanRequest({
      op: 'getSessionPeople',
      id: String(session.session_id),
    });

    const people: SessionPerson[] = peopleData.sessionpeople?.people || [];
    console.log(`    ${people.length} legislators found`);

    for (const person of people) {
      if (!allPeopleById.has(person.people_id)) {
        allPeopleById.set(person.people_id, person);
      }
    }
  }

  console.log(`  Total unique people across sessions: ${allPeopleById.size}`);

  // =========================================================================
  // Step 3: Match LegiScan people to Supabase politicians
  // =========================================================================
  console.log('\nStep 3: Matching LegiScan people to Supabase politicians...');

  // people_id -> bioguide_id mapping
  const peopleToSupabase = new Map<number, string>();
  // people_id -> name mapping (for output)
  const peopleNames = new Map<number, string>();
  let matchedByName = 0;
  let matchedByDistrict = 0;
  let unmatched = 0;

  for (const person of allPeopleById.values()) {
    peopleNames.set(person.people_id, person.name);

    let bioguideId: string | null = null;
    let matchMethod = 'none';

    // Strategy 1: Match by normalized name
    const nameKey = normalizeName(person.name);
    const nameMatches = byNormalizedName.get(nameKey);

    if (nameMatches && nameMatches.length === 1) {
      // Unique name match
      bioguideId = nameMatches[0].bioguide_id;
      matchMethod = 'name_exact';
      matchedByName++;
    } else if (nameMatches && nameMatches.length > 1) {
      // Multiple matches by name — disambiguate by district
      const personDistNum = extractDistrictNumber(person.district);
      const match = nameMatches.find(p => extractDistrictNumber(p.district) === personDistNum);
      if (match) {
        bioguideId = match.bioguide_id;
        matchMethod = 'name_plus_district';
        matchedByName++;
      }
    }

    // Strategy 2: If name didn't work, try nickname
    if (!bioguideId && person.nickname) {
      const nickKey = normalizeName(`${person.nickname} ${person.last_name}`);
      const nickMatches = byNormalizedName.get(nickKey);
      if (nickMatches && nickMatches.length === 1) {
        bioguideId = nickMatches[0].bioguide_id;
        matchMethod = 'nickname';
        matchedByName++;
      }
    }

    // Strategy 3: Match by district number + party
    if (!bioguideId) {
      const personDistNum = extractDistrictNumber(person.district);
      const fullParty = mapPartyToFull(person.party);
      if (personDistNum !== null) {
        const dKey = `${personDistNum}_${fullParty}`;
        const match = byDistrictAndParty.get(dKey);
        if (match) {
          // Verify they have the same role type (Sen vs Rep)
          const isSenator = person.role === 'Sen';
          const isMatchSenator = match.office_level === 'State Senator';
          if (isSenator === isMatchSenator) {
            bioguideId = match.bioguide_id;
            matchMethod = 'district_party';
            matchedByDistrict++;
          }
        }
      }
    }

    if (!bioguideId) {
      unmatched++;
    }

    if (bioguideId) {
      peopleToSupabase.set(person.people_id, bioguideId);
    }

    peopleMatches.push({
      people_id: person.people_id,
      legiscan_name: person.name,
      legiscan_party: person.party,
      legiscan_role: person.role,
      legiscan_district: person.district,
      supabase_bioguide_id: bioguideId,
      supabase_name: bioguideId
        ? supabasePoliticians.find(p => p.bioguide_id === bioguideId)?.name || null
        : null,
      match_method: matchMethod,
    });
  }

  console.log(`  Matched by name:      ${matchedByName}`);
  console.log(`  Matched by district:  ${matchedByDistrict}`);
  console.log(`  Unmatched:            ${unmatched}`);
  console.log(`  Total matched:        ${peopleToSupabase.size} / ${allPeopleById.size}`);

  // Print unmatched for debugging
  const unmatchedPeople = peopleMatches.filter(m => !m.supabase_bioguide_id);
  if (unmatchedPeople.length > 0 && unmatchedPeople.length <= 30) {
    console.log('\n  Unmatched LegiScan people:');
    for (const p of unmatchedPeople) {
      console.log(`    - ${p.legiscan_name} (${p.legiscan_role} ${p.legiscan_district}, ${p.legiscan_party})`);
    }
  }

  // =========================================================================
  // Step 4: Fetch bills with floor votes
  // =========================================================================
  console.log('\nStep 4: Fetching bills with floor votes...');

  const allVotes: ProcessedVoteRecord[] = [];
  const sessionNames: string[] = [];
  let totalBillsWithVotes = 0;
  let totalRollCalls = 0;

  for (const session of regularSessions) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Processing: ${session.session_name}`);
    console.log(`${'─'.repeat(50)}`);
    sessionNames.push(session.session_name);

    // Get master bill list
    console.log('  Fetching master bill list...');
    const masterData = await legiscanRequest({
      op: 'getMasterList',
      id: String(session.session_id),
    });

    const masterList = masterData.masterlist || {};
    const bills: MasterListBill[] = [];
    for (const [key, value] of Object.entries(masterList)) {
      if (key === 'session') continue;
      bills.push(value as MasterListBill);
    }

    console.log(`  Total bills in session: ${bills.length}`);

    // Focus on bills that have progressed (status >= 2 = Engrossed or further)
    // Sort by last_action_date descending to get most recent activity
    let billsToProcess = bills
      .filter(b => b.status >= 2)
      .sort((a, b) => b.last_action_date.localeCompare(a.last_action_date))
      .slice(0, MAX_BILLS_PER_SESSION);

    console.log(`  Bills with status >= 2: ${bills.filter(b => b.status >= 2).length}`);
    console.log(`  Processing top ${billsToProcess.length} most recent`);

    // Fetch bill details to find which ones have floor votes
    let sessionBillsWithVotes = 0;
    let sessionRollCalls = 0;

    for (let i = 0; i < billsToProcess.length; i++) {
      const billEntry = billsToProcess[i];

      if ((i + 1) % 10 === 0) {
        console.log(`    Bill ${i + 1}/${billsToProcess.length}...`);
      }

      let detail: BillDetail | null = null;
      try {
        const billData = await legiscanRequest({
          op: 'getBill',
          id: String(billEntry.bill_id),
        });
        detail = billData.bill || null;
      } catch (err) {
        console.warn(`    Warning: Failed to fetch bill ${billEntry.number}: ${err}`);
        continue;
      }

      if (!detail || !detail.votes || detail.votes.length === 0) continue;

      // Filter to floor votes only
      const floorVotes = detail.votes.filter(isFloorVote);
      if (floorVotes.length === 0) continue;

      sessionBillsWithVotes++;

      // Fetch roll call details for each floor vote
      for (const voteMeta of floorVotes) {
        let rollCall: RollCallDetail | null = null;
        try {
          const rcData = await legiscanRequest({
            op: 'getRollCall',
            id: String(voteMeta.roll_call_id),
          });
          rollCall = rcData.roll_call || null;
        } catch (err) {
          console.warn(`    Warning: Failed to fetch roll call ${voteMeta.roll_call_id}: ${err}`);
          continue;
        }

        if (!rollCall || !rollCall.votes) continue;
        sessionRollCalls++;

        for (const iv of rollCall.votes) {
          const votePosition = VOTE_TEXT_MAP[iv.vote_id]
            || (iv.vote_text as 'Yea' | 'Nay' | 'NV' | 'Absent');

          const bioguideId = peopleToSupabase.get(iv.people_id) || null;
          const personName = peopleNames.get(iv.people_id) || `people_id:${iv.people_id}`;

          allVotes.push({
            politician_people_id: iv.people_id,
            politician_bioguide_id: bioguideId,
            politician_name: personName,
            bill_id: detail.bill_id,
            bill_number: detail.bill_number,
            bill_title: detail.title,
            bill_description: detail.description,
            bill_url: detail.url || detail.state_link || '',
            vote_date: rollCall.date,
            vote_position: votePosition,
            roll_call_id: rollCall.roll_call_id,
            roll_call_desc: rollCall.desc,
            chamber: rollCall.chamber,
            passed: voteMeta.passed === 1,
            yea: rollCall.yea,
            nay: rollCall.nay,
            nv: rollCall.nv,
            absent: rollCall.absent,
            session_id: session.session_id,
            session_title: session.session_name,
          });
        }
      }

      // Log progress for bills that had floor votes
      if (floorVotes.length > 0) {
        console.log(
          `    ${detail.bill_number}: "${detail.title.substring(0, 55)}..." ` +
          `(${floorVotes.length} floor vote${floorVotes.length > 1 ? 's' : ''})`
        );
      }
    }

    totalBillsWithVotes += sessionBillsWithVotes;
    totalRollCalls += sessionRollCalls;
    console.log(`  Session totals: ${sessionBillsWithVotes} bills with floor votes, ${sessionRollCalls} roll calls`);
  }

  // =========================================================================
  // Step 5: Save vote data to JSON file
  // =========================================================================
  console.log('\nStep 5: Saving vote data to JSON file...');

  const uniqueMatchedPeopleInVotes = new Set(
    allVotes.filter(v => v.politician_bioguide_id).map(v => v.politician_bioguide_id)
  );

  const duration = (Date.now() - startTime) / 1000;

  const output: OutputData = {
    state: STATE,
    sessions_fetched: sessionNames,
    total_bills_with_votes: totalBillsWithVotes,
    total_roll_calls: totalRollCalls,
    total_individual_votes: allVotes.length,
    unique_legislators_matched: uniqueMatchedPeopleInVotes.size,
    unique_legislators_total: allPeopleById.size,
    api_calls_made: apiCallCount,
    timestamp: new Date().toISOString(),
    duration_seconds: Math.round(duration),
    people_mapping: peopleMatches,
    votes: allVotes,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`  Saved to ${OUTPUT_FILE}`);

  // Show file size
  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`  File size: ${sizeMb} MB`);

  // =========================================================================
  // Step 6: Update Supabase source_ids with LegiScan people_id
  // =========================================================================
  if (supabase && peopleToSupabase.size > 0) {
    console.log('\nStep 6: Updating Supabase source_ids with LegiScan people_id...');

    let updated = 0;
    let updateErrors = 0;

    // Group by bioguide_id to handle potential duplicates
    const updates = new Map<string, number>();
    for (const [peopleId, bioguideId] of peopleToSupabase.entries()) {
      updates.set(bioguideId, peopleId);
    }

    for (const [bioguideId, peopleId] of updates.entries()) {
      const politician = supabasePoliticians.find(p => p.bioguide_id === bioguideId);
      if (!politician) continue;

      const existingSourceIds = (politician.source_ids || {}) as Record<string, unknown>;

      // Skip if already set to the same value
      if (existingSourceIds.legiscan_people_id === peopleId) {
        updated++; // Count as updated (already correct)
        continue;
      }

      const newSourceIds = {
        ...existingSourceIds,
        legiscan_people_id: peopleId,
      };

      const { error } = await supabase
        .from('politicians')
        .update({
          source_ids: newSourceIds,
          updated_at: new Date().toISOString(),
        })
        .eq('bioguide_id', bioguideId);

      if (error) {
        console.error(`    Error updating ${bioguideId}: ${error.message}`);
        updateErrors++;
      } else {
        updated++;
      }
    }

    console.log(`  Updated: ${updated}, Errors: ${updateErrors}`);
  } else {
    console.log('\nStep 6: Skipping Supabase update (no connection or no matches)');
  }

  // =========================================================================
  // Summary
  // =========================================================================
  const finalDuration = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(70));
  console.log('  SYNC COMPLETE');
  console.log('='.repeat(70));
  console.log(`  Sessions:               ${sessionNames.join(', ')}`);
  console.log(`  Bills with floor votes: ${totalBillsWithVotes}`);
  console.log(`  Total roll calls:       ${totalRollCalls}`);
  console.log(`  Total individual votes: ${allVotes.length}`);
  console.log(`  Matched legislators:    ${peopleToSupabase.size} / ${allPeopleById.size}`);
  console.log(`  Votes with matches:     ${allVotes.filter(v => v.politician_bioguide_id).length} / ${allVotes.length}`);
  console.log(`  API calls made:         ${apiCallCount}`);
  console.log(`  Duration:               ${Math.round(finalDuration)}s`);
  console.log(`  Output:                 ${OUTPUT_FILE}`);

  // Quick sample of vote data
  const matchedVotes = allVotes.filter(v => v.politician_bioguide_id);
  if (matchedVotes.length > 0) {
    console.log('\n  Sample matched votes:');
    const sample = matchedVotes.slice(0, 5);
    for (const v of sample) {
      console.log(`    ${v.politician_name}: ${v.vote_position} on ${v.bill_number} "${v.bill_title.substring(0, 40)}..." (${v.vote_date})`);
    }
  }

  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
