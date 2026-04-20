#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Generic single-politician audit runner.
 *
 * Pulls FEC multi-cycle data, classifies Israel-lobby PACs via the 32-ID
 * set, pulls GovTrack votes, auto-assigns juice_box_tier + cycles_count,
 * recomputes corruption_score with v6.5 scorer, writes to DB, appends one
 * row to data-ingestion/audit-tracker.csv.
 *
 * Usage:
 *   npx tsx scripts/audit-politician.ts <bioguide_id>
 *   npx tsx scripts/audit-politician.ts --batch file.txt   (one bioguide per line)
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const FEC = process.env.FEC_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TRACKER = 'data-ingestion/audit-tracker.csv';

const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299','C00797472','C00797670',
  'C00368522','C00699470','C00740936','C00687657','C90019431',
  'C00556100','C00345132','C30001374','C90012063',
  'C00764126','C90022864',
  'C00441949','C00068692','C00247403','C00127811',
  'C00139659','C00488411',
  'C00141747','C00458935','C00265470',
  'C00748475','C00306670','C00268334','C90014747',
  'C00202481','C00791699','C00277228','C00503250','C00524652',
]);
const ISRAEL_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|JACPAC|JEWISH DEMOCRATIC COUNCIL|JEWISH REPUBLICAN|FRIENDS OF ISRAEL|FIPAC|ALLIES FOR ISRAEL|ISRAEL ALLIANCE|J STREET|JOINT ACTION COMMITTEE FOR POLITICAL|U\.?S\.? ISRAEL/i;
const ISRAEL_KW_RE = /israel|gaza|hamas|hezbollah|iron dome|antisemit|jerusalem|palestin|iran(?!ian)|BDS|zionis|boycott|west bank|yemen|houthi|war powers/i;

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface FecResponse<T> { results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }

async function fecFetch<T>(endpoint: string, params: Record<string, string | number>): Promise<FecResponse<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) { await sleep(30_000); return fecFetch(endpoint, params); }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}`);
  return res.json() as Promise<FecResponse<T>>;
}

interface AuditResult {
  bioguide_id: string;
  name: string;
  office: string;
  party: string;
  district: string | null;
  jurisdiction: string;
  old_score: number;
  new_score: number;
  grade: string;
  confidence: string;
  juice_box_tier: string;
  total_funds: number;
  aipac_funding: number;
  israel_lobby_total_fec: number;
  israel_lobby_pac_count: number;
  israel_aligned_votes: number;
  total_israel_votes: number;
  cycles_count: number;
  fec_id: string | null;
  audited_at: string;
}

async function auditOne(bioguideId: string): Promise<AuditResult | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('SUPABASE env missing');
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: row, error: loadErr } = await s.from('politicians').select('*').eq('bioguide_id', bioguideId).single();
  if (loadErr || !row) { console.error(`[${bioguideId}] not found: ${loadErr?.message}`); return null; }

  const fecId = row.source_ids?.fec_candidate_id as string | undefined;
  const govtrackId = row.source_ids?.govtrack_id as string | undefined;

  let newTotalFunds = Number(row.total_funds) || 0;
  let newAipac = Number(row.aipac_funding) || 0;
  let newIsraelLobbyFec = 0;
  let otherPACs = 0;
  let individuals = 0;
  let cyclesCount = 0;
  const pacDetails: Array<{ name: string; fec_id: string; amount: number; count: number }> = [];

  if (fecId) {
    // All-cycle totals
    try {
      const totalsResp = await fecFetch<{ cycle: number; receipts: number; individual_contributions: number; other_political_committee_contributions: number }>(`/candidate/${fecId}/totals/`, { per_page: 10 });
      const cycles = totalsResp.results || [];
      cyclesCount = new Set(cycles.map(c => c.cycle).filter(Boolean)).size;
      newTotalFunds = cycles.reduce((s, c) => s + (c.receipts || 0), 0);
      individuals = cycles.reduce((s, c) => s + (c.individual_contributions || 0), 0);
      const totalPACs = cycles.reduce((s, c) => s + (c.other_political_committee_contributions || 0), 0);
      await sleep(400);
    } catch (e) { console.error(`[${bioguideId}] totals error:`, e instanceof Error ? e.message : e); }

    // Itemized PAC contribs with Israel classifier — principal committee
    const committeeResp = await fecFetch<{ committee_id: string; designation_full: string }>(`/candidate/${fecId}/committees/`, { per_page: 5 });
    const principal = committeeResp.results?.find(c => /principal/i.test(c.designation_full));
    await sleep(400);
    if (principal) {
      const PLATFORM_CONDUIT_NAMES = /^(ACTBLUE|WINRED|ANEDOT)(\s|,|$)/i;
      const israelByName: Record<string, { name: string; fec_id: string; amount: number; count: number }> = {};
      const cyclesList = Array.from({ length: 6 }, (_, i) => 2016 + i * 2);
      for (const cycle of cyclesList) {
        let lastIdx: unknown, lastAmt: unknown;
        for (let page = 0; page < 10; page++) {
          const params: Record<string, string | number> = {
            committee_id: principal.committee_id, two_year_transaction_period: cycle,
            is_individual: 'false', per_page: 100, sort: '-contribution_receipt_amount',
          };
          if (lastIdx !== undefined) params.last_index = String(lastIdx);
          if (lastAmt !== undefined) params.last_contribution_receipt_amount = String(lastAmt);
          try {
            const resp = await fecFetch<{ contributor_name: string; contribution_receipt_amount: number; entity_type: string; contributor_id?: string; contributor_committee_id?: string }>('/schedules/schedule_a/', params);
            const rows = resp.results || [];
            if (rows.length === 0) break;
            for (const r of rows) {
              if (PLATFORM_CONDUIT_NAMES.test((r.contributor_name || '').trim())) continue;
              otherPACs += r.contribution_receipt_amount || 0;
              const id = r.contributor_committee_id || r.contributor_id || '';
              const isIsrael = (id && ISRAEL_LOBBY_COMMITTEE_IDS.has(id)) || ISRAEL_NAME_RE.test(r.contributor_name || '');
              if (isIsrael) {
                newIsraelLobbyFec += r.contribution_receipt_amount || 0;
                if (/AIPAC|AMERICAN ISRAEL/i.test(r.contributor_name || '')) newAipac += r.contribution_receipt_amount || 0;
                const key = (r.contributor_name || '').toUpperCase();
                if (!israelByName[key]) israelByName[key] = { name: r.contributor_name, fec_id: id, amount: 0, count: 0 };
                israelByName[key].amount += r.contribution_receipt_amount || 0;
                israelByName[key].count++;
              }
            }
            const last = resp.pagination?.last_indexes;
            if (!last) break;
            lastIdx = last.last_index;
            lastAmt = last.last_contribution_receipt_amount;
            await sleep(250);
            if (rows.length < 100) break;
          } catch (e) { break; }
        }
      }
      pacDetails.push(...Object.values(israelByName).sort((a, b) => b.amount - a.amount));
    }
  }

  // GovTrack votes
  let votesRaw: Array<{ date: string; vote: string; question: string; israel_aligned: boolean; category: string; source_url: string }> = [];
  let alignedCount = 0;
  if (govtrackId) {
    const all: Array<{ option: { value: string }; vote: { question?: string; description?: string; created?: string; category?: string; link?: string } }> = [];
    for (let offset = 0; offset < 1000; offset += 200) {
      try {
        const r = await fetch(`https://www.govtrack.us/api/v2/vote_voter?person=${govtrackId}&limit=200&offset=${offset}&format=json&order_by=-created`);
        if (!r.ok) break;
        const j = await r.json() as { objects?: Array<{ option: { value: string }; vote: { question?: string; description?: string; created?: string; category?: string; link?: string } }> };
        if (!j.objects || j.objects.length === 0) break;
        all.push(...j.objects);
        if (j.objects.length < 200) break;
        await sleep(300);
      } catch { break; }
    }
    function classifyAligned(q: string, v: string): boolean {
      const qq = q.toLowerCase();
      if (/strike.*israeli.*(funding|cooperative)|war powers.*remove united states armed forces|gaza pier/.test(qq)) {
        return v === 'Nay' || v === 'No' || v === 'Not Voting';
      }
      if (/israel security|antisemitism|condemning.*hamas|condemning.*antisemit|iran sanctions|anti-bds|no immigration benefits.*hamas|from the river to the sea|condemning iran|iran.*state sponsor|iran counterterrorism|rescission.*waivers.*iran/i.test(qq)) {
        return v === 'Yea' || v === 'Aye' || v === 'Yes';
      }
      return false;
    }
    for (const v of all) {
      const blob = (v.vote?.question || '') + ' ' + (v.vote?.description || '');
      if (ISRAEL_KW_RE.test(blob)) {
        const aligned = classifyAligned(v.vote?.question || '', v.option.value);
        if (aligned) alignedCount++;
        votesRaw.push({
          date: (v.vote?.created || '').slice(0, 10),
          vote: v.option.value,
          question: (v.vote?.question || '').slice(0, 160),
          israel_aligned: aligned,
          category: v.vote?.category || 'israel-middle-east',
          source_url: 'https://www.govtrack.us' + (v.vote?.link || ''),
        });
      }
    }
  }

  // juice_box_tier from Israel lobby total (pick MAX of existing DB vs new FEC)
  const israelForTier = Math.max(Number(row.israel_lobby_total) || 0, newIsraelLobbyFec);
  const tier: 'none' | 'compromised' | 'bought' | 'owned' =
    israelForTier >= 5_000_000 ? 'owned'
    : israelForTier >= 2_000_000 ? 'bought'
    : israelForTier >= 500_000 ? 'compromised'
    : 'none';

  // Build polForScoring
  const pol: Politician = {
    id: row.bioguide_id, name: row.name, office: row.office,
    officeLevel: row.office_level, party: row.party,
    jurisdiction: row.jurisdiction, jurisdictionType: row.jurisdiction_type,
    corruptionScore: row.corruption_score,
    juiceBoxTier: tier,
    aipacFunding: Math.max(newAipac, Number(row.aipac_funding) || 0),
    totalFundsRaised: newTotalFunds > 0 ? newTotalFunds : Number(row.total_funds) || 0,
    top5Donors: row.top5_donors,
    contributionBreakdown: row.contribution_breakdown || {
      aipac: Math.max(newAipac, Number(row.aipac_funding) || 0),
      otherPACs: Math.max(0, otherPACs - newAipac),
      individuals,
      corporate: 0,
    },
    israelLobbyTotal: israelForTier,
    israelLobbyBreakdown: {
      ...(row.israel_lobby_breakdown || {}),
      total: israelForTier,
      pacs: newIsraelLobbyFec || (row.israel_lobby_breakdown?.pacs ?? 0),
      ie: row.israel_lobby_breakdown?.ie ?? 0,
      bundlers: row.israel_lobby_breakdown?.bundlers ?? 0,
      pac_details: pacDetails.length > 0 ? pacDetails : row.israel_lobby_breakdown?.pac_details,
      cycles_count: cyclesCount || row.israel_lobby_breakdown?.cycles_count,
    },
    isActive: row.is_active,
    tags: row.tags || [], bio: row.bio, socialMedia: row.social_media,
    source_ids: row.source_ids, dataSource: 'audit_v6.5',
    courtCases: [], lobbyingRecords: row.lobbying_records || [],
    votes: votesRaw.length > 0
      ? votesRaw.map((v, i) => ({ id: bioguideId + '-' + i, politicianId: bioguideId, billNumber: '', billTitle: v.question, voteValue: v.vote, date: v.date, billSummary: v.question, category: v.category, israel_aligned: v.israel_aligned }) as Politician['votes'][number])
      : (row.voting_records || []),
  };

  const result = computeCorruptionScore(pol);

  // Write to DB
  const updates: Record<string, unknown> = {
    corruption_score: result.score,
    juice_box_tier: tier,
    israel_lobby_breakdown: pol.israelLobbyBreakdown,
    data_source: 'audit_v6.5',
    updated_at: new Date().toISOString(),
  };
  if (newTotalFunds > 0) updates.total_funds = newTotalFunds;
  if (newAipac > (Number(row.aipac_funding) || 0)) updates.aipac_funding = newAipac;
  if (votesRaw.length > 0) updates.voting_records = votesRaw;

  await s.from('politicians').update(updates).eq('bioguide_id', bioguideId);

  return {
    bioguide_id: bioguideId,
    name: row.name,
    office: row.office,
    party: row.party,
    district: row.district,
    jurisdiction: row.jurisdiction,
    old_score: row.corruption_score,
    new_score: result.score,
    grade: result.grade,
    confidence: result.confidence,
    juice_box_tier: tier,
    total_funds: Math.round(pol.totalFundsRaised || 0),
    aipac_funding: Math.round(pol.aipacFunding),
    israel_lobby_total_fec: Math.round(newIsraelLobbyFec),
    israel_lobby_pac_count: pacDetails.length,
    israel_aligned_votes: alignedCount,
    total_israel_votes: votesRaw.length,
    cycles_count: cyclesCount,
    fec_id: fecId ?? null,
    audited_at: new Date().toISOString(),
  };
}

