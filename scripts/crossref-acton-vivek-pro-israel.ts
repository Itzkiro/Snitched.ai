#!/usr/bin/env npx tsx
/**
 * Cross-reference individual donors of Amy Acton (OH-Gov D) and Vivek
 * Ramaswamy (OH-Gov R) against the master pro-Israel donor registry
 * (data/pro-israel-donors-YYYY.csv, 2016–2026).
 *
 * Goal: surface individuals who (a) gave to Acton or Vivek AND (b) appear on
 * the pro-Israel donor list — individual donor hits we may have missed
 * because the existing Israel-lobby classifier only looks at PAC names, not
 * individual contributors.
 *
 * Inputs:
 *   - data/pro-israel-donors-2016.csv ... 2026.csv   (master registry)
 *   - data-ingestion/oh-acton-itemized.json          (OH SOS raw Acton rows)
 *   - /Users/.../Vivek R/Vivek contributions.csv     (Vivek individuals)
 *
 * Output: stdout table of matches with totals + a JSON artifact at
 *   data-ingestion/crossref-pro-israel-acton-vivek.json
 *
 * Read-only: does not touch Supabase.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT = path.join(__dirname, '..', 'data-ingestion', 'crossref-pro-israel-acton-vivek.json');
const ACTON_RAW = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
const VIVEK_CSV = '/Users/kirolosabdalla/Desktop/United For America/Candidates/Ohio/Governor/Vivek R/Vivek contributions.csv';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
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
    cols.forEach((c, i) => { row[c] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function money(s: string): number {
  const n = Number(String(s || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Strip accents, punctuation, collapse whitespace, upper-case. */
