#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Cross-reference Vivek Ramaswamy's and Amy Acton's OH SOS itemized donors
 * against the full 49-year pro-Israel PAC donor registry (1978-2026).
 *
 * Produces two tables ranked by amount given to the candidate, showing each
 * matched donor's lifetime giving to pro-Israel PACs.
 *
 * Usage:  npx tsx scripts/crossref-vivek-acton-vs-pro-israel.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import * as readline from 'readline';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OH_SOS_CONTRIBS = '/tmp/oh-sos-bulk/contribs-2025.csv';

interface LifetimeDonor {
  name: string;
  state: string;
  employer: string;
  lifetime_total: number;
  pacs: Set<string>;
  years: Set<string>;
  contribution_count: number;
}

interface CandidateDonor {
  name: string;
  state: string;
  employer: string;
  to_candidate: number;
  count: number;
}

/** Same donorKey normalization as build-pro-israel-registry.ts */
function donorKey(name: string, state: string, employer: string): string {
  const clean = name.toUpperCase().replace(/[^\w,. ]/g, '').trim();
  const m = clean.match(/^([A-Z-]+)\s*,?\s*([A-Z])/);
  const last = m?.[1] ?? clean.split(/[ ,]/)[0] ?? '';
  const firstInitial = m?.[2] ?? clean.replace(/.*[ ,]\s*/, '')[0] ?? '';
  const emp = employer.toUpperCase().replace(/[^\w ]/g, '').slice(0, 20).trim();
  return `${last}|${firstInitial}|${state}|${emp}`;
}

/** OH SOS has FIRST_NAME LAST_NAME in separate columns; format to "LAST, F" so donorKey parses same way. */
function ohSosToFecName(first: string, last: string): string {
  return `${last.toUpperCase()}, ${first.toUpperCase().charAt(0)}`;
}

