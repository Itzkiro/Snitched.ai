#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Apply the Gallrein pro-Israel roster match to his politician row:
 *  (a) write structured payload to politicians.individual_donor_breakdown
 *      (new column — see supabase/migrations/004_add_individual_donor_breakdown.sql)
 *  (b) append a summary + top-5 specific donor red_flags to source_ids.red_flags
 *      without clobbering the 6 existing flags.
 *
 * Idempotent: re-running replaces any previously-applied roster-match flags
 * (matched by a `roster_match` marker) but preserves everything else.
 *
 * If the new column doesn't exist yet (migration not run), falls back to
 * nesting under israel_lobby_breakdown.individual_registry so nothing is
 * lost, and prints a warning telling the operator to run the migration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const BIOGUIDE_ID = 'ky-04-2026-ed-gallrein';
const ARTIFACT = path.join(__dirname, '..', 'data-ingestion', 'gallrein-roster-matches.json');
const TOP_N_DONORS_IN_BREAKDOWN = 25;
const TOP_N_AS_RED_FLAGS = 5;
const ROSTER_MATCH_MARKER = '[roster-match]';

interface MatchRow {
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

interface Artifact {
  generated_at: string;
  candidate: { name: string; office: string; fec_candidate_id: string };
  master_individuals_indexed: number;
  itemized_individual_rows: number;
  matches: MatchRow[];
  totals: {
    donors_matched: number;
    high_confidence: number;
    medium_confidence: number;
    to_candidate: number;
    these_donors_to_pro_israel: number;
  };
}

interface BreakdownPayload {
  itemized_individual_rows: number;
  matches: number;
  high_confidence: number;
  medium_confidence: number;
  to_candidate: number;
  these_donors_to_pro_israel_career: number;
  match_rate_pct: number;
  top_donors: Array<{
    name: string;
    state: string;
    to_candidate: number;
    to_pro_israel_career: number;
    candidate_cycles: string[];
    pro_israel_cycles: string[];
    pacs: string[];
    confidence: 'high' | 'medium';
  }>;
  source: string;
  generated_at: string;
}

function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

function buildBreakdown(a: Artifact): BreakdownPayload {
  const topDonors = a.matches.slice(0, TOP_N_DONORS_IN_BREAKDOWN).map(m => ({
    name: m.donorName,
    state: m.state,
    to_candidate: m.candidateTotal,
    to_pro_israel_career: m.proIsraelTotal,
    candidate_cycles: m.candidateCycles,
    pro_israel_cycles: m.proIsraelCycles,
    pacs: m.proIsraelPacs,
    confidence: m.confidence,
  }));
  return {
    itemized_individual_rows: a.itemized_individual_rows,
    matches: a.totals.donors_matched,
    high_confidence: a.totals.high_confidence,
    medium_confidence: a.totals.medium_confidence,
    to_candidate: a.totals.to_candidate,
    these_donors_to_pro_israel_career: a.totals.these_donors_to_pro_israel,
    match_rate_pct: Math.round((a.totals.donors_matched / a.itemized_individual_rows) * 1000) / 10,
    top_donors: topDonors,
    source: 'data-ingestion/gallrein-roster-matches.json',
    generated_at: a.generated_at,
  };
}

function buildRedFlags(b: BreakdownPayload): Array<{ label: string; severity: 'high' | 'med' }> {
  const flags: Array<{ label: string; severity: 'high' | 'med' }> = [];
  flags.push({
    label: `${ROSTER_MATCH_MARKER} ${b.match_rate_pct}% of itemized individual donors (${b.matches}/${b.itemized_individual_rows}) are documented pro-Israel PAC donors per 2015-2026 registry — same donors gave ${fmt(b.these_donors_to_pro_israel_career)} career to AIPAC/NorPAC/UDP/Pro-Israel America/DMFI/RJC`,
    severity: 'high',
  });
  for (const d of b.top_donors.slice(0, TOP_N_AS_RED_FLAGS)) {
    const topPacs = d.pacs.slice(0, 2).join(', ');
    flags.push({
      label: `${ROSTER_MATCH_MARKER} ${d.name} (${d.state}): ${fmt(d.to_candidate)} to Gallrein, ${fmt(d.to_pro_israel_career)} career to pro-Israel PACs (${topPacs}${d.pacs.length > 2 ? `, +${d.pacs.length - 2}` : ''})`,
      severity: 'high',
    });
  }
  return flags;
}

async function main(): Promise<void> {
  if (!fs.existsSync(ARTIFACT)) throw new Error(`Artifact not found: ${ARTIFACT}`);
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8')) as Artifact;
  const breakdown = buildBreakdown(artifact);
  const newRosterFlags = buildRedFlags(breakdown);

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE env missing');
  const s = createClient(url, key);

  const { data: row, error: loadErr } = await s
    .from('politicians')
    .select('bioguide_id,name,corruption_score,juice_box_tier,source_ids,israel_lobby_breakdown')
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (loadErr || !row) throw new Error(`Load failed: ${loadErr?.message}`);

  const existingSourceIds = (row.source_ids as Record<string, unknown>) ?? {};
  const existingFlags = (existingSourceIds.red_flags as Array<{ label: string; severity: 'high' | 'med' }>) ?? [];
  // Strip any prior roster-match flags so we don't duplicate on re-run
  const keptFlags = existingFlags.filter(f => !f.label.includes(ROSTER_MATCH_MARKER));
  const mergedFlags = [...keptFlags, ...newRosterFlags];
  const newSourceIds = { ...existingSourceIds, red_flags: mergedFlags };

  // Try the new column first; if PostgREST rejects, fall back to nesting
  // under israel_lobby_breakdown.individual_registry.
  let updated = false;
  try {
    const { error } = await s
      .from('politicians')
      .update({ individual_donor_breakdown: breakdown, source_ids: newSourceIds })
      .eq('bioguide_id', BIOGUIDE_ID);
    if (error) throw error;
    updated = true;
    console.log(`✓ Updated individual_donor_breakdown + ${newRosterFlags.length} red_flags`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    const code = (e as { code?: string })?.code ?? '';
    const isMissingColumn = code === 'PGRST204' || /individual_donor_breakdown/.test(msg);
    if (isMissingColumn) {
      console.warn(`! individual_donor_breakdown column not found — run supabase/migrations/004_add_individual_donor_breakdown.sql`);
      console.warn(`  Falling back to israel_lobby_breakdown.individual_registry`);
      const ilb = (row.israel_lobby_breakdown as Record<string, unknown>) ?? {};
      const newIlb = { ...ilb, individual_registry: breakdown };
      const { error } = await s
        .from('politicians')
        .update({ israel_lobby_breakdown: newIlb, source_ids: newSourceIds })
        .eq('bioguide_id', BIOGUIDE_ID);
      if (error) throw error;
      updated = true;
      console.log(`✓ Updated israel_lobby_breakdown.individual_registry + ${newRosterFlags.length} red_flags (fallback path)`);
    } else {
      throw e;
    }
  }

  if (!updated) throw new Error('No update applied');

  console.log('\nSummary:');
  console.log(`  ${row.name} — score ${row.corruption_score}/${row.juice_box_tier}`);
  console.log(`  ${breakdown.matches}/${breakdown.itemized_individual_rows} donors matched registry (${breakdown.match_rate_pct}%)`);
  console.log(`  ${fmt(breakdown.to_candidate)} → Gallrein / ${fmt(breakdown.these_donors_to_pro_israel_career)} career to pro-Israel PACs`);
  console.log(`  red_flags: kept ${keptFlags.length} existing, added ${newRosterFlags.length} roster-match`);
}

main().catch(e => { console.error(e); process.exit(1); });
