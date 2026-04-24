#!/usr/bin/env npx tsx
/**
 * SC-01 Challenger PAC-Level Audit (Sanford, Pelbath, Smith — NOT Dykes)
 *
 * Verifies each 2026 cycle challenger's Schedule A contributions + Schedule E
 * (independent expenditures) against the FULL pro-Israel PAC registry, unioning
 * every known source in the repo:
 *
 *   - data-ingestion/israel-lobby-pacs.csv           (the "corruption-score" canonical 32)
 *   - scripts/pro-israel-pacs.json                   (the 62-entry registry-builder list)
 *   - lib/fec-client.ts ISRAEL_LOBBY_COMMITTEE_IDS   (the app-code 9 IDs)
 *   - scripts/audit-sc01-challengers.ts inline set   (mirror of csv, defensive)
 *
 * For each challenger:
 *   - Scan 2026 Schedule A rows (locally cached itemized.json) for BOTH
 *     committee_id match + name-regex match. Exclude entity_type='IND' rows.
 *   - Pull Schedule E live from FEC API for cycle=2026 and flag IE from any
 *     pro-Israel PAC (support + oppose).
 *
 * CLI:
 *   npx tsx scripts/audit-sc01-pac-level.ts              # dry-run
 *   npx tsx scripts/audit-sc01-pac-level.ts --write      # patch DB if findings non-trivial
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

const ARGV = new Set(process.argv.slice(2));
const WRITE = ARGV.has('--write');
const FEC_KEY = process.env.FEC_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!FEC_KEY) throw new Error('FEC_API_KEY must be set');

const REPO = path.resolve(__dirname, '..');
const DATA_INGESTION = path.join(REPO, 'data-ingestion');

// ---------------------------------------------------------------------------
// Build the master PAC registry from every source in the repo
// ---------------------------------------------------------------------------

interface PacSource {
  file: string;
  ids: Set<string>;
  names: string[]; // normalized uppercase pac names
}

function loadCsvIds(relPath: string): PacSource {
  const abs = path.join(REPO, relPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split(/\r?\n/).slice(1).filter(l => l.trim());
  const ids = new Set<string>();
  const names: string[] = [];
  for (const line of lines) {
    const [id, , fullName] = line.split(',');
    if (id && /^C[0-9A-Z]+$/.test(id.trim())) ids.add(id.trim());
    if (fullName) names.push(fullName.trim().toUpperCase());
  }
  return { file: relPath, ids, names };
}

function loadJsonIds(relPath: string): PacSource {
  const abs = path.join(REPO, relPath);
  const arr = JSON.parse(fs.readFileSync(abs, 'utf8')) as Array<{ id: string; name: string }>;
  const ids = new Set<string>();
  const names: string[] = [];
  for (const p of arr) {
    if (p.id && /^C[0-9A-Z]+$/.test(p.id)) ids.add(p.id);
    if (p.name) names.push(p.name.toUpperCase());
  }
  return { file: relPath, ids, names };
}

// Source 1: data-ingestion/israel-lobby-pacs.csv
const SRC_CSV = loadCsvIds('data-ingestion/israel-lobby-pacs.csv');

// Source 2: scripts/pro-israel-pacs.json
const SRC_JSON = loadJsonIds('scripts/pro-israel-pacs.json');

// Source 3: lib/fec-client.ts ISRAEL_LOBBY_COMMITTEE_IDS (hand-extracted)
const SRC_FEC_CLIENT: PacSource = {
  file: 'lib/fec-client.ts',
  ids: new Set([
    'C00104414', 'C00803833', 'C00776997', 'C00765578',
    'C00030718', 'C00236489', 'C00368522', 'C00095067', 'C00386532',
  ]),
  names: [],
};

// Source 4: scripts/audit-sc01-challengers.ts inline set (hand-extracted)
const SRC_SC01_INLINE: PacSource = {
  file: 'scripts/audit-sc01-challengers.ts',
  ids: new Set([
    'C00104299', 'C00797472', 'C00797670',
    'C00368522', 'C00699470', 'C00740936', 'C00687657', 'C90019431',
    'C00556100', 'C00345132', 'C30001374', 'C90012063',
    'C00764126', 'C90022864',
    'C00441949', 'C00068692', 'C00247403', 'C00127811',
    'C00139659', 'C00488411',
    'C00141747', 'C00458935', 'C00265470',
    'C00748475', 'C00306670', 'C00268334', 'C90014747',
    'C00202481', 'C00791699', 'C00277228', 'C00503250', 'C00524652',
  ]),
  names: [],
};

const ALL_SOURCES = [SRC_CSV, SRC_JSON, SRC_FEC_CLIENT, SRC_SC01_INLINE];
const MASTER_IDS = new Set<string>();
const MASTER_NAMES = new Set<string>();
for (const s of ALL_SOURCES) {
  for (const id of s.ids) MASTER_IDS.add(id);
  for (const n of s.names) MASTER_NAMES.add(n);
}

// Canonical name regex (catches conduit transfers where committee_id is null).
const ISRAEL_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|JACPAC|JEWISH DEMOCRATIC COUNCIL|JEWISH REPUBLICAN|FRIENDS OF ISRAEL|FIPAC|ALLIES FOR ISRAEL|ISRAEL ALLIANCE|J\s*STREET|JSTREETPAC|JOINT ACTION COMMITTEE FOR POLITICAL|U\.?S\.?\s*ISRAEL|J STREET ACTION|JDCA|SHOMER|ZIONESS|DEMOCRATIC JEWISH OUTREACH|MAINSTREAM DEMOCRATS|BI-COUNTY PAC|WASHINGTON PAC|DESERT CAUCUS|HEARTLAND PAC|CITY PAC|MID MANHATTAN PAC|HUDSON VALLEY PAC|GARDEN STATE PAC|NATIONAL PAC|WORLD ALLIANCE FOR ISRAEL|YOUNG JEWISH LEADERSHIP|WOMEN'S PRO-ISRAEL|TO PROTECT OUR HERITAGE/i;

// ---------------------------------------------------------------------------
// Challenger set
// ---------------------------------------------------------------------------

interface Challenger {
  bioguide: string;
  name: string;
  fec_h: string;
  itemized_file: string; // 2026 only
}

const CHALLENGERS: Challenger[] = [
  { bioguide: 'sc-01-2026-mark-sanford', name: 'Mark Sanford',  fec_h: 'H4SC01073', itemized_file: 'sanford-fec-2026-itemized.json' },
  { bioguide: 'sc-01-2026-alex-pelbath', name: 'Alex Pelbath', fec_h: 'H6SC01268', itemized_file: 'pelbath-fec-2026-itemized.json' },
  { bioguide: 'sc-01-2026-mark-smith',   name: 'Mark Smith',   fec_h: 'H6SC01250', itemized_file: 'smith-fec-2026-itemized.json' },
];

// ---------------------------------------------------------------------------
// Schedule A scan
// ---------------------------------------------------------------------------

interface FecRow {
  contributor_name?: string | null;
  contributor_committee_id?: string | null;
  contribution_receipt_amount?: number | null;
  contribution_receipt_date?: string | null;
  entity_type?: string | null;
}

interface ScheduleAFinding {
  committee_id: string;
  contributor_name: string;
  amount: number;
  date: string;
  match_reason: 'committee_id' | 'name_regex';
}

function scanScheduleA(c: Challenger): ScheduleAFinding[] {
  const abs = path.join(DATA_INGESTION, c.itemized_file);
  if (!fs.existsSync(abs)) {
    console.warn(`  [warn] missing: ${abs}`);
    return [];
  }
  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw) return [];
  const rows: FecRow[] = JSON.parse(raw);

  const findings: ScheduleAFinding[] = [];
  for (const r of rows) {
    const amt = r.contribution_receipt_amount || 0;
    if (!amt) continue;
    const entity = (r.entity_type || '').toUpperCase();
    // Exclude individuals — handled by the bundler pipeline.
    if (entity === 'IND') continue;

    const cid = (r.contributor_committee_id || '').trim();
    const name = (r.contributor_name || '').trim();

    let match_reason: ScheduleAFinding['match_reason'] | null = null;
    if (cid && MASTER_IDS.has(cid)) match_reason = 'committee_id';
    else if (name && ISRAEL_NAME_RE.test(name)) match_reason = 'name_regex';

    if (match_reason) {
      findings.push({
        committee_id: cid,
        contributor_name: name,
        amount: amt,
        date: r.contribution_receipt_date || '',
        match_reason,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Schedule E scan (Independent Expenditures)
// ---------------------------------------------------------------------------

interface ScheduleERow {
  committee_id?: string | null;
  committee?: { name?: string | null } | null;
  payee_name?: string | null;
  expenditure_amount?: number | null;
  support_oppose_indicator?: string | null;
  expenditure_date?: string | null;
  candidate_id?: string | null;
  cycle?: number | null;
}

interface ScheduleEFinding {
  committee_id: string;
  committee_name: string;
  payee_name: string;
  amount: number;
  support_oppose: string; // S / O
  date: string;
}

async function fetchScheduleE(candidate_id: string): Promise<ScheduleEFinding[]> {
  const findings: ScheduleEFinding[] = [];
  let page = 1;
  const per_page = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://api.open.fec.gov/v1/schedules/schedule_e/?api_key=${FEC_KEY}&candidate_id=${candidate_id}&cycle=2026&per_page=${per_page}&page=${page}&sort=-expenditure_date`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`    schedule_e HTTP ${res.status} for ${candidate_id} p${page}`);
      break;
    }
    const body = await res.json() as { results?: ScheduleERow[]; pagination?: { pages?: number } };
    const rows = body.results || [];
    for (const r of rows) {
      const amt = r.expenditure_amount || 0;
      if (!amt) continue;
      const cid = (r.committee_id || '').trim();
      const cname = (r.committee?.name || '').toUpperCase();

      const matchById = cid && MASTER_IDS.has(cid);
      const matchByName = cname && ISRAEL_NAME_RE.test(cname);
      if (!matchById && !matchByName) continue;

      findings.push({
        committee_id: cid,
        committee_name: r.committee?.name || '',
        payee_name: r.payee_name || '',
        amount: amt,
        support_oppose: r.support_oppose_indicator || '?',
        date: r.expenditure_date || '',
      });
    }
    const totalPages = body.pagination?.pages || 1;
    if (page >= totalPages) break;
    page++;
    await new Promise(r => setTimeout(r, 350)); // FEC rate limit friendly
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Supabase fetch — for DB-reality comparison
// ---------------------------------------------------------------------------

interface DbRow {
  bioguide_id: string;
  israel_lobby_breakdown?: Record<string, unknown> | null;
  israel_lobby_total?: number | null;
  contribution_breakdown?: Record<string, unknown> | null;
}

async function fetchDbRow(sb: SupabaseClient, bioguide: string): Promise<DbRow | null> {
  const { data, error } = await sb
    .from('politicians')
    .select('bioguide_id,israel_lobby_breakdown,israel_lobby_total,contribution_breakdown')
    .eq('bioguide_id', bioguide)
    .maybeSingle();
  if (error) {
    console.error(`  DB fetch error: ${error.message}`);
    return null;
  }
  return data as DbRow | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== SC-01 PAC-Level Audit (${WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  console.log(`Master registry: ${MASTER_IDS.size} unique committee IDs + ${MASTER_NAMES.size} unique PAC names`);
  console.log(`  - ${SRC_CSV.file}: ${SRC_CSV.ids.size} IDs`);
  console.log(`  - ${SRC_JSON.file}: ${SRC_JSON.ids.size} IDs`);
  console.log(`  - ${SRC_FEC_CLIENT.file}: ${SRC_FEC_CLIENT.ids.size} IDs`);
  console.log(`  - ${SRC_SC01_INLINE.file}: ${SRC_SC01_INLINE.ids.size} IDs`);

  const sb = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  const rows: Array<{
    name: string;
    directPacDollars: number;
    ieDollars: number;
    pacsInvolved: string;
    dbMatches: string;
    findings: ScheduleAFinding[];
    ie: ScheduleEFinding[];
  }> = [];

  for (const c of CHALLENGERS) {
    console.log(`\n--- ${c.name} (${c.bioguide}, ${c.fec_h}) ---`);
    const sa = scanScheduleA(c);
    const saTotal = sa.reduce((s, f) => s + f.amount, 0);
    console.log(`  Schedule A: ${sa.length} rows, $${saTotal.toLocaleString()}`);
    for (const f of sa) {
      console.log(`    $${f.amount.toFixed(2)}  ${f.contributor_name} [${f.committee_id || '—'}] via ${f.match_reason} on ${f.date}`);
    }

    console.log(`  fetching Schedule E from FEC (cycle=2026, candidate_id=${c.fec_h})...`);
    const se = await fetchScheduleE(c.fec_h);
    const seTotal = se.reduce((s, f) => s + f.amount, 0);
    console.log(`  Schedule E: ${se.length} rows, $${seTotal.toLocaleString()}`);
    for (const f of se) {
      console.log(`    $${f.amount.toFixed(2)}  ${f.committee_name} [${f.committee_id}] ${f.support_oppose} ${f.payee_name} on ${f.date}`);
    }

    // Named PACs
    const pacs = new Set<string>();
    for (const f of sa) pacs.add(f.contributor_name || f.committee_id);
    for (const f of se) pacs.add(f.committee_name || f.committee_id);

    // DB-reality check
    let dbMatches = 'n/a';
    if (sb) {
      const db = await fetchDbRow(sb, c.bioguide);
      if (db) {
        const dbPacsVal = (db.israel_lobby_breakdown as { pacs?: number } | null)?.pacs ?? 0;
        const expected = saTotal + seTotal;
        dbMatches = dbPacsVal === expected ? 'yes' : `db.pacs=$${dbPacsVal} vs scan=$${expected}`;
      } else {
        dbMatches = 'row missing';
      }
    }

    rows.push({
      name: c.name,
      directPacDollars: saTotal,
      ieDollars: seTotal,
      pacsInvolved: pacs.size ? Array.from(pacs).join('; ') : '—',
      dbMatches,
      findings: sa,
      ie: se,
    });
  }

  // Summary table
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`candidate          | directPAC$ | IE$      | PACs             | DB matches?`);
  console.log(`-------------------+------------+----------+------------------+-------------`);
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(18)} | $${String(r.directPacDollars).padStart(9)} | $${String(r.ieDollars).padStart(7)} | ${r.pacsInvolved.slice(0, 16).padEnd(16)} | ${r.dbMatches}`,
    );
  }

  // Verdict
  const anyFindings = rows.some(r => r.directPacDollars > 0 || r.ieDollars > 0);
  if (!anyFindings) {
    console.log(`\nVERDICT: All 3 challengers have ZERO direct pro-Israel PAC contributions and ZERO IE in the 2026 cycle. Their only lobby-adjacent signal is the individual-bundler layer, which is already captured.`);
  } else {
    console.log(`\nVERDICT: Non-trivial findings present. ${WRITE ? 'Patching DB now...' : 'Re-run with --write to patch DB.'}`);
    if (WRITE && sb) {
      for (const c of CHALLENGERS) {
        const row = rows.find(r => r.name === c.name);
        if (!row || (row.directPacDollars === 0 && row.ieDollars === 0)) continue;
        const expected = row.directPacDollars + row.ieDollars;
        const pac_details = [
          ...row.findings.map(f => ({
            source: 'schedule_a',
            committee_id: f.committee_id,
            name: f.contributor_name,
            amount: f.amount,
            date: f.date,
            match_reason: f.match_reason,
          })),
          ...row.ie.map(f => ({
            source: 'schedule_e',
            committee_id: f.committee_id,
            name: f.committee_name,
            amount: f.amount,
            date: f.date,
            support_oppose: f.support_oppose,
          })),
        ];
        const { error } = await sb.from('politicians').update({
          israel_lobby_breakdown: {
            total: expected,
            pacs: row.directPacDollars,
            ie: row.ieDollars,
            bundlers: 0, // preserved separately
          },
          pac_details,
          updated_at: new Date().toISOString(),
        }).eq('bioguide_id', c.bioguide);
        if (error) console.error(`  patch failed for ${c.bioguide}: ${error.message}`);
        else console.log(`  patched ${c.bioguide}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
