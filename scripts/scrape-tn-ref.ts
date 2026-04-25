#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Tennessee Registry of Election Finance (TN REF) scraper — 2026-cycle
 * gubernatorial committees (Monty Fritts, Marsha Blackburn) plus Fritts'
 * TN-32 state-rep committee history.
 *
 * TN REF portal (public, no auth): https://apps.tn.gov/tncamp/
 *   - Search: /public/cpsearch.htm (POST form, session cookie required)
 *   - Reports: /public/replist.htm?id={candId}&owner={NAME}
 *   - Full report w/ Schedule A + B inline: /search/pub/report_full.htm?reportId={id}
 *   - Excel export: /search/pub/fullReportExcelExportPublic.htm?generateLists=true
 *
 * No CSV bulk / no API — every contribution & expenditure is embedded in one
 * big HTML page per report. We parse with cheerio-like regex walks.
 *
 * Stealth: TN REF has no Cloudflare, but we reuse the playwright-extra +
 * stealth pattern from scripts/scrape-vivek-oh-sos-stealth.ts for consistency
 * with the rest of the Snitched.ai scraper fleet.
 *
 * Output files (per committee):
 *   data-ingestion/tn-ref-fritts-gov-2026-itemized.json
 *   data-ingestion/tn-ref-blackburn-gov-2026-itemized.json
 *   data-ingestion/tn-ref-fritts-tn32-historical-itemized.json
 *
 * Usage:
 *   npx tsx scripts/scrape-tn-ref.ts                # headless default
 *   npx tsx scripts/scrape-tn-ref.ts --headed       # show browser
 *   npx tsx scripts/scrape-tn-ref.ts --use-cache    # reuse /tmp/tn-ref/ HTML
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

const HEADLESS = !process.argv.includes('--headed');
const USE_CACHE = process.argv.includes('--use-cache');
const CACHE_DIR = '/tmp/tn-ref';
const OUT_DIR = path.join(__dirname, '..', 'data-ingestion');
const BASE = 'https://apps.tn.gov/tncamp';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Committee {
  key: string; // output filename slug
  label: string; // human-readable
  candidateName: string; // FORM name input (starts-with match)
  candidateId?: number; // filled in after search
  ownerString?: string; // full owner label like "FRITTS (GOVERNOR), MONTY "
  officeFilter?: 'Governor' | 'House of Representatives'; // disambiguate when name matches multiple
  districtFilter?: string; // e.g. "32"
  reportIds?: Array<{ reportId: number; label: string; election: string; submittedOn: string }>;
}

interface Contribution {
  committee_key: string;
  committee_name: string;
  report_label: string;
  contributor_first_name: string;
  contributor_last_name: string;
  contributor_full_raw: string;
  contributor_city: string;
  contributor_state: string;
  contributor_zip: string;
  contributor_employer: string;
  contributor_occupation: string;
  entity_type: 'IND' | 'PAC' | 'ORG' | 'UNKNOWN';
  contribution_receipt_date: string;
  contribution_receipt_amount: number;
  aggregate_amount: number;
  rec_for: string; // Primary / General
  schedule: 'A_MONETARY' | 'A_PAC' | 'A_INKIND' | 'A_OTHER';
}

interface Expenditure {
  committee_key: string;
  committee_name: string;
  report_label: string;
  payee_raw: string;
  payee_city: string;
  payee_state: string;
  disbursement_date: string;
  disbursement_amount: number;
  purpose: string;
  schedule: 'B_EXPEND' | 'B_OTHER';
}

interface CommitteeSummary {
  committee_key: string;
  label: string;
  candidate_id: number;
  owner_string: string;
  total_reports: number;
  total_receipts: number;
  total_expenditures: number;
  individual_rows: number;
  pac_rows: number;
  top_donors: Array<{ name: string; total: number }>;
}

// ---------------------------------------------------------------------------
// Target committees
// ---------------------------------------------------------------------------

