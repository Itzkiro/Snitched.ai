#!/usr/bin/env npx tsx
/**
 * Cross-reference Rep. John Rose's FULL federal House Schedule A individual
 * donor list (C00652743, cycles 2020-2026) against the 49-year pro-Israel
 * individual-donor registry (data/pro-israel-donors-1978.csv ... 2026.csv).
 *
 * Method: HIGH-CONFIDENCE ONLY — last name + full first name + state, exact
 * match after NFD normalization and suffix stripping. No initials-only
 * fallback. This follows the same matcher used by
 * scripts/crossref-rose-tn-gov-pro-israel.ts.
 *
 * Inputs:
 *   - data/pro-israel-donors-YYYY.csv (1978..2026)
 *   - data/rose-federal-individual-donors-aggregated.json
 *     (produced by scripts/fetch-rose-all-cycles-schedule-a.ts)
 *   - data/blackburn-tn-gov-cross-ref-2026.json (cross-ID)
 *   - data/rose-pac-disbursement-audit.json (AIPAC earmarked bundler list)
 *
 * Output: data/rose-federal-49yr-crossref-2026-04-24.json
 *
 * Read-only: does not touch Supabase.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ROSE_AGG_PATH = path.join(DATA_DIR, 'rose-federal-individual-donors-aggregated.json');
const BLACKBURN_CROSSREF_PATH = path.join(DATA_DIR, 'blackburn-tn-gov-cross-ref-2026.json');
const ROSE_PAC_AUDIT_PATH = path.join(DATA_DIR, 'rose-pac-disbursement-audit.json');
const ROSE_TN_GOV_CROSSREF_PATH = path.join(DATA_DIR, 'rose-tn-gov-cross-ref-2026.json');
const INGEST_DIR = path.join(ROOT, 'data-ingestion');
const SC01_FILES = [
  path.join(INGEST_DIR, 'pelbath-fec-2026-itemized.json'),
  path.join(INGEST_DIR, 'smith-fec-2026-itemized.json'),
];
const OUT = path.join(DATA_DIR, 'rose-federal-49yr-crossref-2026-04-24.json');

// ---------------------------------------------------------------------------
// CSV helpers (match crossref-rose-tn-gov-pro-israel.ts)
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

function parseName(raw: string): ParsedName | null {
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

// ---------------------------------------------------------------------------
// Master registry
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

function loadMaster(): {
  index: Map<string, MasterEntry>;
  yearRange: { first: number; last: number; years: number };
  uniqueIndividuals: number;
} {
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
  let uniqueIndividuals = 0;
  const individualNames = new Set<string>();
  for (const f of files) {
    const cycleMatch = f.match(/(\d{4})/);
    if (!cycleMatch) continue;
    const cycle = cycleMatch[1];
    const rows = parseCsv(path.join(DATA_DIR, f));
    for (const r of rows) {
      if (!isIndividualRegistryRow(r)) continue;
      individualNames.add((r.donor_name || '').toUpperCase());
      const p = parseName(r.donor_name);
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
  uniqueIndividuals = individualNames.size;
  return { index: idx, yearRange, uniqueIndividuals };
}

// ---------------------------------------------------------------------------
// Rose aggregated donors
// ---------------------------------------------------------------------------

interface RoseDonor {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total_to_rose: number;
  by_cycle: Record<string, number>;
  contrib_count: number;
}

interface RoseAgg {
  committee_id: string;
  candidate_id: string;
  cycles: number[];
  fetched_at: string;
  totals: {
    total_itemized_receipts: number;
    total_rows: number;
    by_cycle: Record<string, { rows: number; total: number }>;
  };
  donors: RoseDonor[];
}

function loadRoseAgg(): RoseAgg {
  return JSON.parse(fs.readFileSync(ROSE_AGG_PATH, 'utf8')) as RoseAgg;
}

// ---------------------------------------------------------------------------
// Auxiliary data for cross-identification
// ---------------------------------------------------------------------------

interface BlackburnCrossrefMatch {
  name: string;
  state: string;
  to_blackburn?: number;
  to_blackburn_tn_gov?: number;
  pacs?: string[];
  employer?: string;
}

interface BlackburnCrossrefPayload {
  matches: BlackburnCrossrefMatch[];
}

function loadBlackburnDonors(): Set<string> {
  if (!fs.existsSync(BLACKBURN_CROSSREF_PATH)) return new Set();
  const d = JSON.parse(
    fs.readFileSync(BLACKBURN_CROSSREF_PATH, 'utf8'),
  ) as BlackburnCrossrefPayload;
  const s = new Set<string>();
  for (const m of d.matches || []) {
    // m.name is "LAST, FIRST" — parseName handles both comma and space forms
    const p = parseName(m.name || '');
    if (!p || !p.last || !p.first) continue;
    const state = norm(m.state || '');
    s.add(`${p.last}|${p.first}|${state}`);
  }
  return s;
}

interface AipacEarmark {
  name: string; // "FIRST LAST" form (memo)
  total: number;
  cycles: number[];
}

function loadAipacEarmarkBundlers(): Set<string> {
  if (!fs.existsSync(ROSE_PAC_AUDIT_PATH)) return new Set();
  const d = JSON.parse(fs.readFileSync(ROSE_PAC_AUDIT_PATH, 'utf8')) as {
    summary?: { top_earmark_donors?: AipacEarmark[] };
    by_pac?: Record<string, { earmarked_donors?: string[] }>;
  };
  const names = new Set<string>();
  const addFromName = (raw: string): void => {
    const nrm = norm(stripSuffix(raw));
    const toks = nrm.split(/\s+/);
    if (toks.length < 2) return;
    const last = toks[toks.length - 1];
    const first = toks[0];
    names.add(`${last}|${first}`);
  };
  for (const e of d.summary?.top_earmark_donors || []) addFromName(e.name);
  for (const [, pac] of Object.entries(d.by_pac || {})) {
    for (const dn of pac.earmarked_donors || []) addFromName(dn);
  }
  return names;
}

interface Sc01Row {
  contributor_first_name?: string | null;
  contributor_last_name?: string | null;
  contributor_state?: string | null;
}

function loadSc01DonorSet(): Set<string> {
  const out = new Set<string>();
  for (const f of SC01_FILES) {
    if (!fs.existsSync(f)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8')) as
        | { schedule_a_contributions?: Sc01Row[]; individual_rows?: Sc01Row[] }
        | Sc01Row[];
      const rows = Array.isArray(d)
        ? d
        : d.schedule_a_contributions || d.individual_rows || [];
      for (const r of rows) {
        const last = norm(stripSuffix(r.contributor_last_name || ''));
        const first = norm(stripSuffix(r.contributor_first_name || '')).split(
          /\s+/,
        )[0] || '';
        const state = norm(r.contributor_state);
        if (!last || !first) continue;
        out.add(`${last}|${first}|${state}`);
      }
    } catch {
      // ignore malformed files
    }
  }
  return out;
}

function loadTnGovBundlers(): Set<string> {
  if (!fs.existsSync(ROSE_TN_GOV_CROSSREF_PATH)) return new Set();
  const d = JSON.parse(fs.readFileSync(ROSE_TN_GOV_CROSSREF_PATH, 'utf8')) as {
    matches?: Array<{ name: string; state?: string }>;
  };
  const s = new Set<string>();
  for (const m of d.matches || []) {
    const p = parseName(m.name || '');
    if (!p || !p.last || !p.first) continue;
    const state = norm(m.state || '');
    s.add(`${p.last}|${p.first}|${state}`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const FARA_FIRMS =
  /\b(AKIN GUMP|BROWNSTEIN HYATT|BALLARD PARTNERS|BGR GROUP|HOGAN LOVELLS|MERCURY|SIDLEY AUSTIN|SQUIRE PATTON|COVINGTON|DLA PIPER|PILLSBURY|HOLLAND\s*&\s*KNIGHT|ARNOLD\s*&\s*PORTER|VENABLE|GREENBERG TRAURIG|KING\s*&\s*SPALDING|WILEY REIN|ORRICK|NELSON MULLINS|CASSIDY\s*&\s*ASSOCIATES|AKIN\s*GUMP\s*STRAUSS)\b/;

interface OutMatch {
  name: string;
  state: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_rose_all_cycles: number;
  to_rose_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_aipac_earmark_list: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_tn_gov: boolean;
  also_on_sc01_candidates: boolean;
  foreign_money_flag?: string;
}

function run(): void {
  console.log('Loading 49-year pro-Israel master registry...');
  const { index: master, yearRange, uniqueIndividuals } = loadMaster();
  console.log(
    `  registry: ${yearRange.first}-${yearRange.last} (${yearRange.years} years)`,
  );
  console.log(`  unique individuals (by raw donor_name): ${uniqueIndividuals}`);
  console.log(
    `  master index keys (last|first|state): ${master.size}`,
  );

  console.log('\nLoading Rose federal aggregated donors...');
  const agg = loadRoseAgg();
  console.log(`  unique donors: ${agg.donors.length}`);
  console.log(
    `  total itemized: $${agg.totals.total_itemized_receipts.toLocaleString()}`,
  );

  console.log('\nLoading cross-identification sets...');
  const blackburnSet = loadBlackburnDonors();
  const aipacEarmarkSet = loadAipacEarmarkBundlers();
  const sc01Set = loadSc01DonorSet();
  const tnGovSet = loadTnGovBundlers();
  console.log(`  Blackburn TN gov donors: ${blackburnSet.size}`);
  console.log(`  AIPAC earmark bundlers (Rose): ${aipacEarmarkSet.size}`);
  console.log(`  SC-01 (Pelbath/Smith) donor set: ${sc01Set.size}`);
  console.log(`  Rose TN-gov bundler set: ${tnGovSet.size}`);

  console.log('\nMatching HIGH-CONFIDENCE (last + full-first + state)...');
  const matches: OutMatch[] = [];
  for (const d of agg.donors) {
    const key = `${d.last}|${d.first}|${d.state}`;
    const m = master.get(key);
    if (!m) continue;
    const out: OutMatch = {
      name: `${m.last}, ${m.first}`,
      state: m.state,
      employer_last_seen: d.employer || m.employer || '',
      occupation_last_seen: d.occupation || m.occupation || '',
      to_rose_all_cycles: Math.round(d.total_to_rose * 100) / 100,
      to_rose_by_cycle: Object.fromEntries(
        Object.entries(d.by_cycle).map(([c, v]) => [
          c,
          Math.round(v * 100) / 100,
        ]),
      ),
      career_to_pro_israel_pacs: Math.round(m.totalGiven),
      pacs_given_to: Array.from(m.pacs),
      pro_israel_cycles: [...m.cycles].sort(),
      also_on_aipac_earmark_list: aipacEarmarkSet.has(`${d.last}|${d.first}`),
      also_on_blackburn_tn_gov: blackburnSet.has(key),
      also_on_rose_tn_gov: tnGovSet.has(key),
      also_on_sc01_candidates: sc01Set.has(key),
    };
    if (d.employer && FARA_FIRMS.test(d.employer)) {
      out.foreign_money_flag = `${d.employer} is a FARA-registered firm representing foreign sovereigns`;
    }
    matches.push(out);
  }
  matches.sort(
    (a, b) =>
      b.career_to_pro_israel_pacs - a.career_to_pro_israel_pacs ||
      b.to_rose_all_cycles - a.to_rose_all_cycles,
  );

  const toRoseSum =
    Math.round(matches.reduce((s, m) => s + m.to_rose_all_cycles, 0) * 100) /
    100;
  const careerSum = matches.reduce(
    (s, m) => s + m.career_to_pro_israel_pacs,
    0,
  );
  const cycle2026Signal =
    Math.round(
      matches.reduce((s, m) => s + (m.to_rose_by_cycle['2026'] || 0), 0) * 100,
    ) / 100;
  const historicalSignal = Math.round((toRoseSum - cycle2026Signal) * 100) / 100;

  const crossBlackburn = matches
    .filter(m => m.also_on_blackburn_tn_gov)
    .map(m => m.name);
  const crossAipac = matches
    .filter(m => m.also_on_aipac_earmark_list)
    .map(m => m.name);
  const crossSc01 = matches
    .filter(m => m.also_on_sc01_candidates)
    .map(m => m.name);
  const crossRoseTnGov = matches
    .filter(m => m.also_on_rose_tn_gov)
    .map(m => m.name);

  const out = {
    source: 'FEC Schedule A all cycles 2020-2026 for C00652743 (John Rose)',
    method:
      'high-confidence-only (last + full-first-name + state exact; NFD-normalized, suffix-stripped)',
    registry: {
      years: `${yearRange.first}-${yearRange.last}`,
      year_count: yearRange.years,
      unique_individuals: uniqueIndividuals,
      index_keys: master.size,
    },
    rose_donor_universe: {
      committee_id: agg.committee_id,
      candidate_id: agg.candidate_id,
      unique_donors: agg.donors.length,
      total_itemized_receipts: agg.totals.total_itemized_receipts,
      cycles: agg.cycles,
      by_cycle: agg.totals.by_cycle,
    },
    matches,
    totals: {
      high_conf_match_count: matches.length,
      high_conf_total_to_rose: toRoseSum,
      combined_career_to_pro_israel: careerSum,
      cycle_2026_live_signal: cycle2026Signal,
      historical_cycles_signal: historicalSignal,
      cross_identified_with_blackburn_tn_gov: crossBlackburn,
      cross_identified_with_aipac_earmark_bundlers: crossAipac,
      cross_identified_with_sc01_candidates: crossSc01,
      cross_identified_with_rose_tn_gov: crossRoseTnGov,
    },
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`  match_count:                   ${matches.length}`);
  console.log(`  total to Rose from matches:    $${toRoseSum.toLocaleString()}`);
  console.log(
    `    of which 2026 live signal:   $${cycle2026Signal.toLocaleString()}`,
  );
  console.log(
    `    of which historical signal:  $${historicalSignal.toLocaleString()}`,
  );
  console.log(
    `  combined career pro-Israel:    $${careerSum.toLocaleString()}`,
  );
  console.log(
    `  overlap w/ AIPAC earmark list: ${crossAipac.length}`,
  );
  console.log(`  overlap w/ Blackburn TN gov:   ${crossBlackburn.length}`);
  console.log(`  overlap w/ Rose TN gov:        ${crossRoseTnGov.length}`);
  console.log(`  overlap w/ SC-01 candidates:   ${crossSc01.length}`);
  console.log(`\nTop 15 matches:`);
  for (const m of matches.slice(0, 15)) {
    console.log(
      `  ${m.name.padEnd(30)} ${m.state}  to-Rose $${m.to_rose_all_cycles
        .toLocaleString()
        .padStart(8)}  career $${m.career_to_pro_israel_pacs.toLocaleString()}  [${m.pacs_given_to
        .slice(0, 2)
        .join(', ')}]`,
    );
  }
}

run();
