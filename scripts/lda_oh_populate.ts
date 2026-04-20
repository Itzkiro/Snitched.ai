import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type LdaLobbyingActivity = {
  general_issue_code_display?: string;
  description?: string;
  lobbyists?: Array<{ lobbyist?: { first_name?: string; last_name?: string } }>;
};

type LdaFiling = {
  url?: string;
  filing_uuid?: string;
  filing_year?: number;
  filing_period_display?: string;
  filing_type_display?: string;
  income?: string | null;
  expenses?: string | null;
  client?: { name?: string };
  registrant?: { name?: string };
  lobbying_activities?: LdaLobbyingActivity[];
};

type LdaResponse = {
  count?: number;
  results?: LdaFiling[];
};

type LobbyingRecord = {
  lobbyist_name: string;
  client_name: string;
  registrant: string;
  issue_area: string;
  amount: number;
  period: string;
  source: string;
  url: string;
};

async function fetchLdaForOfficial(name: string): Promise<LobbyingRecord[]> {
  // LDA public API: https://lda.senate.gov/api/
  const url = `https://lda.senate.gov/api/v1/filings/?filing_specific_lobbying_issues=${encodeURIComponent(name)}&page_size=25`;
  let json: LdaResponse | null = null;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        const backoff = Math.min(30000, 2000 * 2 ** (attempt - 1));
        await sleep(backoff);
        continue;
      }
      if (!res.ok) {
        return [];
      }
      json = (await res.json()) as LdaResponse;
      break;
    } catch (e) {
      if (attempt === maxAttempts) return [];
      await sleep(1500 * attempt);
    }
  }
  if (!json) return [];
  {
    const filings = json.results || [];
    const records: LobbyingRecord[] = [];
    for (const f of filings.slice(0, 15)) {
      const activities = f.lobbying_activities || [];
      const issue = activities
        .map((a) => a.general_issue_code_display || a.description)
        .filter(Boolean)
        .slice(0, 2)
        .join('; ') || 'Unspecified';
      const lobbyistNames = activities
        .flatMap((a) => (a.lobbyists || []).map((l) => `${l.lobbyist?.first_name || ''} ${l.lobbyist?.last_name || ''}`.trim()))
        .filter(Boolean);
      const lobbyistName = lobbyistNames[0] || 'Unknown';
      const amount = Number(f.income || f.expenses || 0) || 0;
      records.push({
        lobbyist_name: lobbyistName,
        client_name: f.client?.name || 'Unknown',
        registrant: f.registrant?.name || 'Unknown',
        issue_area: issue,
        amount,
        period: `${f.filing_period_display || ''} ${f.filing_year || ''}`.trim(),
        source: 'lda_api',
        url: f.url || `https://lda.senate.gov/filings/public/filing/${f.filing_uuid}/`,
      });
    }
    return records;
  }
}

async function main() {
  // DB-side filtering to avoid 1000-row select cap
  const TOP_OFFICES = ['US Senator', 'US Representative', 'Governor', 'State Senator', 'State Representative'];

  const { data: topOfficials, error: e1 } = await sb
    .from('politicians')
    .select('bioguide_id, name, office_level')
    .ilike('bioguide_id', 'oh-%')
    .is('lobbying_records', null)
    .in('office_level', TOP_OFFICES);
  if (e1) {
    console.error('Top officials query error:', e1);
    return;
  }

  const { data: candidates, error: e2 } = await sb
    .from('politicians')
    .select('bioguide_id, name, office_level')
    .ilike('bioguide_id', 'oh-%')
    .is('lobbying_records', null)
    .eq('is_candidate', true);
  if (e2) {
    console.error('Candidates query error:', e2);
    return;
  }

  const seen = new Set<string>();
  const targets: Array<{ bioguide_id: string; name: string; office_level: string | null }> = [];
  for (const p of [...(topOfficials || []), ...(candidates || [])]) {
    if (seen.has(p.bioguide_id)) continue;
    seen.add(p.bioguide_id);
    targets.push(p as any);
  }

  console.log(`Top officials needing lobby data: ${topOfficials?.length || 0}`);
  console.log(`Candidates needing lobby data: ${candidates?.length || 0}`);
  console.log(`Unique targets: ${targets.length}`);

  // Sort federal officials first
  const federalFirst = (o: string | null | undefined) =>
    o === 'US Senator' || o === 'US Representative' ? 0 : 1;
  targets.sort((a, b) => federalFirst(a.office_level) - federalFirst(b.office_level));

  let foundCount = 0;
  let emptyCount = 0;
  let errCount = 0;
  let idx = 0;

  for (const p of targets) {
    idx++;
    try {
      const records = await fetchLdaForOfficial(p.name);
      const { error: upErr } = await sb
        .from('politicians')
        .update({ lobbying_records: records })
        .eq('bioguide_id', p.bioguide_id);
      if (upErr) {
        errCount++;
        console.error(`[${idx}/${targets.length}] UPDATE ERR ${p.name}:`, upErr.message);
      } else if (records.length > 0) {
        foundCount++;
        console.log(`[${idx}/${targets.length}] FOUND ${records.length} for ${p.name} (${p.office_level})`);
      } else {
        emptyCount++;
        if (idx % 10 === 0) console.log(`[${idx}/${targets.length}] progress: found=${foundCount} empty=${emptyCount}`);
      }
    } catch (e: any) {
      errCount++;
      console.error(`[${idx}/${targets.length}] EXC ${p.name}:`, e?.message);
    }
    await sleep(550);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Processed: ${targets.length}`);
  console.log(`With lobbying records: ${foundCount}`);
  console.log(`Set to empty array: ${emptyCount}`);
  console.log(`Errors: ${errCount}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
