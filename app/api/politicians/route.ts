import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getAllPoliticians as getJsonPoliticians } from '@/lib/real-data';
import type { Politician } from '@/lib/types';

export async function GET() {
  try {
    const client = getServerSupabase();
    if (!client) {
      // Supabase not configured -- fall back to local JSON data
      const politicians = getJsonPoliticians();
      return NextResponse.json(politicians);
    }

    const { data, error } = await client
      .from('politicians')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error:', error);
      const politicians = getJsonPoliticians();
      return NextResponse.json(politicians);
    }

    if (!data || data.length === 0) {
      const politicians = getJsonPoliticians();
      return NextResponse.json(politicians);
    }

    // Map Supabase rows to Politician type
    const politicians: Politician[] = data.map((row: Record<string, unknown>) => {
      const top5 = (row.top5_donors as Politician['top5Donors']) || [];
      return {
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
        isActive: row.is_active as boolean,
        yearsInOffice: Number(row.years_in_office) || 0,
        tags: [],
        bio: row.bio as string | undefined,
        termStart: row.term_start as string,
        termEnd: row.term_end as string | undefined,
        socialMedia: (row.social_media as Politician['socialMedia']) || {},
        source_ids: (row.source_ids as Politician['source_ids']) || {},
        contributions: [],
        courtCases: [],
        votes: [],
        socialPosts: [],
        dataStatus: 'live' as const,
        dataSource: (row.data_source as string) || 'supabase',
        lastUpdated: (row.updated_at as string) || (row.created_at as string),
      };
    });

    return NextResponse.json(politicians);
  } catch (error) {
    console.error('Failed to fetch politicians:', error);
    // Fall back to JSON data on any error
    const politicians = getJsonPoliticians();
    return NextResponse.json(politicians);
  }
}
