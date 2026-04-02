import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getAllPoliticians as getJsonPoliticians } from '@/lib/real-data';
import type { Politician } from '@/lib/types';

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
      const politician = getJsonPoliticians().find((p) => p.id === id);
      if (!politician) {
        return NextResponse.json({ error: 'Politician not found' }, { status: 404 });
      }
      return NextResponse.json(politician);
    }

    const { data: row, error } = await client
      .from('politicians')
      .select('*')
      .eq('bioguide_id', id)
      .single();

    if (error || !row) {
      // Try JSON fallback before returning 404
      const politician = getJsonPoliticians().find((p) => p.id === id);
      if (politician) {
        return NextResponse.json(politician);
      }
      return NextResponse.json({ error: 'Politician not found' }, { status: 404 });
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
      yearsInOffice: Number(row.years_in_office) || 0,
      tags: [],
      bio: row.bio as string | undefined,
      termStart: row.term_start as string,
      termEnd: row.term_end as string | undefined,
      socialMedia: (row.social_media as Politician['socialMedia']) || {},
      source_ids: (row.source_ids as Politician['source_ids']) || {},
      lobbyingRecords: (row.lobbying_records as Politician['lobbyingRecords']) || [],
      contributions: [],
      courtCases: [],
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
      socialPosts: [],
      dataStatus: 'live' as const,
      dataSource: (row.data_source as string) || 'supabase',
      lastUpdated: (row.updated_at as string) || (row.created_at as string),
    };

    return NextResponse.json(politician);
  } catch (error) {
    console.error('Failed to fetch politician:', error);
    const politician = getJsonPoliticians().find((p) => p.id === id);
    if (politician) {
      return NextResponse.json(politician);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
