#!/usr/bin/env npx tsx
/**
 * Cross-reference each FL-07 (US House) 2026 candidate's federal Schedule A
 * individual donors against the 49-year pro-Israel individual-donor registry
 * (data/pro-israel-donors-YYYY.csv) plus prior audit artifacts:
 *   - Donalds federal 49yr (data/donalds-federal-49yr-crossref-2026-04-24.json)
 *   - Donalds AIPAC earmarks (data/donalds-pac-disbursement-audit.json)
 *   - Blackburn TN gov (data/blackburn-tn-gov-cross-ref-2026.json)
 *   - Rose federal 49yr (data/rose-federal-49yr-crossref-2026-04-24.json)
 *   - Rose AIPAC earmarks (data/rose-pac-disbursement-audit.json)
 *
 * HIGH-CONFIDENCE only: last + full first + state exact (NFD-normalized,
 * suffix-stripped).
 *
 * Output (per candidate):
 *   data/<slug>-federal-49yr-crossref-2026-04-24.json
 *
 * Also surfaces a fixed list of named-interest donors from the task brief
 * (Olswanger, Uihlein, Singer, Loeb, Mizel, Zalik, Adler, Abramowitz).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

interface CandSpec {
  slug: string;
  agg_filename: string;
  crossref_out_filename: string;
}

const CANDS: CandSpec[] = [
  {
    slug: 'mills',
    agg_filename: 'mills-federal-individual-donors-aggregated.json',
    crossref_out_filename: 'mills-federal-49yr-crossref-2026-04-24.json',
  },
  {
    slug: 'kinter',
    agg_filename: 'kinter-federal-individual-donors-aggregated.json',
    crossref_out_filename: 'kinter-federal-49yr-crossref-2026-04-24.json',
  },
  {
    slug: 'johnson-fl07',
    agg_filename: 'johnson-fl07-federal-individual-donors-aggregated.json',
    crossref_out_filename: 'johnson-fl07-federal-49yr-crossref-2026-04-24.json',
  },
  {
    slug: 'ulrich-fl07',
    agg_filename: 'ulrich-fl07-federal-individual-donors-aggregated.json',
    crossref_out_filename: 'ulrich-fl07-federal-49yr-crossref-2026-04-24.json',
  },
];

const BLACKBURN_PATH = path.join(DATA_DIR, 'blackburn-tn-gov-cross-ref-2026.json');
const DONALDS_49YR_PATH = path.join(DATA_DIR, 'donalds-federal-49yr-crossref-2026-04-24.json');
const ROSE_49YR_PATH = path.join(DATA_DIR, 'rose-federal-49yr-crossref-2026-04-24.json');
const DONALDS_PAC_PATH = path.join(DATA_DIR, 'donalds-pac-disbursement-audit.json');
const ROSE_PAC_PATH = path.join(DATA_DIR, 'rose-pac-disbursement-audit.json');

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

interface CandDonor {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total_to_candidate: number;
  by_cycle: Record<string, number>;
  by_committee: Record<string, number>;
  contrib_count: number;
}

interface CandAgg {
  committee_ids: string[];
  candidate_id: string;
  cycles: number[];
  fetched_at: string;
  totals: {
    total_itemized_receipts: number;
    total_rows: number;
    by_cycle: Record<string, { rows: number; total: number }>;
  };
  donors: CandDonor[];
}

interface CrossrefMatch {
  name: string;
  state: string;
  employer?: string;
}

interface CrossrefPayload {
  matches: CrossrefMatch[];
}

function loadDonorKeySet(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  const d = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CrossrefPayload;
  const s = new Set<string>();
  for (const m of d.matches || []) {
    const p = parseName(m.name || '');
    if (!p || !p.last || !p.first) continue;
    const state = norm(m.state || '');
    s.add(`${p.last}|${p.first}|${state}`);
  }
  return s;
}

function loadAipacEarmarkBundlers(auditPath: string): Set<string> {
  if (!fs.existsSync(auditPath)) return new Set();
  const d = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as {
    summary?: { top_earmark_donors?: Array<{ name: string }> };
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

const FARA_FIRMS =
  /\b(AKIN GUMP|BROWNSTEIN HYATT|BALLARD PARTNERS|BGR GROUP|HOGAN LOVELLS|MERCURY|SIDLEY AUSTIN|SQUIRE PATTON|COVINGTON|DLA PIPER|PILLSBURY|HOLLAND\s*&\s*KNIGHT|ARNOLD\s*&\s*PORTER|VENABLE|GREENBERG TRAURIG|KING\s*&\s*SPALDING|WILEY REIN|ORRICK|NELSON MULLINS|CASSIDY\s*&\s*ASSOCIATES|AKIN\s*GUMP\s*STRAUSS)\b/;

// Named donors from task brief
const NAMED_INTEREST: Array<{ last: string; first: string; note?: string }> = [
  { last: 'OLSWANGER', first: 'SAM', note: 'Akin Gump FARA, DC' },
  { last: 'UIHLEIN', first: 'RICHARD' },
  { last: 'UIHLEIN', first: 'ELIZABETH' },
  { last: 'SINGER', first: 'PAUL' },
  { last: 'LOEB', first: 'DANIEL' },
  { last: 'MIZEL', first: 'LARRY' },
  { last: 'MIZEL', first: 'LAWRENCE' },
  { last: 'ZALIK', first: 'DAVID' },
  { last: 'ADLER', first: 'ROY' },
  { last: 'ABRAMOWITZ', first: 'BARBARA' },
  { last: 'ABRAMOWITZ', first: 'MARTIN' },
  { last: 'ABRAMOWITZ', first: 'MORTON' },
];

interface OutMatch {
  name: string;
  state: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_candidate_all_cycles: number;
  to_candidate_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_rose_aipac_earmark_list: boolean;
  also_on_donalds_aipac_earmark_list: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_federal_49yr: boolean;
  also_on_donalds_federal_49yr: boolean;
  foreign_money_flag?: string;
}

function runOne(
  cand: CandSpec,
  master: Map<string, MasterEntry>,
  yearRange: { first: number; last: number; years: number },
  uniqueIndividuals: number,
  blackburnSet: Set<string>,
  roseFederalSet: Set<string>,
  donaldsFederalSet: Set<string>,
  roseAipacBundlers: Set<string>,
  donaldsAipacBundlers: Set<string>,
): void {
  const aggPath = path.join(DATA_DIR, cand.agg_filename);
  if (!fs.existsSync(aggPath)) {
    console.log(`\n[${cand.slug}] SKIP — agg file not found at ${aggPath}`);
    return;
  }
  const agg = JSON.parse(fs.readFileSync(aggPath, 'utf8')) as CandAgg;
  console.log(`\n[${cand.slug}] universe: ${agg.donors.length} unique donors / $${agg.totals.total_itemized_receipts.toLocaleString()}`);

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
      to_candidate_all_cycles: Math.round(d.total_to_candidate * 100) / 100,
      to_candidate_by_cycle: Object.fromEntries(
        Object.entries(d.by_cycle).map(([c, v]) => [c, Math.round(v * 100) / 100]),
      ),
      career_to_pro_israel_pacs: Math.round(m.totalGiven),
      pacs_given_to: Array.from(m.pacs),
      pro_israel_cycles: [...m.cycles].sort(),
      also_on_rose_aipac_earmark_list: roseAipacBundlers.has(`${d.last}|${d.first}`),
      also_on_donalds_aipac_earmark_list: donaldsAipacBundlers.has(`${d.last}|${d.first}`),
      also_on_blackburn_tn_gov: blackburnSet.has(key),
      also_on_rose_federal_49yr: roseFederalSet.has(key),
      also_on_donalds_federal_49yr: donaldsFederalSet.has(key),
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
    Math.round(matches.reduce((s, m) => s + m.to_candidate_all_cycles, 0) * 100) / 100;
  const careerSum = matches.reduce((s, m) => s + m.career_to_pro_israel_pacs, 0);
  const cycle2026Signal =
    Math.round(
      matches.reduce((s, m) => s + (m.to_candidate_by_cycle['2026'] || 0), 0) * 100,
    ) / 100;
  const cycle2024Signal =
    Math.round(
      matches.reduce((s, m) => s + (m.to_candidate_by_cycle['2024'] || 0), 0) * 100,
    ) / 100;
  const cycle2022Signal =
    Math.round(
      matches.reduce((s, m) => s + (m.to_candidate_by_cycle['2022'] || 0), 0) * 100,
    ) / 100;

  const namedInterestHits: Array<{
    name: string;
    note?: string;
    candidate_total: number;
    state: string;
    in_master: boolean;
  }> = [];
  for (const ni of NAMED_INTEREST) {
    const candHits = agg.donors.filter(d => d.last === ni.last && d.first === ni.first);
    if (candHits.length === 0) {
      continue; // miss — skip in output for brevity
    }
    for (const d of candHits) {
      const key = `${d.last}|${d.first}|${d.state}`;
      namedInterestHits.push({
        name: `${ni.first} ${ni.last}`,
        note: ni.note,
        candidate_total: Math.round(d.total_to_candidate * 100) / 100,
        state: d.state,
        in_master: master.has(key),
      });
    }
  }

  const crossBlackburn = matches.filter(m => m.also_on_blackburn_tn_gov).map(m => m.name);
  const crossRoseFederal = matches.filter(m => m.also_on_rose_federal_49yr).map(m => m.name);
  const crossRoseAipac = matches.filter(m => m.also_on_rose_aipac_earmark_list).map(m => m.name);
  const crossDonaldsFederal = matches.filter(m => m.also_on_donalds_federal_49yr).map(m => m.name);
  const crossDonaldsAipac = matches.filter(m => m.also_on_donalds_aipac_earmark_list).map(m => m.name);

  const out = {
    source: `FEC Schedule A all cycles for ${cand.slug} (${agg.committee_ids.join(',')})`,
    method:
      'high-confidence-only (last + full-first-name + state exact; NFD-normalized, suffix-stripped)',
    registry: {
      years: `${yearRange.first}-${yearRange.last}`,
      year_count: yearRange.years,
      unique_individuals: uniqueIndividuals,
      index_keys: master.size,
    },
    candidate_donor_universe: {
      committee_ids: agg.committee_ids,
      candidate_id: agg.candidate_id,
      unique_donors: agg.donors.length,
      total_itemized_receipts: agg.totals.total_itemized_receipts,
      cycles: agg.cycles,
      by_cycle: agg.totals.by_cycle,
    },
    matches,
    named_interest_hits: namedInterestHits,
    totals: {
      high_conf_match_count: matches.length,
      high_conf_total_to_candidate: toCandSum,
      combined_career_to_pro_israel: careerSum,
      cycle_2026_live_signal: cycle2026Signal,
      cycle_2024_live_signal: cycle2024Signal,
      cycle_2022_live_signal: cycle2022Signal,
      cross_identified_with_blackburn_tn_gov: crossBlackburn,
      cross_identified_with_rose_federal_49yr: crossRoseFederal,
      cross_identified_with_rose_aipac_earmark: crossRoseAipac,
      cross_identified_with_donalds_federal_49yr: crossDonaldsFederal,
      cross_identified_with_donalds_aipac_earmark: crossDonaldsAipac,
    },
    generated_at: new Date().toISOString(),
  };

  const outPath = path.join(DATA_DIR, cand.crossref_out_filename);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[${cand.slug}] wrote ${outPath}`);
  console.log(`  HC matches: ${matches.length}  to-candidate $${toCandSum.toLocaleString()}  career $${careerSum.toLocaleString()}  2026=$${cycle2026Signal.toLocaleString()}`);
  console.log(`  overlap: blackburn=${crossBlackburn.length} rose49yr=${crossRoseFederal.length} roseAipac=${crossRoseAipac.length} donalds49yr=${crossDonaldsFederal.length} donaldsAipac=${crossDonaldsAipac.length}`);
  if (namedInterestHits.length) {
    console.log(`  named-interest HITS:`);
    for (const n of namedInterestHits) {
      console.log(`    ${n.name.padEnd(25)} ${n.state}  $${n.candidate_total.toLocaleString()}  master=${n.in_master}  ${n.note || ''}`);
    }
  }
}

function run(): void {
  console.log('Loading 49-year pro-Israel master registry...');
  const { index: master, yearRange, uniqueIndividuals } = loadMaster();
  console.log(`  registry: ${yearRange.first}-${yearRange.last} (${yearRange.years} years)`);
  console.log(`  unique individuals: ${uniqueIndividuals}, master keys: ${master.size}`);

  console.log('\nLoading prior audit cross-identification sets...');
  const blackburnSet = loadDonorKeySet(BLACKBURN_PATH);
  const roseFederalSet = loadDonorKeySet(ROSE_49YR_PATH);
  const donaldsFederalSet = loadDonorKeySet(DONALDS_49YR_PATH);
  const roseAipacBundlers = loadAipacEarmarkBundlers(ROSE_PAC_PATH);
  const donaldsAipacBundlers = loadAipacEarmarkBundlers(DONALDS_PAC_PATH);
  console.log(`  blackburn=${blackburnSet.size} rose49yr=${roseFederalSet.size} donalds49yr=${donaldsFederalSet.size} roseAipac=${roseAipacBundlers.size} donaldsAipac=${donaldsAipacBundlers.size}`);

  const onlySlug = process.argv[2];
  for (const cand of CANDS) {
    if (onlySlug && cand.slug !== onlySlug) continue;
    runOne(
      cand,
      master,
      yearRange,
      uniqueIndividuals,
      blackburnSet,
      roseFederalSet,
      donaldsFederalSet,
      roseAipacBundlers,
      donaldsAipacBundlers,
    );
  }
}

run();
