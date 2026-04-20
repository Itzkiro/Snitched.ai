#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Flag Acton's individual pro-Israel bundlers.
 *
 * Acton's existing DB row treats `israel_lobby_total=$0` because the PAC-name
 * classifier never fired — the Cleveland Jewish-philanthropy cluster gave her
 * personally (Ratner, Rosskamm, Kanfer, Kornacker, Kripke, Goodman, Cohen,
 * Horowitz, etc.), not via AIPAC/UDP/DMFI PACs.
 *
 * This script cross-references her 3,683 OH SOS itemized individuals against
 * the pro-Israel master registry (2016–2026) and adds verified name+state
 * matches to her israel_lobby_breakdown.bundlers field. The v6.5 scorer
 * already reclassifies bundlers as PAC-side money via lib/corruption-score.ts,
 * so her corruption score will rise automatically.
 *
 * Safety:
 *   - Only applies HIGH-confidence matches (last name + first initial + state)
 *   - Writes the matched donor list to the DB so the attribution is auditable
 *   - --dry-run by default
 *
 * Usage:
 *   npx tsx scripts/flag-acton-individual-israel-donors.ts              # dry
 *   npx tsx scripts/flag-acton-individual-israel-donors.ts --write      # commit
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const BIOGUIDE_ID = 'oh-gov-2026-amy-acton';
const ACTON_RAW = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// Shared helpers (duplicated intentionally; these scripts are standalone)
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
  return txt.map(l => { const c = splitCsvLine(l); const r: Record<string, string> = {}; cols.forEach((k, i) => r[k] = (c[i] || '').trim()); return r; });
}
function money(s: string | number | null): number {
  if (typeof s === 'number') return s;
  const n = Number(String(s || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[.'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stripSuffix(s: string): string {
  return s.replace(/\b(JR|SR|II|III|IV|MD|DO|PHD|ESQ|CPA)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

const ORG_WORDS = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;

interface MasterEntry {
  last: string; first: string; firstInitial: string; state: string; city: string;
  cycles: Set<string>; totalGiven: number; pacs: Set<string>;
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
      // Split on raw comma BEFORE norm (which strips commas)
      const [lastRaw, restRaw] = (r.donor_name || '').split(',').map(s => s.trim());
      const last = norm(stripSuffix(lastRaw || ''));
      const first = norm(stripSuffix((restRaw || '').split(/\s+/)[0] || ''));
      if (!last || !first) continue;
      const state = norm(r.state);
      const key = `${last}|${first[0]}|${state}`;
      let e = idx.get(key);
      if (!e) {
        e = { last, first, firstInitial: first[0], state, city: norm(r.city),
              cycles: new Set(), totalGiven: 0, pacs: new Set() };
        idx.set(key, e);
      }
      e.cycles.add(cycle);
      e.totalGiven += money(r.total_given);
      (r.pacs_given_to || '').split(/;\s*/).filter(Boolean).forEach(p => e!.pacs.add(p));
      if (first.length > e.first.length) e.first = first;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Acton itemized loader (OH SOS raw rows)
// ---------------------------------------------------------------------------

interface ActonContribution {
  rawName: string; last: string; first: string; firstInitial: string;
  state: string; city: string; amount: number; date: string;
}

function loadActonIndividuals(): ActonContribution[] {
  const raw = JSON.parse(fs.readFileSync(ACTON_RAW, 'utf8')) as string[][];
  const out: ActonContribution[] = [];
  for (const r of raw) {
    const indivName = (r[0] || '').trim();
    const orgName = (r[1] || '').trim();
    if (!indivName || orgName) continue; // individuals only
    // OH SOS format is "LAST FIRST" (no comma); master format is "LAST, FIRST".
    let last = '', first = '';
    if (indivName.includes(',')) {
      const [l, rest] = indivName.split(',').map(s => s.trim());
      last = norm(stripSuffix(l || ''));
      first = norm(stripSuffix((rest || '').split(/\s+/)[0] || ''));
    } else {
      const toks = norm(stripSuffix(indivName)).split(/\s+/);
      if (toks.length >= 2) { last = toks[0]; first = toks[1]; }
    }
    if (!last || !first) continue;
    out.push({
      rawName: indivName, last, first, firstInitial: first[0],
      state: norm(r[5] || ''), city: norm(r[4] || ''),
      amount: money(r[10] || ''), date: (r[9] || '').trim(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Match + aggregate
// ---------------------------------------------------------------------------

interface FlaggedDonor {
  name: string; state: string; city: string;
  amountToActon: number;
  contributionCount: number;
  proIsraelLifetime: number;
  proIsraelCycles: string[];
  proIsraelPacs: string[];
}

interface MatchResult {
  flagged: FlaggedDonor[];
  bundlerTotal: number;
}

function matchActonToMaster(
  contribs: ActonContribution[],
  master: Map<string, MasterEntry>,
): MatchResult {
  // Aggregate Acton individual contribs by (last|firstInitial|state)
  const byKey = new Map<string, { name: string; state: string; city: string; amount: number; count: number }>();
  for (const c of contribs) {
    const key = `${c.last}|${c.firstInitial}|${c.state}`;
    const cur = byKey.get(key);
    if (cur) { cur.amount += c.amount; cur.count += 1; }
    else byKey.set(key, { name: c.rawName, state: c.state, city: c.city, amount: c.amount, count: 1 });
  }

  const flagged: FlaggedDonor[] = [];
  let bundlerTotal = 0;
  for (const [key, agg] of byKey) {
    const m = master.get(key); // HIGH confidence ONLY (name + state + first initial)
    if (!m) continue;
    flagged.push({
      name: `${m.last}, ${m.first}`, state: m.state, city: m.city,
      amountToActon: agg.amount,
      contributionCount: agg.count,
      proIsraelLifetime: m.totalGiven,
      proIsraelCycles: Array.from(m.cycles).sort(),
      proIsraelPacs: Array.from(m.pacs),
    });
    bundlerTotal += agg.amount;
  }
  flagged.sort((a, b) => b.amountToActon - a.amountToActon);
  return { flagged, bundlerTotal };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--write');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('='.repeat(80));
  console.log('  Flag Amy Acton individual pro-Israel bundlers');
  console.log('='.repeat(80));
  console.log(dryRun ? '  [DRY RUN — no DB write]' : '  [LIVE — writing to Supabase]');
  console.log('');

  console.log('Loading pro-Israel master registry...');
  const master = loadMaster();
  const cycleFiles = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f)).sort();
  const cycleRange = cycleFiles.length > 0
    ? `${cycleFiles[0].match(/\d{4}/)![0]}–${cycleFiles[cycleFiles.length - 1].match(/\d{4}/)![0]}`
    : 'none';
  console.log(`  ${master.size} unique individuals indexed across ${cycleFiles.length} cycles (${cycleRange})`);

  console.log('\nLoading Acton itemized individuals...');
  const contribs = loadActonIndividuals();
  console.log(`  ${contribs.length} individual contribution rows`);

  const { flagged, bundlerTotal } = matchActonToMaster(contribs, master);
  console.log(`\nHigh-confidence matches (name+state+initial): ${flagged.length}`);
  console.log(`Individual bundler total → Acton: ${fmt(bundlerTotal)}`);
  console.log('');
  console.log('  Donor'.padEnd(32) + 'St  ' + '→Acton'.padStart(10) + '  ' + 'pro-Israel lifetime'.padStart(20));
  console.log('  ' + '-'.repeat(80));
  for (const d of flagged) {
    console.log(
      '  ' + d.name.padEnd(30) + ' ' + d.state.padEnd(3) + ' ' +
      fmt(d.amountToActon).padStart(10) + '  ' + fmt(d.proIsraelLifetime).padStart(18)
    );
  }

  // Load current politician row
  console.log('\nLoading current Acton row from Supabase...');
  const { data: pol, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !pol) { console.error(`Failed: ${loadErr?.message}`); process.exit(1); }

  const currentBreakdown = pol.israel_lobby_breakdown || { total: 0, pacs: 0, ie: 0, bundlers: 0 };
  const currentTotal = Number(pol.israel_lobby_total) || 0;
  const currentAipac = Number(pol.aipac_funding) || 0;

  // Merge: add our bundler total to the existing breakdown
  const newBreakdown = {
    ...currentBreakdown,
    bundlers: (Number(currentBreakdown.bundlers) || 0) + bundlerTotal,
    total: (Number(currentBreakdown.total) || 0) + bundlerTotal,
    // Track cycles_count for the scorer's multi-cycle multiplier
    cycles_count: Math.max(
      Number((currentBreakdown as Record<string, unknown>).cycles_count) || 0,
      new Set(flagged.flatMap(d => d.proIsraelCycles)).size,
    ),
    individual_bundlers: flagged.map(d => ({
      name: d.name, state: d.state, amount: d.amountToActon,
      pro_israel_lifetime: d.proIsraelLifetime,
      cycles: d.proIsraelCycles, pacs: d.proIsraelPacs,
    })),
  };
  const newIsraelTotal = currentTotal + bundlerTotal;

  console.log('\nIsrael lobby totals:');
  console.log(`  israel_lobby_total:        ${fmt(currentTotal)} → ${fmt(newIsraelTotal)}`);
  console.log(`  breakdown.bundlers:        ${fmt(Number(currentBreakdown.bundlers) || 0)} → ${fmt(newBreakdown.bundlers)}`);
  console.log(`  breakdown.cycles_count:    ${(currentBreakdown as Record<string, unknown>).cycles_count ?? 0} → ${newBreakdown.cycles_count}`);

  // Recompute score
  const polForScoring: Politician = {
    id: BIOGUIDE_ID,
    name: pol.name,
    office: pol.office,
    officeLevel: pol.office_level,
    party: pol.party,
    jurisdiction: pol.jurisdiction,
    jurisdictionType: pol.jurisdiction_type,
    corruptionScore: pol.corruption_score,
    juiceBoxTier: pol.juice_box_tier,
    aipacFunding: currentAipac,
    totalFundsRaised: Number(pol.total_funds) || 0,
    top5Donors: (pol.top5_donors as Politician['top5Donors']) || [],
    contributionBreakdown: pol.contribution_breakdown || { aipac: 0, otherPACs: 0, individuals: 0, corporate: 0 },
    israelLobbyTotal: newIsraelTotal,
    israelLobbyBreakdown: newBreakdown,
    isActive: pol.is_active ?? false,
    isCandidate: true,
    runningFor: pol.running_for ?? 'Governor of Ohio',
    tags: pol.tags || [],
    bio: pol.bio,
    socialMedia: pol.social_media || {},
    dataSource: pol.data_source,
    donorForensics: pol.donor_forensics,
    courtCases: [],
    lobbyingRecords: pol.lobbying_records || [],
    votes: [],
  };
  const score = computeCorruptionScore(polForScoring);
  console.log(`\nCorruption score: ${pol.corruption_score} → ${score.score} (${score.grade}, ${score.confidence})`);
  for (const f of score.factors) {
    console.log(`  ${f.key.padEnd(28)} raw=${String(f.rawScore).padStart(3)} weight=${f.weight.toFixed(2)} ${f.dataAvailable ? '✓' : '·'}`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No DB write. Re-run with --write to commit.');
    return;
  }

  const { error } = await supabase
    .from('politicians')
    .update({
      israel_lobby_total: newIsraelTotal,
      israel_lobby_breakdown: newBreakdown,
      corruption_score: score.score,
      updated_at: new Date().toISOString(),
    })
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) { console.error(`DB update failed: ${error.message}`); process.exit(1); }
  console.log('\n✓ DB update succeeded.');
}

main().catch(e => { console.error(e); process.exit(1); });
