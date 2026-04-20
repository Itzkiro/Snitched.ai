#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Cross-reference Ed Gallrein (KY-04 R, FEC H6KY04171) individual donors
 * against the pro-Israel donor registry (data/pro-israel-donors-YYYY.csv,
 * 2015–2026).
 *
 * Output: data-ingestion/gallrein-roster-matches.json — full set of matches
 * with confidence scoring (state match = high, name-only = medium).
 *
 * Modeled on scripts/crossref-acton-vivek-pro-israel.ts but pulls Gallrein's
 * itemized donors from FEC schedule_a directly instead of a saved JSON.
 */

import * as fs from 'fs';
import * as path from 'path';

const FEC_KEY = process.env.FEC_API_KEY || '';
const CAND_ID = 'H6KY04171';
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT = path.join(__dirname, '..', 'data-ingestion', 'gallrein-roster-matches.json');

// ---------------------------------------------------------------------------
// CSV helpers (copied from crossref-acton-vivek-pro-israel.ts)
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

function money(s: string | number): number {
  const n = Number(String(s ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSuffix(s: string): string {
  return s.replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

interface ParsedName { last: string; first: string; firstInitial: string }

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
  const last = toks[0];
  const first = toks[1] || '';
  return { last, first, firstInitial: first[0] || '' };
}

// ---------------------------------------------------------------------------
// Master pro-Israel registry index
// ---------------------------------------------------------------------------

const ORG_WORDS = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;

function isIndividualRegistryRow(r: Record<string, string>): boolean {
  const nameUpper = (r.donor_name || '').toUpperCase();
  if (!/^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/.test(nameUpper)) return false;
  if (ORG_WORDS.test(nameUpper)) return false;
  return true;
}

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
      if (p.first.length > e.first.length) e.first = p.first;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// FEC pull — Gallrein itemized individuals across all cycles
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface FecResp<T> { results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }

async function fecFetch<T>(endpoint: string, params: Record<string, string | number>): Promise<FecResp<T>> {
  if (!FEC_KEY) throw new Error('FEC_API_KEY missing');
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) { await sleep(30_000); return fecFetch(endpoint, params); }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}`);
  return res.json() as Promise<FecResp<T>>;
}

interface ScheduleARow {
  contributor_name: string;
  contributor_first_name?: string;
  contributor_last_name?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  entity_type: string;
  two_year_transaction_period?: number;
}

interface CandDonor {
  rawName: string;
  last: string;
  first: string;
  firstInitial: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  amount: number;
  date: string;
  cycle: string;
}

async function pullGallreinIndividuals(): Promise<CandDonor[]> {
  console.log(`FEC: fetching principal committee for ${CAND_ID}...`);
  const cmtResp = await fecFetch<{ committee_id: string; designation_full: string; committee_type_full?: string }>(
    `/candidate/${CAND_ID}/committees/`, { per_page: 20 }
  );
  const principal = cmtResp.results?.find(c => /principal/i.test(c.designation_full)) || cmtResp.results?.[0];
  if (!principal) throw new Error('no principal committee found');
  const committeeId = principal.committee_id;
  console.log(`  Principal: ${committeeId} (${principal.designation_full})`);
  await sleep(400);

  const cycles = [2016, 2018, 2020, 2022, 2024, 2026];
  const donors: CandDonor[] = [];
  for (const cy of cycles) {
    let lastIdx: string | number | undefined;
    let lastAmt: string | number | undefined;
    let page = 0;
    const before = donors.length;
    while (page < 50) {
      const params: Record<string, string | number> = {
        committee_id: committeeId,
        two_year_transaction_period: cy,
        is_individual: 'true',
        per_page: 100,
        sort: '-contribution_receipt_amount',
      };
      if (lastIdx !== undefined) params.last_index = lastIdx;
      if (lastAmt !== undefined) params.last_contribution_receipt_amount = lastAmt;
      let resp: FecResp<ScheduleARow>;
      try {
        resp = await fecFetch<ScheduleARow>('/schedules/schedule_a/', params);
      } catch (e) {
        console.error(`  cycle ${cy} page ${page} error:`, e instanceof Error ? e.message : e);
        break;
      }
      const rows = resp.results || [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (r.entity_type && r.entity_type !== 'IND') continue;
        const rawName = (r.contributor_name || '').trim();
        if (!rawName) continue;
        const p = parseName(rawName);
        if (!p || !p.last || !p.first) continue;
        donors.push({
          rawName,
          last: p.last, first: p.first, firstInitial: p.firstInitial,
          state: norm(r.contributor_state || ''),
          city: norm(r.contributor_city || ''),
          employer: norm(r.contributor_employer || ''),
          occupation: norm(r.contributor_occupation || ''),
          amount: r.contribution_receipt_amount || 0,
          date: r.contribution_receipt_date || '',
          cycle: String(cy),
        });
      }
      const last = resp.pagination?.last_indexes;
      if (!last) break;
      lastIdx = last.last_index as string | number | undefined;
      lastAmt = last.last_contribution_receipt_amount as string | number | undefined;
      page++;
      await sleep(300);
      if (rows.length < 100) break;
    }
    console.log(`  cycle ${cy}: ${donors.length - before} individual rows`);
  }
  return donors;
}

// ---------------------------------------------------------------------------
// Matching (same logic as acton-vivek)
// ---------------------------------------------------------------------------

interface Match {
  donorName: string;
  firstFromMaster: string;
  state: string;
  city: string;
  employer: string;
  candidateTotal: number;
  candidateContribCount: number;
  candidateCycles: string[];
  proIsraelTotal: number;
  proIsraelContribCount: number;
  proIsraelCycles: string[];
  proIsraelPacs: string[];
  confidence: 'high' | 'medium';
}

function crossref(donors: CandDonor[], master: Map<string, MasterEntry>): Match[] {
  const byKey = new Map<string, { d: CandDonor; amount: number; count: number; cycles: Set<string> }>();
  for (const d of donors) {
    const key = `${d.last}|${d.firstInitial}|${d.state}`;
    const cur = byKey.get(key);
    if (cur) { cur.amount += d.amount; cur.count += 1; cur.cycles.add(d.cycle); }
    else byKey.set(key, { d, amount: d.amount, count: 1, cycles: new Set([d.cycle]) });
  }

  const matches: Match[] = [];
  for (const [key, agg] of byKey) {
    const d = agg.d;
    let m = master.get(key);
    let confidence: 'high' | 'medium' = 'high';
    if (!m) {
      for (const e of master.values()) {
        if (e.last === d.last && e.firstInitial === d.firstInitial) { m = e; confidence = 'medium'; break; }
      }
    }
    if (!m) continue;
    matches.push({
      donorName: `${m.last}, ${m.first}`,
      firstFromMaster: m.first,
      state: m.state,
      city: m.city,
      employer: m.employer,
      candidateTotal: agg.amount,
      candidateContribCount: agg.count,
      candidateCycles: Array.from(agg.cycles).sort(),
      proIsraelTotal: m.totalGiven,
      proIsraelContribCount: m.contribCount,
      proIsraelCycles: Array.from(m.cycles).sort(),
      proIsraelPacs: Array.from(m.pacs),
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

function printTable(matches: Match[]): void {
  console.log('');
  console.log('='.repeat(110));
  console.log(`  ED GALLREIN (KY-04 R) × pro-Israel individual donors  (${matches.length} matches)`);
  console.log('='.repeat(110));
  if (matches.length === 0) { console.log('  (no matches)'); return; }
  const high = matches.filter(m => m.confidence === 'high');
  const med = matches.filter(m => m.confidence === 'medium');
  const sumCand = matches.reduce((s, m) => s + m.candidateTotal, 0);
  const sumProIsrael = matches.reduce((s, m) => s + m.proIsraelTotal, 0);
  console.log(`  ${high.length} high-confidence (name+state), ${med.length} medium (name only)`);
  console.log(`  From these donors → Gallrein: ${fmt(sumCand)}`);
  console.log(`  From these donors → pro-Israel PACs (all cycles): ${fmt(sumProIsrael)}`);
  console.log('');
  console.log('  Donor'.padEnd(32) + 'St  ' + '→Gall'.padStart(10) + '  ' + '→ProIsrael'.padStart(13) + '  Cycles          PACs');
  console.log('  ' + '-'.repeat(106));
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

async function main(): Promise<void> {
  console.log('Loading pro-Israel master registry...');
  const master = loadMaster();
  console.log(`  Indexed ${master.size} unique individual donors across all available cycles`);

  console.log('\nPulling Gallrein itemized individuals from FEC...');
  const donors = await pullGallreinIndividuals();
  console.log(`\n  Total individual contribution rows: ${donors.length}`);

  const matches = crossref(donors, master);
  printTable(matches);

  const artifact = {
    generated_at: new Date().toISOString(),
    candidate: { name: 'Ed Gallrein', office: 'U.S. House KY-04 (R)', fec_candidate_id: CAND_ID },
    master_individuals_indexed: master.size,
    itemized_individual_rows: donors.length,
    matches,
    totals: {
      donors_matched: matches.length,
      high_confidence: matches.filter(m => m.confidence === 'high').length,
      medium_confidence: matches.filter(m => m.confidence === 'medium').length,
      to_candidate: matches.reduce((s, m) => s + m.candidateTotal, 0),
      these_donors_to_pro_israel: matches.reduce((s, m) => s + m.proIsraelTotal, 0),
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
  console.log(`\nArtifact written → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
