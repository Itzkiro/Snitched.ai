#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Generic batch: cross-reference each candidate's itemized individual
 * contributions against the pro-Israel master registry, write
 * individual-bundler signal + per-donor named list into the politician's
 * israel_lobby_breakdown.
 *
 * Preserves any existing `pacs` and `ie` slots in the breakdown (those are
 * populated by separate pipelines like TrackAIPAC). Only touches `bundlers`,
 * `individual_bundlers`, and the `bundlers_by_source` meta.
 *
 * Does NOT overwrite `corruption_score` — run the appropriate scorer
 * (score-vivek-acton.ts, sync-corruption-scores.ts, etc.) after.
 *
 * Usage:
 *   npx tsx scripts/flag-bundlers-batch.ts              # dry-run all
 *   npx tsx scripts/flag-bundlers-batch.ts --write      # commit
 *   npx tsx scripts/flag-bundlers-batch.ts --only massie,mast  # subset
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// Config — one entry per candidate. `sources` is processed in order:
// first entry is the PRIMARY (scored); subsequent are historical context.
// ---------------------------------------------------------------------------

interface SourceConfig {
  path: string;
  sourceTag: string;           // 'oh_sos_2026' | 'fec_2026_house' | 'fec_2024_pres'
  label: string;               // human-readable
  isPrimary: boolean;          // primary source drives `bundlers` field
}
interface CandidateConfig {
  bioguideId: string;
  key: string;                 // CLI `--only` filter key
  nameLike: string;            // for self-exclusion (skip contributions from the candidate to themselves)
  sources: SourceConfig[];
  // Scoring rule for the `bundlers` field (what drives the corruption score):
  //   'career_sum'      — sum across ALL sources (right for federal incumbents;
  //                       multi-cycle House runs are one entrenched career)
  //   'current_campaign' — primary-source only (right for state candidates where
  //                       the proxy source isn't the same race)
  scoringRule?: 'career_sum' | 'current_campaign';
}

