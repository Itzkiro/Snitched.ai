#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Targeted LDA (Lobbying Disclosure Act) fetch for Ritchie Torres.
 * Pulls LD-203 contribution reports where Torres is listed as a recipient
 * ("covered_recipient") and writes lobbying_records[] to his DB row.
 *
 * LDA API: https://lda.senate.gov/api/v1/ — no key required, 15 req/min
 * unauthenticated (60 with LDA_API_KEY).
 */

import { createClient } from '@supabase/supabase-js';

const BIOGUIDE_ID = 'ny-15-ritchie-torres';
const LAST_NAME = 'TORRES';
const FIRST_NAME = 'RITCHIE';
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
  if (!r.ok) throw new Error(`LDA ${endpoint} ${r.status} ${await r.text().catch(() => '')}`);
  return r.json() as Promise<{ results?: unknown[]; next?: string | null; count?: number }>;
}

interface LdaContribItem {
  contribution_type?: string;
  amount?: string | number;
  contributor_name?: string;
  recipient_name?: string;
  payee_name?: string;
  contribution_date?: string;
  honoree_name?: string;
}

interface LdaContribFiling {
  filing_year?: number;
  filing_uuid?: string;
  registrant?: { name?: string };
  lobbyist?: { first_name?: string; last_name?: string };
  filer_type?: string;
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

  const years = [2026, 2025, 2024, 2023, 2022, 2021];
  const records: LobbyingRecord[] = [];

  for (const year of years) {
    console.log(`\nYear ${year}:`);
    // LD-203 contributions where Torres appears as recipient/honoree
    // Strategy: fetch all contribution filings for the year, filter client-side
    // by honoree_name or contributor context. The /contributions/ endpoint
    // returns filings, each with contribution_items[].
    let page = 1;
    let scanned = 0;
    while (page <= 20) {
      const resp = await ldaFetch('/contributions/', {
        filing_year: String(year),
        contribution_item_honoree: `${FIRST_NAME} ${LAST_NAME}`,
        page: String(page),
        page_size: '25',
      });
      const results = (resp.results || []) as LdaContribFiling[];
      scanned += results.length;
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
      console.log(`  page ${page}: ${results.length} filings, running total ${records.length} records`);
      if (!resp.next) break;
      page++;
      await sleep(4000);
    }
  }

  // Dedupe by filing_uuid + date + amount + type
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
  const uniqRegistrants = new Set(uniq.map(r => r.registrant_name)).size;
  console.log(`\nCollected ${uniq.length} unique LD-203 records:`);
  console.log(`  ${uniqRegistrants} unique registrants/firms`);
  console.log(`  $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} total contributions`);
  for (const r of uniq.slice(0, 10)) console.log(`    ${r.filing_year} ${r.contribution_date} ${r.registrant_name} - $${r.amount} (${r.contribution_type})`);

  const { error } = await s.from('politicians').update({ lobbying_records: uniq }).eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw error;
  console.log(`\n✓ Wrote ${uniq.length} lobbying_records to ${BIOGUIDE_ID}`);
}

main().catch(e => { console.error(e); process.exit(1); });
