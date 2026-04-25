#!/usr/bin/env npx tsx
/**
 * Cross-reference John Rose's TN gubernatorial individual donor list against
 * the 33,719-key pro-Israel individual-donor registry
 * (data/pro-israel-donors-YYYY.csv, 2016–2026).
 *
 * Method: HIGH-CONFIDENCE ONLY — exact match on (last name, full first name,
 * state). Drops initials-only and no-state fallbacks used in some other
 * cross-refs; matches the schema of data/blackburn-tn-gov-cross-ref-2026.json.
 *
 * Inputs:
 *   - data/pro-israel-donors-2016.csv ... 2026.csv   (master registry)
 *   - data-ingestion/tn-ref-rose-gov-2026-itemized.json
 *
 * Output: data/rose-tn-gov-cross-ref-2026.json
 *
 * Read-only: does not touch Supabase.
 */
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const ROSE_ITEMIZED = path.join(
  __dirname,
  '..',
  'data-ingestion',
  'tn-ref-rose-gov-2026-itemized.json',
);
const OUT = path.join(__dirname, '..', 'data', 'rose-tn-gov-cross-ref-2026.json');

// ---------------------------------------------------------------------------
// CSV helpers
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

function norm(s: string): string {
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
  first: string; // full first name (first token after comma or second token)
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

// ---------------------------------------------------------------------------
// Is-individual heuristic for master registry rows
// ---------------------------------------------------------------------------

const ORG_WORDS =
  /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;

function isIndividualRegistryRow(r: Record<string, string>): boolean {
  const nameUpper = (r.donor_name || '').toUpperCase();
  if (!/^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/.test(nameUpper)) return false;
  if (ORG_WORDS.test(nameUpper)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Build master pro-Israel individual index keyed by (last|FULL_FIRST|state)
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

function loadMaster(): Map<string, MasterEntry> {
  const idx = new Map<string, MasterEntry>();
  const files = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f));
  for (const f of files) {
    const cycleMatch = f.match(/(\d{4})/);
    if (!cycleMatch) continue;
    const cycle = cycleMatch[1];
    const rows = parseCsv(path.join(DATA_DIR, f));
    for (const r of rows) {
      if (!isIndividualRegistryRow(r)) continue;
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
  return idx;
}

// ---------------------------------------------------------------------------
// Load Rose individuals
// ---------------------------------------------------------------------------

interface Contribution {
  contributor_first_name: string;
  contributor_last_name: string;
  contributor_state: string;
  contributor_city: string;
  contributor_employer: string;
  contributor_occupation: string;
  entity_type: string;
  contribution_receipt_amount: number;
}

interface RoseItemized {
  schedule_a_contributions: Contribution[];
}

interface AggregatedDonor {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  totalToRose: number;
  contribCount: number;
}

function loadRoseDonors(): { individuals: AggregatedDonor[]; totalRows: number; totalRaised: number } {
  const raw = JSON.parse(fs.readFileSync(ROSE_ITEMIZED, 'utf8')) as RoseItemized;
  const byKey = new Map<string, AggregatedDonor>();
  let totalRows = 0;
  let totalRaised = 0;
  for (const c of raw.schedule_a_contributions) {
    if (c.entity_type !== 'IND') continue;
    if (!c.contributor_last_name || !c.contributor_first_name) continue;
    const last = norm(stripSuffix(c.contributor_last_name));
    const first = norm(stripSuffix(c.contributor_first_name)).split(/\s+/)[0] || '';
    const state = norm(c.contributor_state);
    if (!last || !first) continue;
    totalRows += 1;
    totalRaised += c.contribution_receipt_amount;
    const key = `${last}|${first}|${state}`;
    let cur = byKey.get(key);
    if (!cur) {
      cur = {
        last,
        first,
        state,
        city: norm(c.contributor_city),
        employer: norm(c.contributor_employer),
        occupation: norm(c.contributor_occupation),
        totalToRose: 0,
        contribCount: 0,
      };
      byKey.set(key, cur);
    }
    cur.totalToRose += c.contribution_receipt_amount;
    cur.contribCount += 1;
    if (!cur.employer && c.contributor_employer) cur.employer = norm(c.contributor_employer);
    if (!cur.occupation && c.contributor_occupation) cur.occupation = norm(c.contributor_occupation);
  }
  return { individuals: Array.from(byKey.values()), totalRows, totalRaised };
}

// ---------------------------------------------------------------------------
// High-confidence match: last + full first + state exact
// ---------------------------------------------------------------------------

interface OutMatch {
  name: string;
  state: string;
  to_rose: number;
  career_to_pro_israel_pacs: number;
  employer?: string;
  occupation?: string;
  pacs: string[];
  foreign_money_flag?: string;
}

const FARA_FIRMS =
  /\b(AKIN GUMP|BROWNSTEIN HYATT|BALLARD PARTNERS|BGR GROUP|HOGAN LOVELLS|MERCURY|SIDLEY AUSTIN|SQUIRE PATTON|COVINGTON|DLA PIPER|PILLSBURY|HOLLAND\s*&\s*KNIGHT|ARNOLD\s*&\s*PORTER|VENABLE|GREENBERG TRAURIG|KING\s*&\s*SPALDING|WILEY REIN|ORRICK|NELSON MULLINS|CASSIDY\s*&\s*ASSOCIATES|AKIN\s*GUMP\s*STRAUSS)\b/;

function run(): void {
  console.log('Loading pro-Israel master registry...');
  const master = loadMaster();
  console.log(`  master index: ${master.size} unique (last|first|state) keys`);

  console.log('Loading Rose TN-REF individual donors...');
  const { individuals, totalRows, totalRaised } = loadRoseDonors();
  console.log(`  individuals: ${individuals.length} unique donors from ${totalRows} rows ($${totalRaised.toLocaleString()})`);

  console.log('Matching (HIGH-CONFIDENCE last + full-first + state exact)...');
  const matches: OutMatch[] = [];
  for (const d of individuals) {
    const key = `${d.last}|${d.first}|${d.state}`;
    const m = master.get(key);
    if (!m) continue;
    const out: OutMatch = {
      name: `${m.last}, ${m.first}`,
      state: m.state,
      to_rose: Math.round(d.totalToRose * 100) / 100,
      career_to_pro_israel_pacs: Math.round(m.totalGiven),
      pacs: Array.from(m.pacs),
    };
    if (d.employer) out.employer = d.employer;
    if (d.occupation) out.occupation = d.occupation;
    if (d.employer && FARA_FIRMS.test(d.employer)) {
      out.foreign_money_flag = `${d.employer} is a FARA-registered firm representing foreign sovereigns`;
    }
    matches.push(out);
  }
  matches.sort((a, b) => b.career_to_pro_israel_pacs - a.career_to_pro_israel_pacs || b.to_rose - a.to_rose);

  const bundlerCount = matches.length;
  const toRoseSum = Math.round(matches.reduce((s, m) => s + m.to_rose, 0) * 100) / 100;
  const careerSum = matches.reduce((s, m) => s + m.career_to_pro_israel_pacs, 0);

  // Notable clusters — Belz/Haslam/Uihlein-pattern check plus FARA-firm flags
  const notable: Array<Record<string, unknown>> = [];
  const belz = matches.filter(m => /BELZ/.test(m.employer || '') || /BELZ/.test(m.name));
  if (belz.length) {
    const toRose = belz.reduce((s, m) => s + m.to_rose, 0);
    const career = belz.reduce((s, m) => s + m.career_to_pro_israel_pacs, 0);
    notable.push({
      name: 'Belz family Memphis Jewish-philanthropy real-estate dynasty',
      description: `${belz.length} donor(s) connected to Belz name or employer: ${belz.map(b => b.name).join('; ')}.`,
      total_to_rose: Math.round(toRose * 100) / 100,
      total_career_pro_israel: career,
    });
  }
  const haslam = matches.filter(m => /HASLAM/.test(m.employer || '') || /HASLAM/.test(m.name));
  if (haslam.length) {
    const toRose = haslam.reduce((s, m) => s + m.to_rose, 0);
    const career = haslam.reduce((s, m) => s + m.career_to_pro_israel_pacs, 0);
    notable.push({
      name: 'Haslam family (TN) political-finance network',
      description: `${haslam.length} donor(s) connected to Haslam name or employer: ${haslam.map(b => b.name).join('; ')}.`,
      total_to_rose: Math.round(toRose * 100) / 100,
      total_career_pro_israel: career,
    });
  }
  const uihlein = matches.filter(m => /UIHLEIN/.test(m.name) || /ULINE/.test(m.employer || ''));
  if (uihlein.length) {
    const toRose = uihlein.reduce((s, m) => s + m.to_rose, 0);
    const career = uihlein.reduce((s, m) => s + m.career_to_pro_israel_pacs, 0);
    notable.push({
      name: 'Uihlein/Adelson Preserve America PAC nexus',
      description: `${uihlein.length} Uihlein/Uline donor(s) — historically $3M career to Miriam Adelson's Preserve America PAC.`,
      total_to_rose: Math.round(toRose * 100) / 100,
      total_career_pro_israel: career,
    });
  }
  const faraHits = matches.filter(m => m.foreign_money_flag);
  if (faraHits.length) {
    const toRose = faraHits.reduce((s, m) => s + m.to_rose, 0);
    const career = faraHits.reduce((s, m) => s + m.career_to_pro_israel_pacs, 0);
    notable.push({
      name: 'FARA-registered firm employees',
      description: `${faraHits.length} donor(s) employed by FARA-registered foreign-agent firms: ${faraHits.map(b => `${b.name} (${b.employer})`).join('; ')}.`,
      total_to_rose: Math.round(toRose * 100) / 100,
      total_career_pro_israel: career,
    });
  }

  // Committee ID from the itemized file
  const roseRaw = JSON.parse(fs.readFileSync(ROSE_ITEMIZED, 'utf8'));
  const committeeId: number = roseRaw.committee.candidate_id;

  const out = {
    source: `TN-REF-${committeeId}-2026`,
    method: 'high-confidence-only (last+full-first-name+state exact)',
    total_individual_rows_scanned: totalRows,
    unique_donors: individuals.length,
    total_raised_individual: Math.round(totalRaised * 100) / 100,
    matches,
    totals: {
      bundler_count: bundlerCount,
      to_rose_sum: toRoseSum,
      career_to_pro_israel_sum: careerSum,
    },
    notable_clusters: notable,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`  bundler_count: ${bundlerCount}`);
  console.log(`  to_rose_sum:   $${toRoseSum.toLocaleString()}`);
  console.log(`  career_to_pro_israel_sum: $${careerSum.toLocaleString()}`);
  console.log(`\nTop 10 bundlers:`);
  for (const m of matches.slice(0, 10)) {
    console.log(
      `  ${m.name.padEnd(30)} ${m.state}  to-Rose $${m.to_rose.toLocaleString().padStart(8)}  career $${m.career_to_pro_israel_pacs.toLocaleString()}  [${m.pacs.slice(0, 3).join(', ')}]`,
    );
  }
  console.log('\nNotable clusters:');
  for (const n of notable) console.log(`  - ${n.name}: ${n.description}`);
}

run();
