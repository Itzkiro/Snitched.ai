#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Pull Vivek Ramaswamy's 2024 presidential-run individual itemized
 * contributions from the FEC Schedule A endpoint and cross-reference against
 * data/pro-israel-donors-YYYY.csv to surface pro-Israel donor overlap.
 *
 * Why: the OH SOS portal is Cloudflare-blocked and the export we have is a
 * first-name search, not his real donor roster. His 2024 FEC data is the
 * closest usable proxy for "who gave Vivek money".
 *
 * Committee: VIVEK 2024 (C00833913), candidate P40011082.
 *
 * Usage:
 *   npx tsx scripts/fetch-vivek-fec-2024.ts                 # pull + crossref
 *   npx tsx scripts/fetch-vivek-fec-2024.ts --skip-fetch    # use cached JSON
 */

import * as fs from 'fs';
import * as path from 'path';

const FEC_API_KEY = process.env.FEC_API_KEY || '';
if (!FEC_API_KEY) { console.error('FEC_API_KEY missing'); process.exit(1); }

const COMMITTEE_ID = 'C00833913';
const OUT_RAW = path.join(__dirname, '..', 'data-ingestion', 'vivek-fec-2024-itemized.json');
const OUT_CROSS = path.join(__dirname, '..', 'data-ingestion', 'crossref-pro-israel-vivek-fec2024.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// FEC fetch (Schedule A — individual itemized contributions)
// ---------------------------------------------------------------------------

interface ScheduleARow {
  contributor_name: string | null;
  contributor_first_name: string | null;
  contributor_last_name: string | null;
  contributor_city: string | null;
  contributor_state: string | null;
  contributor_zip: string | null;
  contributor_employer: string | null;
  contributor_occupation: string | null;
  contribution_receipt_amount: number | null;
  contribution_receipt_date: string | null;
  entity_type: string | null;
  entity_type_desc: string | null;
}

interface FecResp {
  pagination: { count: number; pages: number; last_indexes: Record<string, string | number> | null };
  results: ScheduleARow[];
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllScheduleA(): Promise<ScheduleARow[]> {
  const all: ScheduleARow[] = [];
  let lastIndex: string | null = null;
  let lastContribDate: string | null = null;
  let page = 0;
  const per = 100;

  while (true) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
    u.searchParams.set('api_key', FEC_API_KEY);
    u.searchParams.set('committee_id', COMMITTEE_ID);
    u.searchParams.set('two_year_transaction_period', '2024');
    u.searchParams.set('min_amount', '200');
    u.searchParams.set('per_page', String(per));
    u.searchParams.set('sort', '-contribution_receipt_date');
    if (lastIndex) u.searchParams.set('last_index', lastIndex);
    if (lastContribDate) u.searchParams.set('last_contribution_receipt_date', lastContribDate);

    const res = await fetch(u.toString());
    if (res.status === 429) {
      console.warn('  rate-limited, sleeping 60s');
      await sleep(60_000); continue;
    }
    if (!res.ok) { console.error(`FEC error ${res.status}: ${await res.text().catch(()=>' ')}`); break; }
    const data = await res.json() as FecResp;
    const rows = data.results || [];
    if (rows.length === 0) break;
    all.push(...rows);
    page += 1;

    const li = data.pagination?.last_indexes as Record<string, string | number> | null;
    if (!li || !li.last_index) break;
    lastIndex = String(li.last_index);
    lastContribDate = li.last_contribution_receipt_date ? String(li.last_contribution_receipt_date) : null;

    if (page % 10 === 0) console.log(`  fetched ${all.length} / ~${data.pagination?.count}`);
    await sleep(150); // ~6 req/sec, safely under 1000/hr
  }
  return all;
}

// ---------------------------------------------------------------------------
// Crossref helpers (reused from crossref-acton-vivek-pro-israel.ts logic)
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur); return out;
}
function parseCsv(p: string): Record<string, string>[] {
  if (!fs.existsSync(p)) return [];
  const txt = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  const cols = splitCsvLine(txt.shift()!);
  return txt.map(l => { const c = splitCsvLine(l); const r: Record<string,string>={}; cols.forEach((k,i)=>r[k]=(c[i]||'').trim()); return r; });
}
function money(s: string | number | null): number {
  if (typeof s === 'number') return s;
  const n = Number(String(s || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stripSuffix(s: string): string {
  return s.replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

const ORG_WORDS = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;

interface MasterEntry {
  last: string; first: string; firstInitial: string; state: string; city: string; employer: string;
  cycles: Set<string>; totalGiven: number; contribCount: number; pacs: Set<string>;
}

function loadMaster(): Map<string, MasterEntry> {
  const idx = new Map<string, MasterEntry>();
  const files = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f));
  for (const f of files) {
    const cycle = f.match(/(\d{4})/)![1];
    for (const r of parseCsv(path.join(DATA_DIR, f))) {
      const nameUpper = (r.donor_name || '').toUpperCase();
      if (!/^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/.test(nameUpper)) continue;
      if (ORG_WORDS.test(nameUpper)) continue;
      // Split on raw comma FIRST, then normalize each part (norm() strips commas).
      const [lastRaw, restRaw] = (r.donor_name || '').split(',').map(s => s.trim());
      const last = norm(stripSuffix(lastRaw || ''));
      const first = norm(stripSuffix((restRaw || '').split(/\s+/)[0] || ''));
      if (!last || !first) continue;
      const state = norm(r.state);
      const key = `${last}|${first[0]}|${state}`;
      let e = idx.get(key);
      if (!e) {
        e = { last, first, firstInitial: first[0], state, city: norm(r.city), employer: norm(r.employer),
              cycles: new Set(), totalGiven: 0, contribCount: 0, pacs: new Set() };
        idx.set(key, e);
      }
      e.cycles.add(cycle);
      e.totalGiven += money(r.total_given);
      e.contribCount += Number(r.contribution_count) || 0;
      (r.pacs_given_to || '').split(/;\s*/).filter(Boolean).forEach(p => e!.pacs.add(p));
      if (first.length > e.first.length) e.first = first;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Crossref Vivek FEC rows × master
// ---------------------------------------------------------------------------

interface VivekDonorAgg {
  last: string; first: string; firstInitial: string; state: string; city: string;
  employer: string; occupation: string; amount: number; count: number;
}

function aggregateDonors(rows: ScheduleARow[]): VivekDonorAgg[] {
  const byKey = new Map<string, VivekDonorAgg>();
  for (const r of rows) {
    if (r.entity_type && r.entity_type !== 'IND') continue; // individuals only
    let last = norm(stripSuffix(r.contributor_last_name || ''));
    let first = norm(stripSuffix(r.contributor_first_name || ''));
    if (!last || !first) {
      // Fallback: parse combined name "LAST, FIRST"
      const n = stripSuffix(norm(r.contributor_name || ''));
      if (n.includes(',')) {
        const [l, rest] = n.split(',').map(s => s.trim());
        last = l; first = (rest || '').split(/\s+/)[0] || '';
      }
    }
    if (!last || !first) continue;
    const state = norm(r.contributor_state || '');
    const key = `${last}|${first[0]}|${state}`;
    const amt = money(r.contribution_receipt_amount);
    const cur = byKey.get(key);
    if (cur) { cur.amount += amt; cur.count += 1; }
    else byKey.set(key, {
      last, first, firstInitial: first[0], state,
      city: norm(r.contributor_city || ''),
      employer: norm(r.contributor_employer || ''),
      occupation: norm(r.contributor_occupation || ''),
      amount: amt, count: 1,
    });
  }
  return Array.from(byKey.values());
}

interface Match {
  donorName: string; state: string; city: string; employer: string;
  candidateTotal: number; candidateContribCount: number;
  proIsraelTotal: number; proIsraelContribCount: number;
  proIsraelCycles: string[]; proIsraelPacs: string[];
  confidence: 'high' | 'medium';
}

function crossref(donors: VivekDonorAgg[], master: Map<string, MasterEntry>): Match[] {
  const matches: Match[] = [];
  for (const d of donors) {
    const key = `${d.last}|${d.firstInitial}|${d.state}`;
    let m = master.get(key);
    let confidence: 'high' | 'medium' = 'high';
    if (!m) {
      for (const e of master.values()) {
        if (e.last === d.last && e.firstInitial === d.firstInitial) { m = e; confidence = 'medium'; break; }
      }
    }
    if (!m) continue;
    matches.push({
      donorName: `${m.last}, ${m.first}`, state: m.state, city: m.city, employer: m.employer,
      candidateTotal: d.amount, candidateContribCount: d.count,
      proIsraelTotal: m.totalGiven, proIsraelContribCount: m.contribCount,
      proIsraelCycles: Array.from(m.cycles).sort(), proIsraelPacs: Array.from(m.pacs),
      confidence,
    });
  }
  matches.sort((a, b) => b.proIsraelTotal - a.proIsraelTotal || b.candidateTotal - a.candidateTotal);
  return matches;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

async function main() {
  const skipFetch = process.argv.includes('--skip-fetch');

  let rows: ScheduleARow[];
  if (skipFetch && fs.existsSync(OUT_RAW)) {
    rows = JSON.parse(fs.readFileSync(OUT_RAW, 'utf8'));
    console.log(`Loaded ${rows.length} cached rows from ${OUT_RAW}`);
  } else {
    console.log('Fetching Vivek FEC 2024 Schedule A (≥$200 itemized individuals)...');
    rows = await fetchAllScheduleA();
    fs.writeFileSync(OUT_RAW, JSON.stringify(rows, null, 2));
    console.log(`  total ${rows.length} rows → ${OUT_RAW}`);
  }

  console.log('\nLoading pro-Israel master registry...');
  const master = loadMaster();
  console.log(`  ${master.size} unique individuals indexed`);

  console.log('\nAggregating Vivek donors...');
  const donors = aggregateDonors(rows);
  const vivekTotal = donors.reduce((s, d) => s + d.amount, 0);
  console.log(`  ${donors.length} unique Vivek itemized individuals, total ${fmt(vivekTotal)}`);

  const matches = crossref(donors, master);
  const high = matches.filter(m => m.confidence === 'high');
  const med = matches.filter(m => m.confidence === 'medium');
  const sumCand = matches.reduce((s, m) => s + m.candidateTotal, 0);
  const highSum = high.reduce((s, m) => s + m.candidateTotal, 0);

  console.log('\n' + '='.repeat(100));
  console.log(`  VIVEK RAMASWAMY 2024 × pro-Israel individuals  (${matches.length} matches)`);
  console.log('='.repeat(100));
  console.log(`  ${high.length} high-confidence (name+state), ${med.length} medium (name only)`);
  console.log(`  High-confidence $ from these donors → Vivek: ${fmt(highSum)} of ${fmt(vivekTotal)} total itemized`);
  console.log(`  All-matches $ → pro-Israel PACs (lifetime): ${fmt(matches.reduce((s,m)=>s+m.proIsraelTotal,0))}`);
  console.log('');

  console.log('TOP 40 HIGH-CONFIDENCE HITS (sorted by pro-Israel PAC giving history):');
  console.log('  Donor'.padEnd(32) + 'St  ' + '→Vivek'.padStart(10) + '  ' + '→ProIsrael'.padStart(13) + '  Cycles           PACs');
  console.log('  ' + '-'.repeat(96));
  for (const m of high.slice(0, 40)) {
    const pacs = m.proIsraelPacs.slice(0, 2).join('; ').slice(0, 32);
    const cycles = m.proIsraelCycles.join(',').slice(0, 15);
    console.log(
      '  ' + m.donorName.padEnd(30) + ' ' +
      m.state.padEnd(3) + ' ' +
      fmt(m.candidateTotal).padStart(10) + '  ' +
      fmt(m.proIsraelTotal).padStart(13) + '  ' +
      cycles.padEnd(16) + ' ' +
      pacs + (m.proIsraelPacs.length > 2 ? ` +${m.proIsraelPacs.length - 2}` : '')
    );
  }

  fs.writeFileSync(OUT_CROSS, JSON.stringify({
    generated_at: new Date().toISOString(),
    source: 'FEC Schedule A, committee C00833913, two_year_transaction_period=2024, min_amount=200',
    vivek_total_itemized: vivekTotal,
    vivek_unique_individuals: donors.length,
    master_individuals_indexed: master.size,
    matches_count: matches.length,
    high_confidence_count: high.length,
    high_confidence_dollars_to_vivek: highSum,
    matches,
  }, null, 2));
  console.log(`\nArtifact → ${OUT_CROSS}`);
}

main().catch(e => { console.error(e); process.exit(1); });
