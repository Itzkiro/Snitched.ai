#!/usr/bin/env npx tsx
/**
 * Fetch Mark Sanford's (SC-01, bioguide S000051, GovTrack person 400607) full
 * House voting record and filter to Israel/Palestine/Iran/foreign-aid-related
 * votes across both his House stints:
 *   - 104th–106th Congress (1995-2001)
 *   - 113th–115th Congress (2013-2019)
 *
 * Output: data-ingestion/sanford-votes-historical.json
 *
 * NOTE: Read-only — does NOT touch Supabase or recompute scores.
 *
 * Usage:
 *   npx tsx scripts/fetch-sanford-votes.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const GOVTRACK_BASE = 'https://www.govtrack.us/api/v2';
const SANFORD_PERSON_ID = 400607;
const PAGE_SIZE = 200;
const RATE_LIMIT_MS = 250;
const OUTPUT_PATH = path.join(
  'data-ingestion',
  'sanford-votes-historical.json',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GovTrackVoteOption {
  key: string; // '+' = Aye/Yea, '-' = Nay/No, 'P' = Present, '0' = Not Voting
  value: string;
  vote: number;
  winner: boolean | null;
}

interface GovTrackVote {
  category: string;
  category_label: string;
  chamber: string;
  chamber_label: string;
  congress: number;
  created: string;
  link: string;
  number: number;
  question: string;
  question_details: string | null;
  related_bill: {
    bill_type: string;
    bill_type_label: string;
    congress: number;
    display_number: string;
    id: number;
    link: string;
    number: number;
    title: string;
    title_without_number: string;
  } | null;
  required: string;
  result: string;
  session: string;
}

interface GovTrackVoteVoter {
  created: string;
  option: GovTrackVoteOption;
  vote: GovTrackVote;
  voter_type: string;
}

interface GovTrackListResponse<T> {
  meta: {
    limit: number;
    offset: number;
    total_count: number;
  };
  objects: T[];
}

type Relevance =
  | 'israel'
  | 'foreign_aid'
  | 'iran'
  | 'palestine'
  | 'iraq_war'
  | 'antisemitism'
  | 'gaza'
  | 'bds'
  | 'aipac'
  | 'jerusalem';

interface RelevantVote {
  bill: string;
  title: string;
  date: string;
  sanford_position: string; // Aye | Nay | Present | Not Voting
  description: string;
  relevance: Relevance;
  congress: number;
  chamber: string;
  result: string;
  govtrack_link: string;
}

// ---------------------------------------------------------------------------
// Keyword matching. Order matters: first match wins — put the more specific
// tags first so "iran" doesn't absorb a vote that is actually about Israel.
// ---------------------------------------------------------------------------

const RELEVANCE_PATTERNS: Array<{ tag: Relevance; re: RegExp }> = [
  { tag: 'bds', re: /\bbds\b|boycott.*israel|divest.*israel/i },
  { tag: 'aipac', re: /\baipac\b/i },
  { tag: 'jerusalem', re: /\bjerusalem\b/i },
  { tag: 'gaza', re: /\bgaza\b|\bhamas\b/i },
  { tag: 'palestine', re: /palestin|west\s*bank|two[-\s]state|pa\s+authority/i },
  { tag: 'antisemitism', re: /anti[-\s]?sem|holocaust/i },
  {
    tag: 'israel',
    re: /israel|iron\s*dome|memorandum of understanding with israel/i,
  },
  {
    tag: 'iran',
    re:
      /\biran\b|jcpoa|nuclear agreement|ayatollah|tehran|revolutionary guard|irgc/i,
  },
  {
    tag: 'iraq_war',
    re:
      /\biraq\b|authorization for use of military force|aumf|afghanistan|war on terror/i,
  },
  {
    tag: 'foreign_aid',
    re:
      /foreign\s*(operations|aid|assistance|relations)|state[,]?\s*foreign operations|security assistance appropriations/i,
  },
];

function classifyRelevance(
  question: string,
  title: string,
  category: string,
): Relevance | null {
  const haystack = `${question} ${title} ${category}`;
  for (const { tag, re } of RELEVANCE_PATTERNS) {
    if (re.test(haystack)) return tag;
  }
  return null;
}

function normalizePosition(optionKey: string, optionValue: string): string {
  // GovTrack option.key values:
  //   '+' -> Aye/Yea
  //   '-' -> Nay/No
  //   'P' -> Present
  //   '0' -> Not Voting
  // Sometimes election/speaker votes have candidate names as keys; fall back to value.
  if (optionKey === '+') return 'Aye';
  if (optionKey === '-') return 'Nay';
  if (optionKey === 'P') return 'Present';
  if (optionKey === '0') return 'Not Voting';
  // For election votes (e.g., "Gingrich") the position IS the value
  return optionValue || optionKey;
}

// ---------------------------------------------------------------------------
// GovTrack fetch
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} on ${url}: ${await resp.text()}`);
  }
  return (await resp.json()) as T;
}

/**
 * GovTrack caps offset at 1000 per query. Sanford has 7,333 vote records, so
 * we slice by year-range windows and paginate within each window up to the
 * 1000-offset ceiling. His two stints:
 *   - 104th–106th: 1995-01-04 .. 2001-01-02
 *   - 113th–115th: 2013-01-03 .. 2019-01-02
 * Per-year windows keep each sub-query well under 1000 records.
 */
