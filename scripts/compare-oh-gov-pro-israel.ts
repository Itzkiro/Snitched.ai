#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Side-by-side CSV: pro-Israel individual donors + pro-Israel PACs giving to
 * the three OH governor candidates — Amy Acton (D), Vivek Ramaswamy (R),
 * Casey Putsch (R). One row per donor, amounts per candidate.
 *
 * Sources:
 *   data-ingestion/oh-acton-itemized.json       (OH SOS scrape, array-of-arrays)
 *   data-ingestion/vivek-oh-sos-itemized.json   (OH SOS scrape, array-of-objects)
 *   [Putsch data TBD — no finance pull yet]
 *
 * Output: data-ingestion/oh-gov-pro-israel-compare.csv
 *
 * Individuals: join registry matches by (last|firstInitial|state).
 * PACs:        flag by ISRAEL_LOBBY_COMMITTEE_IDS + name regex.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMaster, parseName, type MasterEntry } from '../lib/roster-match';

const DATA_DIR = path.join(__dirname, '..', 'data');
const IN_ACTON = path.join(__dirname, '..', 'data-ingestion', 'oh-acton-itemized.json');
const IN_VIVEK = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');
const IN_PUTSCH = path.join(__dirname, '..', 'data-ingestion', 'putsch-oh-sos-itemized.json');
const OUT = path.join(__dirname, '..', 'data-ingestion', 'oh-gov-pro-israel-compare.csv');

// -- Israel-lobby PAC classifier (same set audit-politician.ts uses) --
const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299','C00797472','C00797670','C00368522','C00699470','C00740936','C00687657','C90019431',
  'C00556100','C00345132','C30001374','C90012063','C00764126','C90022864','C00441949','C00068692',
  'C00247403','C00127811','C00139659','C00488411','C00141747','C00458935','C00265470','C00748475',
  'C00306670','C00268334','C90014747','C00202481','C00791699','C00277228','C00503250','C00524652',
]);
const ISRAEL_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|JACPAC|JEWISH DEMOCRATIC COUNCIL|JEWISH REPUBLICAN|FRIENDS OF ISRAEL|FIPAC|ALLIES FOR ISRAEL|ISRAEL ALLIANCE|J STREET|JOINT ACTION COMMITTEE FOR POLITICAL|U\.?S\.? ISRAEL/i;

function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Contrib {
  rawName: string;
  last: string; firstInitial: string; state: string; city: string; employer: string;
  amount: number; date: string;
  isPAC: boolean;     // true if row looks like a committee/org
  isIsraelPAC: boolean;
}

function isOrgName(nameUpper: string): boolean {
  if (!nameUpper) return false;
  if (!nameUpper.includes(',') && nameUpper.length > 0) return true;
  return /\b(LLC|INC|CORP|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/.test(nameUpper);
}

// -- Acton: array-of-arrays. Columns (from observed sample):
//    [0]=individual name ("LAST, FIRST") or ""
//    [1]=org/committee name
//    [2]=id, [3]=addr, [4]=city, [5]=state, [6]=zip
//    [7]=period, [8]=year, [9]=date, [10]=amount
function loadActon(): Contrib[] {
  if (!fs.existsSync(IN_ACTON)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_ACTON, 'utf8')) as string[][];
  const out: Contrib[] = [];
  for (const r of arr) {
    const indiv = (r[0] || '').trim();
    const org = (r[1] || '').trim();
    const isIndiv = !!indiv && !org;
    const rawName = indiv || org;
    if (!rawName) continue;
    const amt = Number((r[10] || '').replace(/[$,\s]/g, '')) || 0;
    const state = norm(r[5] || '');
    const city = norm(r[4] || '');
    if (isIndiv) {
      const p = parseName(indiv);
      if (!p || !p.last || !p.firstInitial) continue;
      out.push({
        rawName: indiv, last: p.last, firstInitial: p.firstInitial,
        state, city, employer: norm(r[12] || ''),
        amount: amt, date: (r[9] || '').trim(),
        isPAC: false, isIsraelPAC: false,
      });
    } else {
      const nm = norm(org);
      out.push({
        rawName: org, last: '', firstInitial: '',
        state, city, employer: '',
        amount: amt, date: (r[9] || '').trim(),
        isPAC: true,
        isIsraelPAC: ISRAEL_NAME_RE.test(nm),
      });
    }
  }
  return out;
}

