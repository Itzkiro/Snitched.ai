#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Refresh Vivek Ramaswamy (OH Governor 2026) record end-to-end.
 *
 * Modeled on scripts/refresh-acton.ts. Pillars:
 *   1. Court records — CourtListener full-text search (merged with cached)
 *   2. Finances     — OH SOS scraper. UNLIKE Acton, no fabricated press
 *                     fallback: Vivek has $30M+ self-funding + V PAC SuperPAC
 *                     money, so a "95% small-dollar" assumption would be wrong.
 *                     If SOS is unreachable, finance fields are left untouched.
 *   3. Social media — verified handles only (X/Instagram/Facebook); other
 *                     platforms left blank pending verification.
 *   4. Web intel    — Exa news search for controversies / scandal flags
 *   5. Corruption   — computeCorruptionScore() over the refreshed record
 *
 * Usage:
 *   npx tsx scripts/refresh-vivek.ts --dry-run
 *   npx tsx scripts/refresh-vivek.ts --write
 */

import { createClient } from '@supabase/supabase-js';
import { searchCourtRecords } from '../lib/courtlistener-client';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';
import { pullOhFinance, type OhFinanceResult } from './sync-oh-state-finance';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIOGUIDE_ID = 'oh-gov-2026-vivek-ramaswamy';
const CANDIDATE_NAME = 'Vivek Ramaswamy';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EXA_API_KEY = process.env.EXA_API_KEY || '';

