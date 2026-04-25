#!/usr/bin/env npx tsx
/**
 * Cross-reference FL 2026 Gubernatorial candidates' FL DOE donor lists against
 * the 49-year pro-Israel individual-donor registry.
 *
 * Method: HIGH-CONFIDENCE ONLY — last name + full first name + state, exact
 * match after NFD normalization and suffix stripping. Mirrors the matcher used
 * in scripts/crossref-rose-federal-49yr-pro-israel.ts.
 *
 * Candidates:
 *   - Byron Donalds   (data-ingestion/donalds-fldoe-2026.json)
 *   - James Fishback  (data-ingestion/fishback-fldoe-2026.json)
 *   - Jay Collins     (data-ingestion/jay-collins-fldoe-2026.json)
 *
 * Outputs (one per candidate):
 *   data/donalds-fl-gov-cross-ref-2026.json
 *   data/fishback-fl-gov-cross-ref-2026.json
 *   data/jay-collins-fl-gov-cross-ref-2026.json
 *
 * Read-only: does not touch Supabase.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const INGEST_DIR = path.join(ROOT, 'data-ingestion');
const BLACKBURN_CROSSREF_PATH = path.join(DATA_DIR, 'blackburn-tn-gov-cross-ref-2026.json');
const ROSE_CROSSREF_PATH = path.join(DATA_DIR, 'rose-federal-49yr-crossref-2026-04-24.json');

interface CandidateSpec {
  key: string;
  displayName: string;
  input: string;
  output: string;
}

const CANDIDATES: CandidateSpec[] = [
  {
    key: 'donalds',
    displayName: 'Byron Donalds',
    input: path.join(INGEST_DIR, 'donalds-fldoe-2026.json'),
    output: path.join(DATA_DIR, 'donalds-fl-gov-cross-ref-2026.json'),
  },
  {
    key: 'fishback',
    displayName: 'James Fishback',
    input: path.join(INGEST_DIR, 'fishback-fldoe-2026.json'),
    output: path.join(DATA_DIR, 'fishback-fl-gov-cross-ref-2026.json'),
  },
  {
    key: 'jay-collins',
    displayName: 'Jay Collins',
    input: path.join(INGEST_DIR, 'jay-collins-fldoe-2026.json'),
    output: path.join(DATA_DIR, 'jay-collins-fl-gov-cross-ref-2026.json'),
  },
];

// ---------------------------------------------------------------------------
// CSV / Normalization helpers (match crossref-rose-federal-49yr-pro-israel.ts)
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const headerLine = lines.shift();
  if (!headerLine) return [];
  const cols = splitCsvLine(headerLine);
  return lines.map(line => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    cols.forEach((c, i) => {
      row[c] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function money(s: string | number): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  const n = Number(String(s || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function norm(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSuffix(s: string): string {
  return s
    .replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ParsedName {
  last: string;
  first: string;
}

/** Parse a "LAST, FIRST" OR "LAST FIRST" string into components. */
function parseNameCommaFirst(raw: string): ParsedName | null {
  const n = stripSuffix(norm(raw));
  if (!n) return null;
  if (n.includes(',')) {
    const [last, rest] = n.split(',').map(s => s.trim());
    const first = (rest || '').split(/\s+/)[0] || '';
    return { last, first };
  }
  const toks = n.split(/\s+/);
  if (toks.length < 2) return null;
  return { last: toks[0], first: toks[1] || '' };
}

const ORG_WORDS =
  /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;

function isIndividualRegistryRow(r: Record<string, string>): boolean {
  const nameUpper = (r.donor_name || '').toUpperCase();
  if (!/^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/.test(nameUpper)) return false;
  if (ORG_WORDS.test(nameUpper)) return false;
  return true;
}

function looksLikeOrg(name: string): boolean {
  return ORG_WORDS.test(name.toUpperCase());
}

// ---------------------------------------------------------------------------
// Master 49-year pro-Israel registry
// ---------------------------------------------------------------------------

interface MasterEntry {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  cycles: Set<string>;
  totalGiven: number;
  contribCount: number;
  pacs: Set<string>;
}

interface MasterLoad {
  index: Map<string, MasterEntry>;
  yearRange: { first: number; last: number; years: number };
  uniqueIndividuals: number;
}

