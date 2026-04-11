#!/usr/bin/env npx tsx
/**
 * Enrich Ohio officials with FEC financial data + recompute corruption scores.
 *
 * For each OH official:
 *   1. Search FEC by name to find candidate ID
 *   2. Fetch financial totals (receipts across 2026/2024/2022 cycles)
 *   3. Fetch top contributors and classify (Individual/PAC/Israel-PAC/Corporate)
 *   4. Check for Israel lobby / AIPAC contributions + independent expenditures
 *   5. Build contribution_breakdown and top5_donors
 *   6. Recompute corruption score with new data
 *   7. Update Supabase
 *
 * Usage:
 *   npx tsx scripts/enrich-oh-fec-batch.ts --offset 0 --batch-size 174
 *   npx tsx scripts/enrich-oh-fec-batch.ts --offset 0 --batch-size 174 --dry-run
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fecFetch, ISRAEL_LOBBY_COMMITTEE_IDS, isIsraelLobbyDonor } from '../lib/fec-client';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const DELAY_MS = 650; // Stay under 1000 req/hr FEC limit
const CYCLES = [2026, 2024, 2022];

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function classifyDonor(entityType: string, donorName: string, committeeId?: string): string {
  const upper = (donorName || '').toUpperCase();
  if (committeeId && (ISRAEL_LOBBY_COMMITTEE_IDS as readonly string[]).includes(committeeId)) return 'Israel-PAC';
  if (upper.includes('AIPAC') || upper.includes('UNITED DEMOCRACY PROJECT')) return 'Israel-PAC';
  if (typeof isIsraelLobbyDonor === 'function' && isIsraelLobbyDonor(donorName)) return 'Israel-PAC';
  if (entityType === 'IND') return 'Individual';
  if (entityType === 'ORG') return 'Corporate';
  if (['COM', 'PAC', 'CCM', 'PTY'].includes(entityType)) return 'PAC';
  if (upper.includes('PAC') || upper.includes('COMMITTEE')) return 'PAC';
  return 'Individual';
}

async function searchFecCandidate(name: string, state: string): Promise<string | null> {
  try {
    const data = await fecFetch('/candidates/search/', {
      q: name, state, per_page: 5, sort: '-receipts',
    });
    await sleep(DELAY_MS);
    const results = data.results || [];
    if (results.length === 0) return null;
    // Try exact-ish name match
    const nameLower = name.toLowerCase();
    const match = results.find((r: any) => r.name?.toLowerCase().includes(nameLower.split(' ').pop() || ''));
    return (match || results[0]).candidate_id || null;
  } catch {
    return null;
  }
}

async function fetchContributions(candidateId: string): Promise<{
  top5: { name: string; amount: number; type: string }[];
  breakdown: { aipac: number; otherPACs: number; corporate: number; individuals: number };
  israelTotal: number;
  totalRaised: number;
}> {
  const breakdown = { aipac: 0, otherPACs: 0, corporate: 0, individuals: 0 };
  const donorMap = new Map<string, { name: string; amount: number; type: string }>();
  let israelTotal = 0;
  let totalRaised = 0;

  // Get financial totals
  for (const cycle of CYCLES) {
    try {
      const data = await fecFetch(`/candidate/${candidateId}/totals/`, { cycle, per_page: 100 });
      await sleep(DELAY_MS);
      for (const r of data.results || []) {
        totalRaised += Number(r.receipts || 0);
      }
    } catch { /* skip cycle */ }
  }

  // Get committees
  let committeeIds: string[] = [];
  try {
    const data = await fecFetch(`/candidate/${candidateId}/committees/`, { per_page: 10 });
    await sleep(DELAY_MS);
    committeeIds = (data.results || []).map((r: any) => r.committee_id).filter(Boolean);
  } catch { /* no committees */ }

  // Get top contributors from each committee
  for (const cmtId of committeeIds.slice(0, 2)) {
    try {
      const data = await fecFetch('/schedules/schedule_a/', {
        committee_id: cmtId, per_page: 100, sort: '-contribution_receipt_amount',
      });
      await sleep(DELAY_MS);

      for (const c of data.results || []) {
        const donorName = c.contributor_name || c.contributor?.name || 'Unknown';
        const amount = Number(c.contribution_receipt_amount || 0);
        const entityType = c.entity_type || '';
        const cid = c.committee_id || '';
        const type = classifyDonor(entityType, donorName, cid);

        // Accumulate by donor name
        const key = donorName.toUpperCase().trim();
        const existing = donorMap.get(key);
        if (existing) {
          existing.amount += amount;
        } else {
          donorMap.set(key, { name: donorName, amount, type });
        }

        // Breakdown
        if (type === 'Israel-PAC') {
          breakdown.aipac += amount;
          israelTotal += amount;
        } else if (type === 'PAC') {
          breakdown.otherPACs += amount;
        } else if (type === 'Corporate') {
          breakdown.corporate += amount;
        } else {
          breakdown.individuals += amount;
        }
      }
    } catch { /* skip committee */ }
  }

  // Check for Israel lobby independent expenditures
  for (const cycle of [2026, 2024]) {
    try {
      const data = await fecFetch('/schedules/schedule_e/', {
        candidate_id: candidateId, cycle, per_page: 50,
      });
      await sleep(DELAY_MS);
      for (const ie of data.results || []) {
        const cmtId = ie.committee_id || '';
        const cmtName = (ie.committee?.name || '').toUpperCase();
        if ((ISRAEL_LOBBY_COMMITTEE_IDS as readonly string[]).includes(cmtId) ||
            cmtName.includes('AIPAC') || cmtName.includes('UNITED DEMOCRACY')) {
          israelTotal += Math.abs(Number(ie.expenditure_amount || 0));
        }
      }
    } catch { /* skip */ }
  }

  const top5 = Array.from(donorMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return { top5, breakdown, israelTotal, totalRaised };
}

