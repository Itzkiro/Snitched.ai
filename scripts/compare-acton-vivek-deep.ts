#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Deep donor comparison: Amy Acton vs Vivek Ramaswamy.
 *
 * Three tables:
 *   1. Pro-Israel-lobby-tied donor breakdown — OH vs non-OH × amount buckets
 *   2. Common donors to BOTH candidates (any, not just pro-Israel)
 *   3. Common pro-Israel-lobby-tied donors to BOTH candidates
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMaster, parseName, type MasterEntry } from '../lib/roster-match';

const DATA_DIR = path.join(__dirname, '..', 'data');
const IN_ACTON = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
const IN_VIVEK = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');

function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}
function fmt(n: number): string { return '$' + Math.round(n).toLocaleString(); }

interface Donor { last: string; firstInitial: string; state: string; city: string; amount: number; rawName: string; }

function loadActon(): Donor[] {
  const arr = JSON.parse(fs.readFileSync(IN_ACTON, 'utf8')) as string[][];
  const out: Donor[] = [];
  for (const r of arr) {
    const indiv = (r[0] || '').trim();
    const org = (r[1] || '').trim();
    if (!indiv || org) continue;
    const p = parseName(indiv);
    if (!p?.last || !p?.firstInitial) continue;
    const amt = Number((r[10] || '').replace(/[$,\s]/g, '')) || 0;
    out.push({ last: p.last, firstInitial: p.firstInitial, state: norm(r[5] || ''), city: norm(r[4] || ''), amount: amt, rawName: indiv });
  }
  return out;
}

interface VivekRow { entity_type: string; contributor_first_name?: string; contributor_last_name?: string; contributor_state?: string; contributor_city?: string; contributor_name?: string; contribution_receipt_amount: number; }
function loadVivek(): Donor[] {
  const arr = JSON.parse(fs.readFileSync(IN_VIVEK, 'utf8')) as VivekRow[];
  const out: Donor[] = [];
  for (const r of arr) {
    if (r.entity_type !== 'IND') continue;
    const first = (r.contributor_first_name || '').trim();
    const last = (r.contributor_last_name || '').trim();
    if (!first || !last) continue;
    const lastN = norm(last).split(' ')[0];
    const firstInitial = norm(first)[0] || '';
    if (!lastN || !firstInitial) continue;
    const rawName = r.contributor_name || `${last}, ${first}`;
    out.push({ last: lastN, firstInitial, state: norm(r.contributor_state || ''), city: norm(r.contributor_city || ''), amount: Number(r.contribution_receipt_amount) || 0, rawName });
  }
  return out;
}

// Aggregate by donor key (last|firstInitial|state) so each person counts once regardless of transaction count
interface Agg { key: string; last: string; firstInitial: string; state: string; city: string; rawName: string; total: number; contribs: number; }
function aggregate(donors: Donor[]): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const d of donors) {
    const key = `${d.last}|${d.firstInitial}|${d.state}`;
    const cur = m.get(key);
    if (cur) { cur.total += d.amount; cur.contribs++; }
    else m.set(key, { key, last: d.last, firstInitial: d.firstInitial, state: d.state, city: d.city, rawName: d.rawName, total: d.amount, contribs: 1 });
  }
  return m;
}

// Identify pro-Israel-lobby-tied donors (high-confidence: exact last+firstInitial+state in registry;
// medium-confidence: unique last+firstInitial in registry)
function matchRegistry(agg: Map<string, Agg>, master: Map<string, MasterEntry>): Map<string, 'high' | 'medium'> {
  const byNameOnly = new Map<string, MasterEntry[]>();
  for (const e of master.values()) {
    const k = `${e.last}|${e.firstInitial}`;
    const list = byNameOnly.get(k);
    if (list) list.push(e); else byNameOnly.set(k, [e]);
  }
  const matches = new Map<string, 'high' | 'medium'>();
  for (const [key, a] of agg) {
    if (master.has(`${a.last}|${a.firstInitial}|${a.state}`)) { matches.set(key, 'high'); continue; }
    const list = byNameOnly.get(`${a.last}|${a.firstInitial}`) || [];
    if (list.length === 1) matches.set(key, 'medium');
  }
  return matches;
}

function bucket(amount: number): string {
  if (amount < 500) return '<$500';
  if (amount < 1000) return '$500–$999';
  if (amount < 5000) return '$1,000–$4,999';
  return '≥$5,000';
}

