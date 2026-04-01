#!/usr/bin/env npx tsx
/**
 * LegiScan Data Ingestion Script for Snitched.ai
 *
 * Fetches FL state legislative voting records from the LegiScan API and
 * maps them to our Florida state politicians by name/district matching.
 *
 * Usage:
 *   npx tsx data-ingestion/fetch-legiscan-data.ts
 *   npx tsx data-ingestion/fetch-legiscan-data.ts --sessions 2  (default: 2 most recent regular sessions)
 *   npx tsx data-ingestion/fetch-legiscan-data.ts --max-bills 50 (limit bills fetched per session, default: all)
 *
 * Output: data-ingestion/legiscan-results/fl-state-votes.json
 * This file is consumed by lib/real-data.ts to display state voting records.
 *
 * API limits (free tier): 30,000 queries/month. This script is designed to
 * be economical — it caches session/masterlist data and only fetches
 * roll call details for bills that had floor votes.
 */

import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEGISCAN_API_KEY = process.env.LEGISCAN_API_KEY;
if (!LEGISCAN_API_KEY) {
  console.error('Missing required environment variable: LEGISCAN_API_KEY');
  process.exit(1);
}
const LEGISCAN_BASE = 'https://api.legiscan.com/';
const RATE_LIMIT_MS = 350; // ms between requests (stay well under limits)
const STATE = 'FL';

// Parse CLI args
const args = process.argv.slice(2);
const sessionsToFetch = parseInt(getArg('--sessions') || '2', 10);
const maxBillsPerSession = parseInt(getArg('--max-bills') || '0', 10); // 0 = all

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// Output directory
const OUTPUT_DIR = path.join(__dirname, 'legiscan-results');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'fl-state-votes.json');
const PEOPLE_MAP_FILE = path.join(OUTPUT_DIR, 'fl-people-mapping.json');

// ---------------------------------------------------------------------------
// Types (local to ingestion, not exported)
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
  url: string;
  state_link: string;
}

interface BillSponsor {
  people_id: number;
  party: string;
  role: string;
  name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  district: string;
  votesmart_id: number;
  sponsor_type_id: number;
  sponsor_order: number;
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
  status_desc: string;
  url: string;
  state_link: string;
  sponsors: BillSponsor[];
  votes: BillVoteMeta[];
}