const ALL_TARGETS: Committee[] = [
  {
    key: 'fritts-gov-2026',
    label: 'Monty Fritts — TN Governor 2026',
    candidateName: 'FRITTS',
    officeFilter: 'Governor',
  },
  {
    key: 'blackburn-gov-2026',
    label: 'Marsha Blackburn — TN Governor 2026',
    candidateName: 'BLACKBURN',
    officeFilter: 'Governor',
  },
  {
    key: 'fritts-tn32-historical',
    label: 'Monty Fritts — TN House District 32 (historical)',
    candidateName: 'FRITTS',
    officeFilter: 'House of Representatives',
    districtFilter: '32',
  },
  {
    key: 'rose-gov-2026',
    label: 'John Rose — TN Governor 2026',
    candidateName: 'ROSE',
    officeFilter: 'Governor',
  },
];

// Support --only <key1,key2,...> flag to run a subset.
const ONLY_FLAG_IDX = process.argv.indexOf('--only');
const ONLY_KEYS = ONLY_FLAG_IDX > -1 ? process.argv[ONLY_FLAG_IDX + 1]?.split(',') : undefined;
const TARGETS: Committee[] = ONLY_KEYS
  ? ALL_TARGETS.filter(t => ONLY_KEYS.includes(t.key))
  : ALL_TARGETS;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const parseMoney = (s: string): number => {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));

const clean = (s: string): string =>
  decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function cachePath(name: string): string {
  return path.join(CACHE_DIR, name);
}

async function writeCache(name: string, body: string): Promise<void> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(name), body);
}

function readCache(name: string): string | null {
  const p = cachePath(name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// 30s backoff on 429 per task spec
async function fetchHtml(
  ctxFetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
    status: number;
    text: string;
  }>,
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
  attempts = 3,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const res = await ctxFetch(url, init);
    if (res.status === 429) {
      console.warn(`  ⚠ 429 on ${url} — backing off 30s`);
      await new Promise(r => setTimeout(r, 30_000));
      continue;
    }
    if (res.status >= 500) {
      console.warn(`  ⚠ ${res.status} on ${url} — retrying after 5s`);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }
    return res.text;
  }
  throw new Error(`Fetch failed after ${attempts} attempts: ${url}`);
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Find candidate ID and owner string from the POST results page. */
function parseCandidateSearchResults(
  html: string,
  target: Committee,
): { candidateId: number; ownerString: string } | null {
  // Each result row: <td>OWNER</td> ... multiple <td>s ... <a href="/tncamp/public/replist.htm?id=XXXX&owner=YYY">
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const rows = [...html.matchAll(rowRe)].map(m => m[1]);

  for (const rowInner of rows) {
    if (!/replist\.htm\?id=/i.test(rowInner)) continue;
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [...rowInner.matchAll(tdRe)].map(m => clean(m[1]));
    if (cells.length < 6) continue;
    const ownerCell = cells[0];
    // Our columns (based on default field selection): Name, Contact, Treasurer, Party, Office, District, Year, ...
    const officeCell = cells[4] || '';
    const districtCell = cells[5] || '';
    const linkMatch = rowInner.match(/replist\.htm\?id=(\d+)(?:&amp;|&)owner=([^"]+?)"/);
    if (!linkMatch) continue;
    const candidateId = Number(linkMatch[1]);
    const ownerString = linkMatch[2]
      .replace(/%20/g, ' ')
      .replace(/%2C/g, ',')
      .replace(/\+/g, ' ')
      .replace(/&amp;/g, '&');

    if (target.officeFilter && !officeCell.toLowerCase().includes(target.officeFilter.toLowerCase())) continue;
    if (target.districtFilter && districtCell.trim() !== target.districtFilter) continue;
    if (!ownerCell.toUpperCase().includes(target.candidateName.toUpperCase())) continue;

    return { candidateId, ownerString };
  }
  return null;
}

interface ReportRef {
  reportId: number;
  label: string;
  election: string;
  submittedOn: string;
}

function parseReportList(html: string): ReportRef[] {
  const out: ReportRef[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const m of html.matchAll(rowRe)) {
    const rowInner = m[1];
    if (!/report_full\.htm\?reportId=/.test(rowInner)) continue;
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [...rowInner.matchAll(tdRe)].map(c => c[1]);
    if (cells.length < 4) continue;
    const idMatch = cells[1].match(/reportId=(\d+)/);
    if (!idMatch) continue;
    out.push({
      reportId: Number(idMatch[1]),
      election: clean(cells[0]),
      label: clean(cells[1]),
      submittedOn: clean(cells[3]),
    });
  }
  return out;
}

/**
 * Parse a <table id="contribution"> or <table id="expenditure"> block.
 * Returns array of raw cell text arrays per row.
 */
function parseTableRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  const body = tbodyMatch ? tbodyMatch[1] : tableHtml;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const r of body.matchAll(rowRe)) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [...r[1].matchAll(tdRe)].map(c => c[1]);
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * Extract each section's table. A report_full.htm page has multiple tables
 * with id="contribution" (Schedule A: Itemized Monetary, PAC/Committee,
 * In-Kind, Other Receipts) and id="expenditure" (Schedule B).
 *
 * We label each by looking at the nearest preceding section header text.
 */
function extractReportSections(html: string): {
  contribTables: Array<{ schedule: Contribution['schedule']; rowsHtml: string[][] }>;
  expendTables: Array<{ schedule: Expenditure['schedule']; rowsHtml: string[][] }>;
} {
  const contribTables: Array<{ schedule: Contribution['schedule']; rowsHtml: string[][] }> = [];
  const expendTables: Array<{ schedule: Expenditure['schedule']; rowsHtml: string[][] }> = [];

  // Capture each table along with its ~2000-char preceding context (section label)
  const tableRe = /<table[^>]*id="(contribution|expenditure)"[^>]*>([\s\S]*?)<\/table>/g;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(html)) !== null) {
    const kind = match[1];
    const tableInner = match[2];
    const ctxStart = Math.max(0, match.index - 2500);
    const ctx = html.slice(ctxStart, match.index).toLowerCase();

    const rowsHtml = parseTableRows('<table>' + tableInner + '</table>');

    if (kind === 'contribution') {
      let schedule: Contribution['schedule'] = 'A_OTHER';
      if (/monetary contributions, itemized/.test(ctx)) schedule = 'A_MONETARY';
      else if (/pac\/committee|committee receipts|contributions from other political/.test(ctx)) schedule = 'A_PAC';
      else if (/in-kind/.test(ctx)) schedule = 'A_INKIND';
      else schedule = 'A_OTHER';
      contribTables.push({ schedule, rowsHtml });
    } else {
      let schedule: Expenditure['schedule'] = 'B_EXPEND';
      if (/itemized expenditure|expenditures, itemized/.test(ctx)) schedule = 'B_EXPEND';
      else schedule = 'B_OTHER';
      expendTables.push({ schedule, rowsHtml });
    }
  }

  return { contribTables, expendTables };
}

