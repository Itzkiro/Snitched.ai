#!/usr/bin/env npx tsx
/**
 * Sweep + fix three systematic data-quality bugs found during the
 * Gallrein + Bernard Taylor audits (2026-04-27).
 *
 * Bug 1 — total_funds doubled
 *   DB stores 2x the real FEC `/candidate/{H-id}/totals/?cycle=2026`
 *   `receipts` value. Fix: replace DB value with real FEC receipts.
 *
 * Bug 2 — source_ids.donation_status.amount stale
 *   Out of sync with the live israel_lobby_total. EmbedDossier renders
 *   via `donationStatus?.amount ?? lobby` so the override takes
 *   precedence. Fix: realign donation_status.amount to israel_lobby_total.
 *
 * Bug 3 — JStreetPAC counter-signal red_flags
 *   Auto-generated [roster-match] flags whose ONLY pro-Israel-PAC source
 *   is JStreetPAC. JStreetPAC is the dovish/anti-AIPAC progressive
 *   Israel-policy PAC — donors are COUNTER-SIGNALS, not capture
 *   markers. Fix: move to source_ids.historical_red_flags with
 *   _archived + _reason.
 *
 * Usage:
 *   npx tsx scripts/sweep-data-quality-issues.ts --dry-run
 *   npx tsx scripts/sweep-data-quality-issues.ts --write
 *   npx tsx scripts/sweep-data-quality-issues.ts --dry-run --fix-bug 1
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FEC_API_KEY = process.env.FEC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE env missing');
if (!FEC_API_KEY) throw new Error('FEC_API_KEY missing');

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const FEC_RATE_LIMIT_MS = 400;
const FEC_429_BACKOFF_MS = 30_000;
const FEC_DOUBLED_TOLERANCE = 0.02; // within 2% of 2x → flag as doubled

// Already-fixed rows that we should not touch
const SKIP_BIOGUIDE_IDS = new Set<string>([
  'ky-04-2026-ed-gallrein',
  'fl-21-2026-bernard-taylor',
]);

const REPORT_PATH = path.resolve(
  process.cwd(),
  'data/data-quality-sweep-2026-04-27.json',
);

// JStreetPAC patterns — only these substrings (case-insensitive) imply the
// roster-match flag came from JStreetPAC giving alone.
const JSTREET_PATTERN = /j\s*street/i;

// AIPAC and other pro-Israel patterns — if the flag mentions any of these,
// it IS a real capture signal (don't archive).
const PRO_AIPAC_PATTERNS = [
  /aipac/i,
  /norpac/i,
  /dmfi/i,
  /democratic majority for israel/i,
  /united democracy project/i,
  /pro[-\s]?israel america/i,
  /republican jewish coalition/i,
  /\brjc\b/i,
  /jacpac/i,
  /joint action committee/i,
  /jewish republican/i,
  /friends of israel/i,
  /zionist organization/i,
  /israel allies/i,
];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface Args {
  dryRun: boolean;
  write: boolean;
  fixBug: Set<1 | 2 | 3>;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const write = argv.includes('--write');
  if (!dryRun && !write) {
    throw new Error('Must pass --dry-run or --write');
  }
  if (dryRun && write) {
    throw new Error('Cannot pass both --dry-run and --write');
  }
  const fixBugs = new Set<1 | 2 | 3>();
  const idx = argv.indexOf('--fix-bug');
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    if (n === 1 || n === 2 || n === 3) fixBugs.add(n);
    else throw new Error('--fix-bug must be 1, 2, or 3');
  } else {
    fixBugs.add(1).add(2).add(3);
  }
  return { dryRun, write, fixBug: fixBugs };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedFlag {
  severity?: string;
  label?: string;
  source?: string;
  date?: string;
  _archived?: string;
  _reason?: string;
}

interface DonationStatus {
  label?: string;
  color?: string;
  icon?: string;
  amount?: number;
  subtext?: string;
}

interface PoliticianRow {
  bioguide_id: string;
  name: string | null;
  total_funds: number | null;
  israel_lobby_total: number | null;
  source_ids: Record<string, unknown> | null;
}

interface Bug1Finding {
  bug: 1;
  bioguide_id: string;
  name: string;
  fec_id: string;
  db_total_funds: number;
  real_fec_receipts: number;
  delta: number; // db - real
  ratio: number; // db / real
  note?: string;
}

interface Bug2Finding {
  bug: 2;
  bioguide_id: string;
  name: string;
  donation_status_amount: number;
  israel_lobby_total: number;
  delta: number; // ds - lobby
  note?: string;
}

interface Bug3Finding {
  bug: 3;
  bioguide_id: string;
  name: string;
  flags_to_archive: RedFlag[];
  flags_kept: RedFlag[];
  note?: string;
}

interface SkippedRow {
  bioguide_id: string;
  name: string | null;
  reason: string;
}

interface Report {
  generated_at: string;
  mode: 'dry-run' | 'write';
  scope: { active_total: number; with_fec_id: number };
  bug1: { count: number; total_db_dollars: number; total_real_dollars: number; rows: Bug1Finding[] };
  bug2: { count: number; total_stale_dollars: number; total_real_dollars: number; rows: Bug2Finding[] };
  bug3: { count: number; flags_moved: number; rows: Bug3Finding[] };
  skipped: SkippedRow[];
  applied: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// FEC client (rate-limited)
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let lastFecCallAt = 0;

async function fecGet<T = unknown>(endpoint: string, params: Record<string, string | number>): Promise<T | null> {
  const elapsed = Date.now() - lastFecCallAt;
  if (elapsed < FEC_RATE_LIMIT_MS) await sleep(FEC_RATE_LIMIT_MS - elapsed);

  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  lastFecCallAt = Date.now();

  if (res.status === 429) {
    console.warn(`[fec] 429 — backing off ${FEC_429_BACKOFF_MS / 1000}s`);
    await sleep(FEC_429_BACKOFF_MS);
    return fecGet<T>(endpoint, params);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FEC ${endpoint} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface FecCandidateTotalsResponse {
  results?: Array<{ receipts?: number; cycle?: number }>;
}

async function getRealFecReceipts(fecId: string, cycle = 2026): Promise<number | null> {
  const json = await fecGet<FecCandidateTotalsResponse>(
    `/candidate/${fecId}/totals/`,
    { cycle, per_page: 1 },
  );
  if (!json?.results || json.results.length === 0) return null;
  const r = json.results[0]?.receipts;
  return typeof r === 'number' ? r : null;
}

// ---------------------------------------------------------------------------
// Bug detectors
// ---------------------------------------------------------------------------

function detectBug1(row: PoliticianRow, realReceipts: number | null): Bug1Finding | null {
  const fecId = (row.source_ids?.fec_candidate_id as string | undefined) ?? null;
  if (!fecId) return null;
  if (realReceipts === null || realReceipts <= 0) return null;
  const db = Number(row.total_funds ?? 0);
  if (db <= 0) return null;
  const ratio = db / realReceipts;
  // We flag if ratio is between (2 - tol) and (2 + tol) — i.e. ~2x.
  if (Math.abs(ratio - 2) <= FEC_DOUBLED_TOLERANCE * 2) {
    return {
      bug: 1,
      bioguide_id: row.bioguide_id,
      name: row.name ?? row.bioguide_id,
      fec_id: fecId,
      db_total_funds: db,
      real_fec_receipts: realReceipts,
      delta: db - realReceipts,
      ratio,
    };
  }
  return null;
}

// donation_status whose `amount` field is meant to represent the LOBBY total.
// We only flag drift when the badge is in lobby-total mode — labels like
// "FOREIGN INFLUENCE DETECTED", "PRO-ISRAEL LOBBY CAPTURED", or subtext that
// references "Pro-Israel Lobby total". Other badges (GRASSROOTS, SKEPTICAL,
// MOSTLY INDIVIDUAL DONORS) intentionally show total-raised in this slot
// with a custom label and must not be auto-realigned to israel_lobby_total.
function isLobbyTotalBadge(ds: DonationStatus): boolean {
  const label = (ds.label ?? '').toUpperCase();
  const subtext = (ds.subtext ?? '').toLowerCase();
  // Negative-mode badges (GRASSROOTS / NO LOBBY CAPTURE / MOSTLY INDIVIDUAL /
  // SKEPTICAL DONATIONS) intentionally show total-raised in this slot with
  // a curated label. Don't auto-realign these to israel_lobby_total.
  if (/\bNO\b/.test(label)) return false;
  if (/GRASSROOTS/.test(label)) return false;
  if (/MOSTLY\s+INDIVIDUAL/.test(label)) return false;
  if (/SKEPTICAL/.test(label)) return false;
  // Match labels that describe lobby capture (positive mode)
  if (/FOREIGN\s+INFLUENCE/.test(label)) return true;
  if (/LOBBY\s+(CAPTURED|CAPTURE)/.test(label)) return true;
  if (/PRO[-\s]?ISRAEL\s+(LOBBY|CAPTURE)/.test(label)) return true;
  if (/AIPAC/.test(label)) return true;
  // Match subtext that breaks down lobby dollars
  if (/pro-?israel\s+lobby\s+total/.test(subtext)) return true;
  if (/aipac\b.*\$|\$.*aipac/.test(subtext)) return true;
  return false;
}

function detectBug2(row: PoliticianRow): Bug2Finding | null {
  const ds = row.source_ids?.donation_status as DonationStatus | undefined;
  if (!ds || typeof ds.amount !== 'number') return null;
  if (!isLobbyTotalBadge(ds)) return null;
  const lobby = Number(row.israel_lobby_total ?? 0);
  if (Math.abs(ds.amount - lobby) < 0.5) return null;
  return {
    bug: 2,
    bioguide_id: row.bioguide_id,
    name: row.name ?? row.bioguide_id,
    donation_status_amount: ds.amount,
    israel_lobby_total: lobby,
    delta: ds.amount - lobby,
  };
}

function isJStreetOnlyMatch(label: string): boolean {
  // Must mention JStreet AND not mention any pro-AIPAC pattern AND mention roster-match.
  const isRosterMatch = /roster-match/i.test(label);
  if (!isRosterMatch) return false;
  if (!JSTREET_PATTERN.test(label)) return false;
  for (const re of PRO_AIPAC_PATTERNS) {
    if (re.test(label)) return false;
  }
  return true;
}

function detectBug3(row: PoliticianRow): Bug3Finding | null {
  const flags = (row.source_ids?.red_flags as RedFlag[] | undefined) ?? [];
  if (flags.length === 0) return null;
  const toArchive: RedFlag[] = [];
  const kept: RedFlag[] = [];
  for (const f of flags) {
    const label = f.label ?? '';
    if (isJStreetOnlyMatch(label)) toArchive.push(f);
    else kept.push(f);
  }
  if (toArchive.length === 0) return null;
  return {
    bug: 3,
    bioguide_id: row.bioguide_id,
    name: row.name ?? row.bioguide_id,
    flags_to_archive: toArchive,
    flags_kept: kept,
  };
}

// ---------------------------------------------------------------------------
// Fix appliers
// ---------------------------------------------------------------------------

async function applyBug1(f: Bug1Finding): Promise<void> {
  const { error } = await sb
    .from('politicians')
    .update({
      total_funds: f.real_fec_receipts,
      data_source: 'audit_2026-04-27_data_quality_sweep_bug1',
    })
    .eq('bioguide_id', f.bioguide_id);
  if (error) throw new Error(`bug1 ${f.bioguide_id}: ${error.message}`);
}

async function applyBug2(f: Bug2Finding): Promise<void> {
  const { data, error: getErr } = await sb
    .from('politicians')
    .select('source_ids')
    .eq('bioguide_id', f.bioguide_id)
    .single();
  if (getErr || !data) throw new Error(`bug2 read ${f.bioguide_id}: ${getErr?.message}`);
  const si = { ...(data.source_ids as Record<string, unknown>) };
  const ds = { ...(si.donation_status as Record<string, unknown>) };
  ds.amount = f.israel_lobby_total;
  si.donation_status = ds;
  const { error: upErr } = await sb
    .from('politicians')
    .update({
      source_ids: si,
      data_source: 'audit_2026-04-27_data_quality_sweep_bug2',
    })
    .eq('bioguide_id', f.bioguide_id);
  if (upErr) throw new Error(`bug2 write ${f.bioguide_id}: ${upErr.message}`);
}

async function applyBug3(f: Bug3Finding): Promise<void> {
  const { data, error: getErr } = await sb
    .from('politicians')
    .select('source_ids')
    .eq('bioguide_id', f.bioguide_id)
    .single();
  if (getErr || !data) throw new Error(`bug3 read ${f.bioguide_id}: ${getErr?.message}`);
  const si = { ...(data.source_ids as Record<string, unknown>) };
  const historical = ((si.historical_red_flags as RedFlag[] | undefined) ?? []).slice();
  for (const flag of f.flags_to_archive) {
    historical.push({
      ...flag,
      _archived: '2026-04-27',
      _reason: 'JStreetPAC counter-signal — dovish/anti-AIPAC PAC, not pro-AIPAC capture. Anti-AIPAC clean policy applies.',
    });
  }
  si.red_flags = f.flags_kept;
  si.historical_red_flags = historical;
  const { error: upErr } = await sb
    .from('politicians')
    .update({
      source_ids: si,
      data_source: 'audit_2026-04-27_data_quality_sweep_bug3',
    })
    .eq('bioguide_id', f.bioguide_id);
  if (upErr) throw new Error(`bug3 write ${f.bioguide_id}: ${upErr.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  console.log(`[sweep] mode=${args.dryRun ? 'dry-run' : 'write'} bugs=${[...args.fixBug].sort().join(',')}`);

  // 1. Pull all active politicians
  const { data: rows, error } = await sb
    .from('politicians')
    .select('bioguide_id, name, total_funds, israel_lobby_total, source_ids')
    .eq('is_active', true);
  if (error) throw new Error(`pull active: ${error.message}`);
  const all = (rows ?? []) as PoliticianRow[];
  const withFecId = all.filter((r) => Boolean((r.source_ids as Record<string, unknown> | null)?.fec_candidate_id));
  console.log(`[sweep] active=${all.length} with_fec_id=${withFecId.length}`);

  const report: Report = {
    generated_at: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'write',
    scope: { active_total: all.length, with_fec_id: withFecId.length },
    bug1: { count: 0, total_db_dollars: 0, total_real_dollars: 0, rows: [] },
    bug2: { count: 0, total_stale_dollars: 0, total_real_dollars: 0, rows: [] },
    bug3: { count: 0, flags_moved: 0, rows: [] },
    skipped: [],
    applied: [],
    errors: [],
  };

  // 2. Detect Bug 1 — requires FEC API call
  if (args.fixBug.has(1)) {
    let i = 0;
    for (const row of withFecId) {
      i += 1;
      if (SKIP_BIOGUIDE_IDS.has(row.bioguide_id)) {
        report.skipped.push({ bioguide_id: row.bioguide_id, name: row.name, reason: 'manually fixed' });
        continue;
      }
      const fecId = (row.source_ids as Record<string, unknown>)?.fec_candidate_id as string;
      try {
        const real = await getRealFecReceipts(fecId, 2026);
        if (real === null) {
          report.skipped.push({
            bioguide_id: row.bioguide_id,
            name: row.name,
            reason: `FEC ${fecId} no 2026 totals (terminated/old cycle)`,
          });
          continue;
        }
        const finding = detectBug1(row, real);
        if (finding) {
          report.bug1.rows.push(finding);
          report.bug1.count += 1;
          report.bug1.total_db_dollars += finding.db_total_funds;
          report.bug1.total_real_dollars += finding.real_fec_receipts;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        report.errors.push(`bug1 detect ${row.bioguide_id} (${fecId}): ${msg}`);
      }
      if (i % 25 === 0) {
        console.log(`[sweep] bug1 progress ${i}/${withFecId.length}`);
      }
    }
    console.log(`[sweep] bug1 detected=${report.bug1.count}`);
  }

  // 3. Detect Bug 2 + Bug 3 — local-only
  for (const row of all) {
    if (SKIP_BIOGUIDE_IDS.has(row.bioguide_id)) continue;
    if (args.fixBug.has(2)) {
      const f2 = detectBug2(row);
      if (f2) {
        report.bug2.rows.push(f2);
        report.bug2.count += 1;
        report.bug2.total_stale_dollars += f2.donation_status_amount;
        report.bug2.total_real_dollars += f2.israel_lobby_total;
      }
    }
    if (args.fixBug.has(3)) {
      const f3 = detectBug3(row);
      if (f3) {
        report.bug3.rows.push(f3);
        report.bug3.count += 1;
        report.bug3.flags_moved += f3.flags_to_archive.length;
      }
    }
  }
  console.log(`[sweep] bug2 detected=${report.bug2.count}`);
  console.log(`[sweep] bug3 detected=${report.bug3.count} flags_to_move=${report.bug3.flags_moved}`);

  // 4. Apply if --write
  if (args.write) {
    for (const f of report.bug1.rows) {
      try {
        await applyBug1(f);
        report.applied.push(`bug1:${f.bioguide_id}`);
      } catch (e: unknown) {
        report.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    for (const f of report.bug2.rows) {
      try {
        await applyBug2(f);
        report.applied.push(`bug2:${f.bioguide_id}`);
      } catch (e: unknown) {
        report.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    for (const f of report.bug3.rows) {
      try {
        await applyBug3(f);
        report.applied.push(`bug3:${f.bioguide_id}`);
      } catch (e: unknown) {
        report.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    console.log(`[sweep] applied=${report.applied.length} errors=${report.errors.length}`);
  }

  // 5. Write report
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[sweep] report -> ${REPORT_PATH}`);

  // 6. Summary
  console.log('');
  console.log('====== SUMMARY ======');
  console.log(`Bug 1 (total_funds doubled):       ${report.bug1.count} rows  (db=$${Math.round(report.bug1.total_db_dollars).toLocaleString()} -> real=$${Math.round(report.bug1.total_real_dollars).toLocaleString()})`);
  console.log(`Bug 2 (donation_status stale):     ${report.bug2.count} rows  (stale=$${Math.round(report.bug2.total_stale_dollars).toLocaleString()} -> real=$${Math.round(report.bug2.total_real_dollars).toLocaleString()})`);
  console.log(`Bug 3 (JStreetPAC counter-signal): ${report.bug3.count} rows  (flags moved=${report.bug3.flags_moved})`);
  console.log(`Skipped: ${report.skipped.length}  Errors: ${report.errors.length}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