interface IndividualVote {
  people_id: number;
  vote_id: number;
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

// Our output record
interface ProcessedVoteRecord {
  politician_people_id: number;
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

interface PeopleRecord {
  people_id: number;
  name: string;
  first_name: string;
  last_name: string;
  party: string;
  role: string;
  district: string;
  votesmart_id: number;
}

interface OutputData {
  state: string;
  sessions_fetched: string[];
  total_bills_with_votes: number;
  total_roll_calls: number;
  total_individual_votes: number;
  unique_legislators: number;
  api_calls_made: number;
  timestamp: string;
  duration_seconds: number;
  votes: ProcessedVoteRecord[];
  people: PeopleRecord[];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

let apiCallCount = 0;

async function legiscanRequest(params: Record<string, string>): Promise<any> {
  const url = new URL(LEGISCAN_BASE);
  url.searchParams.set('key', LEGISCAN_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  apiCallCount++;
  if (apiCallCount % 50 === 0) {
    console.log(`  [API] ${apiCallCount} calls made so far...`);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`LegiScan API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.status === 'ERROR') {
    throw new Error(`LegiScan API error: ${JSON.stringify(data.alert)}`);
  }

  // Rate limit
  await sleep(RATE_LIMIT_MS);
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Step 1: Get FL sessions
// ---------------------------------------------------------------------------

async function getFlSessions(): Promise<LegiScanSession[]> {
  console.log('Step 1: Fetching FL session list...');
  const data = await legiscanRequest({ op: 'getSessionList', state: STATE });
  const sessions: LegiScanSession[] = data.sessions || [];

  // Filter to regular sessions only (special=0), sorted most recent first
  const regular = sessions
    .filter(s => s.special === 0)
    .sort((a, b) => b.year_start - a.year_start)
    .slice(0, sessionsToFetch);

  console.log(`  Found ${sessions.length} sessions total, using ${regular.length} regular sessions:`);
  for (const s of regular) {
    console.log(`    - ${s.session_name} (ID: ${s.session_id})`);
  }

  return regular;
}

// ---------------------------------------------------------------------------
// Step 2: Get master bill list for each session
// ---------------------------------------------------------------------------

async function getMasterList(sessionId: number): Promise<MasterListBill[]> {
  const data = await legiscanRequest({ op: 'getMasterList', id: String(sessionId) });
  const masterlist = data.masterlist || {};

  const bills: MasterListBill[] = [];
  for (const [key, value] of Object.entries(masterlist)) {
    if (key === 'session') continue; // Skip session metadata entry
    bills.push(value as MasterListBill);
  }

  return bills;
}

// ---------------------------------------------------------------------------
// Step 3: Get bill details (sponsors + roll call metadata)
// ---------------------------------------------------------------------------

async function getBillDetail(billId: number): Promise<BillDetail | null> {
  try {
    const data = await legiscanRequest({ op: 'getBill', id: String(billId) });
    return data.bill || null;
  } catch (err) {
    console.warn(`  Warning: Failed to fetch bill ${billId}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 4: Get roll call details (individual votes)
// ---------------------------------------------------------------------------

async function getRollCallDetail(rollCallId: number): Promise<RollCallDetail | null> {
  try {
    const data = await legiscanRequest({ op: 'getRollCall', id: String(rollCallId) });
    return data.roll_call || null;
  } catch (err) {
    console.warn(`  Warning: Failed to fetch roll call ${rollCallId}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main ingestion pipeline
// ---------------------------------------------------------------------------

async function main() {
  if (!LEGISCAN_API_KEY) {
    console.error('ERROR: LEGISCAN_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('LegiScan FL State Voting Records Ingestion');
  console.log('='.repeat(60));
  console.log(`Sessions to fetch: ${sessionsToFetch}`);
  console.log(`Max bills per session: ${maxBillsPerSession || 'all'}`);
  console.log();

  const startTime = Date.now();
  const allVotes: ProcessedVoteRecord[] = [];
  const allPeople = new Map<number, PeopleRecord>();
  const sessionNames: string[] = [];
  let totalBillsWithVotes = 0;
  let totalRollCalls = 0;

  // Step 1: Sessions
  const sessions = await getFlSessions();

  for (const session of sessions) {
    console.log();
    console.log(`${'─'.repeat(50)}`);
    console.log(`Processing: ${session.session_name}`);
    console.log(`${'─'.repeat(50)}`);
    sessionNames.push(session.session_name);

    // Step 2: Master bill list
    console.log('  Fetching master bill list...');
    const allBills = await getMasterList(session.session_id);
    console.log(`  Found ${allBills.length} bills`);

    // Only process bills that have had some action (status > 1 means
    // the bill has moved beyond introduction/filing)
    // Status codes: 1=Introduced, 2=Engrossed, 3=Enrolled, 4=Passed, 5=Vetoed, 6=Dead
    let billsToProcess = allBills.filter(b => b.status >= 2);
    console.log(`  ${billsToProcess.length} bills with status >= Engrossed (have likely had votes)`);

    if (maxBillsPerSession > 0) {
      billsToProcess = billsToProcess.slice(0, maxBillsPerSession);
      console.log(`  Limited to ${billsToProcess.length} bills (--max-bills)`);
    }

    // Step 3: Fetch bill details to find which ones have roll call votes
    console.log('  Fetching bill details...');
    let billsWithVotes = 0;

    for (let i = 0; i < billsToProcess.length; i++) {
      const bill = billsToProcess[i];

      if ((i + 1) % 25 === 0) {
        console.log(`    Processing bill ${i + 1}/${billsToProcess.length}...`);
      }

      const detail = await getBillDetail(bill.bill_id);
      if (!detail || !detail.votes || detail.votes.length === 0) continue;

      // Collect people from sponsors
      for (const sponsor of detail.sponsors || []) {
        if (!allPeople.has(sponsor.people_id)) {
          allPeople.set(sponsor.people_id, {
            people_id: sponsor.people_id,
            name: sponsor.name,
            first_name: sponsor.first_name,
            last_name: sponsor.last_name,
            party: sponsor.party,
            role: sponsor.role,
            district: sponsor.district,
            votesmart_id: sponsor.votesmart_id,
          });
        }
      }

      // Only fetch floor votes (full chamber votes, not committee votes)
      // Floor votes typically have desc containing "Third Reading" or
      // "Reading" or "Final Passage" or "passage" or total votes > 40
      // (FL House has 120 members, Senate has 40)
      const floorVotes = detail.votes.filter(v =>
        v.total >= 30 || // Likely a floor vote
        v.desc.toLowerCase().includes('third reading') ||
        v.desc.toLowerCase().includes('final passage') ||
        v.desc.toLowerCase().includes('passage')
      );

      if (floorVotes.length === 0) continue;

      billsWithVotes++;
      totalRollCalls += floorVotes.length;

      // Step 4: Fetch roll call details for floor votes
      for (const voteMeta of floorVotes) {
        const rollCall = await getRollCallDetail(voteMeta.roll_call_id);
        if (!rollCall || !rollCall.votes) continue;

        // Map vote_id to text
        const voteTextMap: Record<number, 'Yea' | 'Nay' | 'NV' | 'Absent'> = {
          1: 'Yea',
          2: 'Nay',
          3: 'NV',
          4: 'Absent',
        };

        for (const iv of rollCall.votes) {
          const votePosition = voteTextMap[iv.vote_id] || (iv.vote_text as 'Yea' | 'Nay' | 'NV' | 'Absent');

          allVotes.push({
            politician_people_id: iv.people_id,
            bill_id: detail.bill_id,
            bill_number: detail.bill_number,
            bill_title: detail.title,
            bill_description: detail.description,
            bill_url: detail.url,
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

          // Track unique people from votes too
          if (!allPeople.has(iv.people_id)) {
            allPeople.set(iv.people_id, {
              people_id: iv.people_id,
              name: '', // Will need to be resolved later
              first_name: '',
              last_name: '',
              party: '',
              role: '',
              district: '',
              votesmart_id: 0,
            });
          }
        }
      }
    }

    totalBillsWithVotes += billsWithVotes;
    console.log(`  Session results: ${billsWithVotes} bills with floor votes`);
  }

  // ---------------------------------------------------------------------------
  // Write output
  // ---------------------------------------------------------------------------

  const duration = (Date.now() - startTime) / 1000;

  const output: OutputData = {
    state: STATE,
    sessions_fetched: sessionNames,
    total_bills_with_votes: totalBillsWithVotes,
    total_roll_calls: totalRollCalls,
    total_individual_votes: allVotes.length,
    unique_legislators: allPeople.size,
    api_calls_made: apiCallCount,
    timestamp: new Date().toISOString(),
    duration_seconds: Math.round(duration),
    votes: allVotes,
    people: [...allPeople.values()],
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log();
  console.log('='.repeat(60));
  console.log('INGESTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Sessions fetched:         ${sessionNames.join(', ')}`);
  console.log(`Bills with floor votes:   ${totalBillsWithVotes}`);
  console.log(`Total roll calls:         ${totalRollCalls}`);
  console.log(`Total individual votes:   ${allVotes.length}`);
  console.log(`Unique legislators:       ${allPeople.size}`);
  console.log(`API calls made:           ${apiCallCount}`);
  console.log(`Duration:                 ${Math.round(duration)}s`);
  console.log(`Output:                   ${OUTPUT_FILE}`);
  console.log();

  // ---------------------------------------------------------------------------
  // Step 5: Build people mapping by fetching a sample bill's sponsors
  //         to get name data for people we only have IDs for
  // ---------------------------------------------------------------------------

  // Now match LegiScan people to our florida_politicians.json
  console.log('Matching LegiScan legislators to Snitched.ai politicians...');

  const politiciansPath = path.join(__dirname, 'phase1/processed/florida_politicians.json');
  if (fs.existsSync(politiciansPath)) {
    const rawPoliticians = JSON.parse(fs.readFileSync(politiciansPath, 'utf-8'));

    // Build a lookup by votesmart_id and by name similarity
    const byVotesmartId = new Map<number, string>();
    const byName = new Map<string, string>();

    for (const pol of rawPoliticians) {
      if (pol.source_ids?.votesmart_id) {
        byVotesmartId.set(Number(pol.source_ids.votesmart_id), pol.politician_id);
      }
      // Normalize name for matching: lowercase, remove middle names/suffixes
      const nameParts = pol.name.toLowerCase().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      byName.set(`${firstName}_${lastName}`, pol.politician_id);
    }

    // Count matches
    let matchedByVotesmart = 0;
    let matchedByName = 0;
    let unmatched = 0;

    const peopleMapping: Array<{
      people_id: number;
      politician_id: string | null;
      name: string;
      match_method: string;
    }> = [];

    for (const person of allPeople.values()) {
      let politicianId: string | null = null;
      let matchMethod = 'none';

      // Try VoteSmart ID first (most reliable)
      if (person.votesmart_id && byVotesmartId.has(person.votesmart_id)) {
        politicianId = byVotesmartId.get(person.votesmart_id) || null;
        matchMethod = 'votesmart_id';
        matchedByVotesmart++;
      }

      // Fall back to name matching
      if (!politicianId && person.name) {
        const nameParts = person.name.toLowerCase().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];
        const key = `${firstName}_${lastName}`;
        if (byName.has(key)) {
          politicianId = byName.get(key) || null;
          matchMethod = 'name';
          matchedByName++;
        }
      }

      if (!politicianId) {
        unmatched++;
      }

      peopleMapping.push({
        people_id: person.people_id,
        politician_id: politicianId,
        name: person.name,
        match_method: matchMethod,
      });
    }

    fs.writeFileSync(PEOPLE_MAP_FILE, JSON.stringify(peopleMapping, null, 2));

    console.log(`  Matched by VoteSmart ID: ${matchedByVotesmart}`);
    console.log(`  Matched by name:         ${matchedByName}`);
    console.log(`  Unmatched:               ${unmatched}`);
    console.log(`  People mapping saved:    ${PEOPLE_MAP_FILE}`);
  } else {
    console.log('  Warning: florida_politicians.json not found, skipping matching');
  }

  console.log();
  console.log('Done! Next steps:');
  console.log('  1. Review fl-people-mapping.json for unmatched legislators');
  console.log('  2. Run "npm run build" to verify the app still compiles');
  console.log('  3. The API route at /api/legiscan is ready for client-side queries');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