// Verified primary social handles. TikTok/YouTube/Bluesky/campaign URL are
// intentionally omitted — fill in only after verifying via the campaign site.
const SOCIAL_MEDIA: Record<string, string> = {
  twitterHandle: 'VivekGRamaswamy',
  instagramHandle: 'vivekgramaswamy',
  facebookPageUrl: 'https://www.facebook.com/VivekGRamaswamy',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface ExaResult { title: string; url: string; publishedDate: string | null; text: string; highlights: string[]; }

async function exaSearch(query: string, numResults = 8): Promise<ExaResult[]> {
  if (!EXA_API_KEY) return [];
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
      body: JSON.stringify({
        query, numResults, type: 'auto', useAutoprompt: true,
        contents: { text: { maxCharacters: 500 }, highlights: { numSentences: 2 } },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map(r => ({
      title: String(r.title || ''),
      url: String(r.url || ''),
      publishedDate: (r.publishedDate as string | null) || null,
      text: String(r.text || ''),
      highlights: Array.isArray(r.highlights) ? r.highlights as string[] : [],
    }));
  } catch { return []; }
}

const SCANDAL_KEYWORDS = [
  'indictment', 'indicted', 'charged', 'arrested', 'conviction', 'convicted',
  'lawsuit', 'sued', 'ethics violation', 'conflict of interest', 'bribery',
  'corruption', 'investigation', 'subpoena', 'scandal', 'resigned',
];

function extractScandalFlags(results: ExaResult[]): string[] {
  const flags = new Set<string>();
  for (const r of results) {
    const blob = `${r.title} ${r.text} ${r.highlights.join(' ')}`.toLowerCase();
    for (const kw of SCANDAL_KEYWORDS) {
      if (blob.includes(kw)) flags.add(kw);
    }
  }
  return Array.from(flags);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || !argv.includes('--write');
  const verbose = argv.includes('--verbose');

  console.log('='.repeat(60));
  console.log(`  REFRESH: ${CANDIDATE_NAME} (${BIOGUIDE_ID})`);
  console.log('='.repeat(60));
  console.log(dryRun ? '  [DRY RUN — no DB write]' : '  [LIVE — writing to Supabase]');
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load current record --------------------------------------------------
  const { data: currentRow, error: loadErr } = await supabase
    .from('politicians')
    .select('*')
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (loadErr || !currentRow) {
    console.error(`Failed to load politician: ${loadErr?.message}`);
    process.exit(1);
  }
  console.log(`Loaded existing record: ${currentRow.name} — corruption_score=${currentRow.corruption_score}\n`);

  // ---------- PILLAR 1: COURT RECORDS --------------------------------------
  console.log('--- Pillar 1: Court Records (CourtListener) ---');
  const courtLog: string[] = [];
  let courtRecords: Record<string, unknown>[] = [];
  try {
    const fresh = await searchCourtRecords(CANDIDATE_NAME, courtLog);
    if (verbose) courtLog.forEach(l => console.log(' ', l));
    const existing = (currentRow.court_records as Array<{ id: string; source?: string }> | null) || [];
    const nonCl = existing.filter(r => r.source && r.source !== 'courtlistener');
    const mapped = fresh.map(r => ({
      id: r.id,
      case_name: r.caseName,
      case_name_short: r.caseNameShort,
      court: r.court,
      court_id: r.courtId,
      docket_number: r.docketNumber,
      date_filed: r.dateFiled,
      date_terminated: r.dateTerminated,
      cause: r.cause,
      nature_of_suit: r.natureOfSuit,
      url: r.url,
      source: r.source,
    }));
    const seen = new Set<string>();
    courtRecords = [...nonCl, ...mapped].filter(r => {
      const id = String((r as { id: string }).id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    console.log(`  CourtListener fresh: ${fresh.length} | preserved non-CL: ${nonCl.length} | total: ${courtRecords.length}`);
  } catch (err) {
    console.warn(`  CourtListener error: ${err instanceof Error ? err.message : String(err)} — keeping existing records`);
    courtRecords = (currentRow.court_records as Array<Record<string, unknown>> | null) || [];
  }
  console.log('');

  // ---------- PILLAR 2: FINANCES -----------------------------------------
  console.log('--- Pillar 2: Campaign Finance (OH SOS only — no fabricated fallback) ---');
  let financeBlock: {
    total_funds: number;
    top5_donors: unknown[];
    contribution_breakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number };
    aipac_funding: number;
    israel_lobby_total: number;
    israel_lobby_breakdown: { total: number; pacs: number; ie: number; bundlers: number };
    data_source: string;
  } | null = null;
  let sosResult: OhFinanceResult | null = null;
  try {
    sosResult = await pullOhFinance({
      candidate: CANDIDATE_NAME,
      bioguideId: BIOGUIDE_ID,
    });
    console.log(`  OH SOS: ${sosResult.total_contribution_count} contribs, $${sosResult.total_funds.toLocaleString()} total`);
    financeBlock = {
      total_funds: sosResult.total_funds,
      top5_donors: sosResult.top5_donors,
      contribution_breakdown: sosResult.contribution_breakdown,
      aipac_funding: sosResult.aipac_funding,
      israel_lobby_total: sosResult.israel_lobby_total,
      israel_lobby_breakdown: sosResult.israel_lobby_breakdown,
      data_source: sosResult.data_source,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  OH SOS unreachable (${msg}) — leaving finance fields untouched`);
    console.warn(`  (Vivek has self-funding + V PAC SuperPAC money; refusing to fabricate breakdown.)`);
    financeBlock = null;
  }
  if (financeBlock) {
    console.log(`  total_funds       = $${financeBlock.total_funds.toLocaleString()}`);
    console.log(`  contribution_breakdown = ${JSON.stringify(financeBlock.contribution_breakdown)}`);
    console.log(`  aipac_funding     = $${financeBlock.aipac_funding}`);
    console.log(`  data_source       = ${financeBlock.data_source}`);
  }
  console.log('');

  // ---------- PILLAR 3: SOCIAL MEDIA --------------------------------------
  console.log('--- Pillar 3: Social Media Handles ---');
  for (const [k, v] of Object.entries(SOCIAL_MEDIA)) console.log(`  ${k}: ${v}`);
  console.log('');

  // ---------- PILLAR 4: WEB INTEL -----------------------------------------
  console.log('--- Pillar 4: Web Intel (Exa) ---');
  let scandalFlags: string[] = [];
  let newsArticles: ExaResult[] = [];
  if (EXA_API_KEY) {
    const queries = [
      `"${CANDIDATE_NAME}" Ohio Governor 2026 controversy OR scandal OR investigation`,
      `"${CANDIDATE_NAME}" lawsuit OR indictment OR ethics OR SEC`,
    ];
    for (const q of queries) {
      const results = await exaSearch(q, 6);
      newsArticles.push(...results);
      await sleep(400);
    }
    const seen = new Set<string>();
    newsArticles = newsArticles.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
    scandalFlags = extractScandalFlags(newsArticles);
    console.log(`  ${newsArticles.length} articles, flags: ${scandalFlags.join(', ') || '(none)'}`);
  } else {
    console.log('  EXA_API_KEY unset — skipping');
  }
  console.log('');

  // ---------- PILLAR 5: CORRUPTION SCORE ----------------------------------
  console.log('--- Pillar 5: Corruption Score Recompute ---');
  // Build an in-memory Politician using refreshed finance if we have it,
  // otherwise current DB values — so the scorer never sees fabricated data.
  const fin = financeBlock ?? {
    total_funds: Number(currentRow.total_funds) || 0,
    top5_donors: (currentRow.top5_donors as Politician['top5Donors']) || [],
    contribution_breakdown: currentRow.contribution_breakdown || { aipac: 0, otherPACs: 0, individuals: 0, corporate: 0 },
    aipac_funding: Number(currentRow.aipac_funding) || 0,
    israel_lobby_total: Number(currentRow.israel_lobby_total) || 0,
    israel_lobby_breakdown: currentRow.israel_lobby_breakdown || { total: 0, pacs: 0, ie: 0, bundlers: 0 },
    data_source: currentRow.data_source as string,
  };
  const polForScoring: Politician = {
    id: BIOGUIDE_ID,
    name: currentRow.name,
    office: currentRow.office,
    officeLevel: currentRow.office_level,
    party: currentRow.party,
    jurisdiction: currentRow.jurisdiction,
    jurisdictionType: currentRow.jurisdiction_type,
    corruptionScore: currentRow.corruption_score,
    juiceBoxTier: currentRow.juice_box_tier,
    aipacFunding: fin.aipac_funding,
    totalFundsRaised: fin.total_funds,
    top5Donors: fin.top5_donors as Politician['top5Donors'],
    contributionBreakdown: fin.contribution_breakdown,
    israelLobbyTotal: fin.israel_lobby_total,
    israelLobbyBreakdown: fin.israel_lobby_breakdown,
    isActive: currentRow.is_active ?? false,
    isCandidate: true,
    runningFor: currentRow.running_for ?? 'Governor of Ohio',
    tags: currentRow.tags || [],
    bio: currentRow.bio,
    socialMedia: SOCIAL_MEDIA,
    dataSource: fin.data_source,
    courtCases: [],
    lobbyingRecords: currentRow.lobbying_records || [],
    votes: [],
  };
  const scoreResult = computeCorruptionScore(polForScoring);
  console.log(`  corruption_score: ${currentRow.corruption_score} → ${scoreResult.score} (${scoreResult.grade}, ${scoreResult.confidence} confidence)`);
  if (verbose) {
    for (const f of scoreResult.factors) {
      console.log(`    ${f.key}: raw=${f.rawScore} weighted=${f.weightedScore} (w=${f.weight}, data=${f.dataAvailable})`);
    }
  }
  console.log('');

  // ---------- DIFF + WRITE ------------------------------------------------
  const updates: Record<string, unknown> = {
    court_records: courtRecords,
    social_media: SOCIAL_MEDIA,
    corruption_score: scoreResult.score,
    updated_at: new Date().toISOString(),
  };
  if (financeBlock) {
    updates.total_funds = financeBlock.total_funds;
    updates.top5_donors = financeBlock.top5_donors;
    updates.contribution_breakdown = financeBlock.contribution_breakdown;
    updates.aipac_funding = financeBlock.aipac_funding;
    updates.israel_lobby_total = financeBlock.israel_lobby_total;
    updates.israel_lobby_breakdown = financeBlock.israel_lobby_breakdown;
    updates.data_source = financeBlock.data_source;
  }

  if (newsArticles.length > 0) {
    console.log(`  (news_intel captured but not persisted: ${newsArticles.length} articles, flags=[${scandalFlags.join(', ')}])`);
  }

  console.log('--- Proposed update ---');
  console.log(`  total_funds:        ${currentRow.total_funds} → ${updates.total_funds ?? '(unchanged)'}`);
  console.log(`  corruption_score:   ${currentRow.corruption_score} → ${updates.corruption_score}`);
  console.log(`  court_records:      ${(currentRow.court_records || []).length} → ${(updates.court_records as unknown[]).length}`);
  if (financeBlock) {
    console.log(`  top5_donors:        ${(currentRow.top5_donors || []).length} → ${(updates.top5_donors as unknown[]).length}`);
  }
  console.log(`  social_media keys:  ${Object.keys(currentRow.social_media || {}).length} → ${Object.keys(SOCIAL_MEDIA).length}`);
  if (financeBlock) console.log(`  data_source:        ${currentRow.data_source} → ${updates.data_source}`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Skipping DB write. Re-run with --write to persist.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('politicians')
    .update(updates)
    .eq('bioguide_id', BIOGUIDE_ID);
  if (updateErr) {
    console.error(`DB update failed: ${updateErr.message}`);
    process.exit(1);
  }
  console.log('DB update succeeded.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