function main(): void {
  console.log('Loading registry...');
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} pro-Israel individuals indexed\n`);

  const actonRows = loadActon();
  const vivekRows = loadVivek();
  const actonAgg = aggregate(actonRows);
  const vivekAgg = aggregate(vivekRows);
  console.log(`Acton: ${actonRows.length} contrib rows → ${actonAgg.size} unique donors`);
  console.log(`Vivek: ${vivekRows.length} contrib rows → ${vivekAgg.size} unique donors\n`);

  const actonMatches = matchRegistry(actonAgg, master);
  const vivekMatches = matchRegistry(vivekAgg, master);
  // HIGH confidence only for Table 1
  const actonHigh = [...actonMatches].filter(([, c]) => c === 'high').map(([k]) => k);
  const vivekHigh = [...vivekMatches].filter(([, c]) => c === 'high').map(([k]) => k);
  console.log(`Acton high-conf registry matches: ${actonHigh.length}`);
  console.log(`Vivek high-conf registry matches: ${vivekHigh.length}\n`);

  // ---- TABLE 1: Pro-Israel-tied donor breakdown by OH/non-OH × amount bucket ----
  console.log('═'.repeat(95));
  console.log('  TABLE 1: Pro-Israel-Lobby-Tied Donors (HIGH-conf) — OH vs Non-OH × Amount Bucket');
  console.log('═'.repeat(95));
  const buckets = ['<$500', '$500–$999', '$1,000–$4,999', '≥$5,000'];
  for (const [candLabel, aggMap, matchKeys] of [
    ['ACTON', actonAgg, actonHigh] as const,
    ['VIVEK', vivekAgg, vivekHigh] as const,
  ]) {
    const grid: Record<string, { oh_n: number; oh_$: number; non_n: number; non_$: number }> = {};
    for (const b of buckets) grid[b] = { oh_n: 0, oh_$: 0, non_n: 0, non_$: 0 };
    for (const k of matchKeys) {
      const a = aggMap.get(k);
      if (!a) continue;
      const b = bucket(a.total);
      if (a.state === 'OH') { grid[b].oh_n++; grid[b].oh_$ += a.total; }
      else { grid[b].non_n++; grid[b].non_$ += a.total; }
    }
    const totals = { oh_n: 0, oh_$: 0, non_n: 0, non_$: 0 };
    console.log(`\n  ${candLabel}`);
    console.log('  bucket              OH donors  OH $           non-OH donors  non-OH $');
    console.log('  ' + '-'.repeat(80));
    for (const b of buckets) {
      const g = grid[b];
      totals.oh_n += g.oh_n; totals.oh_$ += g.oh_$; totals.non_n += g.non_n; totals.non_$ += g.non_$;
      console.log(`  ${b.padEnd(20)}${String(g.oh_n).padStart(6)}   ${fmt(g.oh_$).padStart(12)}  ${String(g.non_n).padStart(11)}    ${fmt(g.non_$).padStart(12)}`);
    }
    console.log('  ' + '-'.repeat(80));
    console.log(`  TOTAL               ${String(totals.oh_n).padStart(6)}   ${fmt(totals.oh_$).padStart(12)}  ${String(totals.non_n).padStart(11)}    ${fmt(totals.non_$).padStart(12)}`);
  }

  // ---- TABLE 2: Common donors to both (any) ----
  console.log('\n' + '═'.repeat(95));
  console.log('  TABLE 2: Common donors to BOTH Acton AND Vivek (any)');
  console.log('═'.repeat(95));
  const commonKeys = [...actonAgg.keys()].filter(k => vivekAgg.has(k));
  console.log(`\n  Count of shared donors: ${commonKeys.length}`);
  const commonRows = commonKeys.map(k => {
    const a = actonAgg.get(k)!;
    const v = vivekAgg.get(k)!;
    return { name: a.rawName, state: a.state, city: a.city, acton: a.total, vivek: v.total, combined: a.total + v.total };
  }).sort((x, y) => y.combined - x.combined);
  const sumActon = commonRows.reduce((s, r) => s + r.acton, 0);
  const sumVivek = commonRows.reduce((s, r) => s + r.vivek, 0);
  console.log(`  Sum to Acton from shared donors: ${fmt(sumActon)}`);
  console.log(`  Sum to Vivek from shared donors: ${fmt(sumVivek)}`);
  console.log('\n  Top 20 shared donors (by combined $):');
  console.log('  Donor                             St  City                  → Acton       → Vivek      Combined');
  console.log('  ' + '-'.repeat(105));
  for (const r of commonRows.slice(0, 20)) {
    console.log(`  ${r.name.padEnd(33)} ${r.state.padEnd(3)} ${(r.city || '').padEnd(20)} ${fmt(r.acton).padStart(10)}   ${fmt(r.vivek).padStart(10)}  ${fmt(r.combined).padStart(10)}`);
  }

  // ---- TABLE 3: Common pro-Israel-tied donors ----
  console.log('\n' + '═'.repeat(95));
  console.log('  TABLE 3: Common PRO-ISRAEL-LOBBY-TIED donors to BOTH candidates (high-confidence)');
  console.log('═'.repeat(95));
  const commonIL = commonKeys.filter(k => actonMatches.get(k) === 'high' && vivekMatches.get(k) === 'high');
  console.log(`\n  Count of shared pro-Israel-tied donors: ${commonIL.length}`);
  const commonILRows = commonIL.map(k => {
    const a = actonAgg.get(k)!;
    const v = vivekAgg.get(k)!;
    const me = master.get(k)!;
    return { name: `${me.last}, ${me.first}`, state: a.state, city: a.city, acton: a.total, vivek: v.total, combined: a.total + v.total, career: me.totalGiven, pacs: [...me.pacs].slice(0, 2).join(', ') };
  }).sort((x, y) => y.combined - x.combined);
  const sumActonIL = commonILRows.reduce((s, r) => s + r.acton, 0);
  const sumVivekIL = commonILRows.reduce((s, r) => s + r.vivek, 0);
  console.log(`  Sum to Acton from these: ${fmt(sumActonIL)}`);
  console.log(`  Sum to Vivek from these: ${fmt(sumVivekIL)}`);
  console.log('\n  All shared pro-Israel-tied donors:');
  console.log('  Donor                         St  → Acton    → Vivek     Career $     Top PACs');
  console.log('  ' + '-'.repeat(115));
  for (const r of commonILRows) {
    console.log(`  ${r.name.padEnd(30)} ${r.state.padEnd(3)} ${fmt(r.acton).padStart(8)}  ${fmt(r.vivek).padStart(8)}  ${fmt(r.career).padStart(10)}   ${r.pacs}`);
  }
}

main();
