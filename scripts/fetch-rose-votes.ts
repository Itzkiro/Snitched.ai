#!/usr/bin/env npx tsx
/**
 * Fetch Rep. John W. Rose's (TN-06, bioguide R000612) full Congressional
 * voting record in the House (2019-present, 116th-119th Congresses) and
 * filter to Israel/Palestine/Iran/foreign-aid-related votes.
 *
 * Output: data-ingestion/rose-votes-historical.json
 *
 * NOTE: Read-only — does NOT touch Supabase or recompute scores.
 *
 * Usage:
 *   npx tsx scripts/fetch-rose-votes.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const GOVTRACK_BASE = 'https://www.govtrack.us/api/v2';
const BIOGUIDE_ID = 'R000612';
// GovTrack doesn't support filtering /person/ by bioguideid; resolved via
// /person/?q=John+Rose+Tennessee which returned profile link:
// https://www.govtrack.us/congress/members/john_rose/412818
const ROSE_PERSON_ID = 412818;
const PAGE_SIZE = 200;
const RATE_LIMIT_MS = 250;
const OUTPUT_PATH = path.join(
  'data-ingestion',
  'rose-votes-historical.json',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GovTrackVoteOption {
  key: string;
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
  related_bill:
    | {
        bill_type: string;
        bill_type_label: string;
        congress: number;
        display_number: string;
        id: number;
        link: string;
        number: number;
        title: string;
        title_without_number: string;
      }
    | number
    | null;
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

interface GovTrackPerson {
  id: number;
  bioguideid: string;
  name: string;
  firstname: string;
  lastname: string;
}

type Relevance =
  | 'israel'
  | 'foreign_aid'
  | 'iran'
  | 'palestine'
  | 'antisemitism'
  | 'gaza'
  | 'bds'
  | 'aipac'
  | 'jerusalem';

type Category =
  | 'israel_aid_funding'
  | 'israel_aid_restriction'
  | 'iran_sanctions_nuclear'
  | 'anti_antisemitism'
  | 'palestine_gaza'
  | 'foreign_aid_appropriations'
  | 'other';

interface RelevantVote {
  bill: string;
  title: string;
  date: string;
  position: string; // Aye | Nay | Present | Not Voting
  description: string;
  relevance: Relevance;
  category: Category;
  congress: number;
  chamber: string;
  result: string;
  govtrack_link: string;
}

// ---------------------------------------------------------------------------
// Keyword matching for relevance. First match wins.
// ---------------------------------------------------------------------------

const RELEVANCE_PATTERNS: Array<{ tag: Relevance; re: RegExp }> = [
  { tag: 'bds', re: /\bbds\b|boycott.*israel|divest.*israel|anti[-\s]?boycott/i },
  { tag: 'aipac', re: /\baipac\b/i },
  { tag: 'jerusalem', re: /\bjerusalem\b|embassy.*(jerusalem|israel)/i },
  { tag: 'gaza', re: /\bgaza\b|\bhamas\b|\bhezbollah\b/i },
  {
    tag: 'palestine',
    re: /palestin|west\s*bank|two[-\s]state|\bunrwa\b|palestinian authority|\bgolan\b|settlement/i,
  },
  { tag: 'antisemitism', re: /anti[-\s]?sem|holocaust|\bihra\b|anti[-\s]?zionism/i },
  {
    tag: 'israel',
    re: /israel|iron\s*dome|memorandum of understanding with israel/i,
  },
  {
    tag: 'iran',
    re:
      /\biran\b|jcpoa|nuclear agreement|ayatollah|tehran|revolutionary guard|\birgc\b/i,
  },
  {
    tag: 'foreign_aid',
    re:
      /foreign\s*(operations|aid|assistance|relations)|state[,]?\s*foreign operations|security assistance appropriations/i,
  },
];

/**
 * Bills whose titles/questions don't always carry Israel keywords but which
 * are definitively Israel-aid-adjacent — tag them regardless of text match.
 *
 * H.R. 3237 (117th) — Emergency Security Supplemental Appropriations Act 2021
 *   → $1B Iron Dome replenishment.
 * H.R. 815  (118th) — Making emergency supplemental appropriations, 2024
 *   → $26B Israel + Ukraine + Taiwan (the "National Security Supplemental").
 */
const BILL_ALLOWLIST: Array<{
  congress: number;
  questionPattern: RegExp;
  relevance: Relevance;
}> = [
  {
    congress: 117,
    questionPattern: /\bH\.?\s*R\.?\s*3237\b/i,
    relevance: 'israel',
  },
  {
    congress: 118,
    questionPattern: /\bH\.?\s*R\.?\s*815\b/i,
    relevance: 'israel',
  },
];

