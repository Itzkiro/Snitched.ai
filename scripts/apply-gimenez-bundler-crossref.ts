#!/usr/bin/env npx tsx
/**
 * Apply the already-generated pro-Israel bundler crossref artifact for Carlos
 * Gimenez (79bc66ef-4488-439e-af4b-ab6de865364d) to his DB row. Bypasses the
 * roster-match applyToPolitician helper because his existing red_flags are
 * plain strings (not {label, severity} objects), which triggers a runtime type
 * error in that helper.
 *
 * Writes:
 *   - israel_lobby_breakdown.individual_registry = full breakdown payload
 *   - israel_lobby_breakdown.bundlers_from_registry = dollar amount from crossref
 *   - source_ids.red_flags: appended with human-readable bundler summary lines
 *     (idempotent via '[registry-bundler]' marker)
 *   - israel_lobby_total refreshed to: direct PACs + registry-bundler money
 *     (max of existing bundlers field vs registry match, to avoid downgrading)
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const BIOGUIDE_ID = '79bc66ef-4488-439e-af4b-ab6de865364d';
const ART = path.join(__dirname, '..', 'data-ingestion', `${BIOGUIDE_ID}-roster-matches.json`);
const MARKER = '[registry-bundler]';

interface Match {
  donorName: string;
  state: string;
  candidateTotal: number;
  candidateContribCount: number;
  candidateCycles: string[];
  proIsraelTotal: number;
  proIsraelContribCount: number;
  proIsraelCycles: string[];
  proIsraelPacs: string[];
  confidence: 'high' | 'medium';
}

async function main(): Promise<void> {
  const art = JSON.parse(fs.readFileSync(ART, 'utf8')) as {
    itemized_individual_rows: number;
    matches: Match[];
    totals: { donors_matched: number; high_confidence: number; medium_confidence: number; to_candidate: number; these_donors_to_pro_israel: number };
  };

  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await s.from('politicians').select('name,source_ids,israel_lobby_breakdown,israel_lobby_total,aipac_funding').eq('bioguide_id', BIOGUIDE_ID).single();
  if (error || !row) throw new Error(`load: ${error?.message}`);

  const sourceIds = (row.source_ids as Record<string, unknown>) ?? {};
  const existingFlags = (sourceIds.red_flags as string[]) ?? [];
  const keptFlags = existingFlags.filter(f => typeof f === 'string' && !f.includes(MARKER));

  const topByCareer = [...art.matches].sort((a, b) => b.proIsraelTotal - a.proIsraelTotal);
  const topByCandidate = [...art.matches].sort((a, b) => b.candidateTotal - a.candidateTotal);

  const top10CandidateStr = topByCandidate.slice(0, 10).map(m =>
    `${m.donorName}, ${m.state} ($${m.candidateTotal.toFixed(0)} to Gimenez / $${m.proIsraelTotal.toLocaleString()} career pro-Israel; PACs: ${m.proIsraelPacs.slice(0, 3).join('; ')})`
  );
  const top10CareerStr = topByCareer.slice(0, 10).map(m =>
    `${m.donorName}, ${m.state} ($${m.proIsraelTotal.toLocaleString()} lifetime pro-Israel / $${m.candidateTotal.toFixed(0)} to Gimenez; PACs: ${m.proIsraelPacs.slice(0, 3).join('; ')})`
  );

  const newFlags = [
    `${MARKER} ${art.totals.donors_matched} of ${art.itemized_individual_rows} itemized individual donors (${(100*art.totals.donors_matched/art.itemized_individual_rows).toFixed(1)}%) match the 49-year pro-Israel individual-donor registry; ${art.totals.high_confidence} high confidence, ${art.totals.medium_confidence} medium.`,
    `${MARKER} These matched donors gave Gimenez $${art.totals.to_candidate.toLocaleString()}. Their combined lifetime giving to pro-Israel PACs is $${art.totals.these_donors_to_pro_israel.toLocaleString()}.`,
    `${MARKER} Top 10 bundlers by dollars to Gimenez: ${top10CandidateStr.join(' | ')}`,
    `${MARKER} Top 10 bundlers by lifetime pro-Israel giving: ${top10CareerStr.join(' | ')}`,
  ];

  const breakdown = {
    itemized_individual_rows: art.itemized_individual_rows,
    matches: art.totals.donors_matched,
    high_confidence: art.totals.high_confidence,
    medium_confidence: art.totals.medium_confidence,
    to_candidate: art.totals.to_candidate,
    these_donors_to_pro_israel_career: art.totals.these_donors_to_pro_israel,
    match_rate_pct: Number(((100 * art.totals.donors_matched) / art.itemized_individual_rows).toFixed(2)),
    top_donors_by_candidate: topByCandidate.slice(0, 25).map(m => ({
      name: m.donorName, state: m.state,
      to_candidate: m.candidateTotal,
      candidate_contribs: m.candidateContribCount,
      candidate_cycles: m.candidateCycles,
      to_pro_israel_career: m.proIsraelTotal,
      pro_israel_cycles: m.proIsraelCycles,
      pacs: m.proIsraelPacs,
      confidence: m.confidence,
    })),
    top_donors_by_pro_israel_career: topByCareer.slice(0, 25).map(m => ({
      name: m.donorName, state: m.state,
      to_candidate: m.candidateTotal,
      to_pro_israel_career: m.proIsraelTotal,
      pacs: m.proIsraelPacs,
      confidence: m.confidence,
    })),
    source: 'scripts/apply-gimenez-bundler-crossref.ts',
    generated_at: new Date().toISOString(),
  };

  const ilb = (row.israel_lobby_breakdown as Record<string, unknown>) ?? {};
  const existingBundlers = Number(ilb.bundlers) || 0;
  const registryBundlers = art.totals.to_candidate;
  const newBundlers = Math.max(existingBundlers, registryBundlers);
  const directPacs = Number(ilb.pacs) || 0;
  const newTotal = directPacs + newBundlers;

  const newIlb = {
    ...ilb,
    total: newTotal,
    bundlers: newBundlers,
    bundlers_from_registry: registryBundlers,
    individual_registry: breakdown,
  };

  const newSourceIds = {
    ...sourceIds,
    red_flags: [...keptFlags, ...newFlags],
  };

  const { error: upErr } = await s.from('politicians')
    .update({
      israel_lobby_breakdown: newIlb,
      israel_lobby_total: newTotal,
      source_ids: newSourceIds,
      updated_at: new Date().toISOString(),
    })
    .eq('bioguide_id', BIOGUIDE_ID);
  if (upErr) throw upErr;

  console.log('=== GIMENEZ CROSSREF APPLIED ===');
  console.log(`Matched donors: ${art.totals.donors_matched}/${art.itemized_individual_rows} (${breakdown.match_rate_pct}%)`);
  console.log(`  high-confidence: ${art.totals.high_confidence}, medium: ${art.totals.medium_confidence}`);
  console.log(`To Gimenez from matched donors: $${art.totals.to_candidate.toLocaleString()}`);
  console.log(`These donors' lifetime pro-Israel PAC giving: $${art.totals.these_donors_to_pro_israel.toLocaleString()}`);
  console.log(`\nDirect pro-Israel PAC money: $${directPacs.toLocaleString()}`);
  console.log(`Bundler money (max of prior $${existingBundlers.toLocaleString()} vs new registry $${registryBundlers.toLocaleString()}): $${newBundlers.toLocaleString()}`);
  console.log(`NEW israel_lobby_total: $${newTotal.toLocaleString()}`);
  console.log(`\nTop 10 bundlers by $ to Gimenez:`);
  for (const m of topByCandidate.slice(0, 10)) {
    console.log(`  ${m.confidence.padEnd(6)} | $${m.candidateTotal.toFixed(0).padStart(8)} to Gimenez | $${m.proIsraelTotal.toLocaleString().padStart(14)} lifetime | ${m.donorName}, ${m.state}`);
    console.log(`    PACs: ${m.proIsraelPacs.slice(0, 4).join(' | ')}`);
  }
  console.log(`\nTop 10 bundlers by lifetime pro-Israel giving:`);
  for (const m of topByCareer.slice(0, 10)) {
    console.log(`  ${m.confidence.padEnd(6)} | $${m.candidateTotal.toFixed(0).padStart(8)} to Gimenez | $${m.proIsraelTotal.toLocaleString().padStart(14)} lifetime | ${m.donorName}, ${m.state}`);
    console.log(`    PACs: ${m.proIsraelPacs.slice(0, 4).join(' | ')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
