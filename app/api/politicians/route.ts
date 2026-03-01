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
    const politicians: Politician[] = data.map((row: Record<string, unknown>) => ({
      id: row.bioguide_id as string,
      name: row.name as string,
      office: row.office as string,
      officeLevel: row.office_level as Politician['officeLevel'],
      party: row.party as Politician['party'],
      district: row.district as string | undefined,
      jurisdiction: row.jurisdiction as string,
      jurisdictionType: row.jurisdiction_type as Politician['jurisdictionType'],
      photoUrl: row.photo_url as string | undefined,
      corruptionScore: row.corruption_score as number,
      aipacFunding: (row.aipac_funding as number) || 0,
      juiceBoxTier: row.juice_box_tier as Politician['juiceBoxTier'],
      totalFundsRaised: row.total_funds as number | undefined,
      top5Donors: (row.top5_donors as Politician['top5Donors']) || [],
      topDonor: (row.top5_donors as Array<{ name: string; amount: number }> | null)?.[0]
        ? {
            name: (row.top5_donors as Array<{ name: string; amount: number }>)[0].name,
            amount: (row.top5_donors as Array<{ name: string; amount: number }>)[0].amount,
          }
        : undefined,
      israelLobbyTotal: row.israel_lobby_total as number | undefined,
      israelLobbyBreakdown: row.israel_lobby_breakdown as Politician['israelLobbyBreakdown'],
      isActive: row.is_active as boolean,
      yearsInOffice: (row.years_in_office as number) || 0,
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
      dataSource: 'supabase',
      lastUpdated: (row.updated_at as string) || (row.created_at as string),
    }));

    return NextResponse.json(politicians);
  } catch (error) {
    console.error('Failed to fetch politicians:', error);
    // Fall back to JSON data on any error
    const politicians = getJsonPoliticians();
    return NextResponse.json(politicians);
  }
}
