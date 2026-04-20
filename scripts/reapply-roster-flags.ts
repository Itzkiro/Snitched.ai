#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Re-apply red_flags from an existing roster-match artifact (no FEC re-pull).
 * Use after changing the red_flag rules in lib/roster-match.ts to refresh DB
 * without hitting FEC again.
 *
 * Usage: npx tsx scripts/reapply-roster-flags.ts <bioguide_id>
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { applyToPolitician, type BreakdownPayload, type Match } from '../lib/roster-match';

const OUT_DIR = path.join(__dirname, '..', 'data-ingestion');

async function main(): Promise<void> {
  const bioguideId = process.argv[2];
  if (!bioguideId) throw new Error('usage: reapply-roster-flags <bioguide_id>');

  const file = path.join(OUT_DIR, `${bioguideId}-roster-matches.json`);
  if (!fs.existsSync(file)) throw new Error(`artifact not found: ${file}`);
  const artifact = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    candidate: { name: string; bioguide_id?: string };
    itemized_individual_rows: number;
    matches: Match[];
    totals: { donors_matched: number; high_confidence: number; medium_confidence: number; to_candidate: number; these_donors_to_pro_israel: number };
  };

  // Rebuild breakdown from artifact (don't recompute from raw FEC)
  const top_donors = artifact.matches.slice(0, 25).map(m => ({
    name: m.donorName, state: m.state,
    to_candidate: m.candidateTotal, to_pro_israel_career: m.proIsraelTotal,
    candidate_cycles: m.candidateCycles, pro_israel_cycles: m.proIsraelCycles,
    pacs: m.proIsraelPacs, confidence: m.confidence,
  }));
  const breakdown: BreakdownPayload = {
    itemized_individual_rows: artifact.itemized_individual_rows,
    matches: artifact.totals.donors_matched,
    high_confidence: artifact.totals.high_confidence,
    medium_confidence: artifact.totals.medium_confidence,
    to_candidate: artifact.totals.to_candidate,
    these_donors_to_pro_israel_career: artifact.totals.these_donors_to_pro_israel,
    match_rate_pct: artifact.itemized_individual_rows === 0 ? 0
      : Math.round((artifact.totals.donors_matched / artifact.itemized_individual_rows) * 1000) / 10,
    top_donors,
    source: 'scripts/reapply-roster-flags.ts',
    generated_at: new Date().toISOString(),
  };

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE env missing');
  const s = createClient(url, key);

  const applied = await applyToPolitician(s, bioguideId, breakdown, artifact.candidate.name);
  console.log(`${artifact.candidate.name} → ${applied.column}`);
  console.log(`  red_flags kept: ${applied.kept}, added (high-conf only now): ${applied.added}`);
  console.log(`  high-confidence matches: ${breakdown.high_confidence} / medium: ${breakdown.medium_confidence}`);
}

main().catch(e => { console.error(e); process.exit(1); });
