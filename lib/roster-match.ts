/**
 * Pro-Israel roster match — shared core for CLI scripts and Vercel cron.
 *
 * Pulls a candidate's itemized individual contribs from FEC, cross-references
 * against data/pro-israel-donors-YYYY.csv (the pro-Israel individual donor
 * registry), and writes structured results back to the politician row:
 *   - individual_donor_breakdown (or fallback: israel_lobby_breakdown.individual_registry)
 *   - source_ids.red_flags (summary + top-N specific donor flags, idempotent
 *     via the [roster-match] marker)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const headerLine = lines.shift();
  if (!headerLine) return [];
  const cols = splitCsvLine(headerLine);
  return lines.map(line => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    cols.forEach((c, i) => { row[c] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function money(s: string | number): number {
  const n = Number(String(s ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSuffix(s: string): string {
  return s.replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

export interface ParsedName { last: string; first: string; firstInitial: string }

export function parseName(raw: string): ParsedName | null {
  const n = stripSuffix(norm(raw));
  if (!n) return null;
  if (n.includes(',')) {
    const [last, rest] = n.split(',').map(s => s.trim());
    const first = (rest || '').split(/\s+/)[0] || '';
    return { last, first, firstInitial: first[0] || '' };
  }
  const toks = n.split(/\s+/);
  if (toks.length < 2) return null;
  return { last: toks[0], first: toks[1] || '', firstInitial: toks[1]?.[0] || '' };
}

// ---------------------------------------------------------------------------
// Master pro-Israel registry
// ---------------------------------------------------------------------------

const ORG_WORDS = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;
const COMMA_FIRST_RE = /^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/;

function isIndividualRegistryRow(r: Record<string, string>): boolean {
  const nameUpper = (r.donor_name || '').toUpperCase();
  if (!COMMA_FIRST_RE.test(nameUpper)) return false;
  if (ORG_WORDS.test(nameUpper)) return false;
  return true;
}

export interface MasterEntry {
  last: string;
  first: string;
  firstInitial: string;
  state: string;
  city: string;
  employer: string;
  cycles: Set<string>;
  totalGiven: number;
  contribCount: number;
  pacs: Set<string>;
}

export function loadMaster(dataDir: string): Map<string, MasterEntry> {
  const idx = new Map<string, MasterEntry>();
  if (!fs.existsSync(dataDir)) return idx;
  const files = fs.readdirSync(dataDir).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f));
  for (const f of files) {
    const cycle = f.match(/(\d{4})/)![1];
    const rows = parseCsv(path.join(dataDir, f));
    for (const r of rows) {
      if (!isIndividualRegistryRow(r)) continue;
      const p = parseName(r.donor_name);
      if (!p || !p.last || !p.first) continue;
      const state = norm(r.state);
      const key = `${p.last}|${p.firstInitial}|${state}`;
      let e = idx.get(key);
      if (!e) {
        e = {
          last: p.last, first: p.first, firstInitial: p.firstInitial,
          state, city: norm(r.city), employer: norm(r.employer),
          cycles: new Set(), totalGiven: 0, contribCount: 0, pacs: new Set(),
        };
        idx.set(key, e);
      }
      e.cycles.add(cycle);
      e.totalGiven += money(r.total_given);
      e.contribCount += Number(r.contribution_count) || 0;
      (r.pacs_given_to || '').split(/;\s*/).filter(Boolean).forEach(pac => e!.pacs.add(pac));
      if (p.first.length > e.first.length) e.first = p.first;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// FEC individual-donor pull
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface FecResp<T> { results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }

async function fecFetch<T>(
  endpoint: string, params: Record<string, string | number>, apiKey: string
): Promise<FecResp<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) { await sleep(30_000); return fecFetch(endpoint, params, apiKey); }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}`);
  return res.json() as Promise<FecResp<T>>;
}

interface ScheduleARow {
  contributor_name: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  entity_type: string;
}

export interface CandDonor {
  rawName: string;
  last: string;
  first: string;
  firstInitial: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  amount: number;
  date: string;
  cycle: string;
}

export async function pullCandidateIndividuals(
  fecCandidateId: string, apiKey: string
): Promise<{ committeeId: string; donors: CandDonor[] }> {
  const cmtResp = await fecFetch<{ committee_id: string; designation_full: string }>(
    `/candidate/${fecCandidateId}/committees/`, { per_page: 20 }, apiKey
  );
  const principal = cmtResp.results?.find(c => /principal/i.test(c.designation_full)) || cmtResp.results?.[0];
  if (!principal) throw new Error(`no principal committee for ${fecCandidateId}`);
  const committeeId = principal.committee_id;
  await sleep(400);

  const cycles = [2016, 2018, 2020, 2022, 2024, 2026];
  const donors: CandDonor[] = [];
  for (const cy of cycles) {
    let lastIdx: string | number | undefined;
    let lastAmt: string | number | undefined;
    for (let page = 0; page < 50; page++) {
      const params: Record<string, string | number> = {
        committee_id: committeeId,
        two_year_transaction_period: cy,
        is_individual: 'true',
        per_page: 100,
        sort: '-contribution_receipt_amount',
      };
      if (lastIdx !== undefined) params.last_index = lastIdx;
      if (lastAmt !== undefined) params.last_contribution_receipt_amount = lastAmt;
      let resp: FecResp<ScheduleARow>;
      try {
        resp = await fecFetch<ScheduleARow>('/schedules/schedule_a/', params, apiKey);
      } catch {
        break;
      }
      const rows = resp.results || [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (r.entity_type && r.entity_type !== 'IND') continue;
        const rawName = (r.contributor_name || '').trim();
        if (!rawName) continue;
        const p = parseName(rawName);
        if (!p || !p.last || !p.first) continue;
        donors.push({
          rawName,
          last: p.last, first: p.first, firstInitial: p.firstInitial,
          state: norm(r.contributor_state || ''),
          city: norm(r.contributor_city || ''),
          employer: norm(r.contributor_employer || ''),
          occupation: norm(r.contributor_occupation || ''),
          amount: r.contribution_receipt_amount || 0,
          date: r.contribution_receipt_date || '',
          cycle: String(cy),
        });
      }
      const last = resp.pagination?.last_indexes;
      if (!last) break;
      lastIdx = last.last_index as string | number | undefined;
      lastAmt = last.last_contribution_receipt_amount as string | number | undefined;
      await sleep(300);
      if (rows.length < 100) break;
    }
  }
  return { committeeId, donors };
}

// ---------------------------------------------------------------------------
// Cross-reference
// ---------------------------------------------------------------------------

export interface Match {
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

export function crossref(donors: CandDonor[], master: Map<string, MasterEntry>): Match[] {
  const byKey = new Map<string, { d: CandDonor; amount: number; count: number; cycles: Set<string> }>();
  for (const d of donors) {
    const key = `${d.last}|${d.firstInitial}|${d.state}`;
    const cur = byKey.get(key);
    if (cur) { cur.amount += d.amount; cur.count += 1; cur.cycles.add(d.cycle); }
    else byKey.set(key, { d, amount: d.amount, count: 1, cycles: new Set([d.cycle]) });
  }

  // Index registry by (last|firstInitial) → list of entries across states.
  // Used to make "medium-confidence" (no-state) matches only when the combo is
  // unique in the registry. Previously: picked first arbitrary state match,
  // which produced 80%+ false positives on common names like "SMITH, J".
  const byNameOnly = new Map<string, MasterEntry[]>();
  for (const e of master.values()) {
    const k = `${e.last}|${e.firstInitial}`;
    const list = byNameOnly.get(k);
    if (list) list.push(e); else byNameOnly.set(k, [e]);
  }

  const matches: Match[] = [];
  for (const [, agg] of byKey) {
    const d = agg.d;
    let m = master.get(`${d.last}|${d.firstInitial}|${d.state}`);
    let confidence: 'high' | 'medium' = 'high';
    if (!m) {
      const candidates = byNameOnly.get(`${d.last}|${d.firstInitial}`) || [];
      // Only allow medium match when the name is unambiguous in the registry.
      if (candidates.length === 1) { m = candidates[0]; confidence = 'medium'; }
    }
    if (!m) continue;
    matches.push({
      donorName: `${m.last}, ${m.first}`,
      firstFromMaster: m.first,
      state: m.state,
      city: m.city,
      employer: m.employer,
      candidateTotal: agg.amount,
      candidateContribCount: agg.count,
      candidateCycles: Array.from(agg.cycles).sort(),
      proIsraelTotal: m.totalGiven,
      proIsraelContribCount: m.contribCount,
      proIsraelCycles: Array.from(m.cycles).sort(),
      proIsraelPacs: Array.from(m.pacs),
      confidence,
    });
  }
  matches.sort((a, b) => b.proIsraelTotal - a.proIsraelTotal || b.candidateTotal - a.candidateTotal);
  return matches;
}

// ---------------------------------------------------------------------------
// DB write — breakdown payload + red flags
// ---------------------------------------------------------------------------

export const ROSTER_MATCH_MARKER = '[roster-match]';
const TOP_N_IN_BREAKDOWN = 25;
const TOP_N_AS_RED_FLAGS = 5;

function fmt(n: number): string { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export interface BreakdownPayload {
  itemized_individual_rows: number;
  matches: number;
  high_confidence: number;
  medium_confidence: number;
  to_candidate: number;
  these_donors_to_pro_israel_career: number;
  match_rate_pct: number;
  top_donors: Array<{
    name: string; state: string;
    to_candidate: number; to_pro_israel_career: number;
    candidate_cycles: string[]; pro_israel_cycles: string[];
    pacs: string[]; confidence: 'high' | 'medium';
  }>;
  source: string;
  generated_at: string;
}

export function buildBreakdown(matches: Match[], itemizedRows: number, source: string): BreakdownPayload {
  const top_donors = matches.slice(0, TOP_N_IN_BREAKDOWN).map(m => ({
    name: m.donorName, state: m.state,
    to_candidate: m.candidateTotal, to_pro_israel_career: m.proIsraelTotal,
    candidate_cycles: m.candidateCycles, pro_israel_cycles: m.proIsraelCycles,
    pacs: m.proIsraelPacs, confidence: m.confidence,
  }));
  return {
    itemized_individual_rows: itemizedRows,
    matches: matches.length,
    high_confidence: matches.filter(m => m.confidence === 'high').length,
    medium_confidence: matches.filter(m => m.confidence === 'medium').length,
    to_candidate: matches.reduce((s, m) => s + m.candidateTotal, 0),
    these_donors_to_pro_israel_career: matches.reduce((s, m) => s + m.proIsraelTotal, 0),
    match_rate_pct: itemizedRows === 0 ? 0 : Math.round((matches.length / itemizedRows) * 1000) / 10,
    top_donors,
    source,
    generated_at: new Date().toISOString(),
  };
}

export function buildRedFlags(b: BreakdownPayload, candidateName: string): Array<{ label: string; severity: 'high' | 'med' }> {
  const flags: Array<{ label: string; severity: 'high' | 'med' }> = [];
  // Only HIGH-confidence matches (exact name+state) drive red_flags. Medium
  // matches (unique-name-only) remain in the structured breakdown for review
  // but don't assert an AIPAC tie — a name collision between two real people
  // in different states would otherwise inflate the flag count and score.
  const highTopDonors = b.top_donors.filter(d => d.confidence === 'high');
  if (b.high_confidence > 0) {
    const highRate = b.itemized_individual_rows === 0 ? 0
      : Math.round((b.high_confidence / b.itemized_individual_rows) * 1000) / 10;
    // Sum career $ only for high-confidence matches shown in top_donors.
    // (The full figure in b.these_donors_to_pro_israel_career includes medium.)
    const highCareer = highTopDonors.reduce((s, d) => s + d.to_pro_israel_career, 0);
    flags.push({
      label: `${ROSTER_MATCH_MARKER} ${highRate}% of itemized individual donors (${b.high_confidence}/${b.itemized_individual_rows}) are documented pro-Israel PAC donors per registry (exact name+state match) — top donors gave ${fmt(highCareer)} career to AIPAC/NorPAC/UDP/Pro-Israel America/DMFI/RJC`,
      severity: 'high',
    });
  }
  for (const d of highTopDonors.slice(0, TOP_N_AS_RED_FLAGS)) {
    const topPacs = d.pacs.slice(0, 2).join(', ');
    flags.push({
      label: `${ROSTER_MATCH_MARKER} ${d.name} (${d.state}): ${fmt(d.to_candidate)} to ${candidateName}, ${fmt(d.to_pro_israel_career)} career to pro-Israel PACs (${topPacs}${d.pacs.length > 2 ? `, +${d.pacs.length - 2}` : ''})`,
      severity: 'high',
    });
  }
  return flags;
}

export async function applyToPolitician(
  client: SupabaseClient,
  bioguideId: string,
  breakdown: BreakdownPayload,
  candidateName: string,
): Promise<{ kept: number; added: number; column: 'individual_donor_breakdown' | 'israel_lobby_breakdown.individual_registry' }> {
  const { data: row, error: loadErr } = await client
    .from('politicians')
    .select('bioguide_id,source_ids,israel_lobby_breakdown')
    .eq('bioguide_id', bioguideId)
    .single();
  if (loadErr || !row) throw new Error(`Load failed: ${loadErr?.message}`);

  const existingSourceIds = (row.source_ids as Record<string, unknown>) ?? {};
  const existingFlags = (existingSourceIds.red_flags as Array<{ label: string; severity: 'high' | 'med' }>) ?? [];
  const keptFlags = existingFlags.filter(f => !f.label.includes(ROSTER_MATCH_MARKER));
  const newFlags = buildRedFlags(breakdown, candidateName);
  const mergedFlags = [...keptFlags, ...newFlags];
  const newSourceIds = { ...existingSourceIds, red_flags: mergedFlags };

  try {
    const { error } = await client
      .from('politicians')
      .update({ individual_donor_breakdown: breakdown, source_ids: newSourceIds })
      .eq('bioguide_id', bioguideId);
    if (error) throw error;
    return { kept: keptFlags.length, added: newFlags.length, column: 'individual_donor_breakdown' };
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    const msg = (e as { message?: string })?.message ?? String(e);
    if (code === 'PGRST204' || /individual_donor_breakdown/.test(msg)) {
      const ilb = (row.israel_lobby_breakdown as Record<string, unknown>) ?? {};
      const newIlb = { ...ilb, individual_registry: breakdown };
      const { error } = await client
        .from('politicians')
        .update({ israel_lobby_breakdown: newIlb, source_ids: newSourceIds })
        .eq('bioguide_id', bioguideId);
      if (error) throw error;
      return { kept: keptFlags.length, added: newFlags.length, column: 'israel_lobby_breakdown.individual_registry' };
    }
    throw e;
  }
}