/**
 * Parse one <td> cell of contributor metadata into structured fields.
 *
 * Format in HTML (whitespace-heavy):
 *   LAST <br>, FIRST<br>ADDRESS<br>CITY, ST ZIP<br>EMPLOYER<br>OCCUPATION
 *
 * For PACs: entire block is the PAC name (no comma-first split).
 */
function parseContributorCell(cellHtml: string): {
  first: string;
  last: string;
  rawFull: string;
  city: string;
  state: string;
  zip: string;
  employer: string;
  occupation: string;
  entityType: Contribution['entity_type'];
} {
  // TN REF contributor cells use <br> tags as the *primary* separator between
  // (name block / address / city-state-zip / occupation / employer), but
  // whitespace (literal \n + indentation) is also present inside each block.
  // We replace <br> with a unique delimiter first, then strip all other tags
  // and collapse whitespace; finally split on the delimiter.
  const SEP = '';
  const normalized = cellHtml
    .replace(/<br\s*\/?>/gi, SEP)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
  const blocks = normalized
    .split(SEP)
    .map(b => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const rawFull = blocks.join(' | ');

  let first = '';
  let last = '';
  let entityType: Contribution['entity_type'] = 'IND';
  const nameBlock = blocks[0] || '';

  // Name block is either "LAST , FIRST" or "LAST, FIRST" or just "ORG NAME"
  const commaMatch = nameBlock.match(/^([A-Z][A-Z0-9' .&\-\/]+?)\s*,\s*([A-Z][A-Z0-9' .&\-\/]+)$/i);
  if (commaMatch) {
    last = commaMatch[1].trim();
    first = commaMatch[2].trim();
    entityType = 'IND';
  } else if (
    /\b(PAC|COMMITTEE|FUND|ASSOCIATION|ASSN|INC|LLC|L\.L\.C|CORP|COMPANY|PARTY|REPUBLICAN|DEMOCRAT|TRUST|CAUCUS|LEADERSHIP|CLUB|FOUNDATION|ORGANIZATION)\b/i.test(nameBlock)
  ) {
    last = nameBlock.trim();
    first = '';
    entityType = /\b(PAC|COMMITTEE|FUND|CAUCUS|CLUB|LEADERSHIP)\b/i.test(nameBlock) ? 'PAC' : 'ORG';
  } else {
    last = nameBlock.trim();
    first = '';
    entityType = 'UNKNOWN';
  }

  // Find the block that matches city/state/zip ("CITY , ST ZIP")
  let city = '';
  let state = '';
  let zip = '';
  let csZipIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const m = blocks[i].match(/^(.+?)\s*,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      city = m[1].trim();
      state = m[2];
      zip = m[3];
      csZipIdx = i;
      break;
    }
  }

  // Occupation / Employer: the two blocks immediately after city/state/zip.
  // TN REF order is Occupation then Employer (per schema check vs. ADKISSON:
  //   "OFFICE MANAGER" then "TA TOOL & DIE INC").
  let occupation = '';
  let employer = '';
  if (csZipIdx >= 0) {
    occupation = blocks[csZipIdx + 1] || '';
    employer = blocks[csZipIdx + 2] || '';
  }

  return { first, last, rawFull, city, state, zip, employer, occupation, entityType };
}

