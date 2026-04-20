#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Transaction-level log: every single contribution from a pro-Israel-lobby
 * registry donor to Acton or Vivek. One CSV row per contribution (not per
 * donor). Sorted by candidate then date.
 *
 * Only HIGH-confidence matches (exact name+state in pro-Israel registry) are
 * emitted — medium-confidence name-only matches produced too many collisions
 * (e.g. "MILLER J" in OH matching an unrelated "MILLER J" in NY).
 *
 * Pass --include-medium to emit both tiers for debugging.
 *
 * Output: data-ingestion/oh-gov-pro-israel-donation-log.csv
 */

const INCLUDE_MEDIUM = process.argv.includes('--include-medium');

import * as fs from 'fs';
import * as path from 'path';
import { loadMaster, parseName, type MasterEntry } from '../lib/roster-match';

const DATA_DIR = path.join(__dirname, '..', 'data');
const IN_ACTON = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
const IN_VIVEK = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');
const OUT = path.join(__dirname, '..', 'data-ingestion', 'oh-gov-pro-israel-donation-log.csv');

function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface LogRow {
  candidate: string;
  date: string;
  donor_name: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  amount: number;
  confidence: 'high' | 'medium';
  registry_name: string;
  pro_israel_career_total: number;
  pro_israel_contrib_count: number;
  pro_israel_cycles: string;
  pro_israel_pacs: string;
}

function lookup(
  last: string, firstInitial: string, state: string,
  master: Map<string, MasterEntry>, byNameOnly: Map<string, MasterEntry[]>,
): { entry: MasterEntry; confidence: 'high' | 'medium' } | null {
  const hi = master.get(`${last}|${firstInitial}|${state}`);
  if (hi) return { entry: hi, confidence: 'high' };
  const list = byNameOnly.get(`${last}|${firstInitial}`) || [];
  if (list.length === 1) return { entry: list[0], confidence: 'medium' };
  return null;
}

function toLogRow(
  candidate: string, date: string, donorName: string, last: string, firstInitial: string,
  state: string, city: string, employer: string, occupation: string, amount: number,
  master: Map<string, MasterEntry>, byNameOnly: Map<string, MasterEntry[]>,
): LogRow | null {
  if (!last || !firstInitial) return null;
  const hit = lookup(last, firstInitial, state, master, byNameOnly);
  if (!hit) return null;
  return {
    candidate, date, donor_name: donorName,
    state, city, employer, occupation, amount,
    confidence: hit.confidence,
    registry_name: `${hit.entry.last}, ${hit.entry.first}`,
    pro_israel_career_total: hit.entry.totalGiven,
    pro_israel_contrib_count: hit.entry.contribCount,
    pro_israel_cycles: Array.from(hit.entry.cycles).sort().join(';'),
    pro_israel_pacs: Array.from(hit.entry.pacs).join('; '),
  };
}

function loadActon(master: Map<string, MasterEntry>, byNameOnly: Map<string, MasterEntry[]>): LogRow[] {
  if (!fs.existsSync(IN_ACTON)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_ACTON, 'utf8')) as string[][];
  const out: LogRow[] = [];
  for (const r of arr) {
    const indiv = (r[0] || '').trim();
    const org = (r[1] || '').trim();
    if (!indiv || org) continue;
    const p = parseName(indiv);
    if (!p) continue;
    const amt = Number((r[10] || '').replace(/[$,\s]/g, '')) || 0;
    const row = toLogRow(
      'Acton', (r[9] || '').trim(), indiv, p.last, p.firstInitial,
      norm(r[5] || ''), norm(r[4] || ''), norm(r[12] || ''), '',
      amt, master, byNameOnly,
    );
    if (row) out.push(row);
  }
  return out;
}

