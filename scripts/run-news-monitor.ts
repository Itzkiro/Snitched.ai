#!/usr/bin/env npx tsx
/**
 * Manual trigger for the news monitor — same logic as the cron route
 * but runs locally without auth.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const EXA_API_URL = 'https://api.exa.ai/search';

const SCANDAL_KEYWORDS = [
  'indicted', 'arrested', 'charged', 'corruption', 'bribery', 'fraud',
  'scandal', 'investigation', 'subpoena', 'ethics violation',
  'AIPAC', 'Israel lobby', 'foreign influence', 'dark money',
];

interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  text?: string;
  score?: number;
}

async function searchExa(query: string): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) { console.error('No EXA_API_KEY'); return []; }

  const res = await fetch(EXA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query,
      numResults: 10,
      useAutoprompt: true,
      type: 'auto',
      startPublishedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      contents: { text: { maxCharacters: 500 } },
    }),
  });

  if (!res.ok) { console.error(`Exa error: ${res.status}`); return []; }
  const data = await res.json();
  return (data.results || []) as ExaResult[];
}

function classifySeverity(title: string, text: string): string {
  const combined = `${title} ${text}`.toLowerCase();
  if (/indicted|arrested|charged|convicted/.test(combined)) return 'critical';
  if (/investigation|subpoena|ethics violation/.test(combined)) return 'high';
  if (/scandal|corruption|bribery|fraud|dark money/.test(combined)) return 'medium';
  return 'info';
}

async function main() {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log('=== News Monitor (Manual Run) ===\n');

  // Fetch top politicians
  const { data: pols } = await client
    .from('politicians')
    .select('bioguide_id, name')
    .in('office_level', ['US Senator', 'US Representative', 'Governor', 'State Senator', 'State Representative'])
    .gt('total_funds', 0)
    .order('total_funds', { ascending: false })
    .limit(50);

  const politicians = (pols || []) as { bioguide_id: string; name: string }[];
  console.log(`  Monitoring ${politicians.length} politicians\n`);

  const queries = [
    'Ohio politician corruption scandal indicted 2026',
    'Florida politician corruption scandal indicted 2026',
    'AIPAC campaign finance violation politician 2026',
    'politician arrested charged corruption United States 2026',
    'Israel lobby dark money American politician influence',
  ];

  let created = 0;
  let dupes = 0;

  for (const query of queries) {
    console.log(`  Searching: "${query}"`);
    const results = await searchExa(query);
    console.log(`    Found ${results.length} results`);

    for (const r of results) {
      const severity = classifySeverity(r.title, r.text || '');

      // Dedup
      const { count } = await client.from('intel_alerts').select('*', { count: 'exact', head: true }).eq('url', r.url);
      if ((count || 0) > 0) { dupes++; continue; }

      // Match politician
      let matchedPol: { bioguide_id: string; name: string } | undefined;
      const combined = `${r.title} ${r.text || ''}`.toLowerCase();
      for (const p of politicians) {
        const lastName = p.name.split(' ').pop()?.toLowerCase() || '';
        if (lastName.length > 3 && combined.includes(lastName)) {
          matchedPol = p;
          break;
        }
      }

      await client.from('intel_alerts').insert({
        type: 'news',
        severity,
        title: r.title,
        summary: (r.text || '').slice(0, 500),
        url: r.url,
        politician_id: matchedPol?.bioguide_id || null,
        politician_name: matchedPol?.name || null,
        source: 'exa',
        metadata: { query, published_date: r.publishedDate, score: r.score },
      });
      created++;
      console.log(`    + [${severity.toUpperCase()}] ${r.title.slice(0, 80)}${matchedPol ? ` → ${matchedPol.name}` : ''}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== Done: ${created} alerts created, ${dupes} duplicates skipped ===`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