// -- Vivek OH SOS: array-of-objects.
interface VivekRow {
  entity_type: string;
  contributor_name?: string;
  contributor_first_name?: string;
  contributor_last_name?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
}
function loadVivek(): Contrib[] {
  if (!fs.existsSync(IN_VIVEK)) return [];
  const arr = JSON.parse(fs.readFileSync(IN_VIVEK, 'utf8')) as VivekRow[];
  const out: Contrib[] = [];
  for (const r of arr) {
    const first = (r.contributor_first_name || '').trim();
    const last = (r.contributor_last_name || '').trim();
    const built = r.contributor_name || (last && first ? `${last}, ${first}` : (last || first || ''));
    const rawName = built.trim();
    if (!rawName) continue;
    const amt = Number(r.contribution_receipt_amount) || 0;
    const state = norm(r.contributor_state || '');
    const city = norm(r.contributor_city || '');
    const isIndiv = (r.entity_type === 'IND') || (!!last && !!first && !isOrgName(norm(rawName)));
    if (isIndiv) {
      const lastN = norm(last || rawName.split(',')[0] || '').split(' ')[0];
      const firstInitial = norm(first || rawName.split(',')[1]?.trim() || '')[0] || '';
      if (!lastN || !firstInitial) continue;
      out.push({
        rawName, last: lastN, firstInitial,
        state, city, employer: norm(r.contributor_employer || ''),
        amount: amt, date: r.contribution_receipt_date || '',
        isPAC: false, isIsraelPAC: false,
      });
    } else {
      const nm = norm(rawName);
      out.push({
        rawName, last: '', firstInitial: '',
        state, city, employer: '',
        amount: amt, date: r.contribution_receipt_date || '',
        isPAC: true,
        isIsraelPAC: ISRAEL_NAME_RE.test(nm),
      });
    }
  }
  return out;
}

// -- Putsch: same shape as Vivek when scraped, currently absent.
function loadPutsch(): Contrib[] {
  if (!fs.existsSync(IN_PUTSCH)) return [];
  // Support same format as vivek OH SOS JSON.
  return loadVivek.call(null); // not reached
}

// ---------------------------------------------------------------------------
// Aggregate per-donor per-candidate
// ---------------------------------------------------------------------------

interface Agg {
  rawName: string;
  isPAC: boolean;
  isIsraelPAC: boolean;
  state: string; city: string; employer: string;
  perCandidate: Record<string, { amount: number; contribs: number }>;
  // Registry enrichment (individuals only)
  registry?: { name: string; pacs: string[]; cycles: string[]; career: number; contribCount: number; confidence: 'high' | 'medium' };
}

function keyOf(c: Contrib): string {
  if (c.isPAC) return `PAC|${c.rawName.toUpperCase()}`;
  return `IND|${c.last}|${c.firstInitial}|${c.state}`;
}

function aggregate(contribs: Record<string, Contrib[]>): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const [cand, rows] of Object.entries(contribs)) {
    for (const r of rows) {
      const k = keyOf(r);
      let a = m.get(k);
      if (!a) {
        a = {
          rawName: r.rawName, isPAC: r.isPAC, isIsraelPAC: r.isIsraelPAC,
          state: r.state, city: r.city, employer: r.employer,
          perCandidate: {},
        };
        m.set(k, a);
      }
      const p = a.perCandidate[cand] || { amount: 0, contribs: 0 };
      p.amount += r.amount;
      p.contribs += 1;
      a.perCandidate[cand] = p;
      // Preserve any isIsraelPAC signal from any source
      if (r.isIsraelPAC) a.isIsraelPAC = true;
    }
  }
  return m;
}

function enrichIndividuals(agg: Map<string, Agg>, master: Map<string, MasterEntry>): void {
  // Index by (last|firstInitial) with count, to support state-level fallback when unique
  const byNameOnly = new Map<string, MasterEntry[]>();
  for (const e of master.values()) {
    const k = `${e.last}|${e.firstInitial}`;
    const list = byNameOnly.get(k);
    if (list) list.push(e); else byNameOnly.set(k, [e]);
  }
  for (const [k, a] of agg) {
    if (a.isPAC) continue;
    const [, last, fi, st] = k.split('|');
    let me = master.get(`${last}|${fi}|${st}`);
    let confidence: 'high' | 'medium' = 'high';
    if (!me) {
      const list = byNameOnly.get(`${last}|${fi}`) || [];
      if (list.length === 1) { me = list[0]; confidence = 'medium'; }
    }
    if (!me) continue;
    a.registry = {
      name: `${me.last}, ${me.first}`,
      pacs: Array.from(me.pacs),
      cycles: Array.from(me.cycles).sort(),
      career: me.totalGiven,
      contribCount: me.contribCount,
      confidence,
    };
  }
}

