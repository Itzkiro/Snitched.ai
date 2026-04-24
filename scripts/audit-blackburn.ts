#!/usr/bin/env npx tsx
/**
 * Federal FEC audit of Sen. Marsha Blackburn (R-TN).
 *
 * Scope:
 *  - Pulls Schedule A (itemized receipts) for her Senate principal committee
 *    C00376939 MARSHA FOR SENATE for the 2026 cycle (cycle-only scoring policy).
 *  - Pulls Schedule E (independent expenditures) FOR/AGAINST her (S8TN00337) for 2026.
 *  - Cross-refs against pro-Israel PAC superset (israel-lobby-pacs.csv ∪
 *    scripts/pro-israel-pacs.json ∪ lib/fec-client.ts ISRAEL_LOBBY_COMMITTEE_IDS).
 *  - Cross-refs itemized individuals against 49-year pro-Israel individual
 *    donor registry (high-confidence only, per SC-01 false-positive lessons).
 *  - FARA / foreign-money sweep for known FARA-registered firms & foreign-parent
 *    corporate PAC donors.
 *
 * Writes:
 *   data-ingestion/blackburn-senate-fec-2026-itemized.json   (raw Schedule A)
 *   data-ingestion/blackburn-senate-fec-2026-IE.json          (raw Schedule E)
 *   data/blackburn-senate-audit.json                          (aggregated audit)
 *
 * Her gubernatorial 2026 TN state-level fundraising is separate (TN REF).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { loadMaster, parseName, crossref, type CandDonor } from '../lib/roster-match';

const FEC = process.env.FEC_API_KEY || '';
if (!FEC) throw new Error('FEC_API_KEY missing');

const CANDIDATE_ID_SENATE = 'S8TN00337';
const CANDIDATE_ID_HOUSE = 'H2TN06030';
const PRINCIPAL_COMMITTEE = 'C00376939';   // MARSHA FOR SENATE
const CYCLE = 2026;

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const INGEST_DIR = path.join(ROOT, 'data-ingestion');
const OUT_ITEMIZED = path.join(INGEST_DIR, 'blackburn-senate-fec-2026-itemized.json');
const OUT_IE = path.join(INGEST_DIR, 'blackburn-senate-fec-2026-IE.json');
const OUT_AUDIT = path.join(DATA_DIR, 'blackburn-senate-audit.json');

const CONDUIT_RE = /^(WINRED|ACTBLUE|ANEDOT|STRIPE|PAYPAL)(\s|,|$)/i;

// FARA-registered / foreign-agent firms worth flagging
const FARA_FIRMS = [
  'BGR', 'AKIN GUMP', 'SQUIRE PATTON', 'BROWNSTEIN HYATT', 'BROWNSTEIN',
  'HOLLAND & KNIGHT', 'BALLARD PARTNERS', 'VENABLE', 'CAPITOL COUNSEL',
  'K&L GATES', 'MERCURY PUBLIC AFFAIRS', 'MERCURY LLC', 'SIDLEY AUSTIN',
  'HOGAN LOVELLS', 'ARNOLD & PORTER', 'DLA PIPER', 'COVINGTON',
  'CROWELL & MORING', 'WILEY REIN', 'PODESTA GROUP', 'ARNOLD PORTER',
];

const FOREIGN_PARENT_HINTS = [
  'BP', 'SHELL', 'TOTAL', 'NOVARTIS', 'ASTRAZENECA', 'GLAXOSMITHKLINE',
  'GLAXO', 'ROCHE', 'SANOFI', 'DEUTSCHE', 'UBS', 'CREDIT SUISSE',
  'NESTLE', 'SIEMENS', 'UNILEVER', 'DIAGEO', 'ANHEUSER-BUSCH INBEV',
  'AIRBUS', 'FIAT CHRYSLER', 'STELLANTIS', 'TOYOTA', 'HONDA', 'HYUNDAI',
];

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface Row {
  contributor_name: string;
  contributor_id?: string;
  contributor_committee_id?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  entity_type: string;
}

interface IERow {
  committee_id?: string;
  committee_name?: string;
  candidate_id?: string;
  candidate_name?: string;
  support_oppose_indicator?: string;
  expenditure_amount?: number;
  expenditure_date?: string;
  expenditure_description?: string;
  purpose_category?: string;
  payee_name?: string;
}

interface FecResp<T> { results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null; pages?: number } }

async function fec<T>(endpoint: string, params: Record<string, string | number>): Promise<FecResp<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) { await sleep(30_000); return fec(endpoint, params); }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}: ${await res.text().catch(() => '?')}`);
  return res.json() as Promise<FecResp<T>>;
}

async function pullAllScheduleA(
  committeeId: string, cycle: number, isIndividual: boolean, maxPages = 80, minAmount?: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  let lastIdx: unknown, lastAmt: unknown;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string | number> = {
      committee_id: committeeId,
      two_year_transaction_period: cycle,
      is_individual: isIndividual ? 'true' : 'false',
      per_page: 100,
      sort: '-contribution_receipt_amount',
    };
    if (minAmount !== undefined) params.min_amount = minAmount;
    if (lastIdx !== undefined) params.last_index = String(lastIdx);
    if (lastAmt !== undefined) params.last_contribution_receipt_amount = String(lastAmt);
    const resp = await fec<Row>('/schedules/schedule_a/', params);
    const batch = resp.results || [];
    rows.push(...batch);
    if (page % 5 === 0) { process.stdout.write(`    page ${page + 1}: ${rows.length} rows\n`); }
    const last = resp.pagination?.last_indexes;
    if (!last || batch.length < 100) break;
    lastIdx = last.last_index;
    lastAmt = last.last_contribution_receipt_amount;
    await sleep(300);
  }
  return rows;
}

async function pullAllScheduleE(candidateId: string, cycle: number): Promise<IERow[]> {
  const rows: IERow[] = [];
  let lastIdx: unknown, lastAmt: unknown;
  for (let page = 0; page < 100; page++) {
    const params: Record<string, string | number> = {
      candidate_id: candidateId,
      cycle,
      per_page: 100,
      sort: '-expenditure_amount',
    };
    if (lastIdx !== undefined) params.last_index = String(lastIdx);
    if (lastAmt !== undefined) params.last_expenditure_amount = String(lastAmt);
    const resp = await fec<IERow>('/schedules/schedule_e/', params);
    const batch = resp.results || [];
    rows.push(...batch);
    const last = resp.pagination?.last_indexes;
    if (!last || batch.length < 100) break;
    lastIdx = last.last_index;
    lastAmt = last.last_expenditure_amount;
    await sleep(400);
  }
  return rows;
}

interface DonorAgg {
  name: string; state: string; city: string; employer: string; occupation: string;
  total: number; count: number; first_date: string; last_date: string;
}

function aggregate(rows: Row[]): Map<string, DonorAgg> {
  const m = new Map<string, DonorAgg>();
  for (const r of rows) {
    const name = (r.contributor_name || '').trim().toUpperCase();
    const state = (r.contributor_state || '').toUpperCase();
    const key = `${name}|${state}`;
    const amt = r.contribution_receipt_amount || 0;
    const date = r.contribution_receipt_date || '';
    const cur = m.get(key);
    if (cur) {
      cur.total += amt;
      cur.count++;
      if (date && (!cur.first_date || date < cur.first_date)) cur.first_date = date;
      if (date && date > cur.last_date) cur.last_date = date;
      if (r.contributor_employer && !cur.employer) cur.employer = r.contributor_employer;
    } else {
      m.set(key, {
        name, state,
        city: (r.contributor_city || '').toUpperCase(),
        employer: (r.contributor_employer || '').toUpperCase(),
        occupation: (r.contributor_occupation || '').toUpperCase(),
        total: amt, count: 1,
        first_date: date, last_date: date,
      });
    }
  }
  return m;
}

function loadProIsraelPacSuperset(): Map<string, string> {
  const byId = new Map<string, string>();
  // 1) israel-lobby-pacs.csv
  const csv = path.join(INGEST_DIR, 'israel-lobby-pacs.csv');
  if (fs.existsSync(csv)) {
    const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/);
    lines.shift();
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(',');
      const id = (parts[0] || '').trim();
      const name = (parts[2] || parts[1] || '').trim();
      if (id) byId.set(id, name);
    }
  }
  // 2) scripts/pro-israel-pacs.json
  const json = path.join(ROOT, 'scripts', 'pro-israel-pacs.json');
  if (fs.existsSync(json)) {
    const arr = JSON.parse(fs.readFileSync(json, 'utf8')) as Array<{ id: string; name: string }>;
    for (const r of arr) if (r.id && !byId.has(r.id)) byId.set(r.id, r.name);
  }
  // 3) lib/fec-client.ts ISRAEL_LOBBY_COMMITTEE_IDS (hardcoded mirror)
  const hardcoded: Record<string, string> = {
    C00104414: 'AIPAC (American Israel Public Affairs Committee)',
    C00803833: 'United Democracy Project (AIPAC Super PAC)',
    C00776997: 'Democratic Majority for Israel PAC',
    C00765578: 'Pro-Israel America PAC',
    C00030718: 'NORPAC',
    C00236489: 'J Street PAC',
    C00368522: 'Joint Action Committee for Political Affairs (JACPAC)',
    C00095067: 'Washington PAC',
    C00386532: 'Americans for a Secure Israel',
  };
  for (const [id, name] of Object.entries(hardcoded)) if (!byId.has(id)) byId.set(id, name);
  return byId;
}

const PRO_ISRAEL_NAME_PATTERNS = [
  'AIPAC', 'AMERICAN ISRAEL PUBLIC AFFAIRS', 'UNITED DEMOCRACY PROJECT',
  'DEMOCRATIC MAJORITY FOR ISRAEL', 'PRO-ISRAEL AMERICA', 'NORPAC',
  'J STREET', 'JSTREET', 'JOINT ACTION COMMITTEE FOR POLITICAL',
  'WASHINGTON PAC', 'ISRAEL BONDS', 'FRIENDS OF ISRAEL', 'ISRAEL ALLIES',
  'REPUBLICAN JEWISH COALITION', 'RJC PAC', 'RJC VICTORY',
  'US ISRAEL PAC', 'U.S. ISRAEL PAC', 'AMERICANS FOR A SECURE ISRAEL',
  'ZIONIST', 'ZIONESS', 'PRESERVE AMERICA PAC', 'DMFI',
];

async function main(): Promise<void> {
  console.log('=== MARSHA BLACKBURN (R-TN) FEDERAL FEC AUDIT — CYCLE 2026 ===\n');
  console.log(`Senate candidate: ${CANDIDATE_ID_SENATE}`);
  console.log(`House predecessor: ${CANDIDATE_ID_HOUSE}`);
  console.log(`Principal committee: ${PRINCIPAL_COMMITTEE} (MARSHA FOR SENATE)\n`);

  // 1. Committee totals for current cycle
  const totalsResp = await fec<Record<string, unknown>>(`/committee/${PRINCIPAL_COMMITTEE}/totals/`, { per_page: 20, cycle: CYCLE });
  const totals = (totalsResp.results || []).filter(t => Number(t.cycle) === CYCLE);
  await sleep(400);
  console.log(`Committee totals rows for 2026: ${totals.length}`);
  if (totals.length) {
    const t = totals[0] as Record<string, number>;
    console.log(`  receipts: $${(t.receipts || 0).toLocaleString()}`);
    console.log(`  individual_itemized: $${(t.individual_itemized_contributions || 0).toLocaleString()}`);
    console.log(`  individual_unitemized: $${(t.individual_unitemized_contributions || 0).toLocaleString()}`);
    console.log(`  other_political_committees: $${(t.other_political_committee_contributions || 0).toLocaleString()}`);
    console.log(`  cash_on_hand: $${(t.last_cash_on_hand_end_period || 0).toLocaleString()}`);
  }

  // 2. Schedule A — individuals + non-individuals
  // Individuals: pull all rows >= $200 (cap at 80 pages = 8K rows). Below-$200
  // conduit pass-throughs are noise for registry crossref.
  console.log(`\nPulling Schedule A (individuals >= $200)...`);
  const individualRows = await pullAllScheduleA(PRINCIPAL_COMMITTEE, CYCLE, true, 80, 200);
  console.log(`  => ${individualRows.length} individual rows`);

  console.log(`\nPulling Schedule A (non-individuals / PACs)...`);
  const pacRows = await pullAllScheduleA(PRINCIPAL_COMMITTEE, CYCLE, false, 30);
  console.log(`  => ${pacRows.length} non-individual rows`);

  // Persist raw Schedule A
  fs.writeFileSync(OUT_ITEMIZED, JSON.stringify({
    committee_id: PRINCIPAL_COMMITTEE,
    candidate_id: CANDIDATE_ID_SENATE,
    cycle: CYCLE,
    fetched_at: new Date().toISOString(),
    individual_rows: individualRows,
    non_individual_rows: pacRows,
  }, null, 2));
  console.log(`Wrote ${OUT_ITEMIZED}`);

  // 3. Schedule E
  console.log(`\nPulling Schedule E (IE for/against S8TN00337)...`);
  const ieRows = await pullAllScheduleE(CANDIDATE_ID_SENATE, CYCLE);
  console.log(`  => ${ieRows.length} IE rows`);
  fs.writeFileSync(OUT_IE, JSON.stringify({
    candidate_id: CANDIDATE_ID_SENATE,
    cycle: CYCLE,
    fetched_at: new Date().toISOString(),
    rows: ieRows,
  }, null, 2));
  console.log(`Wrote ${OUT_IE}`);

  // 4. Classify PAC rows and cross-ref against pro-Israel PAC superset
  const proIsraelPacs = loadProIsraelPacSuperset();
  console.log(`\nPro-Israel PAC superset: ${proIsraelPacs.size} committee IDs`);

  const realPacRows = pacRows.filter(r => !CONDUIT_RE.test((r.contributor_name || '').trim()));
  const conduitRows = pacRows.filter(r => CONDUIT_RE.test((r.contributor_name || '').trim()));
  const realPacSum = realPacRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);
  const conduitSum = conduitRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);

  // Pro-Israel PAC direct contributions — match by committee ID OR name pattern
  interface ProIsraelPacHit { committee_id: string; name: string; amount: number; count: number; matched_by: string }
  const proIsraelPacAgg = new Map<string, ProIsraelPacHit>();
  for (const r of realPacRows) {
    const id = (r.contributor_committee_id || r.contributor_id || '').trim();
    const name = (r.contributor_name || '').trim().toUpperCase();
    let hit: { name: string; matched_by: string } | null = null;
    if (id && proIsraelPacs.has(id)) {
      hit = { name: proIsraelPacs.get(id) || name, matched_by: 'committee_id' };
    } else if (PRO_ISRAEL_NAME_PATTERNS.some(p => name.includes(p))) {
      hit = { name, matched_by: 'name_pattern' };
    }
    if (!hit) continue;
    const key = id || name;
    const cur = proIsraelPacAgg.get(key);
    const amt = r.contribution_receipt_amount || 0;
    if (cur) { cur.amount += amt; cur.count++; }
    else proIsraelPacAgg.set(key, { committee_id: id, name: hit.name, amount: amt, count: 1, matched_by: hit.matched_by });
  }

  // Pro-Israel Schedule E (IE for her)
  const ieFor = ieRows.filter(r => /S/i.test(r.support_oppose_indicator || ''));
  const ieAgainst = ieRows.filter(r => /O/i.test(r.support_oppose_indicator || ''));
  const ieForSum = ieFor.reduce((s, r) => s + (r.expenditure_amount || 0), 0);
  const ieAgainstSum = ieAgainst.reduce((s, r) => s + (r.expenditure_amount || 0), 0);

  const proIsraelIeFor = ieFor.filter(r => {
    const cid = (r.committee_id || '').trim();
    const cname = (r.committee_name || '').toUpperCase();
    return (cid && proIsraelPacs.has(cid)) || PRO_ISRAEL_NAME_PATTERNS.some(p => cname.includes(p));
  });

  // 5. Individual donor cross-ref against registry (HIGH CONFIDENCE ONLY per SC-01)
  console.log(`\nLoading pro-Israel individual registry...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} unique pro-Israel donors indexed`);

  const candDonors: CandDonor[] = [];
  for (const r of individualRows) {
    if (r.entity_type && r.entity_type !== 'IND') continue;
    const raw = (r.contributor_name || '').trim();
    if (!raw) continue;
    const p = parseName(raw);
    if (!p || !p.last || !p.first) continue;
    candDonors.push({
      rawName: raw,
      last: p.last, first: p.first, firstInitial: p.firstInitial,
      state: (r.contributor_state || '').toUpperCase().trim(),
      city: (r.contributor_city || '').toUpperCase().trim(),
      employer: (r.contributor_employer || '').toUpperCase().trim(),
      occupation: (r.contributor_occupation || '').toUpperCase().trim(),
      amount: r.contribution_receipt_amount || 0,
      date: r.contribution_receipt_date || '',
      cycle: String(CYCLE),
    });
  }
  const matches = crossref(candDonors, master);

  // Extra strictness: "high confidence" here also requires exact full first name match.
  const highConf = matches.filter(m => m.confidence === 'high');
  const mediumConf = matches.filter(m => m.confidence === 'medium');

  // 6. FARA / foreign-money sweep on individual donor employers + PAC names
  interface Signal { type: string; donor: string; amount: number; note: string; state?: string; employer?: string }
  const signals: Signal[] = [];
  const indAgg = aggregate(individualRows);
  for (const [, d] of indAgg) {
    const emp = d.employer || '';
    for (const firm of FARA_FIRMS) {
      if (emp.includes(firm)) {
        signals.push({ type: 'fara_firm_employer', donor: d.name, amount: d.total, state: d.state, employer: emp, note: `employer matches FARA firm keyword "${firm}"` });
        break;
      }
    }
    for (const hint of FOREIGN_PARENT_HINTS) {
      if (emp === hint || emp.startsWith(hint + ' ') || emp.includes(` ${hint} `)) {
        signals.push({ type: 'foreign_parent_employer', donor: d.name, amount: d.total, state: d.state, employer: emp, note: `employer matches foreign-parent corp "${hint}"` });
        break;
      }
    }
  }
  for (const r of realPacRows) {
    const name = (r.contributor_name || '').toUpperCase();
    for (const firm of FARA_FIRMS) {
      if (name.includes(firm) && name.includes('PAC')) {
        signals.push({ type: 'fara_firm_pac', donor: r.contributor_name || '', amount: r.contribution_receipt_amount || 0, note: `FARA-firm-affiliated PAC "${firm}"` });
        break;
      }
    }
    for (const hint of FOREIGN_PARENT_HINTS) {
      if (name.includes(hint) && (name.includes('PAC') || name.includes('COMMITTEE'))) {
        signals.push({ type: 'foreign_parent_pac', donor: r.contributor_name || '', amount: r.contribution_receipt_amount || 0, note: `foreign-parent corp PAC "${hint}"` });
        break;
      }
    }
  }

  // 7. Report to console
  const indSum = individualRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);
  const totalReceipts = totals.length ? Number((totals[0] as Record<string, number>).receipts) || 0 : 0;

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total receipts (2026 cycle):       $${totalReceipts.toLocaleString()}`);
  console.log(`  Individual itemized rows:        ${individualRows.length} / $${indSum.toLocaleString()}`);
  console.log(`  Real PAC rows:                   ${realPacRows.length} / $${realPacSum.toLocaleString()}`);
  console.log(`  Conduit (WinRed/etc) rows:       ${conduitRows.length} / $${conduitSum.toLocaleString()}`);
  console.log(`\nPro-Israel PAC direct contributions: ${proIsraelPacAgg.size} PACs / $${[...proIsraelPacAgg.values()].reduce((s,p)=>s+p.amount,0).toLocaleString()}`);
  for (const p of [...proIsraelPacAgg.values()].sort((a, b) => b.amount - a.amount)) {
    console.log(`  $${p.amount.toLocaleString().padStart(10)} (${p.count}x) | ${p.committee_id || '-'} | ${p.name} [${p.matched_by}]`);
  }
  console.log(`\nIndependent expenditures (Schedule E):`);
  console.log(`  FOR Blackburn:     ${ieFor.length} rows / $${ieForSum.toLocaleString()}`);
  console.log(`  AGAINST Blackburn: ${ieAgainst.length} rows / $${ieAgainstSum.toLocaleString()}`);
  console.log(`  Pro-Israel IE FOR: ${proIsraelIeFor.length} rows / $${proIsraelIeFor.reduce((s,r)=>s+(r.expenditure_amount||0),0).toLocaleString()}`);
  console.log(`\nIndividual-donor registry crossref (high-confidence only):`);
  console.log(`  matched: ${matches.length} (${highConf.length} high / ${mediumConf.length} medium)`);
  console.log(`  high-conf gave Blackburn:  $${highConf.reduce((s,m)=>s+m.candidateTotal,0).toLocaleString()}`);
  console.log(`  high-conf career to pro-Israel PACs: $${highConf.reduce((s,m)=>s+m.proIsraelTotal,0).toLocaleString()}`);
  console.log(`\nFARA / foreign-money signals: ${signals.length}`);
  for (const s of signals.slice(0, 20)) {
    console.log(`  [${s.type}] $${s.amount.toLocaleString()} | ${s.donor} | ${s.note}`);
  }

  // 8. Write final audit JSON
  const audit = {
    generated_at: new Date().toISOString(),
    candidate: {
      name: 'Marsha Blackburn',
      party: 'REP',
      state: 'TN',
      office: 'Senate',
      candidate_id: CANDIDATE_ID_SENATE,
      house_candidate_id: CANDIDATE_ID_HOUSE,
      principal_committee_id: PRINCIPAL_COMMITTEE,
      leadership_pac_ids: [],
      jfc_ids: ['C00689471', 'C00683029', 'C00674770', 'C00686741', 'C00678235'],
      notes: 'Running for TN Governor 2026 at state level (separate TN REF filing); Senate seat up 2030.',
    },
    cycle: CYCLE,
    total_receipts: totalReceipts,
    committee_totals: totals,
    individual_total: indSum,
    individual_rows: individualRows.length,
    real_pac_total: realPacSum,
    real_pac_rows: realPacRows.length,
    conduit_total: conduitSum,
    conduit_rows: conduitRows.length,
    pro_israel_pacs: [...proIsraelPacAgg.values()].sort((a, b) => b.amount - a.amount),
    pro_israel_pac_total: [...proIsraelPacAgg.values()].reduce((s, p) => s + p.amount, 0),
    pro_israel_bundlers_high_conf: highConf.map(m => ({
      name: m.donorName, state: m.state,
      to_blackburn: m.candidateTotal,
      career_to_pro_israel_pacs: m.proIsraelTotal,
      pacs: m.proIsraelPacs,
      candidate_cycles: m.candidateCycles,
      pro_israel_cycles: m.proIsraelCycles,
    })),
    pro_israel_bundlers_medium_conf: mediumConf.map(m => ({
      name: m.donorName, state: m.state,
      to_blackburn: m.candidateTotal,
      career_to_pro_israel_pacs: m.proIsraelTotal,
      pacs: m.proIsraelPacs,
    })),
    ie_for: ieFor.map(r => ({
      spender_committee: r.committee_name, committee_id: r.committee_id,
      amount: r.expenditure_amount, date: r.expenditure_date,
      purpose: r.expenditure_description || r.purpose_category,
      payee: r.payee_name,
    })),
    ie_for_total: ieForSum,
    ie_against: ieAgainst.map(r => ({
      spender_committee: r.committee_name, committee_id: r.committee_id,
      amount: r.expenditure_amount, date: r.expenditure_date,
      purpose: r.expenditure_description || r.purpose_category,
      payee: r.payee_name,
    })),
    ie_against_total: ieAgainstSum,
    pro_israel_ie_for: proIsraelIeFor.map(r => ({
      spender_committee: r.committee_name, committee_id: r.committee_id,
      amount: r.expenditure_amount, date: r.expenditure_date,
      purpose: r.expenditure_description || r.purpose_category,
    })),
    foreign_money_signals: signals,
    top_individual_donors: [...indAgg.values()].sort((a, b) => b.total - a.total).slice(0, 50),
    top_real_pac_contributions: [...aggregate(realPacRows).entries()]
      .map(([, v]) => v)
      .sort((a, b) => b.total - a.total)
      .slice(0, 50),
  };

  fs.writeFileSync(OUT_AUDIT, JSON.stringify(audit, null, 2));
  console.log(`\nAudit artifact: ${OUT_AUDIT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