function loadMaster(): MasterLoad {
  const idx = new Map<string, MasterEntry>();
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f))
    .sort();
  const years = files
    .map(f => Number(f.match(/(\d{4})/)?.[1] || 0))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const yearRange = {
    first: years[0] || 0,
    last: years[years.length - 1] || 0,
    years: years.length,
  };
  const individualNames = new Set<string>();
  for (const f of files) {
    const cycleMatch = f.match(/(\d{4})/);
    if (!cycleMatch) continue;
    const cycle = cycleMatch[1];
    const rows = parseCsv(path.join(DATA_DIR, f));
    for (const r of rows) {
      if (!isIndividualRegistryRow(r)) continue;
      individualNames.add((r.donor_name || '').toUpperCase());
      const p = parseNameCommaFirst(r.donor_name);
      if (!p || !p.last || !p.first) continue;
      const state = norm(r.state);
      const key = `${p.last}|${p.first}|${state}`;
      let e = idx.get(key);
      if (!e) {
        e = {
          last: p.last,
          first: p.first,
          state,
          city: norm(r.city),
          employer: norm(r.employer),
          occupation: norm(r.occupation),
          cycles: new Set(),
          totalGiven: 0,
          contribCount: 0,
          pacs: new Set(),
        };
        idx.set(key, e);
      }
      e.cycles.add(cycle);
      e.totalGiven += money(r.total_given);
      e.contribCount += Number(r.contribution_count) || 0;
      (r.pacs_given_to || '')
        .split(/;\s*/)
        .filter(Boolean)
        .forEach(pac => e!.pacs.add(pac));
      if (!e.employer && r.employer) e.employer = norm(r.employer);
      if (!e.occupation && r.occupation) e.occupation = norm(r.occupation);
    }
  }
  return {
    index: idx,
    yearRange,
    uniqueIndividuals: individualNames.size,
  };
}

// ---------------------------------------------------------------------------
// FL DOE donor parsing
// ---------------------------------------------------------------------------

interface FlDoeContribution {
  candidate: string;
  date: string;
  amount: number;
  type: string;
  contributor_name: string; // usually "LAST FIRST" (no comma)
  address: string;
  city_state_zip: string; // "CITY, ST 12345"
  occupation: string;
  employer: string;
}

interface FlDoeFile {
  candidate_key: string;
  candidate_name: string;
  scraped_at: string;
  summary: {
    total_raised: number;
    contribution_count: number;
    unique_donors: number;
  };
  contributions: FlDoeContribution[];
}

interface AggDonor {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total: number;
  contribCount: number;
  isOrg: boolean;
}

/** Parse a FL DOE contributor_name (which is space-separated "LAST FIRST"). */
function parseFlDoeName(raw: string): ParsedName | null {
  const n = stripSuffix(norm(raw));
  if (!n) return null;
  if (looksLikeOrg(n)) return null;
  const toks = n.split(/\s+/);
  if (toks.length < 2) return null;
  // FL DOE convention: first token is LAST, second is FIRST.
  // (verified from samples: "ABBOTT MICHAEL", "ABDULLAH ZUBAIR")
  return { last: toks[0], first: toks[1] };
}

function parseCityStateZip(raw: string): { city: string; state: string; zip: string } {
  const m = (raw || '').match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return { city: '', state: '', zip: '' };
  return { city: m[1].trim(), state: m[2], zip: m[3] };
}

function aggregateFlDoe(file: FlDoeFile): {
  agg: AggDonor[];
  totals: { total: number; rows: number; unique: number };
} {
  const byKey = new Map<string, AggDonor>();
  let total = 0;
  for (const c of file.contributions) {
    total += Number(c.amount) || 0;
    const nm = parseFlDoeName(c.contributor_name);
    const { city, state } = parseCityStateZip(c.city_state_zip);
    if (!nm || !nm.last || !nm.first) {
      // treat as org/unknown; still aggregate under raw key so we can count
      continue;
    }
    const key = `${nm.last}|${nm.first}|${state}`;
    let e = byKey.get(key);
    if (!e) {
      e = {
        last: nm.last,
        first: nm.first,
        state,
        city: norm(city),
        employer: norm(c.employer || ''),
        occupation: norm(c.occupation || ''),
        total: 0,
        contribCount: 0,
        isOrg: false,
      };
      byKey.set(key, e);
    }
    e.total += Number(c.amount) || 0;
    e.contribCount += 1;
    if (!e.employer && c.employer) e.employer = norm(c.employer);
    if (!e.occupation && c.occupation) e.occupation = norm(c.occupation);
  }
  return {
    agg: [...byKey.values()],
    totals: { total, rows: file.contributions.length, unique: byKey.size },
  };
}

// ---------------------------------------------------------------------------
// Cross-identification sets
// ---------------------------------------------------------------------------

interface NameStateKey {
  name: string;
  state?: string;
}

