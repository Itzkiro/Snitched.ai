import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';

// Revalidate every 5 minutes — politician data changes at most once/day via cron
export const revalidate = 300;

function cachedResponse(data: unknown) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

export async function GET() {
  try {
    const client = getServerSupabase();
    if (!client) {
      // Supabase not configured -- fall back to local JSON data
      const { getAllPoliticians: getJsonPoliticians } = await import('@/lib/real-data');
      const politicians = getJsonPoliticians();
      return cachedResponse(politicians);
    }

    // Select only list-view columns — exclude voting_records, lobbying_records,
    // bio, social_media, source_ids which bloat the response beyond Vercel limits
    const { data, error } = await client
      .from('politicians')
      .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, photo_url, corruption_score, aipac_funding, juice_box_tier, total_funds, israel_lobby_total, is_active, years_in_office, data_source, updated_at, created_at')
      .order('name');

    if (error) {
      console.error('Supabase error:', error);
      const { getAllPoliticians: getJsonPoliticians } = await import('@/lib/real-data');
      const politicians = getJsonPoliticians();
      return cachedResponse(politicians);
    }

    if (!data || data.length === 0) {
      const { getAllPoliticians: getJsonPoliticians } = await import('@/lib/real-data');
      const politicians = getJsonPoliticians();
      return cachedResponse(politicians);
    }

    // Map Supabase rows to Politician type
    // Lightweight mapping for list view — no donors, no breakdown, no heavy fields
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

    return cachedResponse(politicians);
  } catch (error) {
    console.error('Failed to fetch politicians:', error);
    // Fall back to JSON data on any error
    const { getAllPoliticians: getJsonPoliticians } = await import('@/lib/real-data');
    const politicians = getJsonPoliticians();
    return cachedResponse(politicians);
  }
}