function parseContributionRow(
  cells: string[],
  schedule: Contribution['schedule'],
  committeeKey: string,
  committeeName: string,
  reportLabel: string,
): Contribution | null {
  if (cells.length < 5) return null;
  const parsed = parseContributorCell(cells[0]);
  const cp = clean(cells[1]);
  const recFor = clean(cells[2]);
  const date = clean(cells[3]);
  const amount = parseMoney(clean(cells[4]));
  const aggregate = cells[5] ? parseMoney(clean(cells[5])) : 0;
  if (amount <= 0 && aggregate <= 0) return null;
  // For PAC schedule, force entity_type=PAC
  const entityType: Contribution['entity_type'] =
    schedule === 'A_PAC' ? 'PAC' : parsed.entityType;

  return {
    committee_key: committeeKey,
    committee_name: committeeName,
    report_label: reportLabel,
    contributor_first_name: parsed.first,
    contributor_last_name: parsed.last,
    contributor_full_raw: parsed.rawFull,
    contributor_city: parsed.city,
    contributor_state: parsed.state,
    contributor_zip: parsed.zip,
    contributor_employer: parsed.employer,
    contributor_occupation: parsed.occupation,
    entity_type: entityType,
    contribution_receipt_date: date,
    contribution_receipt_amount: amount,
    aggregate_amount: aggregate,
    rec_for: recFor,
    schedule,
  };
  void cp; // reserved for future use
}

function parseExpenditureRow(
  cells: string[],
  schedule: Expenditure['schedule'],
  committeeKey: string,
  committeeName: string,
  reportLabel: string,
): Expenditure | null {
  if (cells.length < 3) return null;
  const payeeCell = cells[0];
  const normalized = payeeCell
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  const lines = normalized
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const payeeRaw = lines.join(' | ');
  let city = '';
  let state = '';
  for (const l of lines) {
    const m = l.match(/^(.+?)\s*,\s*([A-Z]{2})\s*(\d{5})?/);
    if (m) {
      city = m[1].trim();
      state = m[2];
      break;
    }
  }
  // Columns on expenditure table (Purpose, Date, Amount) — layout varies slightly.
  // Typical: Payee | Purpose | Date | Amount | (Itemized Receipts in some)
  // Find the cell that looks like a date and the one that looks like money.
  let date = '';
  let amount = 0;
  let purpose = '';
  for (let i = 1; i < cells.length; i++) {
    const t = clean(cells[i]);
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) date = t;
    else if (/^\$[\d,\.]+$/.test(t)) amount = parseMoney(t);
    else if (t && !purpose) purpose = t;
  }
  if (amount <= 0) return null;
  return {
    committee_key: committeeKey,
    committee_name: committeeName,
    report_label: reportLabel,
    payee_raw: payeeRaw,
    payee_city: city,
    payee_state: state,
    disbursement_date: date,
    disbursement_amount: amount,
    purpose,
    schedule,
  };
}

