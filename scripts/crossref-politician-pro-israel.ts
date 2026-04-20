#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Generic pro-Israel roster match for any politician in the DB.
 *
 * Usage: npx tsx scripts/crossref-politician-pro-israel.ts <bioguide_id>
 *
 * Pulls the politician's FEC candidate_id from source_ids, fetches itemized
 * individual contribs from FEC, cross-references against the pro-Israel
 * individual donor registry (data/pro-israel-donors-YYYY.csv), writes the
 * structured breakdown + roster-match red_flags to the politician row.
 *
 * Reuses lib/roster-match.ts — same code path as the weekly Vercel cron.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  loadMaster, pullCandidateIndividuals, crossref, buildBreakdown, applyToPolitician,
} from '../lib/roster-match';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_DIR = path.join(__dirname, '..', 'data-ingestion');

async function main(): Promise<void> {
  const bioguideId = process.argv[2];
  if (!bioguideId) {
    console.error('Usage: npx tsx scripts/crossref-politician-pro-israel.ts <bioguide_id>');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const apiKey = process.env.FEC_API_KEY || '';
  if (!url || !key) throw new Error('SUPABASE env missing');
  if (!apiKey) throw new Error('FEC_API_KEY missing');
  const s = createClient(url, key);

  const { data: row, error } = await s
    .from('politicians')
    .select('bioguide_id,name,source_ids')
    .eq('bioguide_id', bioguideId)
    .single();
  if (error || !row) throw new Error(`Load failed: ${error?.message}`);
  const fecId = (row.source_ids as { fec_candidate_id?: string })?.fec_candidate_id;
  if (!fecId) throw new Error(`no fec_candidate_id on source_ids for ${bioguideId}`);

  console.log(`Loading pro-Israel registry from ${DATA_DIR}...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} unique individual donors indexed`);

  console.log(`\nPulling FEC itemized individuals for ${row.name} (${fecId})...`);
  const { committeeId, donors } = await pullCandidateIndividuals(fecId, apiKey);
  console.log(`  ${donors.length} itemized individual rows from committee ${committeeId}`);

  const matches = crossref(donors, master);
  const breakdown = buildBreakdown(matches, donors.length, `scripts/crossref-politician-pro-israel.ts:${bioguideId}`);

  console.log(`\nMatches: ${breakdown.matches}/${breakdown.itemized_individual_rows} (${breakdown.match_rate_pct}%)`);
  console.log(`  high-confidence: ${breakdown.high_confidence}, medium: ${breakdown.medium_confidence}`);
  console.log(`  to candidate:   $${breakdown.to_candidate.toLocaleString()}`);
  console.log(`  career to pro-Israel PACs: $${breakdown.these_donors_to_pro_israel_career.toLocaleString()}`);

  const outFile = path.join(OUT_DIR, `${bioguideId}-roster-matches.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    generated_at: breakdown.generated_at,
    candidate: { bioguide_id: bioguideId, name: row.name, fec_candidate_id: fecId },
    master_individuals_indexed: master.size,
    itemized_individual_rows: donors.length,
    matches,
    totals: {
      donors_matched: breakdown.matches,
      high_confidence: breakdown.high_confidence,
      medium_confidence: breakdown.medium_confidence,
      to_candidate: breakdown.to_candidate,
      these_donors_to_pro_israel: breakdown.these_donors_to_pro_israel_career,
    },
  }, null, 2));
  console.log(`\nArtifact: ${outFile}`);

  const applied = await applyToPolitician(s, bioguideId, breakdown, row.name as string);
  console.log(`DB updated → ${applied.column} / red_flags kept ${applied.kept} added ${applied.added}`);
}

main().catch(e => { console.error(e); process.exit(1); });
