#!/usr/bin/env npx tsx
/**
 * Fix Phil Ehr dossier: clear red_flags (he has $0 direct pro-Israel PAC money,
 * so he should render green, not red), and preserve the nuanced bundler
 * context as positive_flags + bundler_breakdown_notes.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const BIOGUIDE_ID = 'fl-house-2026-phil-ehr';

async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await s.from('politicians').select('source_ids').eq('bioguide_id', BIOGUIDE_ID).single();
  if (error || !data) throw new Error(`load: ${error?.message}`);
  const sourceIds = (data.source_ids as Record<string, unknown>) ?? {};

  const positiveFlags: string[] = [
    '[fec] $0 in pro-Israel PAC contributions across all filings (2018-2026 career).',
    '[fec] $0 in real external PAC contributions — campaign is 100% individual-donor + self-funded + ActBlue conduit. 2024 cycle receipts $1.2M; 2026 cycle to date $207K.',
    '[fec] $27,636 total candidate self-contributions across career — small relative to $1.4M receipts, rules out wealthy self-funder red flag.',
    '[fec] 1,609 itemized individual contributions from 611 unique donors over career.',
    '[registry-context] 93 of 611 unique donors (15%) appear in the 49-year pro-Israel donor registry, giving Ehr $95,593 out of $1.4M career (6.8%). Of the top 10 matched bundlers, 5-6 are primarily J Street donors (dovish peace faction: Sylvia Sabel $738K career to JStreetPAC, Chiara Nappi $282K, Martin Hellman $145K, Stuart Brown $91K, Judson Miner $403K to J Street Action Fund). 4 are AIPAC-aligned hawks (Morris Bailey $150K to UDP, Tom Coleman $75K UDP, Jeffrey Miller $51K DMFI+RJC, Jeffrey Wolf $49K US Israel PAC+AIPAC). Mixed signal — not a uniform lobby-capture pattern.',
  ];

  const newSourceIds = {
    ...sourceIds,
    donation_status: 'GRASSROOTS / NO PRO-ISRAEL PAC MONEY',
    positive_flags: positiveFlags,
    red_flags: [],  // explicit empty — UI renders green when this is empty
    bundler_breakdown_notes: 'Registry crossref context is intentionally classified as positive/neutral, not a red flag, because: (1) $0 direct pro-Israel PAC money to candidate, (2) matched bundlers split between J Street (dovish/pro-peace, anti-AIPAC) and AIPAC-aligned factions with no uniform signal, (3) $95K / $1.4M career = 6.8% is not a capture threshold. The 49-year registry is a pro-Israel PAC donor pool which includes J Street donors who generally oppose AIPAC policy.',
  };

  const { error: upErr } = await s.from('politicians')
    .update({ source_ids: newSourceIds, updated_at: new Date().toISOString() })
    .eq('bioguide_id', BIOGUIDE_ID);
  if (upErr) throw upErr;

  const { data: verify } = await s.from('politicians')
    .select('bioguide_id,name,corruption_score,source_ids')
    .eq('bioguide_id', BIOGUIDE_ID).single();
  console.log('Phil Ehr updated:');
  console.log(`  corruption_score: ${verify?.corruption_score}`);
  const sid = verify?.source_ids as Record<string, unknown>;
  console.log(`  donation_status:  ${sid?.donation_status}`);
  console.log(`  red_flags count:  ${(sid?.red_flags as string[])?.length ?? 0}`);
  console.log(`  positive_flags:   ${(sid?.positive_flags as string[])?.length ?? 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
