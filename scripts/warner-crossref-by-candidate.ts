#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Mark Warner crossref using FEC candidate_id filter (catches all 17
 * committees — principal + JFCs — not just the principal). Default
 * crossref-politician-pro-israel.ts misses ~99% of his itemized donors
 * because they route through JFCs like Forward Together Warner.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  loadMaster, parseName, crossref, buildBreakdown, applyToPolitician,
  type CandDonor,
} from '../lib/roster-match';

const CAND_ID = 'S6VA00093';
const BIOGUIDE = 'va-senate-2026-mark-warner';
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT = path.join(__dirname, '..', 'data-ingestion', 'va-senate-2026-mark-warner-roster-matches.json');
const KEY = process.env.FEC_API_KEY!;

function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface ScheduleARow {
  contributor_name?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contribution_receipt_amount?: number;
  contribution_receipt_date?: string;
  entity_type?: string;
}

interface FecResp<T> { results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }

async function fecFetch<T>(endpoint: string, params: Record<string, string | number>): Promise<FecResp<T>> {
  const u = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString());
  if (r.status === 429) { await sleep(30_000); return fecFetch(endpoint, params); }
  if (!r.ok) throw new Error(`FEC ${endpoint} ${r.status}`);
  return r.json() as Promise<FecResp<T>>;
}

async function pullByCandidateId(): Promise<CandDonor[]> {
  const cycles = [2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026];
  // Incremental cache: per-cycle file so we can resume and don't lose work
  const CACHE = path.join(__dirname, '..', 'data-ingestion', 'warner-raw-donors.json');
  let donors: CandDonor[] = [];
  const doneCycles = new Set<string>();
  if (fs.existsSync(CACHE)) {
    donors = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as CandDonor[];
    for (const d of donors) doneCycles.add(d.cycle);
    console.log(`  [cache] loaded ${donors.length} rows from ${doneCycles.size} prior cycles: ${[...doneCycles].sort().join(',')}`);
  }
  for (const cy of cycles) {
    if (doneCycles.has(String(cy))) { console.log(`  cycle ${cy}: skip (already cached)`); continue; }
    let lastIdx: string | number | undefined;
    let lastAmt: string | number | undefined;
    let page = 0;
    const before = donors.length;
    while (page < 50) {
      const params: Record<string, string | number> = {
        candidate_id: CAND_ID,
        two_year_transaction_period: cy,
        is_individual: 'true',
        per_page: 100,
        sort: '-contribution_receipt_amount',
      };
      if (lastIdx !== undefined) params.last_index = lastIdx;
      if (lastAmt !== undefined) params.last_contribution_receipt_amount = lastAmt;
      let resp: FecResp<ScheduleARow>;
      try {
        resp = await fecFetch<ScheduleARow>('/schedules/schedule_a/', params);
      } catch (e) { console.error(`cy ${cy} p${page} err:`, e instanceof Error ? e.message : e); break; }
      const rows = resp.results || [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (r.entity_type && r.entity_type !== 'IND') continue;
        const rawName = (r.contributor_name || '').trim();
        if (!rawName) continue;
        const p = parseName(rawName);
        if (!p || !p.last || !p.firstInitial) continue;
        donors.push({
          rawName, last: p.last, first: p.first, firstInitial: p.firstInitial,
          state: norm(r.contributor_state || ''), city: norm(r.contributor_city || ''),
          employer: norm(r.contributor_employer || ''), occupation: '',
          amount: r.contribution_receipt_amount || 0,
          date: r.contribution_receipt_date || '', cycle: String(cy),
        });
      }
      const last = resp.pagination?.last_indexes;
      if (!last) break;
      lastIdx = last.last_index as string | number | undefined;
      lastAmt = last.last_contribution_receipt_amount as string | number | undefined;
      await sleep(500);
      if (rows.length < 100) break;
      page++;
    }
    console.log(`  cycle ${cy}: +${donors.length - before}  (total ${donors.length})`);
    // Save after each cycle so kill-recovery works
    fs.writeFileSync(CACHE, JSON.stringify(donors));
  }
  return donors;
}

async function main(): Promise<void> {
  console.log(`Loading registry from ${DATA_DIR}...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} pro-Israel individuals indexed`);

  console.log(`\nPulling Warner itemized individuals by candidate_id=${CAND_ID}...`);
  const donors = await pullByCandidateId();
  console.log(`\n  Total rows: ${donors.length}`);

  const matches = crossref(donors, master);
  const b = buildBreakdown(matches, donors.length, 'scripts/warner-crossref-by-candidate.ts');
  console.log(`\nMatches: ${b.matches}/${b.itemized_individual_rows} (${b.match_rate_pct}%)`);
  console.log(`  high=${b.high_confidence}  medium=${b.medium_confidence}`);
  console.log(`  $ to Warner: $${b.to_candidate.toLocaleString()}`);
  console.log(`  career $ to pro-Israel PACs: $${b.these_donors_to_pro_israel_career.toLocaleString()}`);

  fs.writeFileSync(OUT, JSON.stringify({
    generated_at: b.generated_at,
    candidate: { bioguide_id: BIOGUIDE, name: 'Mark Warner', fec_candidate_id: CAND_ID },
    master_individuals_indexed: master.size,
    itemized_individual_rows: donors.length,
    matches,
    totals: {
      donors_matched: b.matches, high_confidence: b.high_confidence, medium_confidence: b.medium_confidence,
      to_candidate: b.to_candidate, these_donors_to_pro_israel: b.these_donors_to_pro_israel_career,
    },
  }, null, 2));
  console.log(`\nArtifact: ${OUT}`);

  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const applied = await applyToPolitician(s, BIOGUIDE, b, 'Mark Warner');
  console.log(`DB → ${applied.column}  (red_flags kept ${applied.kept} added ${applied.added})`);
}

main().catch(e => { console.error(e); process.exit(1); });
