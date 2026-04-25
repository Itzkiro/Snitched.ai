#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Targeted LDA (LD-203) fetch for Mark Warner (VA-Sen D).
 * Mirror of fetch-torres-lobbying.ts, just targeting Warner.
 */
import { createClient } from '@supabase/supabase-js';

const BIOGUIDE_ID = 'va-senate-2026-mark-warner';
const LAST_NAME = 'WARNER';
const FIRST_NAME = 'MARK';
const LDA_BASE = 'https://lda.senate.gov/api/v1';
const LDA_KEY = process.env.LDA_API_KEY || '';

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function ldaFetch(endpoint: string, params: Record<string, string>): Promise<{ results?: unknown[]; next?: string | null; count?: number }> {
  const u = new URL(`${LDA_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (LDA_KEY) headers.Authorization = `Token ${LDA_KEY}`;
  const r = await fetch(u.toString(), { headers });
  if (r.status === 429) {
    const retry = parseInt(r.headers.get('Retry-After') ?? '5');
    await sleep(retry * 1000);
    return ldaFetch(endpoint, params);
  }
  if (!r.ok) throw new Error(`LDA ${endpoint} ${r.status}`);
  return r.json() as Promise<{ results?: unknown[]; next?: string | null; count?: number }>;
}

interface LdaContribItem {
  contribution_type?: string;
  amount?: string | number;
  contributor_name?: string;
  payee_name?: string;
  contribution_date?: string;
  honoree_name?: string;
}

interface LdaContribFiling {
  filing_year?: number;
  filing_uuid?: string;
  registrant?: { name?: string };
  contribution_items?: LdaContribItem[];
}

interface LobbyingRecord {
  source: 'LDA LD-203';
  filing_year: number;
  filing_uuid: string;
  registrant_name: string;
  contribution_type: string;
  amount: number;
  contribution_date: string;
  contributor_name: string;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE env missing');
  const s = createClient(url, key);

  // Warner has been a Senator since 2009 — pull deep history
  const years = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];
  const records: LobbyingRecord[] = [];

  for (const year of years) {
    console.log(`Year ${year}:`);
    let page = 1;
    while (page <= 20) {
      const resp = await ldaFetch('/contributions/', {
        filing_year: String(year),
        contribution_item_honoree: `${FIRST_NAME} ${LAST_NAME}`,
        page: String(page),
        page_size: '25',
      });
      const results = (resp.results || []) as LdaContribFiling[];
      for (const f of results) {
        for (const ci of (f.contribution_items || [])) {
          const honoree = (ci.honoree_name || '').toUpperCase();
          if (!honoree.includes(LAST_NAME) || !honoree.includes(FIRST_NAME)) continue;
          records.push({
            source: 'LDA LD-203',
            filing_year: f.filing_year || year,
            filing_uuid: f.filing_uuid || '',
            registrant_name: f.registrant?.name || '',
            contribution_type: ci.contribution_type || '',
            amount: Number(ci.amount) || 0,
            contribution_date: ci.contribution_date || '',
            contributor_name: ci.contributor_name || ci.payee_name || f.registrant?.name || '',
          });
        }
      }
      console.log(`  page ${page}: ${results.length} filings, total ${records.length} records`);
      if (!resp.next) break;
      page++;
      await sleep(4000);
    }
  }

  const seen = new Set<string>();
  const uniq: LobbyingRecord[] = [];
  for (const r of records) {
    const k = `${r.filing_uuid}|${r.contribution_date}|${r.amount}|${r.contribution_type}|${r.registrant_name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
  }
  uniq.sort((a, b) => b.filing_year - a.filing_year || b.amount - a.amount);
  const totalAmount = uniq.reduce((s, r) => s + r.amount, 0);
  const uniqRegs = new Set(uniq.map(r => r.registrant_name)).size;
  console.log(`\nFINAL: ${uniq.length} unique LD-203 records / ${uniqRegs} firms / $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  for (const r of uniq.slice(0, 20)) console.log(`  ${r.filing_year} ${r.contribution_date} ${r.registrant_name} - $${r.amount} (${r.contribution_type})`);

  const { error } = await s.from('politicians').update({ lobbying_records: uniq }).eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw error;
  console.log(`✓ Wrote ${uniq.length} lobbying_records to ${BIOGUIDE_ID}`);
}

main().catch(e => { console.error(e); process.exit(1); });