const CANDIDATES: CandidateConfig[] = [
  {
    bioguideId: 'ky-04-thomas-massie',
    key: 'massie',
    nameLike: 'MASSIE',
    scoringRule: 'career_sum',
    sources: [
      { path: 'data-ingestion/massie-fec-2026-itemized.json', sourceTag: 'fec_2026_house', label: '2026 KY-4 House campaign (FEC, current cycle)', isPrimary: true },
      { path: 'data-ingestion/massie-fec-2024-itemized.json', sourceTag: 'fec_2024_house', label: '2024 KY-4 House campaign (FEC, prior cycle)', isPrimary: false },
      { path: 'data-ingestion/massie-fec-2022-itemized.json', sourceTag: 'fec_2022_house', label: '2022 KY-4 House campaign (FEC, historical)', isPrimary: false },
    ],
  },
  {
    bioguideId: 'ky-04-2026-ed-gallrein',
    key: 'gallrein',
    nameLike: 'GALLREIN',
    scoringRule: 'current_campaign',  // first-time candidate, only 2026 data
    sources: [
      { path: 'data-ingestion/gallrein-fec-2026-itemized.json', sourceTag: 'fec_2026_house', label: '2026 KY-4 House challenge (FEC, first-time candidate)', isPrimary: true },
    ],
  },
  {
    bioguideId: 'fl-21-2026-bernard-taylor',
    key: 'taylor',
    nameLike: 'TAYLOR',
    scoringRule: 'current_campaign',
    sources: [
      { path: 'data-ingestion/taylor-fec-2026-itemized.json', sourceTag: 'fec_2026_house', label: '2026 FL-21 House challenge (FEC, first-time candidate)', isPrimary: true },
    ],
  },
  {
    bioguideId: '317b2e4e-5dcf-478b-bad4-1518d0fc20c2',
    key: 'mast',
    nameLike: 'MAST',
    scoringRule: 'career_sum',
    sources: [
      { path: 'data-ingestion/mast-fec-2026-itemized.json', sourceTag: 'fec_2026_house', label: '2026 FL-21 House campaign (FEC, current cycle)', isPrimary: true },
      { path: 'data-ingestion/mast-fec-2024-itemized.json', sourceTag: 'fec_2024_house', label: '2024 FL-21 House campaign (FEC, prior cycle)', isPrimary: false },
      { path: 'data-ingestion/mast-fec-2022-itemized.json', sourceTag: 'fec_2022_house', label: '2022 FL-21 House campaign (FEC, historical)', isPrimary: false },
    ],
  },
  {
    bioguideId: 'ny-15-ritchie-torres',
    key: 'torres',
    nameLike: 'TORRES',
    scoringRule: 'career_sum',
    sources: [
      { path: 'data-ingestion/torres-fec-2026-itemized.json', sourceTag: 'fec_2026_house', label: '2026 NY-15 House campaign (FEC, current cycle)', isPrimary: true },
      { path: 'data-ingestion/torres-fec-2024-itemized.json', sourceTag: 'fec_2024_house', label: '2024 NY-15 House campaign (FEC, prior cycle)', isPrimary: false },
      { path: 'data-ingestion/torres-fec-2022-itemized.json', sourceTag: 'fec_2022_house', label: '2022 NY-15 House campaign (FEC, historical)', isPrimary: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers (duplicated intentionally; this script is standalone)
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur); return out.map(s => s.trim());
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
function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

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
// Contribution loader (works on FEC Schedule A JSON or OH SOS itemized JSON)
// ---------------------------------------------------------------------------

interface Contrib {
  last: string; first: string; firstInitial: string;
  state: string; city: string; amount: number; date: string;
}

function loadContribs(filePath: string, selfNameLike: string): Contrib[] {
  if (!fs.existsSync(filePath)) { console.warn(`  [!] missing: ${filePath}`); return []; }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Record<string, unknown>>;
  const out: Contrib[] = [];
  for (const r of raw) {
    if ((r.entity_type as string) && (r.entity_type as string) !== 'IND') continue;
    const last = norm(stripSuffix(String(r.contributor_last_name || '')));
    const first = norm(stripSuffix(String(r.contributor_first_name || '')));
    if (!last || !first) continue;
    if (last === selfNameLike) continue; // skip self-funding
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

// ---------------------------------------------------------------------------
// Cross-ref and per-candidate flagging
// ---------------------------------------------------------------------------

interface FlaggedDonor {
  name: string; state: string; city: string;
  amount: number; contribCount: number;
  proIsraelLifetime: number;
  proIsraelCycles: string[]; proIsraelPacs: string[];
}

function matchToMaster(contribs: Contrib[], master: Map<string, MasterEntry>): { flagged: FlaggedDonor[]; total: number } {
  const byKey = new Map<string, { name: string; state: string; city: string; amount: number; count: number }>();
  for (const c of contribs) {
    const key = `${c.last}|${c.firstInitial}|${c.state}`;
    const cur = byKey.get(key);
    if (cur) { cur.amount += c.amount; cur.count += 1; }
    else byKey.set(key, { name: `${c.last}, ${c.first}`, state: c.state, city: c.city, amount: c.amount, count: 1 });
  }
  const flagged: FlaggedDonor[] = [];
  let total = 0;
  for (const [key, agg] of byKey) {
    const m = master.get(key);
    if (!m) continue;
    flagged.push({
      name: `${m.last}, ${m.first}`, state: m.state, city: m.city,
      amount: agg.amount, contribCount: agg.count,
      proIsraelLifetime: m.totalGiven,
      proIsraelCycles: Array.from(m.cycles).sort(),
      proIsraelPacs: Array.from(m.pacs),
    });
    total += agg.amount;
  }
  flagged.sort((a, b) => b.amount - a.amount);
  return { flagged, total };
}

// Merge per-source lists by donor key, tagging which sources each donor came from
interface DualDonor {
  name: string; state: string; city: string;
  amounts_by_source: Record<string, number>;
  counts_by_source: Record<string, number>;
  pro_israel_lifetime: number;
  pro_israel_cycles: string[];
  pro_israel_pacs: string[];
  sources: string[];
}

function mergeSources(perSource: Array<{ sourceTag: string; flagged: FlaggedDonor[] }>): DualDonor[] {
  const merged = new Map<string, DualDonor>();
  for (const { sourceTag, flagged } of perSource) {
    for (const d of flagged) {
      const k = `${d.name}|${d.state}`;
      const cur = merged.get(k);
      if (cur) {
        cur.amounts_by_source[sourceTag] = (cur.amounts_by_source[sourceTag] || 0) + d.amount;
        cur.counts_by_source[sourceTag] = (cur.counts_by_source[sourceTag] || 0) + d.contribCount;
        if (!cur.sources.includes(sourceTag)) cur.sources.push(sourceTag);
        cur.pro_israel_lifetime = Math.max(cur.pro_israel_lifetime, d.proIsraelLifetime);
      } else {
        merged.set(k, {
          name: d.name, state: d.state, city: d.city,
          amounts_by_source: { [sourceTag]: d.amount },
          counts_by_source: { [sourceTag]: d.contribCount },
          pro_israel_lifetime: d.proIsraelLifetime,
          pro_israel_cycles: d.proIsraelCycles,
          pro_israel_pacs: d.proIsraelPacs,
          sources: [sourceTag],
        });
      }
    }
  }
  return Array.from(merged.values());
}

// ---------------------------------------------------------------------------
// Per-candidate processor
// ---------------------------------------------------------------------------

async function processCandidate(
  supabase: ReturnType<typeof createClient>,
  master: Map<string, MasterEntry>,
  config: CandidateConfig,
  dryRun: boolean,
): Promise<void> {
  console.log('\n' + '━'.repeat(80));
  console.log(`  ${config.bioguideId} (${config.key})`);
  console.log('━'.repeat(80));

  // Process each source independently
  const perSource: Array<{ sourceTag: string; flagged: FlaggedDonor[]; total: number; label: string; isPrimary: boolean }> = [];
  for (const s of config.sources) {
    const contribs = loadContribs(s.path, config.nameLike);
    const { flagged, total } = matchToMaster(contribs, master);
    console.log(`  ${s.sourceTag}: ${contribs.length} rows → ${flagged.length} matches, ${fmt(total)} ${s.isPrimary ? '[PRIMARY — SCORED]' : '[CONTEXT]'}`);
    perSource.push({ sourceTag: s.sourceTag, flagged, total, label: s.label, isPrimary: s.isPrimary });
  }
  if (perSource.every(s => s.flagged.length === 0)) {
    console.log(`  No matches across any source — skipping DB write`);
    return;
  }

  const primary = perSource.find(s => s.isPrimary)!;
  const merged = mergeSources(perSource);
  merged.sort((a, b) => (b.amounts_by_source[primary.sourceTag] || 0) - (a.amounts_by_source[primary.sourceTag] || 0));

  // Show top 10
  console.log(`\n  Top 10 by primary-source amount:`);
  for (const d of merged.slice(0, 10)) {
    const pAmt = d.amounts_by_source[primary.sourceTag] || 0;
    const tags = d.sources.join('+');
    console.log(`    ${d.name.padEnd(28)} ${d.state.padEnd(3)} ${fmt(pAmt).padStart(10)} | pro-Israel life: ${fmt(d.pro_israel_lifetime).padStart(12)} | ${tags}`);
  }

  // Load existing DB row
  const { data: pol, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', config.bioguideId).single();
  if (loadErr || !pol) { console.error(`  Load failed: ${loadErr?.message}`); return; }

  const existingBreakdown = ((pol as Record<string, unknown>).israel_lobby_breakdown || {}) as Record<string, unknown>;
  const existingPacs = Number(existingBreakdown.pacs) || 0;
  const existingIe = Number(existingBreakdown.ie) || 0;
  const existingTotal = Number((pol as Record<string, unknown>).israel_lobby_total) || 0;

  // Build bundlers_by_source summary
  const bundlersBySource: Record<string, unknown> = {};
  for (const s of perSource) {
    bundlersBySource[s.sourceTag] = {
      label: s.label, donor_count: s.flagged.length, amount: s.total,
      is_primary_scored: s.isPrimary,
    };
  }

  // Scoring rule: 'career_sum' (federal incumbents — sum across all cycles
  // of same race, reflects true career capture) or 'current_campaign'
  // (state races / first-time candidates — current filing only). Default
  // is current_campaign for backward compat with the v1 behavior.
  const scoringRule = config.scoringRule ?? 'current_campaign';
  const scoringBundlers = scoringRule === 'career_sum'
    ? perSource.reduce((sum, s) => sum + s.total, 0)
    : primary.total;
  const allCycles = new Set<string>();
  for (const d of merged) for (const c of d.pro_israel_cycles) allCycles.add(c);

  const newBreakdown = {
    pacs: existingPacs,                                     // preserve
    ie: existingIe,                                         // preserve
    bundlers: scoringBundlers,                              // scoring rule applied
    total: existingPacs + existingIe + scoringBundlers,
    cycles_count: allCycles.size,
    scoring_rule: scoringRule,
    source: perSource.map(s => s.sourceTag).join('+'),
    bundlers_by_source: bundlersBySource,
    individual_bundlers: merged.map(d => ({
      name: d.name, state: d.state,
      amounts_by_source: d.amounts_by_source,
      counts_by_source: d.counts_by_source,
      pro_israel_lifetime: d.pro_israel_lifetime,
      cycles: d.pro_israel_cycles,
      pacs: d.pro_israel_pacs,
      sources: d.sources,
      in_multiple_sources: d.sources.length > 1,
    })),
  };
  const newTotal = newBreakdown.total;

  console.log(`\n  DB update:`);
  console.log(`    israel_lobby_total:   ${fmt(existingTotal)} → ${fmt(newTotal)}`);
  console.log(`    breakdown.bundlers:   ${fmt(Number(existingBreakdown.bundlers) || 0)} → ${fmt(newBreakdown.bundlers)}`);
  console.log(`    breakdown.pacs (preserved): ${fmt(existingPacs)}`);
  console.log(`    breakdown.ie   (preserved): ${fmt(existingIe)}`);

  if (dryRun) { console.log(`  [dry-run]`); return; }

  const { error } = await supabase
    .from('politicians')
    .update({
      israel_lobby_total: newTotal,
      israel_lobby_breakdown: newBreakdown,
      updated_at: new Date().toISOString(),
    })
    .eq('bioguide_id', config.bioguideId);
  if (error) console.error(`  WRITE FAILED: ${error.message}`);
  else console.log(`  ✓ DB written`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--write');
  const onlyArg = argv.find(a => a.startsWith('--only'));
  const onlyKeys = onlyArg ? onlyArg.replace(/^--only[=\s]?/, '').split(',').map(s => s.trim().toLowerCase()) : null;

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Supabase env missing'); process.exit(1); }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('='.repeat(80));
  console.log('  BATCH: flag individual pro-Israel bundlers');
  console.log('='.repeat(80));
  console.log(dryRun ? '  [DRY RUN]' : '  [LIVE — writing to Supabase]');

  console.log('\nLoading master registry...');
  const master = loadMaster();
  console.log(`  ${master.size} individuals indexed`);

  const targets = onlyKeys ? CANDIDATES.filter(c => onlyKeys.includes(c.key)) : CANDIDATES;
  console.log(`\nProcessing ${targets.length} candidate(s): ${targets.map(c => c.key).join(', ')}`);

  for (const c of targets) {
    await processCandidate(supabase, master, c, dryRun);
  }

  console.log('\n' + '='.repeat(80));
  console.log(dryRun ? '  Dry-run complete — re-run with --write to commit' : '  All writes committed.');
  console.log('  Next: run appropriate scorer (score-vivek-acton.ts or sync-corruption-scores.ts)');
  console.log('='.repeat(80));
}

main().catch(e => { console.error(e); process.exit(1); });