// ---------------------------------------------------------------------------
// Main driver
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('  TN REF scrape — 2026 gubernatorial + Fritts TN-32 history');
  console.log('='.repeat(80));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[1/5] Launching ${HEADLESS ? 'HEADLESS' : 'HEADED'} Chromium with stealth plugin`);
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Tiny wrapper so we only ever go through ctx.request (keeps session cookies).
  const ctxFetch = async (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; text: string }> => {
    const resp = await ctx.request.fetch(url, {
      method: (init?.method as 'GET' | 'POST') || 'GET',
      headers: { 'User-Agent': UA, ...(init?.headers || {}) },
      data: init?.body,
      maxRedirects: 5,
    });
    return { status: resp.status(), text: await resp.text() };
  };

  try {
    // Warm up JSESSIONID
    console.log('[2/5] Warming TN REF session (JSESSIONID)...');
    await ctxFetch(`${BASE}/public/cpsearch.htm`);

    const summaries: CommitteeSummary[] = [];

    for (const target of TARGETS) {
      console.log(`\n[3/5] ${target.label}`);
      console.log(`      Searching name="${target.candidateName}"  office=${target.officeFilter || '*'}  district=${target.districtFilter || '*'}`);

      const searchCacheName = `search-${target.key}.html`;
      let searchHtml: string;
      if (USE_CACHE && readCache(searchCacheName)) {
        searchHtml = readCache(searchCacheName)!;
        console.log('      (cached)');
      } else {
        // Re-warm the search form session before each POST. The TN REF app
        // invalidates the session state after a POST submission, so reusing
        // the same JSESSIONID for another POST returns a 500.
        await ctxFetch(`${BASE}/public/cpsearch.htm`);
        const body = new URLSearchParams({
          searchType: 'both',
          name: target.candidateName,
          officeSelection: '',
          districtSelection: '',
          electionYearSelection: '',
          partySelection: '',
          nameField: 'true',
          contactField: 'true',
          treasurerNameField: 'true',
          partyField: 'true',
          officeField: 'true',
          districtField: 'true',
          electionYearField: 'true',
          committeeField: 'true',
          createdField: 'true',
          closedField: 'true',
          _continue: 'Search',
        }).toString();
        searchHtml = await fetchHtml(ctxFetch, `${BASE}/public/cpsearch.htm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: `${BASE}/public/cpsearch.htm`,
          },
          body,
        });
        await writeCache(searchCacheName, searchHtml);
      }

      const hit = parseCandidateSearchResults(searchHtml, target);
      if (!hit) {
        console.warn(`      ⚠ No matching committee found for ${target.candidateName}`);
        continue;
      }
      target.candidateId = hit.candidateId;
      target.ownerString = hit.ownerString;
      console.log(`      ✓ id=${hit.candidateId}  owner="${hit.ownerString.trim()}"`);

      // Fetch report list
      const replistCache = `replist-${target.key}.html`;
      let replistHtml: string;
      if (USE_CACHE && readCache(replistCache)) {
        replistHtml = readCache(replistCache)!;
      } else {
        const url = `${BASE}/public/replist.htm?id=${hit.candidateId}&owner=${encodeURIComponent(hit.ownerString)}`;
        replistHtml = await fetchHtml(ctxFetch, url);
        await writeCache(replistCache, replistHtml);
      }
      const reports = parseReportList(replistHtml);
      target.reportIds = reports;
      console.log(`      ${reports.length} report(s):`);
      for (const r of reports) {
        console.log(`        · ${r.reportId}  ${r.election}  ${r.label}  (submitted ${r.submittedOn})`);
      }

      // Fetch each report and parse
      const contribs: Contribution[] = [];
      const expends: Expenditure[] = [];
      for (const r of reports) {
        const cacheName = `report-${target.key}-${r.reportId}.html`;
        let reportHtml: string;
        if (USE_CACHE && readCache(cacheName)) {
          reportHtml = readCache(cacheName)!;
        } else {
          console.log(`      Downloading report ${r.reportId} (${r.label})...`);
          reportHtml = await fetchHtml(ctxFetch, `${BASE}/search/pub/report_full.htm?reportId=${r.reportId}`);
          await writeCache(cacheName, reportHtml);
          // Polite ~750ms delay between reports
          await new Promise(res => setTimeout(res, 750));
        }
        const { contribTables, expendTables } = extractReportSections(reportHtml);
        for (const t of contribTables) {
          for (const row of t.rowsHtml) {
            const c = parseContributionRow(row, t.schedule, target.key, hit.ownerString.trim(), r.label);
            if (c) contribs.push(c);
          }
        }
        for (const t of expendTables) {
          for (const row of t.rowsHtml) {
            const e = parseExpenditureRow(row, t.schedule, target.key, hit.ownerString.trim(), r.label);
            if (e) expends.push(e);
          }
        }
      }

      const outFile = path.join(OUT_DIR, `tn-ref-${target.key}-itemized.json`);
      fs.writeFileSync(
        outFile,
        JSON.stringify(
          {
            committee: {
              key: target.key,
              label: target.label,
              candidate_id: hit.candidateId,
              owner_string: hit.ownerString.trim(),
              reports,
            },
            schedule_a_contributions: contribs,
            schedule_b_expenditures: expends,
          },
          null,
          2,
        ),
      );

      const totalReceipts = contribs.reduce((s, c) => s + c.contribution_receipt_amount, 0);
      const totalExpend = expends.reduce((s, e) => s + e.disbursement_amount, 0);
      const indCount = contribs.filter(c => c.entity_type === 'IND').length;
      const pacCount = contribs.filter(c => c.entity_type === 'PAC').length;

      const donorTotals = new Map<string, number>();
      for (const c of contribs) {
        const key = `${c.contributor_last_name}${c.contributor_first_name ? ', ' + c.contributor_first_name : ''}`;
        donorTotals.set(key, (donorTotals.get(key) || 0) + c.contribution_receipt_amount);
      }
      const topDonors = [...donorTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, total]) => ({ name, total }));

      summaries.push({
        committee_key: target.key,
        label: target.label,
        candidate_id: hit.candidateId,
        owner_string: hit.ownerString.trim(),
        total_reports: reports.length,
        total_receipts: totalReceipts,
        total_expenditures: totalExpend,
        individual_rows: indCount,
        pac_rows: pacCount,
        top_donors: topDonors,
      });

      console.log(`      ✓ wrote ${outFile}`);
      console.log(
        `        receipts=$${totalReceipts.toLocaleString(undefined, { maximumFractionDigits: 2 })}  ` +
          `expend=$${totalExpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}  ` +
          `ind=${indCount}  pac=${pacCount}`,
      );
    }

    console.log('\n[4/5] Summary');
    console.log('─'.repeat(80));
    for (const s of summaries) {
      console.log(`\n● ${s.label}`);
      console.log(`  id=${s.candidate_id}  owner="${s.owner_string}"  reports=${s.total_reports}`);
      console.log(`  total receipts : $${s.total_receipts.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
      console.log(`  total expend   : $${s.total_expenditures.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
      console.log(`  rows: individual=${s.individual_rows}  pac=${s.pac_rows}`);
      console.log(`  top 10 donors:`);
      for (const d of s.top_donors) {
        console.log(`     $${d.total.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(14)}  ${d.name}`);
      }
    }

    fs.writeFileSync(path.join(OUT_DIR, 'tn-ref-summary.json'), JSON.stringify(summaries, null, 2));
    console.log('\n[5/5] Done.');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
