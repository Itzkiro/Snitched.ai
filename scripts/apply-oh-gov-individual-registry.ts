#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Populate individual_donor_breakdown (→ israel_lobby_breakdown.individual_registry
 * fallback if migration 004 isn't run) for OH gov candidates using their
 * already-pulled OH SOS itemized data.
 *
 * Unlike crossref-politician-pro-israel.ts (which pulls from FEC), this reads
 * local OH SOS JSON files directly. Works for state-level candidates who
 * don't have FEC candidate IDs.
 *
 *   Acton: data-ingestion/oh-acton-itemized.json  (array-of-arrays, OH SOS)
 *   Vivek: data-ingestion/vivek-oh-sos-itemized.json  (array-of-objects, OH SOS)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  loadMaster, parseName, crossref, buildBreakdown, applyToPolitician,
  type CandDonor, type MasterEntry,
} from '../lib/roster-match';

const DATA_DIR = path.join(__dirname, '..', 'data');

function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function actonDonors(): CandDonor[] {
  const file = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
  if (!fs.existsSync(file)) return [];
  const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as string[][];
  const out: CandDonor[] = [];
  for (const r of arr) {
    const indiv = (r[0] || '').trim();
    const org = (r[1] || '').trim();
    if (!indiv || org) continue;
    const p = parseName(indiv);
    if (!p?.last || !p.firstInitial) continue;
    const amt = Number((r[10] || '').replace(/[$,\s]/g, '')) || 0;
    out.push({
      rawName: indiv, last: p.last, first: p.first, firstInitial: p.firstInitial,
      state: norm(r[5] || ''), city: norm(r[4] || ''),
      employer: norm(r[12] || ''), occupation: '',
      amount: amt, date: (r[9] || '').trim(),
      cycle: (r[8] || '2026').trim(),
    });
  }
  return out;
}

interface VivekRow {
  entity_type: string;
  contributor_name?: string;
  contributor_first_name?: string;
  contributor_last_name?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
}
function vivekDonors(): CandDonor[] {
  const file = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');
  if (!fs.existsSync(file)) return [];
  const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as VivekRow[];
  const out: CandDonor[] = [];
  for (const r of arr) {
    if (r.entity_type !== 'IND') continue;
    const first = (r.contributor_first_name || '').trim();
    const last = (r.contributor_last_name || '').trim();
    const built = r.contributor_name || (last && first ? `${last}, ${first}` : (last || first || ''));
    const rawName = built.trim();
    if (!rawName) continue;
    let lastN = '', firstInitial = '';
    if (last && first) { lastN = norm(last).split(' ')[0]; firstInitial = norm(first)[0] || ''; }
    else {
      const p = parseName(rawName);
      if (!p) continue;
      lastN = p.last; firstInitial = p.firstInitial;
    }
    if (!lastN || !firstInitial) continue;
    const date = r.contribution_receipt_date || '';
    const year = date.match(/\d{4}/)?.[0] || '2026';
    out.push({
      rawName, last: lastN, first: first || rawName.split(',')[1]?.trim() || '',
      firstInitial,
      state: norm(r.contributor_state || ''), city: norm(r.contributor_city || ''),
      employer: norm(r.contributor_employer || ''), occupation: '',
      amount: Number(r.contribution_receipt_amount) || 0,
      date, cycle: year,
    });
  }
  return out;
}

async function applyOne(
  bioguideId: string, candidateName: string, donors: CandDonor[],
  master: Map<string, MasterEntry>,
): Promise<void> {
  console.log(`\n=== ${candidateName} (${bioguideId}) ===`);
  console.log(`  ${donors.length} individual contribution rows`);
  const matches = crossref(donors, master);
  const breakdown = buildBreakdown(matches, donors.length, `scripts/apply-oh-gov-individual-registry.ts:${bioguideId}`);
  console.log(`  matches: ${breakdown.matches}/${breakdown.itemized_individual_rows} (${breakdown.match_rate_pct}%)`);
  console.log(`    high: ${breakdown.high_confidence}  medium: ${breakdown.medium_confidence}`);
  console.log(`    $ to candidate:           $${breakdown.to_candidate.toLocaleString()}`);
  console.log(`    $ career to pro-Israel:   $${breakdown.these_donors_to_pro_israel_career.toLocaleString()}`);

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE env missing');
  const s = createClient(url, key);
  const applied = await applyToPolitician(s, bioguideId, breakdown, candidateName);
  console.log(`  applied → ${applied.column}  (red_flags kept ${applied.kept} added ${applied.added})`);
}

async function main(): Promise<void> {
  const master = loadMaster(DATA_DIR);
  console.log(`Indexed ${master.size} pro-Israel individuals`);

  await applyOne('oh-gov-2026-amy-acton', 'Amy Acton', actonDonors(), master);
  await applyOne('oh-gov-2026-vivek-ramaswamy', 'Vivek Ramaswamy', vivekDonors(), master);
}

main().catch(e => { console.error(e); process.exit(1); });
