import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';
import { redirect } from 'next/navigation';
import { filterByState, getStateName } from '@/lib/state-utils';
import { isStateLive } from '@/components/ComingSoon';
import { getAllStats } from '@/lib/platform-stats';
import TerminalHome from '@/components/TerminalHome';

/**
 * Homepage — server component that fetches politician data at request time
 * and passes it to the interactive client component.
 *
 * Key stats are rendered as server-side HTML so bots and crawlers see real
 * content instead of a "Loading..." spinner.
 */

// Revalidate every 5 minutes (same as /api/politicians)
export const revalidate = 300;

async function fetchPoliticians(): Promise<Politician[]> {
  try {
    const client = getServerSupabase();
    if (!client) {
      const { getAllPoliticians } = await import('@/lib/real-data');
      return getAllPoliticians();
    }

    const columns =
      'bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, photo_url, corruption_score, aipac_funding, juice_box_tier, total_funds, israel_lobby_total, is_active, years_in_office, data_source, updated_at, created_at';
    const allRows: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data: batch, error: batchErr } = await client
        .from('politicians')
        .select(columns)
        .order('name')
        .range(from, to);

      if (batchErr || !batch) break;
      allRows.push(...batch);
      hasMore = batch.length === pageSize;
      page++;
    }

    if (allRows.length === 0) {
      const { getAllPoliticians } = await import('@/lib/real-data');
      return getAllPoliticians();
    }

    return allRows.map((row: Record<string, unknown>): Politician => ({
      id: row.bioguide_id as string,
      name: row.name as string,
      office: row.office as string,
      officeLevel: row.office_level as Politician['officeLevel'],
      party: row.party as Politician['party'],
      district: row.district as string | undefined,
      jurisdiction: row.jurisdiction as string,
      jurisdictionType: row.jurisdiction_type as Politician['jurisdictionType'],
      photoUrl: row.photo_url as string | undefined,
      corruptionScore: Number(row.corruption_score) || 0,
      aipacFunding: Number(row.aipac_funding) || 0,
      juiceBoxTier: row.juice_box_tier as Politician['juiceBoxTier'],
      totalFundsRaised: Number(row.total_funds) || 0,
      top3Donors: [],
      top5Donors: [],
      israelLobbyTotal: Number(row.israel_lobby_total) || 0,
      isActive: row.is_active as boolean,
      yearsInOffice: Number(row.years_in_office) || 0,
      tags: [],
      socialMedia: {},
      source_ids: {},
      lobbyingRecords: [],
      contributions: [],
      courtCases: [],
      votes: [],
      socialPosts: [],
      dataStatus: 'live' as const,
      dataSource: (row.data_source as string) || 'supabase',
      lastUpdated: (row.updated_at as string) || (row.created_at as string),
    }));
  } catch (error) {
    console.error('Failed to fetch politicians for SSR:', error);
    try {
      const { getAllPoliticians } = await import('@/lib/real-data');
      return getAllPoliticians();
    } catch {
      return [];
    }
  }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state: stateParam } = await searchParams;
  if (stateParam && !isStateLive(stateParam)) redirect(`/officials?state=${stateParam}`);
  const [allPoliticians, platformStats] = await Promise.all([
    fetchPoliticians(),
    getAllStats(),
  ]);
  const politicians = filterByState(allPoliticians, stateParam);

  // Compute key stats for the server-rendered section (visible to crawlers)
  const active = politicians.filter(p => p.isActive);
  const totalTracked = politicians.length;
  const totalFunding = active.reduce(
    (sum, p) => sum + (p.israelLobbyTotal || p.aipacFunding || 0),
    0,
  );
  const avgCorruption =
    active.length > 0
      ? Math.round(
          active.reduce((sum, p) => sum + p.corruptionScore, 0) / active.length,
        )
      : 0;
  const compromisedCount = active.filter(p => p.juiceBoxTier !== 'none').length;
  const withFunding = politicians.filter(p => (p.totalFundsRaised || 0) > 0).length;

  // Top corruption targets for crawlers
  const topTargets = [...active]
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 6);

  return (
    <>
      {/*
        Server-rendered stats block: visible to all bots/crawlers.
        Visually hidden for regular users (the interactive client component
        renders the styled version), but the text is still in the HTML.
      */}
      <section
        aria-label={`${getStateName(stateParam)} Corruption Index Summary`}
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        <h1>Snitched.ai - {getStateName(stateParam)} Corruption Index</h1>
        <p>
          Real-time political transparency platform tracking {totalTracked} {getStateName(stateParam)}{' '}
          politicians. Exposing foreign lobby influence, campaign finance, and
          corruption using public records from FEC, state election databases, LDA,
          and LegiScan.
        </p>
        <h2>Key Statistics</h2>
        <ul>
          <li>Politicians tracked: {totalTracked}</li>
          <li>Pro-Israel lobby funding tracked: ${Math.round(totalFunding).toLocaleString('en-US')}+</li>
          <li>Average corruption score: {avgCorruption}/100</li>
          <li>Politicians flagged for foreign lobby ties: {compromisedCount}</li>
          <li>Politicians with real funding data: {withFunding}</li>
        </ul>
        <h2>Top Corruption Targets</h2>
        <ol>
          {topTargets.map(p => (
            <li key={p.id}>
              {p.name} ({p.party}) - {p.office} - Corruption Score: {p.corruptionScore}/100
              {(p.israelLobbyTotal || p.aipacFunding) > 0
                ? (() => {
                    const amt = p.israelLobbyTotal || p.aipacFunding || 0;
                    return ` - Pro-Israel Lobby: $${Math.round(amt).toLocaleString('en-US')}`;
                  })()
                : ''}
            </li>
          ))}
        </ol>
        <p>
          Data sources: Federal Election Commission (FEC), Florida Division of
          Elections, Lobbying Disclosure Act (LDA) filings, LegiScan state
          legislature records.
        </p>
      </section>

      {/* Interactive client component with pre-fetched data */}
      <TerminalHome initialPoliticians={politicians} selectedState={stateParam || null} platformStats={platformStats} />
    </>
  );
}
