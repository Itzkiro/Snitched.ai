#!/usr/bin/env npx tsx
/**
 * Populate voting_records for Ohio federal officials and candidates.
 *
 * Strategy:
 *  - Fetch OH 119th Congress members from Congress.gov to map our bioguide IDs
 *    (oh-rep-d04-jim-jordan, oh-sen-jon-husted, etc.) -> real bioguide IDs
 *    (J000289, H001104, ...).
 *  - Fetch recent House roll call votes for the 119th Congress, pull member
 *    vote results, and build per-representative voting_records arrays.
 *  - Senate votes are not exposed by Congress.gov API, so senators get [].
 *  - Non-incumbent candidates (no voting history) get [].
 *
 * Usage:
 *   CONGRESS_API_KEY=... npx tsx scripts/populate-oh-voting-records.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || 'DEMO_KEY';
const CONGRESS_BASE = 'https://api.congress.gov/v3';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DELAY_MS = 500;
const HOUSE_VOTE_LIMIT = 10; // demo key rate-limited; most recent 10 house roll calls
const FETCH_BILL_TITLES = false; // saves 1 API call per vote
const CONGRESS = 119;
const SESSION = 1;

interface VotingRecord {
  bill_number: string;
  bill_title: string;
  vote_position: string;
  vote_date: string;
  chamber: string;
  category: string | null;
}

interface HouseVoteListItem {
  congress: number;
  rollCallNumber: number;
  sessionNumber: number;
  legislationNumber: string;
  legislationType: string;
  legislationUrl?: string;
  result: string;
  startDate: string;
  voteType: string;
}

interface HouseVoteMember {
  bioguideID: string;
  firstName: string;
  lastName: string;
  voteCast: string; // Yea, Nay, Present, Not Voting
  voteParty: string;
  voteState: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string): Promise<T> {
  const sep = url.includes('?') ? '&' : '?';
  const full = `${url}${sep}api_key=${CONGRESS_API_KEY}&format=json`;
  const res = await fetch(full);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function getOhIncumbentBioguideMap(): Promise<Map<string, string>> {
  // Map "Last, First" style from Congress.gov -> our internal bioguide_id slug.
  // We'll pull OH 119 members and match by name against our DB rows.
  type ListResp = {
    members: Array<{
      bioguideId: string;
      name: string; // "Last, First"
      state: string;
      district?: number | null;
      terms: { item: Array<{ chamber: string; startYear: number }> };
    }>;
  };
  const data = await fetchJson<ListResp>(
    `${CONGRESS_BASE}/member/congress/${CONGRESS}/OH?currentMember=true&limit=50`,
  );

  // Map: normalized "last first" -> bioguideId
  const map = new Map<string, string>();
  for (const m of data.members) {
    const parts = m.name.split(',').map((s) => s.trim());
    const last = (parts[0] || '').toLowerCase();
    const firstFull = (parts[1] || '').toLowerCase();
    const first = firstFull.split(/\s+/)[0] || '';
    map.set(`${first} ${last}`, m.bioguideId);
    map.set(last, m.bioguideId); // fallback
  }
  return map;
}

function resolveBioguideForIncumbent(
  ourName: string,
  nameMap: Map<string, string>,
): string | null {
  const norm = ourName.toLowerCase().trim();
  // Try full "first last"
  if (nameMap.has(norm)) return nameMap.get(norm)!;
  const parts = norm.split(/\s+/);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (nameMap.has(`${first} ${last}`)) return nameMap.get(`${first} ${last}`)!;
  if (nameMap.has(last)) return nameMap.get(last)!;
  return null;
}

async function fetchRecentHouseVotes(limit: number): Promise<HouseVoteListItem[]> {
  type Resp = { houseRollCallVotes: HouseVoteListItem[] };
  // The API returns sorted by most recent updateDate; filter to 119/1
  const data = await fetchJson<Resp>(
    `${CONGRESS_BASE}/house-vote/${CONGRESS}/${SESSION}?limit=${limit}`,
  );
  return data.houseRollCallVotes || [];
}

async function fetchHouseVoteMembers(
  congress: number,
  session: number,
  rollCall: number,
): Promise<HouseVoteMember[]> {
  type Resp = {
    houseRollCallVoteMemberVotes: { results: HouseVoteMember[] };
  };
  const data = await fetchJson<Resp>(
    `${CONGRESS_BASE}/house-vote/${congress}/${session}/${rollCall}/members`,
  );
  return data.houseRollCallVoteMemberVotes?.results || [];
}

async function fetchBillTitle(
  congress: number,
  type: string,
  number: string,
): Promise<string | null> {
  try {
    type Resp = { bill?: { title?: string } };
    const data = await fetchJson<Resp>(
      `${CONGRESS_BASE}/bill/${congress}/${type.toLowerCase()}/${number}`,
    );
    return data.bill?.title || null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Fetching OH federal politicians needing voting_records...');
  const { data: pols, error: polErr } = await sb
    .from('politicians')
    .select('bioguide_id, name, office, office_level, source_ids, voting_records')
    .ilike('bioguide_id', 'oh-%')
    .in('office_level', ['US Senator', 'US Representative'])
    .is('voting_records', null);

  if (polErr) throw polErr;
  const politicians = pols || [];
  console.log(`  Found ${politicians.length} politicians with null voting_records`);

  // Incumbents: bioguide_id starts with oh-rep- or oh-sen-
  const incumbents = politicians.filter(
    (p) => /^oh-(rep|sen)-/.test(p.bioguide_id),
  );
  const candidates = politicians.filter(
    (p) => !/^oh-(rep|sen)-/.test(p.bioguide_id),
  );
  console.log(`  Incumbents: ${incumbents.length}, Candidates: ${candidates.length}`);

  // ----- Step 1: Map incumbents to real bioguide IDs via Congress.gov -----
  console.log('\nMapping incumbents to Congress.gov bioguide IDs...');
  const nameMap = await getOhIncumbentBioguideMap();
  await sleep(DELAY_MS);

  const incumbentBioguide = new Map<string, string>(); // our slug -> real bioguideId
  const bioguideToSlug = new Map<string, string>(); // real bioguideId -> our slug
  for (const p of incumbents) {
    const realId = resolveBioguideForIncumbent(p.name, nameMap);
    if (realId) {
      incumbentBioguide.set(p.bioguide_id, realId);
      bioguideToSlug.set(realId, p.bioguide_id);
      console.log(`  ${p.name} -> ${realId}`);
    } else {
      console.log(`  WARN: no Congress.gov match for ${p.name} (${p.bioguide_id})`);
    }
  }

  // ----- Step 2: Fetch recent House votes -----
  console.log(`\nFetching ${HOUSE_VOTE_LIMIT} recent House roll call votes...`);
  const votes = await fetchRecentHouseVotes(HOUSE_VOTE_LIMIT);
  console.log(`  Got ${votes.length} votes`);
  await sleep(DELAY_MS);

  // Records indexed by our internal slug
  const recordsBySlug = new Map<string, VotingRecord[]>();

  // Pre-fetch titles (one per vote) to avoid N*M calls
  for (let i = 0; i < votes.length; i++) {
    const v = votes[i];
    console.log(
      `  [${i + 1}/${votes.length}] roll ${v.rollCallNumber} ${v.legislationType} ${v.legislationNumber}`,
    );

    // Fetch bill title (optional; saves API calls when disabled)
    let title = `${v.legislationType} ${v.legislationNumber}`;
    if (FETCH_BILL_TITLES) {
      const fetched = await fetchBillTitle(
        v.congress,
        v.legislationType,
        v.legislationNumber,
      );
      if (fetched) title = fetched;
      await sleep(DELAY_MS);
    }

    // Fetch member votes
    const members = await fetchHouseVoteMembers(
      v.congress,
      v.sessionNumber,
      v.rollCallNumber,
    );
    await sleep(DELAY_MS);

    // Filter to our OH incumbents
    for (const m of members) {
      const slug = bioguideToSlug.get(m.bioguideID);
      if (!slug) continue;
      const rec: VotingRecord = {
        bill_number: `${v.legislationType} ${v.legislationNumber}`,
        bill_title: title,
        vote_position: m.voteCast,
        vote_date: v.startDate,
        chamber: 'House',
        category: null,
      };
      if (!recordsBySlug.has(slug)) recordsBySlug.set(slug, []);
      recordsBySlug.get(slug)!.push(rec);
    }
  }

  // ----- Step 3: Update politicians -----
  console.log('\nUpdating politicians in Supabase...');
  let updated = 0;
  let emptySet = 0;

  for (const p of politicians) {
    const records = recordsBySlug.get(p.bioguide_id) || [];
    const { error: upErr } = await sb
      .from('politicians')
      .update({ voting_records: records })
      .eq('bioguide_id', p.bioguide_id);
    if (upErr) {
      console.error(`  ERROR updating ${p.bioguide_id}: ${upErr.message}`);
      continue;
    }
    if (records.length > 0) {
      updated++;
      console.log(`  ${p.name}: ${records.length} votes`);
    } else {
      emptySet++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Politicians processed:     ${politicians.length}`);
  console.log(`  Incumbents mapped:       ${incumbentBioguide.size}/${incumbents.length}`);
  console.log(`  Candidates:              ${candidates.length}`);
  console.log(`Updated with real votes:   ${updated}`);
  console.log(`Set to empty array []:     ${emptySet}`);
  console.log(`House votes fetched:       ${votes.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
