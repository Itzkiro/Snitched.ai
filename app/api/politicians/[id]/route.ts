import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';

// Force dynamic — no stale cache from old DB
export const dynamic = 'force-dynamic';

async function getJsonPoliticians() {
  const { getAllPoliticians } = await import('@/lib/real-data');
  return getAllPoliticians();
}

function cachedResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'CDN-Cache-Control': 'no-store',
    },
  });
}

/**
 * GET /api/politicians/[id]
 *
 * Returns a single politician by bioguide_id (or local JSON id).
 * Falls back to local JSON data when Supabase is unavailable.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const client = getServerSupabase();

    if (!client) {
      const all = await getJsonPoliticians();
      const politician = all.find((p) => p.id === id);
      if (!politician) {
        return cachedResponse({ error: 'Politician not found' }, 404);
      }
      return cachedResponse(politician);
    }

    const { data: row, error } = await client
      .from('politicians')
      .select('*')
      .eq('bioguide_id', id)
      .single();

    const { data: socialPosts } = await client
      .from('social_posts')
      .select('*')
      .eq('politician_id', id)
      .order('posted_at', { ascending: false })
      .limit(20);

    if (error || !row) {
      // Try JSON fallback before returning 404
      const all = await getJsonPoliticians();
      const politician = all.find((p) => p.id === id);
      if (politician) {
        return cachedResponse(politician);
      }
      return cachedResponse({ error: 'Politician not found' }, 404);
    }

    const top5 = (row.top5_donors as Politician['top5Donors']) || [];
    const politician: Politician = {
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
      top3Donors: top5.slice(0, 3),
      top5Donors: top5,
      topDonor: top5[0]
        ? { name: top5[0].name, amount: top5[0].amount }
        : undefined,
      israelLobbyTotal: Number(row.israel_lobby_total) || 0,
      israelLobbyBreakdown: row.israel_lobby_breakdown as Politician['israelLobbyBreakdown'],
      contributionBreakdown: row.contribution_breakdown as Politician['contributionBreakdown'],
      isActive: row.is_active as boolean,
      isCandidate: row.is_candidate as boolean,
      runningFor: row.running_for as string | undefined,
      yearsInOffice: Number(row.years_in_office) || 0,
      tags: [],
      bio: row.bio as string | undefined,
      termStart: row.term_start as string,
      termEnd: row.term_end as string | undefined,
      socialMedia: (row.social_media as Politician['socialMedia']) || {},
      source_ids: (row.source_ids as Politician['source_ids']) || {},
      lobbyingRecords: (row.lobbying_records as Politician['lobbyingRecords']) || [],
      contributions: (top5 || []).map((d, i) => ({
        id: `contrib-${i}`,
        politicianId: row.bioguide_id as string,
        donorName: d.name,
        donorType: (d.type || 'Individual') as 'PAC' | 'Individual' | 'Corporate',
        amount: d.amount,
        date: '',
        isAipac: d.type === 'Israel-PAC',
      })),
      courtCases: (row.court_records || []).map((c: any) => ({
        id: c.id || '',
        politicianId: row.bioguide_id,
        caseNumber: c.docket_number || c.docketNumber || '',
        court: c.court || '',
        caseType: c.nature_of_suit || c.cause || 'Civil',
        status: (c.date_terminated || c.dateTerminated) ? 'Closed' : 'Active',
        summary: c.case_name || c.caseName || '',
        filedDate: c.date_filed || c.dateFiled || '',
        url: c.url || '',
        dateTerminated: c.date_terminated || c.dateTerminated || '',
      })),
      votes: ((row.voting_records as any[]) || []).map((v: any) => ({
        id: String(v.roll_call_id ?? ''),
        politicianId: row.bioguide_id as string,
        billNumber: v.bill_number ?? '',
        billTitle: v.title ?? '',
        voteValue: v.vote === 'Yea' ? 'Yes' : v.vote === 'Nay' ? 'No' : v.vote === 'NV' ? 'Abstain' : 'Absent',
        date: v.vote_date ?? '',
        billSummary: v.description ?? '',
        category: '',
      })),
      socialPosts: (socialPosts || []).map((p: any) => ({
        id: p.id,
        politicianId: p.politician_id,
        platform: p.platform,
        content: p.content,
        postUrl: p.post_url,
        postedAt: p.posted_at,
        sentimentScore: p.sentiment_score || 0,
        isDeleted: p.is_deleted || false,
      })),
      dataStatus: 'live' as const,
      dataSource: (row.data_source as string) || 'supabase',
      lastUpdated: (row.updated_at as string) || (row.created_at as string),
    };

    return cachedResponse(politician);
  } catch (error) {
    console.error('Failed to fetch politician:', error);
    const all = await getJsonPoliticians();
    const politician = all.find((p) => p.id === id);
    if (politician) {
      return cachedResponse(politician);
    }
    return cachedResponse({ error: 'Internal server error' }, 500);
  }
}