// ---------------------------------------------------------------------------
// CSV emit
// ---------------------------------------------------------------------------

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main(): void {
  const master = loadMaster(DATA_DIR);
  console.log(`Indexed ${master.size} pro-Israel individuals`);

  const actonRows = loadActon();
  const vivekRows = loadVivek();
  const putschRows = loadPutsch();
  console.log(`Acton:  ${actonRows.length} rows (${actonRows.filter(r => !r.isPAC).length} individual, ${actonRows.filter(r => r.isPAC).length} org/PAC)`);
  console.log(`Vivek:  ${vivekRows.length} rows (${vivekRows.filter(r => !r.isPAC).length} individual, ${vivekRows.filter(r => r.isPAC).length} org/PAC)`);
  console.log(`Putsch: ${putschRows.length} rows  ${putschRows.length === 0 ? '(no data — scraping required)' : ''}`);

  const agg = aggregate({
    'Acton': actonRows, 'Vivek': vivekRows, 'Putsch': putschRows,
  });
  enrichIndividuals(agg, master);

  // Filter: keep rows that are pro-Israel registry matches OR pro-Israel PACs
  const kept = [...agg.values()].filter(a => a.registry || a.isIsraelPAC);

  // Sort by registry career $ desc (for individuals), then PAC total to any candidate
  kept.sort((a, b) => {
    const aScore = a.registry?.career ?? 0;
    const bScore = b.registry?.career ?? 0;
    if (aScore !== bScore) return bScore - aScore;
    const aSum = Object.values(a.perCandidate).reduce((s, x) => s + x.amount, 0);
    const bSum = Object.values(b.perCandidate).reduce((s, x) => s + x.amount, 0);
    return bSum - aSum;
  });

  const headers = [
    'type', 'confidence', 'donor_name', 'state', 'city', 'employer',
    'pro_israel_pacs', 'pro_israel_cycles', 'pro_israel_career_total', 'pro_israel_contrib_count',
    'acton_amount', 'acton_contribs',
    'vivek_amount', 'vivek_contribs',
    'putsch_amount', 'putsch_contribs',
  ];
  const lines: string[] = [headers.join(',')];
  for (const a of kept) {
    const type = a.isPAC ? 'PAC' : 'Individual';
    const confidence = a.isPAC ? (a.isIsraelPAC ? 'high' : '') : (a.registry?.confidence || '');
    const name = a.registry?.name || a.rawName;
    const pacs = (a.registry?.pacs || []).join('; ');
    const cycles = (a.registry?.cycles || []).join(';');
    const career = a.registry?.career ?? '';
    const contribCount = a.registry?.contribCount ?? '';
    const ac = a.perCandidate['Acton']  || { amount: 0, contribs: 0 };
    const vi = a.perCandidate['Vivek']  || { amount: 0, contribs: 0 };
    const pu = a.perCandidate['Putsch'] || { amount: 0, contribs: 0 };
    lines.push([
      type, confidence, name, a.state, a.city, a.employer,
      pacs, cycles, career, contribCount,
      ac.amount.toFixed(2), ac.contribs,
      vi.amount.toFixed(2), vi.contribs,
      pu.amount.toFixed(2), pu.contribs,
    ].map(csvEscape).join(','));
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`\nWrote ${lines.length - 1} rows → ${OUT}`);

  // Summary per candidate
  const sumFor = (cand: string) => kept.reduce((s, a) => {
    const v = a.perCandidate[cand];
    return v ? { $: s.$ + v.amount, n: s.n + v.contribs, donors: s.donors + (v.amount > 0 ? 1 : 0) } : s;
  }, { $: 0, n: 0, donors: 0 });
  for (const c of ['Acton', 'Vivek', 'Putsch']) {
    const s = sumFor(c);
    console.log(`  ${c.padEnd(7)}: ${s.donors} pro-Israel-tied donors/PACs, ${s.n} contribs, $${s.$.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
}

main();