function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove common suffixes (JR, SR, II, III, MD, ESQ, etc.) */
function stripSuffix(s: string): string {
  return s.replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

interface ParsedName { last: string; first: string; firstInitial: string }

/**
 * Try to parse a human name into { last, first } regardless of input style.
 * Accepts:
 *   "LAST, FIRST"         — SOS / pro-Israel master format
 *   "LAST  FIRST"         — Vivek CSV (double-space) or single space
 *   "LAST FIRST MIDDLE"   — fallback, takes token[0] as last
 */
function parseName(raw: string): ParsedName | null {
  const n = stripSuffix(norm(raw));
  if (!n) return null;
  if (n.includes(',')) {
    const [last, rest] = n.split(',').map(s => s.trim());
    const first = (rest || '').split(/\s+/)[0] || '';
    return { last, first, firstInitial: first[0] || '' };
  }
  const toks = n.split(/\s+/);
  if (toks.length < 2) return null;
  // Heuristic: if single-letter token exists, treat as middle; last is toks[0]
  const last = toks[0];
  const first = toks[1] || '';
  return { last, first, firstInitial: first[0] || '' };
}

// ---------------------------------------------------------------------------
// Is-individual heuristic for master registry rows
// ---------------------------------------------------------------------------

const ORG_WORDS = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;

function isIndividualRegistryRow(r: Record<string, string>): boolean {
  const nameUpper = (r.donor_name || '').toUpperCase();
  // Individual = "LAST, FIRST" pattern (comma BEFORE norm strips it)
  if (!/^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/.test(nameUpper)) return false;
  // Reject anything that looks organizational
  if (ORG_WORDS.test(nameUpper)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Build master pro-Israel individual index
// ---------------------------------------------------------------------------

interface MasterEntry {
  last: string;
  first: string;
  firstInitial: string;
  state: string;
  city: string;
  employer: string;
  cycles: Set<string>;
  totalGiven: number;
  contribCount: number;
  pacs: Set<string>;
}

function loadMaster(): Map<string, MasterEntry> {
  const idx = new Map<string, MasterEntry>();
  const files = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f));
  for (const f of files) {
    const cycle = f.match(/(\d{4})/)![1];
    const rows = parseCsv(path.join(DATA_DIR, f));
    for (const r of rows) {
      if (!isIndividualRegistryRow(r)) continue;
      const p = parseName(r.donor_name);
      if (!p || !p.last || !p.first) continue;
      const state = norm(r.state);
      const key = `${p.last}|${p.firstInitial}|${state}`;
      let e = idx.get(key);
      if (!e) {
        e = {
          last: p.last, first: p.first, firstInitial: p.firstInitial,
          state, city: norm(r.city), employer: norm(r.employer),
          cycles: new Set(), totalGiven: 0, contribCount: 0, pacs: new Set(),
        };
        idx.set(key, e);
      }
      e.cycles.add(cycle);
      e.totalGiven += money(r.total_given);
      e.contribCount += Number(r.contribution_count) || 0;
      (r.pacs_given_to || '').split(/;\s*/).filter(Boolean).forEach(pac => e!.pacs.add(pac));
      // Prefer longest first-name (handle mix of "JAMES" vs "J" records)
      if (p.first.length > e.first.length) e.first = p.first;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Candidate donor loaders
// ---------------------------------------------------------------------------

interface CandidateDonor {
  candidate: string;
  rawName: string;
  last: string;
  first: string;
  firstInitial: string;
  state: string;
  city: string;
  employer: string;
  amount: number;
  date: string;
}

/** Acton OH SOS raw rows: [0]=individualName "LAST, FIRST", [1]=orgName, [3]=addr, [4]=city, [5]=state, [10]=amount, [9]=date, [12]=employer */
function loadActon(): CandidateDonor[] {
  if (!fs.existsSync(ACTON_RAW)) {
    console.warn(`Acton raw data not found at ${ACTON_RAW}`);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(ACTON_RAW, 'utf8')) as string[][];
  const out: CandidateDonor[] = [];
  for (const r of raw) {
    const indivName = (r[0] || '').trim();
    const orgName = (r[1] || '').trim();
    if (!indivName || orgName) continue; // only pure individual rows
    const p = parseName(indivName);
    if (!p || !p.last || !p.first) continue;
    out.push({
      candidate: 'Amy Acton',
      rawName: indivName,
      last: p.last, first: p.first, firstInitial: p.firstInitial,
      state: norm(r[5] || ''), city: norm(r[4] || ''),
      employer: norm(r[12] || ''),
      amount: money(r[10] || ''), date: (r[9] || '').trim(),
    });
  }
  return out;
}

/** Vivek CSV from Desktop: "Contributor Name","Address","City","State","Zip",...,"Amount",...,"Employer/Occupation","Committee" */
function loadVivek(): CandidateDonor[] {
  if (!fs.existsSync(VIVEK_CSV)) {
    console.warn(`Vivek CSV not found at ${VIVEK_CSV}`);
    return [];
  }
  const rows = parseCsv(VIVEK_CSV);
  const out: CandidateDonor[] = [];
  for (const r of rows) {
    const committee = r['Committee'] || '';
    // Keep only rows actually to Vivek's committee (name contains VIVEK/RAMASW)
    if (!/VIVEK|RAMASW/i.test(committee)) continue;
    const p = parseName(r['Contributor Name'] || '');
    if (!p || !p.last || !p.first) continue;
    out.push({
      candidate: 'Vivek Ramaswamy',
      rawName: r['Contributor Name'] || '',
      last: p.last, first: p.first, firstInitial: p.firstInitial,
      state: norm(r['State'] || ''), city: norm(r['City'] || ''),
      employer: norm(r['Employer/Occupation'] || ''),
      amount: money(r['Amount'] || ''), date: (r['Contribution Date'] || '').trim(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface Match {
  candidate: string;
  donorName: string;
  firstFromMaster: string;
  state: string;
  city: string;
  employer: string;
  candidateTotal: number;
  candidateContribCount: number;
  proIsraelTotal: number;        // total given to pro-Israel PACs by this donor
  proIsraelContribCount: number;
  proIsraelCycles: string[];
  proIsraelPacs: string[];
  confidence: 'high' | 'medium';  // state match → high, no-state → medium
}

function crossref(donors: CandidateDonor[], master: Map<string, MasterEntry>): Match[] {
  // Aggregate candidate donors by (last|firstInitial|state) so multiple
  // itemized contribs from the same person collapse.
  const byKey = new Map<string, { d: CandidateDonor; amount: number; count: number }>();
  for (const d of donors) {
    const key = `${d.last}|${d.firstInitial}|${d.state}`;
    const cur = byKey.get(key);
    if (cur) { cur.amount += d.amount; cur.count += 1; }
    else byKey.set(key, { d, amount: d.amount, count: 1 });
  }

  const matches: Match[] = [];
  for (const [key, agg] of byKey) {
    const d = agg.d;
    // Primary lookup: exact last|firstInitial|state
    let m = master.get(key);
    let confidence: 'high' | 'medium' = 'high';
    // Fallback: drop state (same person may donate from a different address)
    if (!m) {
      for (const e of master.values()) {
        if (e.last === d.last && e.firstInitial === d.firstInitial) { m = e; confidence = 'medium'; break; }
      }
    }
    if (!m) continue;

    matches.push({
      candidate: d.candidate,
      donorName: `${m.last}, ${m.first}`,
      firstFromMaster: m.first,
      state: m.state,
      city: m.city,
      employer: m.employer,
      candidateTotal: agg.amount,
      candidateContribCount: agg.count,
      proIsraelTotal: m.totalGiven,
      proIsraelContribCount: m.contribCount,
      proIsraelCycles: Array.from(m.cycles).sort(),
      proIsraelPacs: Array.from(m.pacs),
      confidence,
    });
  }
  // Rank by pro-Israel dollar size then candidate $
  matches.sort((a, b) => b.proIsraelTotal - a.proIsraelTotal || b.candidateTotal - a.candidateTotal);
  return matches;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function printTable(title: string, matches: Match[]): void {
  console.log('');
  console.log('='.repeat(100));
  console.log(`  ${title}  (${matches.length} matches)`);
  console.log('='.repeat(100));
  if (matches.length === 0) { console.log('  (no pro-Israel individual donors matched)'); return; }
  const high = matches.filter(m => m.confidence === 'high');
  const med = matches.filter(m => m.confidence === 'medium');
  const sumCand = matches.reduce((s, m) => s + m.candidateTotal, 0);
  const sumProIsrael = matches.reduce((s, m) => s + m.proIsraelTotal, 0);
  console.log(`  ${high.length} high-confidence (name+state), ${med.length} medium (name only)`);
  console.log(`  Total $ from these donors → candidate: ${fmt(sumCand)}`);
  console.log(`  Total $ from these donors → pro-Israel PACs (all cycles): ${fmt(sumProIsrael)}`);
  console.log('');
  console.log('  Donor'.padEnd(32) + 'St  ' + '→Cand'.padStart(10) + '  ' + '→ProIsrael'.padStart(13) + '  Cycles           PACs');
  console.log('  ' + '-'.repeat(96));
  for (const m of matches) {
    const pacs = m.proIsraelPacs.slice(0, 2).join('; ').slice(0, 32);
    const cycles = m.proIsraelCycles.join(',').slice(0, 15);
    console.log(
      '  ' + m.donorName.padEnd(30) + ' ' +
      m.state.padEnd(3) + ' ' +
      fmt(m.candidateTotal).padStart(10) + '  ' +
      fmt(m.proIsraelTotal).padStart(13) + '  ' +
      cycles.padEnd(16) + ' ' +
      pacs + (m.proIsraelPacs.length > 2 ? ` +${m.proIsraelPacs.length - 2}` : '') +
      (m.confidence === 'medium' ? '  [no-state-match]' : '')
    );
  }
}

function main(): void {
  console.log('Loading pro-Israel master registry...');
  const master = loadMaster();
  console.log(`  Indexed ${master.size} unique individual donors across 2016-2026`);

  console.log('\nLoading Acton itemized (OH SOS)...');
  const actonDonors = loadActon();
  console.log(`  ${actonDonors.length} individual Acton contribution rows`);

  console.log('\nLoading Vivek itemized (OH SOS CSV export)...');
  const vivekDonors = loadVivek();
  console.log(`  ${vivekDonors.length} individual Vivek contribution rows (to his committee)`);

  const actonMatches = crossref(actonDonors, master);
  const vivekMatches = crossref(vivekDonors, master);

  printTable('AMY ACTON × pro-Israel individuals', actonMatches);
  printTable('VIVEK RAMASWAMY × pro-Israel individuals', vivekMatches);

  const artifact = {
    generated_at: new Date().toISOString(),
    master_individuals_indexed: master.size,
    acton: {
      itemized_individual_rows: actonDonors.length,
      matches: actonMatches,
      totals: {
        donors_matched: actonMatches.length,
        to_candidate: actonMatches.reduce((s, m) => s + m.candidateTotal, 0),
        these_donors_to_pro_israel: actonMatches.reduce((s, m) => s + m.proIsraelTotal, 0),
      },
    },
    vivek: {
      itemized_individual_rows: vivekDonors.length,
      matches: vivekMatches,
      totals: {
        donors_matched: vivekMatches.length,
        to_candidate: vivekMatches.reduce((s, m) => s + m.candidateTotal, 0),
        these_donors_to_pro_israel: vivekMatches.reduce((s, m) => s + m.proIsraelTotal, 0),
      },
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
  console.log(`\nArtifact written → ${OUT}`);
}

main();