function appendCsv(r: AuditResult): void {
  const exists = fs.existsSync(TRACKER);
  const header = 'bioguide_id,name,office,party,district,jurisdiction,old_score,new_score,grade,confidence,juice_box_tier,total_funds,aipac_funding,israel_lobby_total_fec,israel_lobby_pac_count,israel_aligned_votes,total_israel_votes,cycles_count,fec_id,audited_at';
  const row = [
    r.bioguide_id, csv(r.name), csv(r.office), csv(r.party), csv(r.district ?? ''), csv(r.jurisdiction),
    r.old_score, r.new_score, r.grade, r.confidence, r.juice_box_tier,
    r.total_funds, r.aipac_funding, r.israel_lobby_total_fec, r.israel_lobby_pac_count,
    r.israel_aligned_votes, r.total_israel_votes, r.cycles_count, r.fec_id ?? '', r.audited_at,
  ].join(',');
  if (!exists) fs.writeFileSync(TRACKER, header + '\n');
  fs.appendFileSync(TRACKER, row + '\n');
}
function csv(s: string): string { return '"' + String(s ?? '').replace(/"/g, '""') + '"'; }

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const ids: string[] = [];
  if (argv[0] === '--batch' && argv[1]) {
    const lines = fs.readFileSync(argv[1], 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    ids.push(...lines);
  } else if (argv[0]) {
    ids.push(argv[0]);
  } else {
    console.error('Usage: audit-politician.ts <bioguide_id>  OR  --batch file.txt');
    process.exit(1);
  }

  console.log(`Auditing ${ids.length} politician(s)...`);
  let successes = 0;
  for (const id of ids) {
    try {
      const r = await auditOne(id);
      if (r) {
        appendCsv(r);
        successes++;
        console.log(`  [${successes}/${ids.length}] ${r.name}: ${r.old_score} -> ${r.new_score}/${r.grade} | tier=${r.juice_box_tier} | Israel \$${r.israel_lobby_total_fec.toLocaleString()} (${r.israel_lobby_pac_count} PACs) | ${r.israel_aligned_votes}/${r.total_israel_votes} aligned votes`);
      }
    } catch (e) {
      console.error(`  [${id}] ERROR:`, e instanceof Error ? e.message : e);
    }
    await sleep(500);
  }
  console.log(`\nDone. ${successes}/${ids.length} audited. Tracker: ${TRACKER}`);
}

main().catch(err => { console.error(err); process.exit(1); });
