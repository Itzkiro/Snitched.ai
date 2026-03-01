/**
 * Supabase Data Layer
 * Fetches politician data from Supabase database
 */

import { getSupabase } from './supabase';
import type { Politician } from './types';
import { getAllPoliticians as getJsonPoliticians } from './real-data';

/**
 * Fetch all politicians from Supabase
 * Falls back to JSON data if Supabase is not configured
 */
export async function getAllPoliticiansFromSupabase(): Promise<Politician[]> {
  try {
    const client = getSupabase();
    if (!client) {
      console.log('Supabase not configured, using JSON fallback');
      return getJsonPoliticians();
    }

    const { data, error } = await client
      .from('politicians')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error:', error);
      console.log('Falling back to JSON data...');
      return getJsonPoliticians();
    }

    if (!data || data.length === 0) {
      console.log('No data in Supabase, falling back to JSON...');
      return getJsonPoliticians();
    }

    console.log(`Loaded ${data.length} politicians from Supabase`);

    // Map Supabase data to Politician type
    return data.map((row: any) => ({
      id: row.bioguide_id,
      name: row.name,
      office: row.office,
      officeLevel: row.office_level as any,
      party: row.party,
      district: row.district,
      jurisdiction: row.jurisdiction,
      jurisdictionType: row.jurisdiction_type as any,
      photoUrl: row.photo_url,
      corruptionScore: row.corruption_score,
      aipacFunding: row.aipac_funding || 0,
      juiceBoxTier: row.juice_box_tier as any,
      totalFundsRaised: row.total_funds,
      top5Donors: row.top5_donors || [],
      topDonor: row.top5_donors?.[0] ? {
        name: row.top5_donors[0].name,
        amount: row.top5_donors[0].amount,
      } : undefined,
      israelLobbyTotal: row.israel_lobby_total,
      israelLobbyBreakdown: row.israel_lobby_breakdown,
      isActive: row.is_active,
      yearsInOffice: row.years_in_office || 0,
      tags: [],
      bio: row.bio,
      termStart: row.term_start,
      termEnd: row.term_end,
      socialMedia: row.social_media || {},
      source_ids: row.source_ids || {},
      contributions: [],
      courtCases: [],
      votes: [],
      socialPosts: [],
      dataStatus: 'live',
      dataSource: 'supabase',
      lastUpdated: row.updated_at || row.created_at,
    }));
  } catch (error) {
    console.error('Failed to fetch from Supabase:', error);
    console.log('Falling back to JSON data...');
    return getJsonPoliticians();
  }
}