interface VivekRow { entity_type: string; contributor_name?: string; contributor_first_name?: string; contributor_last_name?: string; contributor_state?: string; contributor_city?: string; contributor_employer?: string; contribution_receipt_amount: number; contribution_receipt_date: string; }
function loadVivek(master: Map<string, MasterEntry>, byNameOnly: Map<string, MasterEntry[]>): LogRow[] {
  if (!fs.existsSync(IN_VIVEK)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_VIVEK, 'utf8')) as VivekRow[];
  const out: LogRow[] = [];
  for (const r of arr) {
    if (r.entity_type !== 'IND') continue;
    const first = (r.contributor_first_name || '').trim();
    const last = (r.contributor_last_name || '').trim();
    const built = r.contributor_name || (last && first ? `${last}, ${first}` : (last || first || ''));
    const rawName = built.trim();
    if (!rawName) continue;
    // Prefer structured first/last when present
    let lastN = '', firstInitial = '';
    if (last && first) { lastN = norm(last).split(' ')[0]; firstInitial = norm(first)[0] || ''; }
    else {
      const p = parseName(rawName);
      if (!p) continue;
      lastN = p.last; firstInitial = p.firstInitial;
    }
    const amt = Number(r.contribution_receipt_amount) || 0;
    const row = toLogRow(
      'Vivek', r.contribution_receipt_date || '', rawName, lastN, firstInitial,
      norm(r.contributor_state || ''), norm(r.contributor_city || ''),
      norm(r.contributor_employer || ''), '', amt, master, byNameOnly,
    );
    if (row) out.push(row);
  }
  return out;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main(): void {
  const master = loadMaster(DATA_DIR);
  const byNameOnly = new Map<string, MasterEntry[]>();
  for (const e of master.values()) {
    const k = `${e.last}|${e.firstInitial}`;
    const list = byNameOnly.get(k);
    if (list) list.push(e); else byNameOnly.set(k, [e]);
  }
  console.log(`Indexed ${master.size} pro-Israel individuals`);

  const acton = loadActon(master, byNameOnly);
  const vivek = loadVivek(master, byNameOnly);
  console.log(`Acton hits: ${acton.length} transactions  (high=${acton.filter(r => r.confidence === 'high').length} medium=${acton.filter(r => r.confidence === 'medium').length})`);
  console.log(`Vivek hits: ${vivek.length} transactions  (high=${vivek.filter(r => r.confidence === 'high').length} medium=${vivek.filter(r => r.confidence === 'medium').length})`);

  const unfiltered = [...acton, ...vivek];
  const all = (INCLUDE_MEDIUM ? unfiltered : unfiltered.filter(r => r.confidence === 'high')).sort((a, b) =>
    a.candidate.localeCompare(b.candidate) ||
    (b.pro_israel_career_total - a.pro_israel_career_total) ||
    a.date.localeCompare(b.date)
  );
  if (!INCLUDE_MEDIUM) console.log(`Filtered to HIGH-confidence only (exact name+state). Run with --include-medium to also see name-only matches.`);

  const headers = [
    'candidate', 'date', 'donor_name', 'state', 'city', 'employer', 'occupation',
    'amount', 'confidence', 'registry_name',
    'pro_israel_career_total', 'pro_israel_contrib_count', 'pro_israel_cycles', 'pro_israel_pacs',
  ];
  const lines = [headers.join(',')];
  for (const r of all) {
    lines.push([
      r.candidate, r.date, r.donor_name, r.state, r.city, r.employer, r.occupation,
      r.amount.toFixed(2), r.confidence, r.registry_name,
      r.pro_israel_career_total, r.pro_israel_contrib_count, r.pro_israel_cycles, r.pro_israel_pacs,
    ].map(csvEscape).join(','));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`\nWrote ${lines.length - 1} transaction rows → ${OUT}`);

  // High-conf summary
  for (const cand of ['Acton', 'Vivek']) {
    const rows = all.filter(r => r.candidate === cand && r.confidence === 'high');
    const total = rows.reduce((s, r) => s + r.amount, 0);
    console.log(`  ${cand} HIGH-CONF: ${rows.length} transactions, $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }
}

main();