function loadBlackburnDonors(): Set<string> {
  if (!fs.existsSync(BLACKBURN_CROSSREF_PATH)) return new Set();
  const d = JSON.parse(fs.readFileSync(BLACKBURN_CROSSREF_PATH, 'utf8')) as {
    matches?: NameStateKey[];
  };
  const s = new Set<string>();
  for (const m of d.matches || []) {
    const p = parseNameCommaFirst(m.name || '');
    if (!p || !p.last || !p.first) continue;
    const state = norm(m.state || '');
    s.add(`${p.last}|${p.first}|${state}`);
  }
  return s;
}

function loadRoseDonors(): Set<string> {
  if (!fs.existsSync(ROSE_CROSSREF_PATH)) return new Set();
  const d = JSON.parse(fs.readFileSync(ROSE_CROSSREF_PATH, 'utf8')) as {
    matches?: NameStateKey[];
  };
  const s = new Set<string>();
  for (const m of d.matches || []) {
    const p = parseNameCommaFirst(m.name || '');
    if (!p || !p.last || !p.first) continue;
    const state = norm(m.state || '');
    s.add(`${p.last}|${p.first}|${state}`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

const FARA_FIRMS =
  /\b(AKIN GUMP|BROWNSTEIN HYATT|BALLARD PARTNERS|BGR GROUP|HOGAN LOVELLS|MERCURY|SIDLEY AUSTIN|SQUIRE PATTON|COVINGTON|DLA PIPER|PILLSBURY|HOLLAND\s*&\s*KNIGHT|ARNOLD\s*&\s*PORTER|VENABLE|GREENBERG TRAURIG|KING\s*&\s*SPALDING|WILEY REIN|ORRICK|NELSON MULLINS|CASSIDY\s*&\s*ASSOCIATES|AKIN\s*GUMP\s*STRAUSS)\b/;

interface OutMatch {
  name: string;
  state: string;
  city: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_candidate: number;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_federal: boolean;
  foreign_money_flag?: string;
}

// Known cross-candidate AIPAC-network bundlers to specifically flag
const KNOWN_BUNDLERS = [
  { last: 'OLSWANGER', first: 'SAM' },
  { last: 'BYRD', first: 'BARNEY' },
  { last: 'HYATT', first: 'LAWRENCE' },
];

function matchCandidate(
  cand: CandidateSpec,
  master: Map<string, MasterEntry>,
  blackburnSet: Set<string>,
  roseSet: Set<string>,
): {
  candidate: string;
  inputStats: { total_raised: number; rows: number; unique_donors: number };
  matches: OutMatch[];
  totals: {
    high_conf_match_count: number;
    high_conf_total_to_candidate: number;
    combined_career_to_pro_israel: number;
    cross_with_blackburn: string[];
    cross_with_rose: string[];
    known_bundler_hits: Array<{ name: string; to_candidate: number }>;
  };
} | null {
  if (!fs.existsSync(cand.input)) {
    console.warn(`  ⚠ input not found for ${cand.key}: ${cand.input}`);
    return null;
  }
  const file = JSON.parse(fs.readFileSync(cand.input, 'utf8')) as FlDoeFile;
  const { agg, totals } = aggregateFlDoe(file);

  const matches: OutMatch[] = [];
  for (const d of agg) {
    const key = `${d.last}|${d.first}|${d.state}`;
    const m = master.get(key);
    if (!m) continue;
    const out: OutMatch = {
      name: `${m.last}, ${m.first}`,
      state: m.state,
      city: d.city || m.city || '',
      employer_last_seen: d.employer || m.employer || '',
      occupation_last_seen: d.occupation || m.occupation || '',
      to_candidate: Math.round(d.total * 100) / 100,
      career_to_pro_israel_pacs: Math.round(m.totalGiven),
      pacs_given_to: Array.from(m.pacs),
      pro_israel_cycles: [...m.cycles].sort(),
      also_on_blackburn_tn_gov: blackburnSet.has(key),
      also_on_rose_federal: roseSet.has(key),
    };
    if (d.employer && FARA_FIRMS.test(d.employer)) {
      out.foreign_money_flag = `${d.employer} is a FARA-registered firm representing foreign sovereigns`;
    }
    matches.push(out);
  }
  matches.sort(
    (a, b) =>
      b.career_to_pro_israel_pacs - a.career_to_pro_israel_pacs ||
      b.to_candidate - a.to_candidate,
  );

  // Known bundler check — explicit last+first lookup regardless of state
  const knownHits: Array<{ name: string; to_candidate: number }> = [];
  for (const kb of KNOWN_BUNDLERS) {
    const hit = agg.find(d => d.last === kb.last && d.first === kb.first);
    if (hit) {
      knownHits.push({
        name: `${kb.last}, ${kb.first}`,
        to_candidate: Math.round(hit.total * 100) / 100,
      });
    }
  }

  return {
    candidate: cand.displayName,
    inputStats: {
      total_raised: Math.round(totals.total * 100) / 100,
      rows: totals.rows,
      unique_donors: totals.unique,
    },
    matches,
    totals: {
      high_conf_match_count: matches.length,
      high_conf_total_to_candidate:
        Math.round(matches.reduce((s, m) => s + m.to_candidate, 0) * 100) / 100,
      combined_career_to_pro_israel: matches.reduce(
        (s, m) => s + m.career_to_pro_israel_pacs,
        0,
      ),
      cross_with_blackburn: matches
        .filter(m => m.also_on_blackburn_tn_gov)
        .map(m => m.name),
      cross_with_rose: matches.filter(m => m.also_on_rose_federal).map(m => m.name),
      known_bundler_hits: knownHits,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Loading 49-year pro-Israel master registry...');
  const { index: master, yearRange, uniqueIndividuals } = loadMaster();
  console.log(
    `  registry: ${yearRange.first}-${yearRange.last} (${yearRange.years} years)  unique individuals: ${uniqueIndividuals}  keys: ${master.size}`,
  );

  console.log('\nLoading cross-identification sets...');
  const blackburnSet = loadBlackburnDonors();
  const roseSet = loadRoseDonors();
  console.log(`  Blackburn TN gov donors: ${blackburnSet.size}`);
  console.log(`  Rose federal donors: ${roseSet.size}`);

  const summaries: Array<{ key: string; result: ReturnType<typeof matchCandidate> }> = [];

  for (const cand of CANDIDATES) {
    console.log(`\n=== ${cand.displayName} (${cand.key}) ===`);
    const res = matchCandidate(cand, master, blackburnSet, roseSet);
    if (!res) continue;

    const payload = {
      source: 'FL DOE campaign-finance contributions portal (2026 GOV)',
      method:
        'high-confidence-only (last + full-first-name + state exact; NFD-normalized, suffix-stripped)',
      registry: {
        years: `${yearRange.first}-${yearRange.last}`,
        year_count: yearRange.years,
        unique_individuals: uniqueIndividuals,
        index_keys: master.size,
      },
      candidate: {
        key: cand.key,
        name: cand.displayName,
        total_raised: res.inputStats.total_raised,
        total_rows: res.inputStats.rows,
        unique_donors: res.inputStats.unique_donors,
      },
      matches: res.matches,
      totals: res.totals,
      cross_candidate_known_bundlers: res.totals.known_bundler_hits,
      generated_at: new Date().toISOString(),
    };
    fs.writeFileSync(cand.output, JSON.stringify(payload, null, 2));
    console.log(`  wrote ${cand.output}`);
    console.log(
      `  matches: ${res.totals.high_conf_match_count}  to-candidate: $${res.totals.high_conf_total_to_candidate.toLocaleString()}  career pro-Israel: $${res.totals.combined_career_to_pro_israel.toLocaleString()}`,
    );
    console.log(`  cross w/ Blackburn TN gov: ${res.totals.cross_with_blackburn.length}`);
    console.log(`  cross w/ Rose federal: ${res.totals.cross_with_rose.length}`);
    if (res.totals.known_bundler_hits.length > 0) {
      console.log('  KNOWN BUNDLER HITS:');
      for (const h of res.totals.known_bundler_hits) {
        console.log(`    ${h.name}  to-candidate $${h.to_candidate.toLocaleString()}`);
      }
    }
    if (res.matches.length > 0) {
      console.log('  Top 5 matches:');
      for (const m of res.matches.slice(0, 5)) {
        console.log(
          `    ${m.name.padEnd(30)} ${m.state}  to $${m.to_candidate
            .toLocaleString()
            .padStart(8)}  career $${m.career_to_pro_israel_pacs.toLocaleString()}`,
        );
      }
    }
    summaries.push({ key: cand.key, result: res });
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY TABLE');
  console.log('='.repeat(70));
  console.log(
    '  Candidate            Total Raised   # Indiv  HC Match  $ to Cand  Career$  X-Blck  X-Rose',
  );
  for (const s of summaries) {
    const r = s.result!;
    console.log(
      `  ${r.candidate.padEnd(20)} $${r.inputStats.total_raised.toLocaleString().padStart(12)}  ${String(r.inputStats.unique_donors).padStart(7)}  ${String(r.totals.high_conf_match_count).padStart(8)}  $${r.totals.high_conf_total_to_candidate.toLocaleString().padStart(8)}  $${r.totals.combined_career_to_pro_israel.toLocaleString().padStart(7)}  ${String(r.totals.cross_with_blackburn.length).padStart(6)}  ${String(r.totals.cross_with_rose.length).padStart(6)}`,
    );
  }
}

main();
