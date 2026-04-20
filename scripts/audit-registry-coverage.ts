#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Audit the pro-Israel registry CSVs → how thorough is the individual-donor
 * filter, and what rows are we excluding? If the filter is too strict we miss
 * legit individuals in crossref-*-pro-israel.ts matches.
 *
 * Reports per CSV:
 *   raw rows, individual (matched filter), excluded-but-looks-like-person,
 *   org-like, and some sample excluded rows.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

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

const ORG_WORDS = /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO\b|LP\b|LLP\b|PARTNERS|PARTNERSHIP|FUND|FOUNDATION|TRUST|HOLDINGS|GROUP|CAPITAL|ENTERPRISES|ASSOC|ASSOCIATION|COMMITTEE|PAC\b|POLITICAL|DEMOCRATIC|REPUBLICAN|PARTY|COALITION|PROJECT|USA|OF AMERICA)\b/;
const COMMA_FIRST_RE = /^[A-Z][A-Z\s'\-.]+,\s+[A-Z]/;

function isIndividual(nameUpper: string): boolean {
  if (!COMMA_FIRST_RE.test(nameUpper)) return false;
  if (ORG_WORDS.test(nameUpper)) return false;
  return true;
}

// Heuristic: looks like a person even if current strict filter rejects.
// (e.g., "SMITH JOHN" with no comma, or "VAN DER BERG, ANNA" with apostrophes,
//  or lowercase, or Mc/O' prefixes not anchored, or single-name rows.)
function looksLikePerson(nameUpper: string): boolean {
  if (ORG_WORDS.test(nameUpper)) return false;
  if (COMMA_FIRST_RE.test(nameUpper)) return true;
  // "LAST FIRST" two-token no-comma, both alpha
  if (/^[A-Z][A-Z'\-.]+\s+[A-Z][A-Z'\-.]+$/.test(nameUpper)) return true;
  // "LAST FIRST MIDDLE" 3 tokens, no comma, all alpha
  if (/^[A-Z][A-Z'\-.]+\s+[A-Z][A-Z'\-.]+(\s+[A-Z][A-Z'\-.]*)+$/.test(nameUpper)) return true;
  return false;
}

interface Bucket { rows: number; individuals: number; excluded_looks_person: number; org_like: number; samples_excluded_person: string[] }

function audit(): void {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f)).sort();
  const per: Record<string, Bucket> = {};
  const totals: Bucket = { rows: 0, individuals: 0, excluded_looks_person: 0, org_like: 0, samples_excluded_person: [] };
  for (const f of files) {
    const cycle = f.match(/(\d{4})/)![1];
    const rows = parseCsv(path.join(DATA_DIR, f));
    const b: Bucket = { rows: rows.length, individuals: 0, excluded_looks_person: 0, org_like: 0, samples_excluded_person: [] };
    for (const r of rows) {
      const n = (r.donor_name || '').toUpperCase();
      if (isIndividual(n)) { b.individuals++; continue; }
      if (ORG_WORDS.test(n)) { b.org_like++; continue; }
      if (looksLikePerson(n)) {
        b.excluded_looks_person++;
        if (b.samples_excluded_person.length < 5) b.samples_excluded_person.push(r.donor_name);
      }
    }
    per[cycle] = b;
    totals.rows += b.rows;
    totals.individuals += b.individuals;
    totals.excluded_looks_person += b.excluded_looks_person;
    totals.org_like += b.org_like;
  }
  console.log('Per-CSV audit:');
  console.log('  cycle  rows   individual  excluded-but-person-like  org-like');
  for (const cy of Object.keys(per).sort()) {
    const b = per[cy];
    console.log(`  ${cy}   ${String(b.rows).padStart(5)}  ${String(b.individuals).padStart(10)}  ${String(b.excluded_looks_person).padStart(24)}  ${String(b.org_like).padStart(8)}`);
  }
  console.log(`  TOTAL  ${String(totals.rows).padStart(5)}  ${String(totals.individuals).padStart(10)}  ${String(totals.excluded_looks_person).padStart(24)}  ${String(totals.org_like).padStart(8)}`);

  console.log('\nSample excluded-but-looks-like-person rows (per cycle, up to 5):');
  for (const cy of Object.keys(per).sort()) {
    const s = per[cy].samples_excluded_person;
    if (s.length === 0) continue;
    console.log(`  ${cy}: ${s.slice(0, 5).join(' | ')}`);
  }
}

audit();