function classifyRelevance(
  question: string,
  title: string,
  category: string,
  congress: number,
): Relevance | null {
  const haystack = `${question} ${title} ${category}`;
  for (const { tag, re } of RELEVANCE_PATTERNS) {
    if (re.test(haystack)) return tag;
  }
  for (const entry of BILL_ALLOWLIST) {
    if (entry.congress === congress && entry.questionPattern.test(question)) {
      return entry.relevance;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Broader categorization for summary buckets.
// ---------------------------------------------------------------------------

function classifyCategory(
  question: string,
  title: string,
  relevance: Relevance,
  congress: number,
): Category {
  const q = `${question} ${title}`.toLowerCase();

  for (const entry of BILL_ALLOWLIST) {
    if (entry.congress === congress && entry.questionPattern.test(question)) {
      return 'israel_aid_funding';
    }
  }
  if (
    /(iron\s*dome|israel.*(aid|assistance|security|missile|arms|military|supplement|defense)|memorandum of understanding with israel|israeli security assistance|united states[-\s]israel)/i.test(
      q,
    )
  ) {
    return 'israel_aid_funding';
  }
  if (relevance === 'bds' || /\bbds\b|anti[-\s]?boycott|combating bds/i.test(q)) {
    return 'israel_aid_restriction';
  }
  if (
    relevance === 'iran' ||
    /iran.*(sanction|nuclear|regime|missile)|jcpoa|\birgc\b/i.test(q)
  ) {
    return 'iran_sanctions_nuclear';
  }
  if (relevance === 'antisemitism' || /antisemit|holocaust|\bihra\b/i.test(q)) {
    return 'anti_antisemitism';
  }
  if (
    relevance === 'palestine' ||
    relevance === 'gaza' ||
    /palestin|\bgaza\b|\bhamas\b|\bunrwa\b|two[-\s]state|west\s*bank|\bgolan\b/i.test(q)
  ) {
    return 'palestine_gaza';
  }
  if (
    relevance === 'foreign_aid' ||
    /foreign\s*operations.*appropriations|state.*foreign operations|ndaa|national defense authorization/i.test(
      q,
    )
  ) {
    return 'foreign_aid_appropriations';
  }
  return 'other';
}

function normalizePosition(optionKey: string, optionValue: string): string {
  if (optionKey === '+') return 'Aye';
  if (optionKey === '-') return 'Nay';
  if (optionKey === 'P') return 'Present';
  if (optionKey === '0') return 'Not Voting';
  return optionValue || optionKey;
}

// ---------------------------------------------------------------------------
// GovTrack fetch
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(url: string): Promise<T> {
  const MAX_RETRIES = 5;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        // Retry on 5xx / 429; fail fast on other client errors
        if (resp.status >= 500 || resp.status === 429) {
          const backoff = 1000 * 2 ** (attempt - 1);
          console.warn(
            `  HTTP ${resp.status} on ${url} (attempt ${attempt}/${MAX_RETRIES}); retry in ${backoff}ms`,
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${resp.status} on ${url}: ${await resp.text()}`);
      }
      return (await resp.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) break;
      const backoff = 1000 * 2 ** (attempt - 1);
      console.warn(
        `  Fetch error on ${url} (attempt ${attempt}/${MAX_RETRIES}): ${
          err instanceof Error ? err.message : String(err)
        }; retry in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Fetch failed after ${MAX_RETRIES} attempts: ${url}`);
}

async function verifyPersonId(
  personId: number,
  expectedBioguide: string,
): Promise<void> {
  const url = `${GOVTRACK_BASE}/person/${personId}`;
  const p = await fetchJson<GovTrackPerson>(url);
  if (p.bioguideid !== expectedBioguide) {
    throw new Error(
      `GovTrack person ${personId} has bioguide ${p.bioguideid}, expected ${expectedBioguide}`,
    );
  }
  console.log(`  Verified GovTrack id=${personId} -> ${p.bioguideid} (${p.name})`);
}

/**
 * GovTrack caps offset at 1000 per query. Pull per-window slices to stay well
 * under the cap. House members in busy years produce 700-1000 votes/yr;
 * half-year windows keep us safely under the cap.
 */
async function fetchVotesForWindow(
  personId: number,
  startDate: string,
  endDate: string,
): Promise<GovTrackVoteVoter[]> {
  const votes: GovTrackVoteVoter[] = [];
  let offset = 0;

  while (true) {
    const url =
      `${GOVTRACK_BASE}/vote_voter/?person=${personId}` +
      `&created__gte=${startDate}&created__lt=${endDate}` +
      `&limit=${PAGE_SIZE}&offset=${offset}`;
    const data = await fetchJson<GovTrackListResponse<GovTrackVoteVoter>>(url);
    votes.push(...data.objects);
    if (data.objects.length < PAGE_SIZE) break;
    offset += data.objects.length;
    if (offset >= 1000) {
      console.warn(
        `  WARN: window ${startDate}..${endDate} exceeded 1000-offset cap ` +
          `(got ${votes.length} of ${data.meta.total_count})`,
      );
      break;
    }
    await sleep(RATE_LIMIT_MS);
  }
  return votes;
}

async function fetchAllRoseVotes(personId: number): Promise<GovTrackVoteVoter[]> {
  const all: GovTrackVoteVoter[] = [];
  // House TN-06: 2019-present (116th-119th Congress).
  const currentYear = new Date().getUTCFullYear();

  // Half-year windows to dodge the 1000-offset cap.
  const windows: Array<{ label: string; start: string; end: string }> = [];
  for (let y = 2019; y <= currentYear; y++) {
    windows.push({ label: `${y}H1`, start: `${y}-01-01`, end: `${y}-07-01` });
    windows.push({ label: `${y}H2`, start: `${y}-07-01`, end: `${y + 1}-01-01` });
  }

  for (const w of windows) {
    const winVotes = await fetchVotesForWindow(personId, w.start, w.end);
    all.push(...winVotes);
    console.log(
      `  ${w.label}: ${winVotes.length} votes (running total: ${all.length})`,
    );
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Significance scoring for top-10 summary
// ---------------------------------------------------------------------------

function significanceScore(v: RelevantVote): number {
  let score = 0;
  const q = (v.title + ' ' + v.description).toLowerCase();

  if (v.category === 'israel_aid_funding') {
    score += v.position === 'Nay' ? 120 : 100;
  }
  if (
    /iron\s*dome|israel.*(aid|assistance|security|missile|arms|supplement|defense)|memorandum of understanding with israel|recognition.*jerusalem|embassy.*jerusalem/i.test(
      q,
    )
  ) {
    score += v.position === 'Aye' ? 100 : 80;
  }
  if (/\bbds\b|boycott.*israel|combating bds|anti[-\s]?boycott/i.test(q)) {
    score += v.position === 'Aye' ? 90 : 70;
  }
  if (/jcpoa|iran.*(nuclear|agreement|deal)/i.test(q)) {
    score += 95;
  }
  if (/iran.*sanction|\birgc\b|revolutionary guard/i.test(q)) {
    score += 75;
  }
  if (/war\s*powers.*(israel|iran|strike)/i.test(q)) {
    score += v.position === 'Nay' ? 85 : 50;
  }
  if (/ihra|antisemit|condemning.*hamas|awareness.*antisemit/i.test(q)) {
    score += v.position === 'Aye' ? 70 : 40;
  }
  if (/supplement.*(appropriat|israel|ukraine)|national security supplement/i.test(q)) {
    score += v.position === 'Aye' ? 85 : 60;
  }
  if (/foreign\s*operations.*appropriations/i.test(q)) {
    score += 30;
  }
  if (/\bunrwa\b/i.test(q)) {
    score += v.position === 'Aye' ? 60 : 50;
  }
  score += 5;
  return score;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Fetching Rep. John W. Rose voting record from GovTrack');
  console.log(`  Bioguide: ${BIOGUIDE_ID}  |  GovTrack: ${ROSE_PERSON_ID}`);
  console.log('='.repeat(60));

  await verifyPersonId(ROSE_PERSON_ID, BIOGUIDE_ID);

  console.log('\nFetching all vote records...');
  const allVotes = await fetchAllRoseVotes(ROSE_PERSON_ID);
  console.log(`\nTotal vote records fetched: ${allVotes.length}`);

  // Filter to relevant votes
  const relevant: RelevantVote[] = [];
  for (const vv of allVotes) {
    const v = vv.vote;
    const rb =
      v.related_bill && typeof v.related_bill === 'object'
        ? v.related_bill
        : null;
    const title = rb?.title ?? '';
    const category = v.category_label ?? '';
    const tag = classifyRelevance(v.question, title, category, v.congress);
    if (!tag) continue;

    const billLabel = rb?.display_number ?? `Roll ${v.number} (${v.congress})`;
    const description = v.question_details
      ? `${v.question}. ${v.question_details}`
      : v.question;
    const cat = classifyCategory(v.question, title, tag, v.congress);

    relevant.push({
      bill: billLabel,
      title: title || v.question,
      date: v.created.split('T')[0],
      position: normalizePosition(vv.option.key, vv.option.value),
      description: description.substring(0, 500),
      relevance: tag,
      category: cat,
      congress: v.congress,
      chamber: v.chamber_label,
      result: v.result,
      govtrack_link: v.link,
    });
  }

  // Sort newest first
  relevant.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(relevant, null, 2));
  console.log(`\nWrote ${relevant.length} relevant votes to ${OUTPUT_PATH}`);

  // ---------------- Summary ----------------
  const byRelevance: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byPosition: Record<string, number> = {};
  const byChamber: Record<string, number> = { House: 0, Senate: 0, Other: 0 };

  for (const r of relevant) {
    byRelevance[r.relevance] = (byRelevance[r.relevance] ?? 0) + 1;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    byPosition[r.position] = (byPosition[r.position] ?? 0) + 1;
    if (/senate/i.test(r.chamber)) byChamber.Senate++;
    else if (/house/i.test(r.chamber)) byChamber.House++;
    else byChamber.Other++;
  }

  const israelAidVotes = relevant.filter((r) => r.category === 'israel_aid_funding');
  const iranVotes = relevant.filter((r) => r.category === 'iran_sanctions_nuclear');
  const antiBdsVotes = relevant.filter(
    (r) => r.category === 'israel_aid_restriction',
  );
  const nayOnIsraelAid = israelAidVotes.filter((r) => r.position === 'Nay');

  const pct = (n: number, d: number): string =>
    d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;

  const top10 = [...relevant]
    .map((r) => ({ ...r, _score: significanceScore(r) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total vote records fetched:   ${allVotes.length}`);
  console.log(`Relevant votes (filtered):    ${relevant.length}`);
  console.log(`\nBy chamber:`);
  for (const [k, n] of Object.entries(byChamber)) {
    console.log(`  ${k.padEnd(10)} ${n}`);
  }
  console.log('\nBy relevance tag:');
  for (const [k, n] of Object.entries(byRelevance).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${n}`);
  }
  console.log('\nBy category:');
  for (const [k, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(30)} ${n}`);
  }
  console.log('\nBy position:');
  for (const [k, n] of Object.entries(byPosition).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${n}`);
  }

  console.log('\nAlignment metrics:');
  console.log(
    `  Israel-aid funding votes:       ${israelAidVotes.length} (Aye ${
      israelAidVotes.filter((r) => r.position === 'Aye').length
    }, ${pct(
      israelAidVotes.filter((r) => r.position === 'Aye').length,
      israelAidVotes.length,
    )})`,
  );
  console.log(
    `  Anti-BDS / restriction votes:   ${antiBdsVotes.length} (Aye ${
      antiBdsVotes.filter((r) => r.position === 'Aye').length
    }, ${pct(
      antiBdsVotes.filter((r) => r.position === 'Aye').length,
      antiBdsVotes.length,
    )})`,
  );
  console.log(
    `  Iran sanctions/JCPOA votes:     ${iranVotes.length} (Aye ${
      iranVotes.filter((r) => r.position === 'Aye').length
    }, ${pct(
      iranVotes.filter((r) => r.position === 'Aye').length,
      iranVotes.length,
    )})`,
  );
  console.log(`  NAY votes on direct Israel aid: ${nayOnIsraelAid.length}`);
  if (nayOnIsraelAid.length > 0) {
    console.log('  ---- Rare-bird NAY details: ----');
    for (const r of nayOnIsraelAid) {
      console.log(`    [${r.date}] ${r.bill}: ${r.title.substring(0, 100)}`);
    }
  }

  // Explicit HR 815 litmus check
  const hr815 = relevant.filter(
    (r) => r.congress === 118 && /\bH\.?\s*R\.?\s*815\b/i.test(r.description),
  );
  if (hr815.length > 0) {
    console.log('\nH.R. 815 (118th, $26B Israel/Ukraine/Taiwan supplemental) votes:');
    for (const r of hr815) {
      console.log(
        `  [${r.date}] Position: ${r.position.padEnd(12)} | Result: ${r.result}`,
      );
      console.log(`    Q: ${r.description.substring(0, 160)}`);
    }
  }

  console.log('\nTop 10 most significant votes:');
  console.log('-'.repeat(60));
  for (let i = 0; i < top10.length; i++) {
    const t = top10[i];
    console.log(
      `${i + 1}. [${t.date}] ${t.bill} (Cong ${t.congress}, ${t.chamber}) — ${t.category}`,
    );
    console.log(`   Title: ${t.title.substring(0, 130)}`);
    console.log(`   Position: ${t.position} | Result: ${t.result}`);
    console.log(`   Link: ${t.govtrack_link}`);
    console.log('');
  }

  console.log(`Output file: ${path.resolve(OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
