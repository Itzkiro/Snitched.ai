#!/usr/bin/env npx tsx
/**
 * Sync Voting Records from LegiScan API
 *
 * Fetches real roll call vote data for Florida state legislators and
 * US Congress members, matching them to our politicians database.
 *
 * Data flow:
 *   1. Get FL sessions & US Congress sessions from LegiScan
 *   2. Get people (legislators) per session & match to our DB
 *   3. Get bills that passed/were vetoed (floor votes matter most)
 *   4. Get roll call votes for each bill
 *   5. Build per-politician voting records and push to Supabase
 *
 * Usage:
 *   npx tsx scripts/sync-voting-records.ts
 *   npx tsx scripts/sync-voting-records.ts --dry-run
 *   npx tsx scripts/sync-voting-records.ts --limit 5    # Limit bills per session
 *   npx tsx scripts/sync-voting-records.ts --state FL    # FL only (default: FL + US)
 *   npx tsx scripts/sync-voting-records.ts --state US    # US only
 *   npx tsx scripts/sync-voting-records.ts --verbose
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEGISCAN_API_KEY = process.env.LEGISCAN_API_KEY || '';
const LEGISCAN_BASE_URL = 'https://api.legiscan.com/';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const RATE_LIMIT_MS = 250; // LegiScan doesn't enforce per-second, but be polite

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LegiScanPerson {
  people_id: number;
  person_hash: string;
  party: string;
  role: string; // "Rep" or "Sen"
  name: string;
  first_name: string;
  last_name: string;
  district: string;
  committee_sponsor: number;
  state_federal: number;
}

interface LegiScanBillSummary {
  bill_id: number;
  number: string;
  status: number;
  title: string;
  description: string;
  last_action_date: string;
}

interface LegiScanRollCallSummary {
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
}

interface LegiScanVote {
  people_id: number;
  vote_id: number;
  vote_text: string; // "Yea", "Nay", "NV", "Absent"
}

interface VotingRecord {
  bill_id: number;
  bill_number: string;
  title: string;
  description: string;
  vote: string;
  vote_date: string;
  chamber: string;
  vote_desc: string;
  passed: boolean;
  yea_count: number;
  nay_count: number;
  session: string;
  session_id: number;
  roll_call_id: number;
  bill_status: number;
  legiscan_url: string;
}

// ---------------------------------------------------------------------------
// LegiScan API helpers
// ---------------------------------------------------------------------------

async function legiScanFetch(op: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(LEGISCAN_BASE_URL);
  url.searchParams.set('key', LEGISCAN_API_KEY);
  url.searchParams.set('op', op);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString());

  if (!resp.ok) {
    throw new Error(`LegiScan API ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  if (data.status === 'ERROR') {
    throw new Error(`LegiScan API error: ${JSON.stringify(data)}`);
  }

  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Common nickname → formal name mappings */
const NICKNAME_MAP: Record<string, string[]> = {
  rick: ['richard'],
  richard: ['rick'],
  bill: ['william'],
  william: ['bill', 'will', 'billy'],
  bob: ['robert'],
  robert: ['bob', 'rob', 'bobby'],
  jim: ['james'],
  james: ['jim', 'jimmy'],
  jimmy: ['james'],
  mike: ['michael'],
  michael: ['mike'],
  joe: ['joseph'],
  joseph: ['joe'],
  tom: ['thomas'],
  thomas: ['tom', 'tommy'],
  tommy: ['thomas'],
  dan: ['daniel'],
  daniel: ['dan', 'danny'],
  danny: ['daniel'],
  ed: ['edward', 'edwin'],
  edward: ['ed', 'ted'],
  ted: ['edward', 'theodore'],
  steve: ['stephen', 'steven'],
  stephen: ['steve'],
  steven: ['steve'],
  greg: ['gregory'],
  gregory: ['greg'],
  pat: ['patricia', 'patrick'],
  chris: ['christopher', 'christine', 'christina'],
  christopher: ['chris'],
  matt: ['matthew'],
  matthew: ['matt'],
  tony: ['anthony'],
  anthony: ['tony'],
  vern: ['vernon'],
  vernon: ['vern'],
  chuck: ['charles'],
  charles: ['chuck', 'charlie'],
  charlie: ['charles'],
  dick: ['richard'],
  don: ['donald'],
  donald: ['don'],
  doug: ['douglas'],
  douglas: ['doug'],
  fred: ['frederick', 'frederic'],
  frederick: ['fred'],
  gus: ['gustavo', 'august', 'augustus'],
  larry: ['lawrence'],
  lawrence: ['larry'],
  liz: ['elizabeth'],
  elizabeth: ['liz', 'beth'],
  kate: ['katherine', 'catherine'],
  katherine: ['kate', 'kathy'],
  kathy: ['katherine', 'kathleen'],
  kathleen: ['kathy'],
  debbie: ['deborah', 'debra'],
  deborah: ['debbie'],
  debra: ['debbie'],
};

function firstNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // Check nickname mapping
  const aAliases = NICKNAME_MAP[a] ?? [];
  const bAliases = NICKNAME_MAP[b] ?? [];
  if (aAliases.includes(b) || bAliases.includes(a)) return true;
  return false;
}

function matchPoliticianToLegiScan(
  dbPoliticians: any[],
  legiScanPeople: LegiScanPerson[],
): Map<number, string> {
  // Map: LegiScan people_id -> our bioguide_id
  const matches = new Map<number, string>();

  for (const person of legiScanPeople) {
    if (person.committee_sponsor === 1) continue; // Skip committee sponsors

    const lsFirst = normalizeForMatch(person.first_name);
    const lsLast = normalizeForMatch(person.last_name);
    const lsFull = `${lsFirst} ${lsLast}`;

    let bestMatch: any = null;
    let bestScore = 0;

    for (const pol of dbPoliticians) {
      const dbName = normalizeForMatch(pol.name);
      const dbParts = dbName.split(' ');
      const dbFirst = dbParts[0];
      const dbLast = dbParts[dbParts.length - 1];

      // Exact last name + first name match (including nickname aliases)
      if (dbLast === lsLast && firstNamesMatch(dbFirst, lsFirst)) {
        const score = dbFirst === lsFirst ? 100 : 90;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = pol;
        }
      }

      // Full name contains match (handles middle names, suffixes)
      if (bestScore < 80 && dbName.includes(lsLast) && dbName.includes(lsFirst)) {
        bestScore = 80;
        bestMatch = pol;
      }
    }

    if (bestMatch && bestScore >= 80) {
      matches.set(person.people_id, bestMatch.bioguide_id);
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Main sync logic
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const billLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 300;
  const stateIdx = args.indexOf('--state');
  const stateFilter = stateIdx >= 0 ? args[stateIdx + 1].toUpperCase() : 'ALL';

  console.log('='.repeat(60));
  console.log('  LegiScan Voting Records Sync');
  console.log('='.repeat(60));
  if (dryRun) console.log('  [DRY RUN — no changes will be saved]');
  console.log(`  State filter: ${stateFilter}`);
  console.log(`  Bill limit per session: ${billLimit}`);
  console.log();

  // ----- Step 1: Fetch our politicians from Supabase -----
  const { data: dbRows, error: dbError } = await supabase
    .from('politicians')
    .select('bioguide_id, name, office, office_level, source_ids')
    .order('name');

  if (dbError || !dbRows) {
    console.error('Failed to fetch politicians:', dbError);
    process.exit(1);
  }

  console.log(`Fetched ${dbRows.length} politicians from Supabase\n`);

  // ----- Step 2: Determine sessions to sync -----
  const sessionsToSync: { sessionId: number; sessionName: string; state: string }[] = [];

  if (stateFilter === 'ALL' || stateFilter === 'FL') {
    console.log('Fetching FL sessions...');
    const flSessions = await legiScanFetch('getSessionList', { state: 'FL' });
    const flSessionList = flSessions.sessions ?? [];

    // Get the 2 most recent regular sessions
    const regularSessions = flSessionList
      .filter((s: any) => s.special === 0)
      .sort((a: any, b: any) => b.year_start - a.year_start)
      .slice(0, 2);

    for (const s of regularSessions) {
      sessionsToSync.push({
        sessionId: s.session_id,
        sessionName: s.session_name,
        state: 'FL',
      });
      console.log(`  FL: ${s.session_name} (ID: ${s.session_id})`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  if (stateFilter === 'ALL' || stateFilter === 'US') {
    console.log('Fetching US Congress sessions...');
    const usSessions = await legiScanFetch('getSessionList', { state: 'US' });
    const usSessionList = usSessions.sessions ?? [];

    // Get the current Congress session
    const currentCongress = usSessionList
      .filter((s: any) => s.special === 0)
      .sort((a: any, b: any) => b.year_start - a.year_start)
      .slice(0, 1);

    for (const s of currentCongress) {
      sessionsToSync.push({
        sessionId: s.session_id,
        sessionName: s.session_name,
        state: 'US',
      });
      console.log(`  US: ${s.session_name} (ID: ${s.session_id})`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\nProcessing ${sessionsToSync.length} session(s)...\n`);

  // ----- Track all voting records by politician bioguide_id -----
  const votingRecordsByPolitician = new Map<string, VotingRecord[]>();
  let apiCalls = 3; // Already made 3 (supabase + 2 session lists)

  const stats = {
    sessionsProcessed: 0,
    billsFetched: 0,
    rollCallsFetched: 0,
    totalVotes: 0,
    politiciansWithVotes: 0,
    updated: 0,
    errors: 0,
    apiCalls: 3,
  };

  // ----- Step 3: Process each session -----
  for (const session of sessionsToSync) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Session: ${session.sessionName} (${session.state})`);
    console.log('─'.repeat(50));

    // 3a. Get legislators for this session
    const peopleData = await legiScanFetch('getSessionPeople', { id: String(session.sessionId) });
    stats.apiCalls++;
    await sleep(RATE_LIMIT_MS);

    const sessionPeople: LegiScanPerson[] = (peopleData.sessionpeople?.people ?? [])
      .filter((p: any) => p.committee_sponsor === 0);

    console.log(`  ${sessionPeople.length} legislators in session`);

    // 3b. Match LegiScan people to our DB
    // For FL state sessions, match against state-level politicians
    // For US sessions, match against federal politicians
    const filteredDb = session.state === 'US'
      ? dbRows.filter(r => r.office_level === 'US Senator' || r.office_level === 'US Representative')
      : dbRows.filter(r => r.office_level === 'State Representative' || r.office_level === 'State Senator');

    const matchMap = matchPoliticianToLegiScan(filteredDb, sessionPeople);
    console.log(`  ${matchMap.size} matched to our DB (of ${filteredDb.length} eligible)`);

    if (matchMap.size === 0) {
      console.log('  Skipping — no matches');
      continue;
    }

    // Build reverse map: people_id -> person name for logging
    const peopleNameMap = new Map<number, string>();
    for (const p of sessionPeople) {
      peopleNameMap.set(p.people_id, p.name);
    }

    // 3c. Get master bill list
    const masterData = await legiScanFetch('getMasterList', { id: String(session.sessionId) });
    stats.apiCalls++;
    await sleep(RATE_LIMIT_MS);

    const masterList = masterData.masterlist ?? {};
    const allBills: LegiScanBillSummary[] = [];
    for (const key of Object.keys(masterList)) {
      if (key === 'session') continue;
      const bill = masterList[key];
      // Only get bills that passed (4) or were vetoed (5) — these have meaningful floor votes
      if (bill.status === 4 || bill.status === 5) {
        allBills.push(bill);
      }
    }

    // Sort by date descending, take up to billLimit
    allBills.sort((a, b) => (b.last_action_date ?? '').localeCompare(a.last_action_date ?? ''));
    const billsToProcess = allBills.slice(0, billLimit);
    console.log(`  ${allBills.length} passed/vetoed bills, processing ${billsToProcess.length}`);

    // 3d. For each bill, get details and roll calls
    for (let i = 0; i < billsToProcess.length; i++) {
      const billSummary = billsToProcess[i];

      if (verbose && i % 50 === 0) {
        console.log(`    Processing bill ${i + 1}/${billsToProcess.length}...`);
      }

      try {
        // Get full bill details (includes roll call IDs)
        const billData = await legiScanFetch('getBill', { id: String(billSummary.bill_id) });
        stats.apiCalls++;
        stats.billsFetched++;
        await sleep(RATE_LIMIT_MS);

        const bill = billData.bill;
        if (!bill) continue;

        const billVotes: LegiScanRollCallSummary[] = bill.votes ?? [];

        // Filter to floor votes only (Third Reading / Passage / Final Passage)
        const floorVotes = billVotes.filter((v: LegiScanRollCallSummary) => {
          const desc = (v.desc ?? '').toLowerCase();
          return desc.includes('third reading') ||
                 desc.includes('final passage') ||
                 desc.includes('passage') ||
                 desc.includes('concurrence') ||
                 desc.includes('to pass');
        });

        if (floorVotes.length === 0) continue;

        // Get roll call for each floor vote
        for (const floorVote of floorVotes) {
          try {
            const rcData = await legiScanFetch('getRollCall', { id: String(floorVote.roll_call_id) });
            stats.apiCalls++;
            stats.rollCallsFetched++;
            await sleep(RATE_LIMIT_MS);

            const rollCall = rcData.roll_call;
            if (!rollCall) continue;

            const votes: LegiScanVote[] = rollCall.votes ?? [];

            // Map each vote to our politicians
            for (const vote of votes) {
              const bioguideId = matchMap.get(vote.people_id);
              if (!bioguideId) continue;

              stats.totalVotes++;

              const record: VotingRecord = {
                bill_id: bill.bill_id,
                bill_number: bill.bill_number,
                title: bill.title,
                description: (bill.description ?? '').substring(0, 300),
                vote: vote.vote_text, // "Yea", "Nay", "NV", "Absent"
                vote_date: rollCall.date,
                chamber: rollCall.chamber,
                vote_desc: rollCall.desc,
                passed: rollCall.passed === 1,
                yea_count: rollCall.yea,
                nay_count: rollCall.nay,
                session: session.sessionName,
                session_id: session.sessionId,
                roll_call_id: rollCall.roll_call_id,
                bill_status: bill.status,
                legiscan_url: `https://legiscan.com/${session.state}/bill/${bill.bill_number}/${bill.session?.year_start ?? ''}`,
              };

              if (!votingRecordsByPolitician.has(bioguideId)) {
                votingRecordsByPolitician.set(bioguideId, []);
              }
              votingRecordsByPolitician.get(bioguideId)!.push(record);
            }
          } catch (err) {
            if (verbose) console.error(`    Error fetching roll call ${floorVote.roll_call_id}:`, err);
          }
        }
      } catch (err) {
        if (verbose) console.error(`    Error fetching bill ${billSummary.bill_id}:`, err);
      }
    }

    stats.sessionsProcessed++;
  }

  // ----- Step 4: Push to Supabase -----
  console.log(`\n${'═'.repeat(50)}`);
  console.log('Pushing voting records to Supabase...');
  console.log('═'.repeat(50));

  stats.politiciansWithVotes = votingRecordsByPolitician.size;

  for (const [bioguideId, records] of votingRecordsByPolitician) {
    // Sort by date descending
    records.sort((a, b) => b.vote_date.localeCompare(a.vote_date));

    // Deduplicate by roll_call_id (same vote shouldn't appear twice)
    const seen = new Set<number>();
    const deduped = records.filter(r => {
      if (seen.has(r.roll_call_id)) return false;
      seen.add(r.roll_call_id);
      return true;
    });

    const pol = dbRows.find(r => r.bioguide_id === bioguideId);
    if (verbose) {
      console.log(`  ${pol?.name ?? bioguideId}: ${deduped.length} votes`);
    }

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('politicians')
        .update({ voting_records: deduped })
        .eq('bioguide_id', bioguideId);

      if (updateError) {
        console.error(`  Error updating ${pol?.name ?? bioguideId}: ${updateError.message}`);
        stats.errors++;
      } else {
        stats.updated++;
      }
    }
  }

  // ----- Summary -----
  console.log('\n' + '='.repeat(60));
  console.log('  VOTING RECORDS SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Sessions processed:        ${stats.sessionsProcessed}`);
  console.log(`  Bills fetched:             ${stats.billsFetched}`);
  console.log(`  Roll calls fetched:        ${stats.rollCallsFetched}`);
  console.log(`  Total individual votes:    ${stats.totalVotes}`);
  console.log(`  Politicians with votes:    ${stats.politiciansWithVotes}`);
  console.log(`  Updated in Supabase:       ${stats.updated}`);
  console.log(`  Errors:                    ${stats.errors}`);
  console.log(`  API calls used:            ${stats.apiCalls} / 30,000 monthly`);

  // Show top politicians by vote count
  const sorted = Array.from(votingRecordsByPolitician.entries())
    .map(([id, records]) => ({
      name: dbRows.find(r => r.bioguide_id === id)?.name ?? id,
      count: records.length,
    }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length > 0) {
    console.log('\n  Top politicians by vote count:');
    for (const p of sorted.slice(0, 15)) {
      console.log(`    ${p.name.padEnd(35)} ${p.count} votes`);
    }
  }
}

main().catch(console.error);
