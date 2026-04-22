#!/usr/bin/env npx tsx
/**
 * Second pass: enrich Phil Ehr + Carlos Gimenez DB rows with bios, donation_status,
 * positive/red flags, and authoritative narrative text.
 * Relies on data/fl28-phil-ehr-audit.json (already generated) for Ehr's numbers.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fl28-phil-ehr-audit.json'), 'utf8'));

async function main(): Promise<void> {
  const { data: ehr } = await s.from('politicians').select('source_ids').eq('bioguide_id', 'fl-house-2026-phil-ehr').single();
  if (!ehr) throw new Error('Ehr not found');

  const ehrBio = 'Democratic challenger for U.S. House Florida District 28 in 2026. Retired U.S. Navy pilot (1982-2008, 26 years of service). Registered Republican until 2017. Previously ran for Congress in Florida\'s 1st Congressional District against Rep. Matt Gaetz in 2018 and 2020, losing by 30+ points each cycle. Originally filed for U.S. Senate in 2024 against Rick Scott, then switched to FL-28 in October 2023 to clear the Senate primary for Debbie Mucarsel-Powell. Lost the FL-28 2024 general election to incumbent Rep. Carlos Gimenez 35.4-64.6%. Running again in 2026 as the only filed Democrat for the August 18 primary. Principal committee "EHR FORCE INC." (C00904128); 2024 cycle committee "PHIL EHR FOR CONGRESS" (C00845750).';

  const ehrPositiveFlags: string[] = [
    '[fec] $0 in pro-Israel PAC contributions across all filings (2018-2026 career).',
    '[fec] $0 in real external PAC contributions — campaign is 100% individual-donor + self-funded + ActBlue conduit. 2024 cycle receipts $1.2M; 2026 cycle to date $207K.',
    '[fec] $27,636 total candidate self-contributions across career — small relative to $1.4M receipts, rules out wealthy self-funder red flag.',
    '[fec] 1,609 itemized individual contributions from 611 unique donors over career.',
  ];

  const ehrRedFlags: string[] = [
    `[registry] 93 donors to Ehr match the 49-year pro-Israel donor registry (33,587 indexed), 54 high-confidence. These donors gave Ehr $${audit.registry_match_to_candidate.toFixed(0)} total — $95K of a $1.4M career is 6.8%.`,
    '[registry-breakdown] Of the top 10 matched bundlers, 5-6 are primarily J Street donors (dovish/peace faction: Sabel $738K career to JStreetPAC; Nappi $282K; Hellman $145K; Brown $91K; Miner $403K to J Street Action Fund). 4 are AIPAC-aligned hawks (Bailey $150K to UDP; Coleman $75K UDP; Miller $51K to DMFI+RJC; Wolf $49K to US Israel PAC + Pro-Israel America + AIPAC PAC). Not a uniform lobby-capture signal.',
  ];

  const ehrDonationStatus = 'NO DIRECT PRO-ISRAEL PAC MONEY / MIXED J-STREET + AIPAC BUNDLERS';

  await s.from('politicians').update({
    bio: ehrBio,
    source_ids: {
      ...(ehr.source_ids as Record<string, unknown>),
      donation_status: ehrDonationStatus,
      positive_flags: ehrPositiveFlags,
      red_flags: ehrRedFlags,
      bundler_breakdown_notes: 'J Street (dovish) and AIPAC-aligned (hawkish) donors both appear in the top 10 bundler matches. Treat the $95K as split between factions rather than unified lobby capture.',
      ballotpedia_slug: 'Phil_Ehr',
    },
    social_media: { facebook: 'https://www.facebook.com/PhilEhrFlorida/' },
    updated_at: new Date().toISOString(),
  }).eq('bioguide_id', 'fl-house-2026-phil-ehr');

  // Gimenez: add donation_status + positive/red flags for the existing row
  const { data: gim } = await s.from('politicians').select('source_ids,israel_lobby_breakdown').eq('bioguide_id', '79bc66ef-4488-439e-af4b-ab6de865364d').single();
  if (!gim) throw new Error('Gimenez not found');

  const gimRedFlags: string[] = [
    '[fec] $467,245 lifetime pro-Israel lobby money ($102,913 direct PACs + $344,886 from pro-Israel registry bundlers + $19K other).',
    '[fec] $39,700 direct from AIPAC PAC across 31 contributions (C00797670).',
    '[fec] $28,963 direct from Republican Jewish Coalition PAC across 32 contributions (C00345132).',
    '[fec] $15,500 direct from U.S. Israel PAC across 6 contributions.',
    '[fec] $11.86M total lifetime receipts — deep incumbent fundraising base across 4 cycles (2020-2026).',
    '[votes] 22 of 34 Israel-category votes aligned with Israel-lobby position (65% alignment rate) per GovTrack Congress.gov pull.',
  ];

  const gimPositiveFlags: string[] = [
    '[fec] No single cycle receipts > $5M — not in "owned" tier ($5M+).',
    '[fec] No self-funding red flag — candidate contributed $0 to own committees.',
  ];

  await s.from('politicians').update({
    source_ids: {
      ...(gim.source_ids as Record<string, unknown>),
      donation_status: 'PRO-ISRAEL LOBBY (BOUGHT TIER — $467K lifetime)',
      positive_flags: gimPositiveFlags,
      red_flags: gimRedFlags,
      opponent_2026: { name: 'Phil Ehr (D)', fec_id: 'H4FL28042', bioguide_id: 'fl-house-2026-phil-ehr' },
    },
    updated_at: new Date().toISOString(),
  }).eq('bioguide_id', '79bc66ef-4488-439e-af4b-ab6de865364d');

  console.log('Done. Both rows updated.');

  // Verify
  const { data: verify } = await s.from('politicians').select('bioguide_id,name,corruption_score,total_funds,israel_lobby_total,source_ids').in('bioguide_id', ['fl-house-2026-phil-ehr', '79bc66ef-4488-439e-af4b-ab6de865364d']);
  for (const r of verify || []) {
    console.log(`\n${r.name}:`);
    console.log(`  score=${r.corruption_score} | total_funds=$${(r.total_funds || 0).toLocaleString()} | israel_lobby_total=$${(r.israel_lobby_total || 0).toLocaleString()}`);
    console.log(`  donation_status: ${(r.source_ids as Record<string, string>)?.donation_status || '(unset)'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