function normalizeLineEndings(): Transform {
  return new Transform({
    transform(chunk, _enc, cb) { cb(null, chunk.toString().replace(/\r/g, '\n')); },
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const parseMoney = (s: string) => {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

async function loadLifetimeRegistry(): Promise<Map<string, LifetimeDonor>> {
  const registry = new Map<string, LifetimeDonor>();
  const files = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f)).sort();
  console.log(`[1/3] Aggregating ${files.length} pro-Israel donor CSVs (1978-2026)...`);

  for (const f of files) {
    const year = f.match(/\d{4}/)![0];
    const txt = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
    const lines = txt.split('\n').filter(Boolean);
    const header = parseCsvLine(lines.shift()!);
    const idx = {
      key: header.indexOf('donor_key'),
      name: header.indexOf('donor_name'),
      state: header.indexOf('state'),
      employer: header.indexOf('employer'),
      total: header.indexOf('total_given'),
      count: header.indexOf('contribution_count'),
      pacs: header.indexOf('pacs_given_to'),
    };
    for (const line of lines) {
      const cells = parseCsvLine(line);
      const key = cells[idx.key] || '';
      if (!key) continue;
      const amt = Number(cells[idx.total]) || 0;
      if (!registry.has(key)) {
        registry.set(key, {
          name: cells[idx.name],
          state: cells[idx.state],
          employer: cells[idx.employer],
          lifetime_total: 0,
          pacs: new Set(),
          years: new Set(),
          contribution_count: 0,
        });
      }
      const d = registry.get(key)!;
      d.lifetime_total += amt;
      d.contribution_count += Number(cells[idx.count]) || 0;
      d.years.add(year);
      for (const pac of (cells[idx.pacs] || '').split(';').map(s => s.trim()).filter(Boolean)) d.pacs.add(pac);
    }
  }
  console.log(`      loaded ${registry.size.toLocaleString()} unique lifetime pro-Israel donors\n`);
  return registry;
}

async function extractCandidateDonors(committeePatterns: RegExp): Promise<Map<string, CandidateDonor>> {
  const donors = new Map<string, CandidateDonor>();
  const rl = readline.createInterface({
    input: fs.createReadStream(OH_SOS_CONTRIBS).pipe(normalizeLineEndings()),
  });
  let headers: string[] | null = null;
  let idx = { com: -1, first: -1, mid: -1, last: -1, nonIndiv: -1, state: -1, emp: -1, amt: -1, pacReg: -1 };
  let totalRows = 0;
  for await (const raw of rl) {
    totalRows++;
    const line = raw.trim(); if (!line) continue;
    const cells = parseCsvLine(line);
    if (!headers) {
      headers = cells.map(s => s.toUpperCase().replace(/"/g, ''));
      idx = {
        com: headers.indexOf('COM_NAME'),
        first: headers.indexOf('FIRST_NAME'),
        mid: headers.indexOf('MIDDLE_NAME'),
        last: headers.indexOf('LAST_NAME'),
        nonIndiv: headers.indexOf('NON_INDIVIDUAL'),
        state: headers.indexOf('STATE'),
        emp: headers.indexOf('EMP_OCCUPATION'),
        amt: headers.indexOf('AMOUNT'),
        pacReg: headers.indexOf('PAC_REG_NO'),
      };
      continue;
    }
    const com = (cells[idx.com] || '').toUpperCase();
    if (!committeePatterns.test(com)) continue;
    // Only individual contributors (skip PACs/corps — those are handled separately)
    const nonIndiv = (cells[idx.nonIndiv] || '').trim();
    if (nonIndiv) continue;
    const first = (cells[idx.first] || '').trim();
    const last = (cells[idx.last] || '').trim();
    if (!last) continue;
    const state = (cells[idx.state] || '').toUpperCase().trim();
    const emp = (cells[idx.emp] || '').trim();
    const amt = parseMoney(cells[idx.amt] || '0');
    if (amt <= 0) continue;

    const name = ohSosToFecName(first, last);
    const key = donorKey(name, state, emp);
    if (!donors.has(key)) {
      donors.set(key, { name: `${first} ${last}`.trim(), state, employer: emp, to_candidate: 0, count: 0 });
    }
    const d = donors.get(key)!;
    d.to_candidate += amt;
    d.count += 1;
  }
  console.log(`      scanned ${totalRows.toLocaleString()} OH SOS rows\n`);
  return donors;
}

function renderTable(title: string, matches: Array<{ candDonor: CandidateDonor; registry: LifetimeDonor; key: string }>): string {
  const lines: string[] = [];
  lines.push(`\n=== ${title} — ${matches.length} matched donors ===\n`);
  lines.push('rank | to candidate | name                                  | state | pro-Israel lifetime | years    | PACs');
  lines.push('-----|--------------|---------------------------------------|-------|---------------------|----------|-----------------');
  matches.slice(0, 50).forEach((m, i) => {
    const years = [...m.registry.years].sort();
    const yearRange = years.length > 2 ? `${years[0]}–${years[years.length - 1]}` : years.join(',');
    lines.push([
      String(i + 1).padStart(4),
      `$${m.candDonor.to_candidate.toFixed(0).padStart(10)}`,
      m.candDonor.name.padEnd(37).slice(0, 37),
      (m.candDonor.state || '?').padEnd(5),
      `$${m.registry.lifetime_total.toFixed(0).padStart(17)}`,
      yearRange.padEnd(9),
      [...m.registry.pacs].slice(0, 3).join('; ').slice(0, 60),
    ].join(' | '));
  });
  return lines.join('\n');
}

async function main() {
  const registry = await loadLifetimeRegistry();

  console.log('[2/3] Extracting Vivek Ramaswamy donors from OH SOS contribs-2025.csv...');
  const vivekDonors = await extractCandidateDonors(/VIVEK RAMASWAMY AND ROB MCCOLLEY FOR OHIO/);
  console.log(`      ${vivekDonors.size.toLocaleString()} unique individual donors to Vivek's committee`);

  console.log('[3/3] Extracting Amy Acton donors from OH SOS contribs-2025.csv...');
  const actonDonors = await extractCandidateDonors(/OHIOANS FOR AMY ACTON AND DAVID PEPPER/);
  console.log(`      ${actonDonors.size.toLocaleString()} unique individual donors to Acton's committee\n`);

  function crossref(candDonors: Map<string, CandidateDonor>) {
    const matches: Array<{ candDonor: CandidateDonor; registry: LifetimeDonor; key: string }> = [];
    for (const [key, d] of candDonors) {
      const hit = registry.get(key);
      if (hit) matches.push({ candDonor: d, registry: hit, key });
    }
    matches.sort((a, b) => b.candDonor.to_candidate - a.candDonor.to_candidate);
    return matches;
  }

  const vivekMatches = crossref(vivekDonors);
  const actonMatches = crossref(actonDonors);

  const vivekTotalToCand = vivekMatches.reduce((s, m) => s + m.candDonor.to_candidate, 0);
  const actonTotalToCand = actonMatches.reduce((s, m) => s + m.candDonor.to_candidate, 0);
  const vivekTotalDonors = vivekDonors.size;
  const actonTotalDonors = actonDonors.size;

  console.log('='.repeat(110));
  console.log(`\nVivek Ramaswamy — ${vivekMatches.length} / ${vivekTotalDonors.toLocaleString()} individual donors matched pro-Israel registry (${((vivekMatches.length / vivekTotalDonors) * 100).toFixed(2)}%)`);
  console.log(`  They gave Vivek: $${vivekTotalToCand.toLocaleString()}`);
  console.log(renderTable('TOP 50: Vivek Ramaswamy × Pro-Israel Registry', vivekMatches));

  console.log('\n' + '='.repeat(110));
  console.log(`\nAmy Acton — ${actonMatches.length} / ${actonTotalDonors.toLocaleString()} individual donors matched pro-Israel registry (${((actonMatches.length / actonTotalDonors) * 100).toFixed(2)}%)`);
  console.log(`  They gave Acton: $${actonTotalToCand.toLocaleString()}`);
  console.log(renderTable('TOP 50: Amy Acton × Pro-Israel Registry', actonMatches));

  // Write CSVs
  const vivekOut = path.join(DATA_DIR, 'crossref-vivek-vs-pro-israel.csv');
  const actonOut = path.join(DATA_DIR, 'crossref-acton-vs-pro-israel.csv');
  function writeCrossrefCsv(file: string, matches: Array<{ candDonor: CandidateDonor; registry: LifetimeDonor; key: string }>) {
    const header = ['rank', 'donor_name', 'state', 'employer', 'to_candidate', 'pro_israel_lifetime', 'pro_israel_years', 'pacs'];
    const rows = [header.join(',')];
    matches.forEach((m, i) => {
      const years = [...m.registry.years].sort();
      const pacs = [...m.registry.pacs].join('; ').replace(/"/g, "'");
      rows.push([
        String(i + 1),
        `"${m.candDonor.name.replace(/"/g, "'")}"`,
        m.candDonor.state,
        `"${m.candDonor.employer.replace(/"/g, "'")}"`,
        m.candDonor.to_candidate.toFixed(2),
        m.registry.lifetime_total.toFixed(2),
        `"${years[0] || ''}–${years[years.length - 1] || ''}"`,
        `"${pacs}"`,
      ].join(','));
    });
    fs.writeFileSync(file, rows.join('\n'));
  }
  writeCrossrefCsv(vivekOut, vivekMatches);
  writeCrossrefCsv(actonOut, actonMatches);
  console.log(`\n  CSV: ${vivekOut}  (${vivekMatches.length} rows)`);
  console.log(`  CSV: ${actonOut}  (${actonMatches.length} rows)`);
}

main().catch(e => { console.error(e); process.exit(1); });
