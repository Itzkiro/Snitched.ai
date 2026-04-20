#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * All PAC donations to Amy Acton (OH gov D), Vivek Ramaswamy (OH gov R, plus
 * his 2024 presidential FEC file for completeness), and Casey Putsch (no data).
 * Each row is one PAC→candidate row, flagged if it's a pro-Israel lobby PAC.
 *
 * Output: data-ingestion/oh-gov-pac-donations.csv
 */

import * as fs from 'fs';
import * as path from 'path';

const IN_ACTON = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
const IN_VIVEK_OH = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');
const IN_VIVEK_FEC = path.join(__dirname, '..', 'data-ingestion', 'vivek-fec-2024-itemized.json');
const OUT = path.join(__dirname, '..', 'data-ingestion', 'oh-gov-pac-donations.csv');

const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299','C00797472','C00797670','C00368522','C00699470','C00740936','C00687657','C90019431',
  'C00556100','C00345132','C30001374','C90012063','C00764126','C90022864','C00441949','C00068692',
  'C00247403','C00127811','C00139659','C00488411','C00141747','C00458935','C00265470','C00748475',
  'C00306670','C00268334','C90014747','C00202481','C00791699','C00277228','C00503250','C00524652',
]);
const ISRAEL_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL|REPUBLICAN JEWISH|ZIONIST|JACPAC|J STREET|PRESERVE AMERICA|DESERT CAUCUS|NATIONAL PAC/i;

interface PacRow {
  candidate: string;
  source: string;
  pac_name: string;
  pac_id: string;
  entity_type: string;
  state: string;
  city: string;
  amount: number;
  date: string;
  is_israel_lobby: boolean;
  israel_match_reason: string;
}

function isIsraelLobby(name: string, id: string): { flag: boolean; reason: string } {
  if (id && ISRAEL_LOBBY_COMMITTEE_IDS.has(id)) return { flag: true, reason: 'committee_id' };
  if (ISRAEL_RE.test(name)) return { flag: true, reason: 'name_regex' };
  return { flag: false, reason: '' };
}

function loadActonPacs(): PacRow[] {
  if (!fs.existsSync(IN_ACTON)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_ACTON, 'utf8')) as string[][];
  const out: PacRow[] = [];
  for (const r of arr) {
    const indiv = (r[0] || '').trim();
    const org = (r[1] || '').trim();
    if (!org || indiv) continue;   // only org/PAC rows
    const amt = Number((r[10] || '').replace(/[$,\s]/g, '')) || 0;
    const { flag, reason } = isIsraelLobby(org.toUpperCase(), '');
    out.push({
      candidate: 'Acton', source: 'OH SOS itemized',
      pac_name: org, pac_id: '', entity_type: 'ORG/PAC',
      state: (r[5] || '').trim(), city: (r[4] || '').trim(),
      amount: amt, date: (r[9] || '').trim(),
      is_israel_lobby: flag, israel_match_reason: reason,
    });
  }
  return out;
}

interface VivekOhRow { entity_type: string; contributor_name?: string; contributor_first_name?: string; contributor_last_name?: string; contributor_state?: string; contributor_city?: string; contribution_receipt_amount: number; contribution_receipt_date: string; }
function loadVivekOhPacs(): PacRow[] {
  if (!fs.existsSync(IN_VIVEK_OH)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_VIVEK_OH, 'utf8')) as VivekOhRow[];
  const out: PacRow[] = [];
  for (const r of arr) {
    if (r.entity_type === 'IND') continue;
    const name = (r.contributor_name || `${r.contributor_last_name||''} ${r.contributor_first_name||''}`).trim();
    const { flag, reason } = isIsraelLobby(name.toUpperCase(), '');
    out.push({
      candidate: 'Vivek', source: 'OH SOS itemized (2026 gov campaign)',
      pac_name: name, pac_id: '', entity_type: r.entity_type || 'UNKNOWN',
      state: (r.contributor_state || '').trim(), city: (r.contributor_city || '').trim(),
      amount: Number(r.contribution_receipt_amount) || 0,
      date: r.contribution_receipt_date || '',
      is_israel_lobby: flag, israel_match_reason: reason,
    });
  }
  return out;
}

interface VivekFecRow { contributor_name?: string; contributor_id?: string; contributor_committee_id?: string; entity_type?: string; contributor_state?: string; contributor_city?: string; contribution_receipt_amount: number; contribution_receipt_date: string; }
function loadVivekFecPacs(): PacRow[] {
  if (!fs.existsSync(IN_VIVEK_FEC)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_VIVEK_FEC, 'utf8')) as VivekFecRow[];
  const out: PacRow[] = [];
  for (const r of arr) {
    const et = (r.entity_type || '').toUpperCase();
    if (!et || et === 'IND') continue;
    const name = (r.contributor_name || '').trim();
    const id = (r.contributor_committee_id || r.contributor_id || '').trim();
    const { flag, reason } = isIsraelLobby(name.toUpperCase(), id);
    out.push({
      candidate: 'Vivek', source: 'FEC schedule_a (2024 presidential)',
      pac_name: name, pac_id: id, entity_type: et,
      state: (r.contributor_state || '').trim(), city: (r.contributor_city || '').trim(),
      amount: Number(r.contribution_receipt_amount) || 0,
      date: r.contribution_receipt_date || '',
      is_israel_lobby: flag, israel_match_reason: reason,
    });
  }
  return out;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main(): void {
  const acton = loadActonPacs();
  const vivekOh = loadVivekOhPacs();
  const vivekFec = loadVivekFecPacs();
  console.log(`Acton PAC rows:      ${acton.length}  (Israel-lobby: ${acton.filter(r => r.is_israel_lobby).length})`);
  console.log(`Vivek OH gov PACs:   ${vivekOh.length}  (Israel-lobby: ${vivekOh.filter(r => r.is_israel_lobby).length})`);
  console.log(`Vivek FEC 2024 PACs: ${vivekFec.length}  (Israel-lobby: ${vivekFec.filter(r => r.is_israel_lobby).length})`);
  console.log(`Putsch PAC rows:     0  (no data — scraping required)`);

  const all = [...acton, ...vivekOh, ...vivekFec]
    .sort((a, b) => Number(b.is_israel_lobby) - Number(a.is_israel_lobby) || b.amount - a.amount);

  const headers = [
    'candidate', 'source', 'pac_name', 'pac_id', 'entity_type',
    'state', 'city', 'amount', 'date',
    'is_israel_lobby', 'israel_match_reason',
  ];
  const lines = [headers.join(',')];
  for (const r of all) {
    lines.push([
      r.candidate, r.source, r.pac_name, r.pac_id, r.entity_type,
      r.state, r.city, r.amount.toFixed(2), r.date,
      r.is_israel_lobby ? 'YES' : 'no', r.israel_match_reason,
    ].map(csvEscape).join(','));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`\nWrote ${lines.length - 1} rows → ${OUT}`);

  // Summary
  for (const cand of ['Acton', 'Vivek']) {
    const rows = all.filter(r => r.candidate === cand);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const il = rows.filter(r => r.is_israel_lobby);
    const ilTotal = il.reduce((s, r) => s + r.amount, 0);
    console.log(`  ${cand}: $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} across ${rows.length} PAC contribs | Israel-lobby: $${ilTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} across ${il.length}`);
  }
}

main();
