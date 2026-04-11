#!/usr/bin/env npx tsx
/**
 * Seed Ohio Israel Lobby data from verified Track AIPAC totals.
 * Updates israel_lobby_total, aipac_funding, then recomputes corruption scores.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const OH_ISRAEL_LOBBY = [
  { name: 'Bernie Moreno', total: 1137218, pacs: 66112, ie: 0, donors: 1071106 },
  { name: 'Jon Husted', total: 194627, pacs: 27, ie: 0, donors: 194600 },
  { name: 'Greg Landsman', total: 1733305, pacs: 732093, ie: 0, donors: 1001212 },
  { name: 'David Taylor', total: 68121, pacs: 37571, ie: 0, donors: 30550 },
  { name: 'Joyce Beatty', total: 431314, pacs: 191676, ie: 0, donors: 239638 },
  { name: 'Jim Jordan', total: 711711, pacs: 219834, ie: 0, donors: 491877 },
  { name: 'Bob Latta', total: 247788, pacs: 75387, ie: 0, donors: 172401 },
  { name: 'Michael Rulli', total: 75405, pacs: 38545, ie: 0, donors: 36860 },
  { name: 'Max Miller', total: 964930, pacs: 309274, ie: 0, donors: 655656 },
  { name: 'Warren Davidson', total: 62078, pacs: 3300, ie: 0, donors: 58778 },
  { name: 'Marcy Kaptur', total: 857037, pacs: 184548, ie: 0, donors: 672489 },
  { name: 'Mike Turner', total: 611931, pacs: 228038, ie: 0, donors: 383893 },
  { name: 'Shontel Brown', total: 6639385, pacs: 1520814, ie: 3182118, donors: 1936453 },
  { name: 'Troy Balderson', total: 264697, pacs: 68071, ie: 0, donors: 196626 },
  { name: 'Emilia Sykes', total: 1061993, pacs: 347272, ie: 0, donors: 714721 },
  { name: 'Dave Joyce', total: 438057, pacs: 79899, ie: 0, donors: 358158 },
  { name: 'Mike Carey', total: 181351, pacs: 73526, ie: 0, donors: 107825 },
];

async function main() {
  console.log('=== Seeding Ohio Israel Lobby Data ===\n');

  for (const entry of OH_ISRAEL_LOBBY) {
    // Find by name (fuzzy match on last name)
    const lastName = entry.name.split(' ').pop()!;
    const { data: matches } = await supabase
      .from('politicians')
      .select('*')
      .like('bioguide_id', 'oh-%')
      .ilike('name', `%${lastName}%`);

    if (!matches || matches.length === 0) {
      console.log(`  ✗ ${entry.name} — not found in OH database`);
      continue;
    }

    // Pick best match
    const exact = matches.find(m => m.name.toLowerCase().includes(entry.name.split(' ')[0].toLowerCase()));
    const row = exact || matches[0];

    // Build israel lobby breakdown
    const breakdown = {
      pacs: entry.pacs,
      ie: entry.ie,
      lobby_donors: entry.donors,
      ie_details: entry.ie > 0 ? [{ committee_name: 'Israel Lobby IE', amount: entry.ie, is_israel_lobby: true, support_oppose: 'S' }] : [],
    };

    // Update
    const { error } = await supabase
      .from('politicians')
      .update({
        israel_lobby_total: entry.total,
        aipac_funding: entry.total,
        israel_lobby_breakdown: breakdown,
        updated_at: new Date().toISOString(),
      })
      .eq('bioguide_id', row.bioguide_id);

    if (error) {
      console.log(`  ✗ ${entry.name} — update error: ${error.message}`);
      continue;
    }

    // Recompute corruption score
    const top5 = (row.top5_donors ?? []) as Politician['top5Donors'];
    const politician: Politician = {
      id: row.bioguide_id,
      name: row.name,
      office: row.office,
      officeLevel: row.office_level,
      party: row.party,
      district: row.district,
      jurisdiction: row.jurisdiction,
      jurisdictionType: row.jurisdiction_type,
      corruptionScore: Number(row.corruption_score) || 0,
      aipacFunding: entry.total,
      juiceBoxTier: row.juice_box_tier || 'none',
      totalFundsRaised: Number(row.total_funds) || 0,
      top3Donors: top5?.slice(0, 3),
      top5Donors: top5,
      israelLobbyTotal: entry.total,
      israelLobbyBreakdown: breakdown,
      contributionBreakdown: row.contribution_breakdown ?? undefined,
      isActive: row.is_active,
      yearsInOffice: Number(row.years_in_office) || 0,
      tags: [],
      socialMedia: row.social_media || {},
      source_ids: row.source_ids || {},
      lobbyingRecords: row.lobbying_records ?? [],
      contributions: [],
      courtCases: [],
      votes: (row.voting_records ?? []).map((v: any) => ({
        id: String(v.roll_call_id ?? ''),
        politicianId: row.bioguide_id,
        billNumber: v.bill_number ?? '',
        billTitle: v.title ?? '',
        voteValue: v.vote === 'Yea' ? 'Yes' : v.vote === 'Nay' ? 'No' : 'Absent',
        date: v.vote_date ?? '',
        billSummary: v.description ?? '',
        category: '',
      })),
      socialPosts: [],
      dataStatus: 'live',
      dataSource: row.data_source || 'supabase',
      lastUpdated: new Date().toISOString(),
    };

    const result = computeCorruptionScore(politician);

    await supabase
      .from('politicians')
      .update({
        corruption_score: result.score,
        juice_box_tier: result.score >= 60 ? 'critical' : result.score >= 40 ? 'high' : result.score >= 20 ? 'medium' : 'none',
      })
      .eq('bioguide_id', row.bioguide_id);

    const amt = entry.total >= 1e6 ? `$${(entry.total / 1e6).toFixed(1)}M` : `$${(entry.total / 1e3).toFixed(0)}K`;
    console.log(`  ✓ ${row.name} — ${amt} Israel lobby → score: ${row.corruption_score} → ${result.score} (${result.grade})`);
  }

  console.log('\nDone!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
