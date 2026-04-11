import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/monitor-news
 *
 * AI-powered news monitor. Searches Exa every 6 hours for scandal keywords
 * combined with tracked politician names. Auto-flags critical findings as
 * intel_alerts with severity classification.
 *
 * Schedule: every 6 hours (0 2,8,14,20 * * *)
 */

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const EXA_API_URL = 'https://api.exa.ai/search';
const PAGE = 1000;

const SCANDAL_KEYWORDS = [
  'indicted', 'arrested', 'charged', 'corruption', 'bribery', 'fraud',
  'scandal', 'investigation', 'subpoena', 'ethics violation', 'campaign finance violation',
  'money laundering', 'embezzlement', 'kickback', 'quid pro quo',
  'foreign agent', 'FARA violation', 'lobbying scandal', 'insider trading',
  'sexual harassment', 'abuse of power', 'obstruction', 'perjury',
  'AIPAC', 'Israel lobby', 'foreign influence', 'dark money',
];

interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  text?: string;
  score?: number;
  author?: string;
}

async function searchExa(query: string): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(EXA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query,
        numResults: 10,
        useAutoprompt: true,
        type: 'auto',
        startPublishedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // last 7 days
        contents: { text: { maxCharacters: 500 } },
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []) as ExaResult[];
  } catch {
    return [];
  }
}

function classifySeverity(title: string, text: string): 'critical' | 'high' | 'medium' | 'info' {
  const combined = `${title} ${text}`.toLowerCase();
  if (/indicted|arrested|charged|convicted/.test(combined)) return 'critical';
  if (/investigation|subpoena|ethics violation|campaign finance violation|FARA/.test(combined)) return 'high';
  if (/scandal|corruption|bribery|fraud|dark money|foreign/.test(combined)) return 'medium';
  return 'info';
}

export async function GET(request: NextRequest) {
  const start = Date.now();

  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const client = getServiceRoleSupabase();
  if (!client) {
    return cronResponse('monitor-news', { success: false, synced: 0, errors: 1, details: { error: 'No DB' }, duration_ms: 0 });
  }

  if (!process.env.EXA_API_KEY) {
    return cronResponse('monitor-news', { success: false, synced: 0, errors: 1, details: { error: 'EXA_API_KEY not set' }, duration_ms: 0 });
  }

  // Fetch notable politicians (federal + state level with data)
  const { data: pols } = await client
    .from('politicians')
    .select('bioguide_id, name')
    .in('office_level', ['US Senator', 'US Representative', 'Governor', 'State Senator', 'State Representative'])
    .gt('total_funds', 0)
    .order('total_funds', { ascending: false })
    .limit(100);

  const politicians = (pols || []) as { bioguide_id: string; name: string }[];

  let alertsCreated = 0;
  let searchesRun = 0;
  const errors: string[] = [];

  // Search for general political scandal news in tracked states
  const generalQueries = [
    'Ohio politician corruption scandal indicted 2026',
    'Florida politician corruption scandal indicted 2026',
    'AIPAC campaign finance violation politician',
    'politician arrested charged corruption United States 2026',
    'dark money foreign influence American politician',
  ];

  for (const query of generalQueries) {
    const results = await searchExa(query);
    searchesRun++;

    for (const r of results) {
      const severity = classifySeverity(r.title, r.text || '');

      // Check if this URL already exists as an alert
      const { count } = await client
        .from('intel_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('url', r.url);

      if ((count || 0) > 0) continue; // Already tracked

      // Try to match to a tracked politician
      let matchedPol: { bioguide_id: string; name: string } | undefined;
      const combinedText = `${r.title} ${r.text || ''}`.toLowerCase();
      for (const p of politicians) {
        const lastName = p.name.split(' ').pop()?.toLowerCase() || '';
        if (lastName.length > 3 && combinedText.includes(lastName)) {
          matchedPol = p;
          break;
        }
      }

      const { error: insertErr } = await client.from('intel_alerts').insert({
        type: 'news',
        severity,
        title: r.title,
        summary: r.text?.slice(0, 500) || '',
        url: r.url,
        politician_id: matchedPol?.bioguide_id || null,
        politician_name: matchedPol?.name || null,
        source: 'exa',
        metadata: {
          query,
          published_date: r.publishedDate,
          score: r.score,
          author: r.author,
        },
      });

      if (insertErr) {
        errors.push(insertErr.message);
      } else {
        alertsCreated++;
      }
    }

    // Rate limit Exa
    await new Promise(r => setTimeout(r, 1000));
  }

  // Search for specific high-profile politicians
  const topPols = politicians.slice(0, 20);
  for (const pol of topPols) {
    const query = `${pol.name} scandal corruption investigation 2026`;
    const results = await searchExa(query);
    searchesRun++;

    for (const r of results) {
      const { count } = await client
        .from('intel_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('url', r.url);
      if ((count || 0) > 0) continue;

      const severity = classifySeverity(r.title, r.text || '');

      await client.from('intel_alerts').insert({
        type: 'news',
        severity,
        title: r.title,
        summary: r.text?.slice(0, 500) || '',
        url: r.url,
        politician_id: pol.bioguide_id,
        politician_name: pol.name,
        source: 'exa',
        metadata: { query, published_date: r.publishedDate, score: r.score },
      });
      alertsCreated++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  return cronResponse('monitor-news', {
    success: true,
    synced: alertsCreated,
    errors: errors.length,
    details: { searchesRun, alertsCreated, politiciansMonitored: topPols.length, errors: errors.slice(0, 5) },
    duration_ms: Date.now() - start,
  });
}