async function fetchVotesForYear(year: number): Promise<GovTrackVoteVoter[]> {
  const votes: GovTrackVoteVoter[] = [];
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;
  let offset = 0;

  while (true) {
    const url =
      `${GOVTRACK_BASE}/vote_voter/?person=${SANFORD_PERSON_ID}` +
      `&created__gte=${startDate}&created__lt=${endDate}` +
      `&limit=${PAGE_SIZE}&offset=${offset}`;
    const data = await fetchJson<GovTrackListResponse<GovTrackVoteVoter>>(url);
    votes.push(...data.objects);
    if (data.objects.length < PAGE_SIZE) break;
    offset += data.objects.length;
    if (offset >= 1000) {
      console.warn(
        `  WARN: year ${year} exceeded 1000-offset cap (got ${votes.length} of ${data.meta.total_count})`,
      );
      break;
    }
    await sleep(RATE_LIMIT_MS);
  }
  return votes;
}

async function fetchAllSanfordVotes(): Promise<GovTrackVoteVoter[]> {
  const all: GovTrackVoteVoter[] = [];
  // Sanford served these years (skip 2001-2012 when he wasn't in the House):
  const years = [
    1995, 1996, 1997, 1998, 1999, 2000, // 104-106
    2013, 2014, 2015, 2016, 2017, 2018, // 113-115
  ];
  for (const year of years) {
    const yearVotes = await fetchVotesForYear(year);
    all.push(...yearVotes);
    console.log(`  Year ${year}: ${yearVotes.length} votes (running total: ${all.length})`);
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Significance scoring for top-5 summary
// ---------------------------------------------------------------------------

function significanceScore(v: RelevantVote): number {
  let score = 0;
  const q = v.title.toLowerCase() + ' ' + v.description.toLowerCase();

  // Major Israel aid / arms / recognition — pro votes are significant
  if (/iron\s*dome|israel.*(aid|assistance|security|missile|arms)|memorandum of understanding with israel|recognition.*jerusalem/i.test(q)) {
    score += v.sanford_position === 'Aye' ? 100 : 60;
  }
  // Anti-BDS measures: supporting (Aye) is a strong pro-Israel signal
  if (/\bbds\b|boycott.*israel/i.test(q)) {
    score += v.sanford_position === 'Aye' ? 90 : 70;
  }
  // Iran sanctions / JCPOA
  if (/iran.*sanction|jcpoa/i.test(q)) {
    score += 70;
  }
  // Iraq war authorization
  if (/authorization.*(use of military force|iraq)/i.test(q)) {
    score += 80;
  }
  // Anti-Israel / withdrawal resolutions — a Nay is significant alignment
  if (/strike.*israel|war\s*powers.*(israel|iran)|gaza\s*pier/i.test(q)) {
    score += v.sanford_position === 'Nay' ? 85 : 40;
  }
  // Condemning antisemitism / Hamas
  if (/antisemit|condemning.*hamas/i.test(q)) {
    score += v.sanford_position === 'Aye' ? 50 : 30;
  }
  // Foreign aid / appropriations with Israel content
  if (/foreign\s*operations.*appropriations/i.test(q)) {
    score += 30;
  }
  // Baseline for any relevant vote
  score += 5;

  return score;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Fetching Mark Sanford voting record from GovTrack');
  console.log(`  Person ID: ${SANFORD_PERSON_ID} (bioguide S000051)`);
  console.log('='.repeat(60));

  console.log('\nFetching all vote records...');
  const allVotes = await fetchAllSanfordVotes();
  console.log(`\nTotal vote records fetched: ${allVotes.length}`);

  // Filter to Israel/Palestine/foreign-aid relevant votes
  const relevant: RelevantVote[] = [];
  for (const vv of allVotes) {
    const v = vv.vote;
    const title = v.related_bill?.title ?? '';
    const category = v.category_label ?? '';
    const tag = classifyRelevance(v.question, title, category);
    if (!tag) continue;

    const billLabel = v.related_bill?.display_number ?? `Roll ${v.number} (${v.congress})`;
    const description = v.question_details
      ? `${v.question}. ${v.question_details}`
      : v.question;

    relevant.push({
      bill: billLabel,
      title: title || v.question,
      date: v.created.split('T')[0],
      sanford_position: normalizePosition(vv.option.key, vv.option.value),
      description: description.substring(0, 500),
      relevance: tag,
      congress: v.congress,
      chamber: v.chamber_label,
      result: v.result,
      govtrack_link: v.link,
    });
  }

  // Sort newest first
  relevant.sort((a, b) => b.date.localeCompare(a.date));

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(relevant, null, 2));
  console.log(`\nWrote ${relevant.length} relevant votes to ${OUTPUT_PATH}`);

  // ---------------- Summary ----------------
  const byRelevance: Record<string, number> = {};
  for (const r of relevant) {
    byRelevance[r.relevance] = (byRelevance[r.relevance] ?? 0) + 1;
  }

  const byStint: Record<string, number> = { '1995-2001 (104-106)': 0, '2013-2019 (113-115)': 0 };
  for (const r of relevant) {
    if (r.congress >= 104 && r.congress <= 106) byStint['1995-2001 (104-106)']++;
    else if (r.congress >= 113 && r.congress <= 115) byStint['2013-2019 (113-115)']++;
  }

  const byPosition: Record<string, number> = {};
  for (const r of relevant) {
    byPosition[r.sanford_position] = (byPosition[r.sanford_position] ?? 0) + 1;
  }

  // Top 5 most significant
  const top5 = [...relevant]
    .map((r) => ({ ...r, _score: significanceScore(r) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total vote records fetched:   ${allVotes.length}`);
  console.log(`Relevant votes (filtered):    ${relevant.length}`);
  console.log('\nBy stint:');
  for (const [k, n] of Object.entries(byStint)) {
    console.log(`  ${k.padEnd(25)} ${n}`);
  }
  console.log('\nBy relevance tag:');
  for (const [k, n] of Object.entries(byRelevance).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${n}`);
  }
  console.log('\nBy position:');
  for (const [k, n] of Object.entries(byPosition).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${n}`);
  }

  console.log('\nTop 5 most significant votes:');
  console.log('-'.repeat(60));
  for (let i = 0; i < top5.length; i++) {
    const t = top5[i];
    console.log(`${i + 1}. [${t.date}] ${t.bill} (Congress ${t.congress}) — ${t.relevance}`);
    console.log(`   Title: ${t.title.substring(0, 120)}`);
    console.log(`   Position: ${t.sanford_position} | Result: ${t.result}`);
    console.log(`   Link: ${t.govtrack_link}`);
    console.log('');
  }

  console.log(`Output file: ${path.resolve(OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
