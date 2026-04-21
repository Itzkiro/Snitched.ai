#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Pull Independent Expenditures (FEC Schedule E) supporting or opposing
 * Brian Mast across all cycles. Writes:
 *   politicians.israel_lobby_breakdown.ie (total Israel-lobby IE)
 *   politicians.israel_lobby_breakdown.ie_details (per-committee breakdown)
 *
 * Updates israel_lobby_total to match pacs + ie + bundlers.
 */

import { createClient } from '@supabase/supabase-js';

const BIOGUIDE_ID = '317b2e4e-5dcf-478b-bad4-1518d0fc20c2';
const CAND_ID = 'H6FL18097';
const FEC_KEY = process.env.FEC_API_KEY || '';

const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299','C00797472','C00797670','C00368522','C00699470','C00740936','C00687657','C90019431',
  'C00556100','C00345132','C30001374','C90012063','C00764126','C90022864','C00441949','C00068692',
  'C00247403','C00127811','C00139659','C00488411','C00141747','C00458935','C00265470','C00748475',
  'C00306670','C00268334','C90014747','C00202481','C00791699','C00277228','C00503250','C00524652',
]);
const ISRAEL_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|UNITED DEMOCRACY|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|RJC VICTORY|J STREET|PRESERVE AMERICA/i;

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface ScheduleERow {
  committee_id?: string;
  committee_name?: string;
  candidate_id?: string;
  candidate_name?: string;
  support_oppose_indicator?: string;
  expenditure_amount?: number;
  expenditure_date?: string;
  cycle?: number;
  two_year_transaction_period?: number;
}

async function fecFetch<T>(endpoint: string, params: Record<string, string | number>): Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }> {
  const u = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  u.searchParams.set('api_key', FEC_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString());
  if (r.status === 429) { await sleep(30_000); return fecFetch(endpoint, params); }
  if (!r.ok) throw new Error(`FEC ${endpoint} ${r.status}`);
  return r.json() as Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }>;
}

interface IeDetail {
  committee_name: string;
  committee_id: string;
  amount: number;
  support_oppose: string;
  is_israel_lobby: boolean;
}

async function main(): Promise<void> {
  if (!FEC_KEY) throw new Error('FEC_API_KEY missing');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE env missing');
  const s = createClient(url, key);

  const cycles = [2016, 2018, 2020, 2022, 2024, 2026];
  const byCommittee: Record<string, IeDetail> = {};
  let totalIE = 0;
  let israelIE = 0;

  for (const cy of cycles) {
    let lastIdx: string | number | undefined;
    let lastAmt: string | number | undefined;
    let page = 0;
    const before = Object.keys(byCommittee).length;
    while (page < 30) {
      const params: Record<string, string | number> = {
        candidate_id: CAND_ID,
        two_year_transaction_period: cy,
        per_page: 100,
        sort: '-expenditure_amount',
      };
      if (lastIdx !== undefined) params.last_index = lastIdx;
      if (lastAmt !== undefined) params.last_expenditure_amount = lastAmt;
      let resp;
      try {
        resp = await fecFetch<ScheduleERow>('/schedules/schedule_e/', params);
      } catch (e) {
        console.error(`  cycle ${cy} page ${page} error:`, e instanceof Error ? e.message : e);
        break;
      }
      const rows = resp.results || [];
      if (rows.length === 0) break;
      for (const r of rows) {
        const cid = (r.committee_id || '').trim();
        const name = (r.committee_name || '').trim();
        const amt = Number(r.expenditure_amount) || 0;
        if (!cid || amt === 0) continue;
        const isIsrael = ISRAEL_LOBBY_COMMITTEE_IDS.has(cid) || ISRAEL_NAME_RE.test(name);
        const key = `${cid}|${r.support_oppose_indicator || 'S'}`;
        let d = byCommittee[key];
        if (!d) {
          d = { committee_name: name, committee_id: cid, amount: 0, support_oppose: r.support_oppose_indicator === 'O' ? 'oppose' : 'support', is_israel_lobby: isIsrael };
          byCommittee[key] = d;
        }
        d.amount += amt;
        totalIE += amt;
        if (isIsrael && d.support_oppose === 'support') israelIE += amt;
      }
      const last = resp.pagination?.last_indexes;
      if (!last) break;
      lastIdx = last.last_index as string | number | undefined;
      lastAmt = last.last_expenditure_amount as string | number | undefined;
      page++;
      await sleep(400);
      if (rows.length < 100) break;
    }
    console.log(`  cycle ${cy}: ${Object.keys(byCommittee).length - before} new committees`);
  }

  const details = Object.values(byCommittee).sort((a, b) => b.amount - a.amount);
  console.log(`\nTotal IE across all cycles: $${totalIE.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Israel-lobby IE (supporting only): $${israelIE.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  ${details.length} unique (committee × support/oppose) entries`);
  console.log(`\nTop 10 IE spenders:`);
  for (const d of details.slice(0, 10)) {
    console.log(`  ${d.support_oppose.padEnd(7)} ${d.committee_name.padEnd(45)} ${d.committee_id}  $${d.amount.toLocaleString()}${d.is_israel_lobby ? '  🇮🇱' : ''}`);
  }

  // Apply to DB: update israel_lobby_breakdown.ie (supporting only, Israel) + ie_details + israel_lobby_total
  const { data: row } = await s.from('politicians').select('israel_lobby_breakdown,aipac_funding').eq('bioguide_id', BIOGUIDE_ID).single();
  const current = (row?.israel_lobby_breakdown as Record<string, unknown>) || {};
  const pacs = Number(current.pacs) || 0;
  const bundlers = Number(current.bundlers) || 0;
  const newBreakdown = {
    ...current,
    ie: israelIE,
    ie_details: details.filter(d => d.is_israel_lobby).map(d => ({
      committee_name: d.committee_name,
      committee_id: d.committee_id,
      amount: d.amount,
      support_oppose: d.support_oppose,
      is_israel_lobby: true,
    })),
    total: pacs + israelIE + bundlers,
  };
  const newIsraelLobbyTotal = pacs + israelIE + bundlers;
  const { error } = await s.from('politicians')
    .update({ israel_lobby_breakdown: newBreakdown, israel_lobby_total: newIsraelLobbyTotal })
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw error;
  console.log(`\n✓ Updated Mast: ilb.ie = $${israelIE.toLocaleString()}, israel_lobby_total = $${newIsraelLobbyTotal.toLocaleString()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
