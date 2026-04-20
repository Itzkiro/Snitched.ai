#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Flag Vivek Ramaswamy's individual pro-Israel bundlers using his 2024
 * presidential-run FEC Schedule A as a proxy.
 *
 * Why proxy: OH SOS CFDISCLOSURE portal is Cloudflare-blocked, so we can't
 * directly pull his 2026 OH governor itemized individual list. The 2024 FEC
 * data is the best available signal of who funds him; many of these donors
 * will recur on the 2026 state filing.
 *
 * Provenance: the bundler total is tagged with `source` field in
 * israel_lobby_breakdown so the proxy nature is auditable. If/when we unblock
 * OH SOS and pull his real 2026 roster, the proxy value should be replaced.
 *
 * Data: data-ingestion/vivek-fec-2024-itemized.json (produced by
 * scripts/fetch-vivek-fec-2024.ts).
 *
 * Usage:
 *   npx tsx scripts/flag-vivek-individual-israel-donors.ts           # dry
 *   npx tsx scripts/flag-vivek-individual-israel-donors.ts --write   # commit
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const BIOGUIDE_ID = 'oh-gov-2026-vivek-ramaswamy';
const VIVEK_OH_SOS = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');
const VIVEK_FEC = path.join(__dirname, '..', 'data-ingestion', 'vivek-fec-2024-itemized.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// Helpers (same as flag-acton script, intentionally duplicated for standalone)
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
  for (const f of fs.readdirSync(DATA_DIR).filter(x => /^pro-israel-donors-\d{4}\.csv$/.test(x))) {
    const cycle = f.match(/(\d{4})/)![1];
    for (const r of parseCsv(path.join(DATA_DIR, f))) {
      const nameUpper = (r.donor_name || '').toUpperCase();
      if (!/^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/.test(nameUpper)) continue;
      if (ORG_WORDS.test(nameUpper)) continue;
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
// Vivek FEC loader (individuals only; skip Vivek self-funding)
// ---------------------------------------------------------------------------

interface VivekContrib {
  last: string; first: string; firstInitial: string;
  state: string; city: string; amount: number; date: string;
}

type SourceTag = 'oh_sos_2026' | 'fec_2024_pres';

function loadContribsFromJson(p: string): VivekContrib[] {
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<Record<string, unknown>>;
  const out: VivekContrib[] = [];
  for (const r of raw) {
    if ((r.entity_type as string) !== 'IND') continue;
    const last = norm(stripSuffix(String(r.contributor_last_name || '')));
    const first = norm(stripSuffix(String(r.contributor_first_name || '')));
    if (!last || !first) continue;
    if (last === 'RAMASWAMY') continue; // skip self-funding
    out.push({
      last, first, firstInitial: first[0],
      state: norm(String(r.contributor_state || '')),
      city: norm(String(r.contributor_city || '')),
      amount: money(r.contribution_receipt_amount as number | string | null),
      date: String(r.contribution_receipt_date || ''),
    });
  }
  return out;
}

function loadBothSources(): { oh_sos_2026: VivekContrib[]; fec_2024_pres: VivekContrib[] } {
  return {
    oh_sos_2026: loadContribsFromJson(VIVEK_OH_SOS),
    fec_2024_pres: loadContribsFromJson(VIVEK_FEC),
  };
}

// ---------------------------------------------------------------------------
// Match + aggregate
// ---------------------------------------------------------------------------

interface FlaggedDonor {
  name: string; state: string; city: string;
  amountToVivek: number; contributionCount: number;
  proIsraelLifetime: number; proIsraelCycles: string[]; proIsraelPacs: string[];
}

function matchToMaster(
  contribs: VivekContrib[],
  master: Map<string, MasterEntry>,
): { flagged: FlaggedDonor[]; bundlerTotal: number } {
  const byKey = new Map<string, { name: string; state: string; city: string; amount: number; count: number }>();
  for (const c of contribs) {
    const key = `${c.last}|${c.firstInitial}|${c.state}`;
    const cur = byKey.get(key);
    if (cur) { cur.amount += c.amount; cur.count += 1; }
    else byKey.set(key, { name: `${c.last}, ${c.first}`, state: c.state, city: c.city, amount: c.amount, count: 1 });
  }
  const flagged: FlaggedDonor[] = [];
  let bundlerTotal = 0;
  for (const [key, agg] of byKey) {
    const m = master.get(key); // HIGH confidence only
    if (!m) continue;
    flagged.push({
      name: `${m.last}, ${m.first}`, state: m.state, city: m.city,
      amountToVivek: agg.amount, contributionCount: agg.count,
      proIsraelLifetime: m.totalGiven,
      proIsraelCycles: Array.from(m.cycles).sort(),
      proIsraelPacs: Array.from(m.pacs),
    });
    bundlerTotal += agg.amount;
  }
  flagged.sort((a, b) => b.amountToVivek - a.amountToVivek);
  return { flagged, bundlerTotal };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

async function main() {
  const dryRun = !process.argv.includes('--write');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Supabase env missing'); process.exit(1); }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('='.repeat(80));
  console.log('  Flag Vivek Ramaswamy individual pro-Israel bundlers');
  console.log(`  Source: FEC Schedule A 2024 (committee C00833913) — proxy for 2026 OH-gov`);
  console.log('='.repeat(80));
  console.log(dryRun ? '  [DRY RUN]' : '  [LIVE — writing to Supabase]');
  console.log('');

  const master = loadMaster();
  const cycleFiles = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f)).sort();
  const cycleRange = cycleFiles.length > 0
    ? `${cycleFiles[0].match(/\d{4}/)![0]}–${cycleFiles[cycleFiles.length - 1].match(/\d{4}/)![0]}`
    : 'none';
  console.log(`Master registry: ${master.size} individuals across ${cycleFiles.length} cycles (${cycleRange})`);

  // Process BOTH sources independently, then merge into a dual-source breakdown.
  const sources = loadBothSources();
  console.log(`OH SOS 2026 (current campaign):  ${sources.oh_sos_2026.length} contribution rows`);
  console.log(`FEC 2024 pres (historical proxy): ${sources.fec_2024_pres.length} contribution rows`);

  const ohSosMatches = matchToMaster(sources.oh_sos_2026, master);
  const fecMatches = matchToMaster(sources.fec_2024_pres, master);

  console.log(`\nOH SOS 2026 high-confidence matches: ${ohSosMatches.flagged.length} donors, ${fmt(ohSosMatches.bundlerTotal)} → Vivek`);
  console.log(`FEC 2024 pres high-confidence matches: ${fecMatches.flagged.length} donors, ${fmt(fecMatches.bundlerTotal)} → Vivek (historical)`);

  // Merge per-donor. Key by "last|firstInitial|state" so overlapping donors
  // collapse into one record with both per-source amounts.
  interface DualSourceDonor {
    name: string; state: string; city: string;
    amount_oh_sos_2026: number;
    amount_fec_2024_pres: number;
    contribution_count_oh_sos_2026: number;
    contribution_count_fec_2024_pres: number;
    pro_israel_lifetime: number;
    pro_israel_cycles: string[];
    pro_israel_pacs: string[];
    sources: SourceTag[];
  }
  const merged = new Map<string, DualSourceDonor>();
  const keyOf = (d: FlaggedDonor) => `${d.name}|${d.state}`;

  for (const d of ohSosMatches.flagged) {
    merged.set(keyOf(d), {
      name: d.name, state: d.state, city: d.city,
      amount_oh_sos_2026: d.amountToVivek, amount_fec_2024_pres: 0,
      contribution_count_oh_sos_2026: d.contributionCount, contribution_count_fec_2024_pres: 0,
      pro_israel_lifetime: d.proIsraelLifetime,
      pro_israel_cycles: d.proIsraelCycles, pro_israel_pacs: d.proIsraelPacs,
      sources: ['oh_sos_2026'],
    });
  }
  for (const d of fecMatches.flagged) {
    const k = keyOf(d);
    const cur = merged.get(k);
    if (cur) {
      cur.amount_fec_2024_pres = d.amountToVivek;
      cur.contribution_count_fec_2024_pres = d.contributionCount;
      cur.sources.push('fec_2024_pres');
      // Keep the larger lifetime figure (both should be equal since same master)
      cur.pro_israel_lifetime = Math.max(cur.pro_israel_lifetime, d.proIsraelLifetime);
    } else {
      merged.set(k, {
        name: d.name, state: d.state, city: d.city,
        amount_oh_sos_2026: 0, amount_fec_2024_pres: d.amountToVivek,
        contribution_count_oh_sos_2026: 0, contribution_count_fec_2024_pres: d.contributionCount,
        pro_israel_lifetime: d.proIsraelLifetime,
        pro_israel_cycles: d.proIsraelCycles, pro_israel_pacs: d.proIsraelPacs,
        sources: ['fec_2024_pres'],
      });
    }
  }
  const mergedList = Array.from(merged.values()).sort((a, b) => b.amount_oh_sos_2026 - a.amount_oh_sos_2026 || b.amount_fec_2024_pres - a.amount_fec_2024_pres);

  const donorsInBoth = mergedList.filter(d => d.sources.length === 2);
  const donorsOhSosOnly = mergedList.filter(d => d.sources.length === 1 && d.sources[0] === 'oh_sos_2026');
  const donorsFecOnly = mergedList.filter(d => d.sources.length === 1 && d.sources[0] === 'fec_2024_pres');

  console.log(`\nUnion / intersection:`);
  console.log(`  Donors in BOTH datasets (gave 2024 pres AND 2026 gov): ${donorsInBoth.length}`);
  console.log(`  OH SOS 2026 only (new current-campaign donors):       ${donorsOhSosOnly.length}`);
  console.log(`  FEC 2024 only (historical, not recurring in 2026):    ${donorsFecOnly.length}`);
  console.log(`  Total unique donors: ${mergedList.length}`);

  console.log(`\nTop 20 donors-in-both (highest overlap signal):`);
  console.log('  ' + 'Donor'.padEnd(30) + 'St  ' + '→2026'.padStart(10) + '  ' + '→2024'.padStart(10) + '  pro-Israel life');
  console.log('  ' + '-'.repeat(80));
  for (const d of donorsInBoth.slice(0, 20)) {
    console.log(
      '  ' + d.name.padEnd(30) + ' ' + d.state.padEnd(3) + ' ' +
      fmt(d.amount_oh_sos_2026).padStart(10) + '  ' +
      fmt(d.amount_fec_2024_pres).padStart(10) + '  ' +
      fmt(d.pro_israel_lifetime)
    );
  }

  // Load current politician row
  const { data: pol, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !pol) { console.error(`Load failed: ${loadErr?.message}`); process.exit(1); }

  const currentBreakdown = pol.israel_lobby_breakdown || { total: 0, pacs: 0, ie: 0, bundlers: 0 };
  const currentTotal = Number(pol.israel_lobby_total) || 0;

  // SCORING RULE: `bundlers` (which drives the v6.5 scorer's israelLobbyTotal)
  // uses ONLY the current-campaign OH SOS figure so we don't double-count
  // historical 2024 pres donors who aren't active in 2026. The FEC 2024
  // number is preserved separately for UI context.
  const basePacs = Number(currentBreakdown.pacs) || 0;
  const baseIe = Number(currentBreakdown.ie) || 0;
  const scoringBundlers = ohSosMatches.bundlerTotal;
  const allCyclesFromBoth = new Set<string>();
  for (const d of mergedList) for (const c of d.pro_israel_cycles) allCyclesFromBoth.add(c);

  const newBreakdown = {
    pacs: basePacs,
    ie: baseIe,
    bundlers: scoringBundlers,
    total: basePacs + baseIe + scoringBundlers,
    cycles_count: allCyclesFromBoth.size,
    source: 'oh_sos_2026+fec_2024_pres_union',
    // Separate per-source summaries for UI to render both datasets side-by-side
    bundlers_by_source: {
      oh_sos_2026: {
        label: '2026 OH governor campaign (real, OH SOS itemized)',
        donor_count: ohSosMatches.flagged.length,
        amount: ohSosMatches.bundlerTotal,
        is_current_campaign: true,
      },
      fec_2024_pres: {
        label: '2024 presidential campaign (historical, FEC Schedule A proxy)',
        donor_count: fecMatches.flagged.length,
        amount: fecMatches.bundlerTotal,
        is_current_campaign: false,
      },
      both: {
        label: 'Donors who appear in BOTH datasets (strongest signal)',
        donor_count: donorsInBoth.length,
        amount_2026: donorsInBoth.reduce((s, d) => s + d.amount_oh_sos_2026, 0),
        amount_2024: donorsInBoth.reduce((s, d) => s + d.amount_fec_2024_pres, 0),
      },
    },
    individual_bundlers: mergedList.map(d => ({
      name: d.name, state: d.state,
      amount_oh_sos_2026: d.amount_oh_sos_2026,
      amount_fec_2024_pres: d.amount_fec_2024_pres,
      pro_israel_lifetime: d.pro_israel_lifetime,
      cycles: d.pro_israel_cycles, pacs: d.pro_israel_pacs,
      sources: d.sources,
      in_both: d.sources.length === 2,
    })),
  };
  const newIsraelTotal = newBreakdown.total;

  console.log(`\nDB updates:`);
  console.log(`  israel_lobby_total:    ${fmt(currentTotal)} → ${fmt(newIsraelTotal)} (= OH SOS 2026 bundlers, score-driver)`);
  console.log(`  breakdown.bundlers:    ${fmt(Number(currentBreakdown.bundlers) || 0)} → ${fmt(newBreakdown.bundlers)}`);
  console.log(`  bundlers_by_source.oh_sos_2026:   ${fmt(ohSosMatches.bundlerTotal)} (${ohSosMatches.flagged.length} donors, SCORED)`);
  console.log(`  bundlers_by_source.fec_2024_pres: ${fmt(fecMatches.bundlerTotal)} (${fecMatches.flagged.length} donors, context only, NOT scored)`);
  console.log(`  bundlers_by_source.both:          ${donorsInBoth.length} donors overlap`);
  console.log(`  cycles_count: ${(currentBreakdown as Record<string, unknown>).cycles_count ?? 0} → ${newBreakdown.cycles_count}`);

  // Score recompute
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
    aipacFunding: Number(pol.aipac_funding) || 0,
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
    console.log('\n[DRY RUN] Re-run with --write to commit.');
    return;
  }

  // NOTE: intentionally NOT writing corruption_score here. Vivek's score is
  // set by scripts/score-vivek-acton.ts using the extended rubric (stance,
  // legal, self-funding). Overwriting with the bare computeCorruptionScore
  // output would wipe those signals. Run score-vivek-acton.ts --write after
  // this to recompute both candidates with the new Israel-lobby input.
  const { error } = await supabase
    .from('politicians')
    .update({
      israel_lobby_total: newIsraelTotal,
      israel_lobby_breakdown: newBreakdown,
      updated_at: new Date().toISOString(),
    })
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) { console.error(`DB update failed: ${error.message}`); process.exit(1); }
  console.log('\n✓ DB update succeeded (israel_lobby_* only — score left alone).');
  console.log('  Next: run `npx tsx scripts/score-vivek-acton.ts --write` to recompute combined score.');
}

main().catch(e => { console.error(e); process.exit(1); });
