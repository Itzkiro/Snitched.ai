#!/usr/bin/env npx tsx
/**
 * Cross-reference Ed Gallrein's (R-KY-04 challenger to Massie) FEC 2026
 * itemized individual donor list against the 49-year pro-Israel individual-
 * donor registry (data/pro-israel-donors-1978.csv ... 2026.csv).
 *
 * Method: HIGH-CONFIDENCE ONLY — last name + full first name + state, exact
 * match after NFD normalization and suffix stripping. Mirrors
 * scripts/crossref-rose-federal-49yr-pro-israel.ts.
 *
 * Inputs:
 *   - data/pro-israel-donors-YYYY.csv (1978..2026)
 *   - data-ingestion/gallrein-fec-2026-itemized.json (raw FEC itemized rows)
 *   - data/donalds-federal-49yr-crossref-2026-04-24.json   (cross-ID)
 *   - data/blackburn-tn-gov-cross-ref-2026.json           (cross-ID)
 *   - data/rose-federal-49yr-crossref-2026-04-24.json     (cross-ID)
 *   - data/mills-federal-49yr-crossref-2026-04-24.json    (cross-ID)
 *   - data/gallrein-pac-disbursement-audit.json           (AIPAC earmark)
 *
 * Output: data/gallrein-49yr-crossref-2026-04-27.json
 *
 * Read-only: does not touch Supabase.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const INGEST_DIR = path.join(ROOT, 'data-ingestion');
const GALLREIN_ITEMIZED_PATH = path.join(
  INGEST_DIR,
  'gallrein-fec-2026-itemized.json',
);
const PAC_AUDIT_PATH = path.join(DATA_DIR, 'gallrein-pac-disbursement-audit.json');
const DONALDS_CROSSREF_PATH = path.join(
  DATA_DIR,
  'donalds-federal-49yr-crossref-2026-04-24.json',
);
const BLACKBURN_CROSSREF_PATH = path.join(
  DATA_DIR,
  'blackburn-tn-gov-cross-ref-2026.json',
);
const ROSE_CROSSREF_PATH = path.join(
  DATA_DIR,
  'rose-federal-49yr-crossref-2026-04-24.json',
);
const MILLS_CROSSREF_PATH = path.join(
  DATA_DIR,
  'mills-federal-49yr-crossref-2026-04-24.json',
);
const OUT = path.join(DATA_DIR, 'gallrein-49yr-crossref-2026-04-27.json');

// ---------------------------------------------------------------------------
// CSV helpers (same as crossref-rose-federal-49yr-pro-israel.ts)
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
  return { index: idx, yearRange, uniqueIndividuals: individualNames.size };
}

// ---------------------------------------------------------------------------
// Gallrein donor universe — aggregate raw FEC itemized rows
// ---------------------------------------------------------------------------

interface ItemizedRow {
  entity_type?: string | null;
  contributor_first_name?: string | null;
  contributor_last_name?: string | null;
  contributor_state?: string | null;
  contributor_city?: string | null;
  contributor_employer?: string | null;
  contributor_occupation?: string | null;
  contribution_receipt_amount?: number | null;
  contribution_receipt_date?: string | null;
  two_year_transaction_period?: number | null;
  contributor_name?: string | null;
}

interface Donor {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total_to_candidate: number;
  by_cycle: Record<string, number>;
  contrib_count: number;
}

function loadGallreinItemized(): {
  donors: Donor[];
  total_itemized_individual_receipts: number;
  total_individual_rows: number;
  by_cycle: Record<string, { rows: number; total: number }>;
} {
  const raw = JSON.parse(fs.readFileSync(GALLREIN_ITEMIZED_PATH, 'utf8')) as ItemizedRow[];
  const byKey = new Map<string, Donor>();
  let totalRows = 0;
  let totalAmt = 0;
  const byCycle: Record<string, { rows: number; total: number }> = {};

  for (const r of raw) {
    if ((r.entity_type || '').toUpperCase() !== 'IND') continue;
    const last = norm(stripSuffix(r.contributor_last_name || ''));
    const firstFull = norm(stripSuffix(r.contributor_first_name || ''));
    const first = firstFull.split(/\s+/)[0] || '';
    const state = norm(r.contributor_state);
    const amt = Number(r.contribution_receipt_amount) || 0;
    const cycle = String(r.two_year_transaction_period || '2026');
    if (!last || !first) continue;
    totalRows++;
    totalAmt += amt;
    if (!byCycle[cycle]) byCycle[cycle] = { rows: 0, total: 0 };
    byCycle[cycle].rows++;
    byCycle[cycle].total += amt;
    const key = `${last}|${first}|${state}`;
    let cur = byKey.get(key);
    if (!cur) {
      cur = {
        last,
        first,
        state,
        city: norm(r.contributor_city),
        employer: norm(r.contributor_employer),
        occupation: norm(r.contributor_occupation),
        total_to_candidate: 0,
        by_cycle: {},
        contrib_count: 0,
      };
      byKey.set(key, cur);
    }
    cur.total_to_candidate += amt;
    cur.by_cycle[cycle] = (cur.by_cycle[cycle] || 0) + amt;
    cur.contrib_count += 1;
    if (!cur.employer && r.contributor_employer)
      cur.employer = norm(r.contributor_employer);
    if (!cur.occupation && r.contributor_occupation)
      cur.occupation = norm(r.contributor_occupation);
  }

  const donors = [...byKey.values()].sort(
    (a, b) => b.total_to_candidate - a.total_to_candidate,
  );
  return {
    donors,
    total_itemized_individual_receipts: Math.round(totalAmt * 100) / 100,
    total_individual_rows: totalRows,
    by_cycle: byCycle,
  };
}

// ---------------------------------------------------------------------------
// Auxiliary data for cross-identification
// ---------------------------------------------------------------------------

function loadCrossrefDonorKeys(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  const d = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
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

interface AipacEarmark {
  name: string;
  total: number;
}

function loadAipacEarmarkBundlers(): Set<string> {
  if (!fs.existsSync(PAC_AUDIT_PATH)) return new Set();
  const d = JSON.parse(fs.readFileSync(PAC_AUDIT_PATH, 'utf8')) as {
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

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const FARA_FIRMS =
  /\b(AKIN GUMP|BROWNSTEIN HYATT|BALLARD PARTNERS|BGR GROUP|HOGAN LOVELLS|MERCURY|SIDLEY AUSTIN|SQUIRE PATTON|COVINGTON|DLA PIPER|PILLSBURY|HOLLAND\s*&\s*KNIGHT|ARNOLD\s*&\s*PORTER|VENABLE|GREENBERG TRAURIG|KING\s*&\s*SPALDING|WILEY REIN|ORRICK|NELSON MULLINS|CASSIDY\s*&\s*ASSOCIATES|AKIN\s*GUMP\s*STRAUSS)\b/;

interface OutMatch {
  name: string;
  state: string;
  city: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_candidate_all_cycles: number;
  to_candidate_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_aipac_earmark_list: boolean;
  also_on_donalds_2026: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_federal: boolean;
  also_on_mills_federal: boolean;
  foreign_money_flag?: string;
}

function run(): void {
  console.log('Loading 49-year pro-Israel master registry...');
  const { index: master, yearRange, uniqueIndividuals } = loadMaster();
  console.log(
    `  registry: ${yearRange.first}-${yearRange.last} (${yearRange.years} years)`,
  );
  console.log(`  unique individuals (raw donor_name): ${uniqueIndividuals}`);
  console.log(`  master index keys (last|first|state): ${master.size}`);

  console.log('\nLoading Gallrein FEC 2026 itemized donors...');
  const agg = loadGallreinItemized();
  console.log(`  unique donors: ${agg.donors.length}`);
  console.log(`  itemized individual rows: ${agg.total_individual_rows}`);
  console.log(
    `  total individual receipts: $${agg.total_itemized_individual_receipts.toLocaleString()}`,
  );

  console.log('\nLoading cross-identification sets...');
  const aipacEarmarkSet = loadAipacEarmarkBundlers();
  const donaldsSet = loadCrossrefDonorKeys(DONALDS_CROSSREF_PATH);
  const blackburnSet = loadCrossrefDonorKeys(BLACKBURN_CROSSREF_PATH);
  const roseSet = loadCrossrefDonorKeys(ROSE_CROSSREF_PATH);
  const millsSet = loadCrossrefDonorKeys(MILLS_CROSSREF_PATH);
  console.log(`  AIPAC earmark bundlers (Gallrein PAC audit): ${aipacEarmarkSet.size}`);
  console.log(`  Donalds 49-yr crossref:   ${donaldsSet.size}`);
  console.log(`  Blackburn TN gov:         ${blackburnSet.size}`);
  console.log(`  Rose 49-yr crossref:      ${roseSet.size}`);
  console.log(`  Mills 49-yr crossref:     ${millsSet.size}`);

  console.log('\nMatching HIGH-CONFIDENCE (last + full-first + state)...');
  const matches: OutMatch[] = [];
  for (const d of agg.donors) {
    const key = `${d.last}|${d.first}|${d.state}`;
    const m = master.get(key);
    if (!m) continue;
    const out: OutMatch = {
      name: `${m.last}, ${m.first}`,
      state: m.state,
      city: d.city || m.city || '',
      employer_last_seen: d.employer || m.employer || '',
      occupation_last_seen: d.occupation || m.occupation || '',
      to_candidate_all_cycles: Math.round(d.total_to_candidate * 100) / 100,
      to_candidate_by_cycle: Object.fromEntries(
        Object.entries(d.by_cycle).map(([c, v]) => [
          c,
          Math.round(v * 100) / 100,
        ]),
      ),
      career_to_pro_israel_pacs: Math.round(m.totalGiven),
      pacs_given_to: Array.from(m.pacs),
      pro_israel_cycles: [...m.cycles].sort(),
      also_on_aipac_earmark_list: aipacEarmarkSet.has(`${d.last}|${d.first}`),
      also_on_donalds_2026: donaldsSet.has(key),
      also_on_blackburn_tn_gov: blackburnSet.has(key),
      also_on_rose_federal: roseSet.has(key),
      also_on_mills_federal: millsSet.has(key),
    };
    if (d.employer && FARA_FIRMS.test(d.employer)) {
      out.foreign_money_flag = `${d.employer} is a FARA-registered firm representing foreign sovereigns`;
    }
    matches.push(out);
  }
  matches.sort(
    (a, b) =>
      b.career_to_pro_israel_pacs - a.career_to_pro_israel_pacs ||
      b.to_candidate_all_cycles - a.to_candidate_all_cycles,
  );

  const toCandSum =
    Math.round(matches.reduce((s, m) => s + m.to_candidate_all_cycles, 0) * 100) /
    100;
  const careerSum = matches.reduce(
    (s, m) => s + m.career_to_pro_israel_pacs,
    0,
  );
  const cycle2026Signal =
    Math.round(
      matches.reduce((s, m) => s + (m.to_candidate_by_cycle['2026'] || 0), 0) *
        100,
    ) / 100;

  const matchRatePct =
    Math.round(
      (matches.length / Math.max(1, agg.donors.length)) * 1000,
    ) / 10;

  const crossDonalds = matches
    .filter(m => m.also_on_donalds_2026)
    .map(m => m.name);
  const crossBlackburn = matches
    .filter(m => m.also_on_blackburn_tn_gov)
    .map(m => m.name);
  const crossRose = matches.filter(m => m.also_on_rose_federal).map(m => m.name);
  const crossMills = matches.filter(m => m.also_on_mills_federal).map(m => m.name);
  const crossAipac = matches
    .filter(m => m.also_on_aipac_earmark_list)
    .map(m => m.name);

  // Sam Olswanger (Akin Gump FARA firm) probe
  const olswanger = matches.find(m => /OLSWANGER/.test(m.name)) || null;

  const out = {
    source:
      'FEC Schedule A 2026-cycle itemized for C00923995 (GALLREIN FOR CONGRESS, candidate H6KY04171)',
    method:
      'high-confidence-only (last + full-first-name + state exact; NFD-normalized, suffix-stripped)',
    registry: {
      years: `${yearRange.first}-${yearRange.last}`,
      year_count: yearRange.years,
      unique_individuals: uniqueIndividuals,
      index_keys: master.size,
    },
    candidate_donor_universe: {
      committee_id: 'C00923995',
      candidate_id: 'H6KY04171',
      unique_donors: agg.donors.length,
      total_itemized_individual_rows: agg.total_individual_rows,
      total_itemized_individual_receipts: agg.total_itemized_individual_receipts,
      by_cycle: agg.by_cycle,
    },
    matches,
    totals: {
      high_conf_match_count: matches.length,
      match_rate_pct_of_unique_donors: matchRatePct,
      high_conf_total_to_candidate: toCandSum,
      cycle_2026_live_signal: cycle2026Signal,
      combined_career_to_pro_israel: careerSum,
      cross_identified_with_aipac_earmark_bundlers: crossAipac,
      cross_identified_with_donalds_2026: crossDonalds,
      cross_identified_with_blackburn_tn_gov: crossBlackburn,
      cross_identified_with_rose_federal: crossRose,
      cross_identified_with_mills_federal: crossMills,
      olswanger_present: !!olswanger,
      olswanger_detail: olswanger || null,
    },
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`  match_count:                   ${matches.length}`);
  console.log(`  match_rate_pct of unique donors: ${matchRatePct}%`);
  console.log(`  total to Gallrein from matches:  $${toCandSum.toLocaleString()}`);
  console.log(`    of which 2026 live signal:   $${cycle2026Signal.toLocaleString()}`);
  console.log(`  combined career pro-Israel:    $${careerSum.toLocaleString()}`);
  console.log(`  overlap w/ AIPAC earmark list: ${crossAipac.length}`);
  console.log(`  overlap w/ Donalds:            ${crossDonalds.length}`);
  console.log(`  overlap w/ Blackburn TN gov:   ${crossBlackburn.length}`);
  console.log(`  overlap w/ Rose federal:       ${crossRose.length}`);
  console.log(`  overlap w/ Mills federal:      ${crossMills.length}`);
  console.log(`  Olswanger (Akin Gump) present: ${!!olswanger}`);
  if (olswanger) {
    console.log(
      `    ${olswanger.name} ${olswanger.state}  to-Gallrein $${olswanger.to_candidate_all_cycles}  career $${olswanger.career_to_pro_israel_pacs.toLocaleString()}  employer=${olswanger.employer_last_seen}`,
    );
  }
  console.log(`\nTop 15 matches:`);
  for (const m of matches.slice(0, 15)) {
    console.log(
      `  ${m.name.padEnd(30)} ${m.state}  to-Gall $${m.to_candidate_all_cycles
        .toLocaleString()
        .padStart(8)}  career $${m.career_to_pro_israel_pacs.toLocaleString()}  [${m.pacs_given_to
        .slice(0, 2)
        .join(', ')}]`,
    );
  }
}

run();