async function main() {
  const offset = parseInt(getArg('offset', '0'));
  const batchSize = parseInt(getArg('batch-size', '174'));
  const dryRun = process.argv.includes('--dry-run');

  // Fetch OH officials in this batch
  const { data: rows, error } = await supabase
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, total_funds, aipac_funding, israel_lobby_total, top5_donors, lobbying_records, voting_records, contribution_breakdown, corruption_score, is_active, years_in_office, source_ids, social_media, juice_box_tier, bio, term_start, term_end, data_source, updated_at, created_at, israel_lobby_breakdown')
    .like('bioguide_id', 'oh-%')
    .order('bioguide_id')
    .range(offset, offset + batchSize - 1);

  if (error || !rows) {
    console.error(`[Batch ${offset}] Fetch error:`, error?.message);
    process.exit(1);
  }

  console.log(`[Batch offset=${offset}] Enriching ${rows.length} OH politicians via FEC...`);

  let enriched = 0;
  let scored = 0;
  let skipped = 0;
  let rateLimited = false;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;

    try {
      // Search FEC for this official
      const candidateId = await searchFecCandidate(row.name, 'OH');

      if (!candidateId) {
        skipped++;
        continue;
      }

      // Fetch contributions and financial data
      const fecData = await fetchContributions(candidateId);

      if (fecData.totalRaised === 0 && fecData.top5.length === 0) {
        skipped++;
        continue;
      }

      // Build update payload
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (fecData.totalRaised > (Number(row.total_funds) || 0)) {
        update.total_funds = fecData.totalRaised;
      }
      if (fecData.top5.length > 0) {
        update.top5_donors = fecData.top5;
      }
      if (fecData.breakdown.aipac + fecData.breakdown.otherPACs + fecData.breakdown.corporate + fecData.breakdown.individuals > 0) {
        update.contribution_breakdown = fecData.breakdown;
      }
      if (fecData.israelTotal > (Number(row.israel_lobby_total) || 0)) {
        update.israel_lobby_total = fecData.israelTotal;
        update.aipac_funding = fecData.israelTotal;
      }

      // Store FEC candidate ID
      const sourceIds = row.source_ids || {};
      if (candidateId && !sourceIds.fec_candidate_id) {
        update.source_ids = { ...sourceIds, fec_candidate_id: candidateId };
      }

      // Recompute corruption score with enriched data
      const top5 = (fecData.top5.length > 0 ? fecData.top5 : (row.top5_donors || [])) as Politician['top5Donors'];
      const politician: Politician = {
        id: row.bioguide_id,
        name: row.name,
        office: row.office,
        officeLevel: row.office_level,
        party: row.party,
        district: row.district,
        jurisdiction: row.jurisdiction,
        jurisdictionType: row.jurisdiction_type,
        corruptionScore: Number(row.corruption_score) || 0,
        aipacFunding: fecData.israelTotal || Number(row.aipac_funding) || 0,
        juiceBoxTier: row.juice_box_tier || 'none',
        totalFundsRaised: Math.max(fecData.totalRaised, Number(row.total_funds) || 0),
        top3Donors: top5?.slice(0, 3),
        top5Donors: top5,
        israelLobbyTotal: fecData.israelTotal || Number(row.israel_lobby_total) || 0,
        israelLobbyBreakdown: row.israel_lobby_breakdown,
        contributionBreakdown: fecData.breakdown.individuals > 0 ? fecData.breakdown : row.contribution_breakdown,
        isActive: row.is_active,
        yearsInOffice: Number(row.years_in_office) || 0,
        tags: [],
        socialMedia: row.social_media || {},
        source_ids: row.source_ids || {},
        lobbyingRecords: row.lobbying_records ?? [],
        contributions: [],
        courtCases: [],
        votes: [],
        socialPosts: [],
        dataStatus: 'live',
        dataSource: 'fec',
        lastUpdated: new Date().toISOString(),
      };

      const result = computeCorruptionScore(politician);
      update.corruption_score = result.score;

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from('politicians')
          .update(update)
          .eq('bioguide_id', row.bioguide_id);

        if (updateErr) {
          console.error(`${progress} ✗ ${row.name} — ${updateErr.message}`);
          errors++;
          continue;
        }
      }

      enriched++;
      if (result.score > 0) scored++;
      const funds = fecData.totalRaised >= 1e6 ? `$${(fecData.totalRaised / 1e6).toFixed(1)}M` : `$${(fecData.totalRaised / 1e3).toFixed(0)}K`;
      console.log(`${progress} ✓ ${row.name} — ${funds} raised, ${fecData.top5.length} donors, score: ${result.score} (${result.grade})${fecData.israelTotal > 0 ? ` 🚨 $${(fecData.israelTotal / 1e3).toFixed(0)}K Israel` : ''}`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || msg.includes('rate limit')) {
        console.error(`\n⚠ FEC rate limited at ${progress}. Stopping batch.`);
        rateLimited = true;
        break;
      }
      errors++;
    }
  }

  console.log(`\n[Batch offset=${offset}] Done: ${enriched} enriched, ${scored} with score>0, ${skipped} no FEC match, ${errors} errors${rateLimited ? ' (RATE LIMITED)' : ''}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
