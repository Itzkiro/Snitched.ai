import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';
import BrowseClient from './BrowseClient';

// ISR: revalidate every 5 minutes
export const revalidate = 300;

async function getPoliticians(): Promise<Politician[]> {
  const client = getServerSupabase();
  if (!client) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians();
  }

  const { data, error } = await client
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, corruption_score, aipac_funding, juice_box_tier, is_active, total_funds, israel_lobby_total, contribution_breakdown, top5_donors')
    .order('name');

  if (error || !data || data.length === 0) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians();
  }

  return data.map((row: Record<string, unknown>) => {
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
      corruptionScore: Number(row.corruption_score) || 0,
      aipacFunding: Number(row.aipac_funding) || 0,
      juiceBoxTier: (row.juice_box_tier as Politician['juiceBoxTier']) || 'none',
      isActive: row.is_active as boolean,
      totalFundsRaised: Number(row.total_funds) || 0,
      israelLobbyTotal: Number(row.israel_lobby_total) || 0,
      contributionBreakdown: row.contribution_breakdown as Politician['contributionBreakdown'],
      top5Donors: top5,
      topDonor: top5[0] ? { name: top5[0].name, amount: top5[0].amount } : undefined,
    };
  }) as Politician[];
}

export default async function BrowsePage() {
  const politicians = await getPoliticians();
  return <BrowseClient politicians={politicians} />;
}
