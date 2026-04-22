#!/usr/bin/env npx tsx
/**
 * Seed Aaron Baker (FL-06, Republican challenger to Rep. Randy Fine) into the
 * politicians table using the full-audit numbers from data/aaron-baker-audit.json
 * and the public-record positions researched from his campaign site, Floridian
 * Press, and the federal lawsuit (Baker v. Fine, Ocala Division, 2026-02-20).
 *
 * All numbers come directly from FEC API queries — no placeholder values.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE env missing');

const auditPath = path.join(__dirname, '..', 'data', 'aaron-baker-audit.json');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const BIOGUIDE_ID = 'fl-house-2026-aaron-baker';

interface CycleTotal {
  committee_id: string;
  cycle: number;
  receipts?: number;
  individual_contributions?: number;
  other_political_committee_contributions?: number;
  political_party_committee_contributions?: number;
  candidate_contribution?: number;
  last_cash_on_hand_end_period?: number;
  coverage_end_date?: string;
  last_report_type_full?: string;
}
const cycleTotals = audit.totals as CycleTotal[];
const combinedReceipts = cycleTotals.reduce((s, t) => s + (t.receipts || 0), 0);
const combinedIndividuals = cycleTotals.reduce((s, t) => s + (t.individual_contributions || 0), 0);
const combinedPacs = cycleTotals.reduce((s, t) => s + (t.other_political_committee_contributions || 0), 0);
const combinedParty = cycleTotals.reduce((s, t) => s + (t.political_party_committee_contributions || 0), 0);
const combinedCandidate = cycleTotals.reduce((s, t) => s + (t.candidate_contribution || 0), 0);
const cashOnHand = cycleTotals.find(t => t.committee_id === 'C00902478')?.last_cash_on_hand_end_period || 0;

// Top 5 donors — use itemized aggregates (these are the actual top individuals
// identifiable, as FEC reports WinRed as a PAC/conduit for pooled small-dollar)
const topDonors = audit.top_individual_donors.slice(0, 5).map((d: { name: string; total: number; count: number; employer: string }) => ({
  name: d.name,
  type: 'Individual' as const,
  amount: Math.round(d.total),
  is_israel_lobby: false,
  metadata: { count: d.count, employer: d.employer },
}));

// Israel-lobby breakdown — effectively zero; no pro-Israel PAC money.
// Bundler crossref produced 17 matches worth $2,749 total to Baker, but 11 are
// "medium confidence" on common surnames (Smith, Williams, Brown, Johns, Byrd)
// and the 6 high-confidence matches were tiny WinRed platform passthroughs
// ($1,545 Donald Smith FL, $350 Mike Levine FL, and $100-total from 4 others).
// No single bundler > $1.6K. Not a lobby-capture signal.
const israelLobbyBreakdown = {
  total: 0,
  pacs: 0,
  ie: 0,
  bundlers: 0,
  registry_match_total: Math.round(audit.summary.pro_israel_match_to_candidate),
  registry_match_count: audit.summary.pro_israel_matches,
  registry_match_high_confidence: audit.summary.pro_israel_matches_high_confidence,
  cross_reference_notes: 'No real pro-Israel PAC money. Bundler crossref produced 17 matches totaling $2,749 to Baker, but all high-confidence matches were small WinRed passthroughs (<$1,600) from donors whose pro-Israel career giving was modest. Candidate also took $1,500 from Anti-Zionist America PAC (C00916379) — an explicit anti-Israel-lobby stance, not capture.',
};

const contributionBreakdown = {
  aipac: 0,
  corporate: 0,
  otherPACs: Math.round(combinedPacs),
  individuals: Math.round(combinedIndividuals),
  party: Math.round(combinedParty),
  self_funding: Math.round(combinedCandidate),
  anti_zionist_pac: 1500,
};

const polForScoring: Politician = {
  id: BIOGUIDE_ID,
  name: 'Aaron Baker',
  office: 'U.S. House',
  officeLevel: 'Federal Representative',
  party: 'Republican',
  jurisdiction: 'Florida',
  jurisdictionType: 'federal_congressional',
  corruptionScore: 0,
  juiceBoxTier: 'none',
  aipacFunding: 0,
  totalFundsRaised: Math.round(combinedReceipts),
  top5Donors: topDonors,
  contributionBreakdown,
  israelLobbyTotal: 0,
  israelLobbyBreakdown: israelLobbyBreakdown,
  isActive: false,
  tags: ['candidate', '2026-primary', 'challenger', 'grassroots', 'anti-zionist-pac-endorsed'],
  bio: 'Republican challenger to Rep. Randy Fine (R-FL) in the August 18, 2026 primary for Florida\'s 6th Congressional District. Born 1980 in Lakeland, FL; resides in Sorrento, FL. Previously ran in the January 2025 special Republican primary and lost to Randy Fine (who won 83%). Campaign is funded by grassroots small-dollar donors and drew support from Muslim-American donors and the Anti-Zionist America PAC. Filed federal First Amendment lawsuit against Rep. Fine on Feb 20, 2026 in the U.S. District Court for the Middle District of Florida (Ocala Division) over X/Twitter account blocking, represented by attorney Anthony Sabatini. Platform: "America First" domestic priorities; supports Israel\'s Iron Dome defensive aid only while opposing offensive weapons funding; has called Israel\'s Gaza operations "genocidal" and described Rep. Fine as "the genocidal representative of Congress."',
  socialMedia: { twitter: 'https://x.com/Aaron4fl6', website: 'https://aaron4fl6.com/' },
  source_ids: {
    fec_candidate_id: 'H6FL06324',
    fec_candidate_id_2024: 'H6FL06241',
    principal_committee_id: 'C00902478',
    terminated_committee_id: 'C00893289',
    ballotpedia_slug: 'Aaron_Baker_(Florida)',
    donation_status: 'GRASSROOTS / ANTI-LOBBY-CAPTURE',
    positive_flags: [
      '[fec] $0 in pro-Israel PAC contributions across both campaign committees (C00902478 principal + C00893289 terminated) over the 2024 and 2026 cycles.',
      '[fec] $1,500 from Anti-Zionist America PAC (C00916379, AZA-PAC.COM, treasurer LORI R. PRICE, executive director MICHAEL RECTENWALD) on 2025-10-16 — an explicit anti-Israel-lobby endorsement.',
      '[fec] Grassroots individual donor base: 166 unique individual donors, 820 itemized contribution rows, $66,198 total individual contributions. Median donation tiny (~$50); largest individual donor Hassan Shibly, former CAIR-Florida executive director ($1,250).',
      '[public] Called Rep. Randy Fine "the genocidal representative of Congress" and characterized Israel\'s Gaza operations as "genocidal" (Floridian Press, April 2026).',
      '[public] Supports Iron Dome defensive aid to Israel but opposes offensive-weapons funding (Floridian Press, April 2026).',
      '[public] Filed federal First Amendment lawsuit vs. Rep. Fine 2026-02-20 (Ocala Division, M.D. Fla.) over X account blocking — Baker v. Fine, attorney Anthony Sabatini.',
      '[fec] Only $11,802 candidate self-contribution (12 small installments) — rules out affluent-self-funder red flag.',
      '[fec] Pro-Israel registry cross-reference: 17 matches of 166 unique individual donors, $2,749 combined to Baker, no single bundler > $1,600 — no bundler-capture signal.',
    ],
    red_flags: [],
  },
  dataSource: 'baker_audit_2026-04-22',
  courtCases: [],
  lobbyingRecords: [],
  votes: [],
};

const result = computeCorruptionScore(polForScoring);
console.log('\n=== CORRUPTION SCORE RESULT ===');
console.log(`Score:      ${result.score}/100`);
console.log(`Grade:      ${result.grade}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Factors:`);
for (const f of result.factors) {
  console.log(`  ${f.name}: ${Math.round(f.score)}/100 (weight ${f.weight.toFixed(2)}) — ${f.description}`);
}

async function main(): Promise<void> {
  const s = createClient(SUPABASE_URL, SUPABASE_KEY);
  const nowIso = new Date().toISOString();

  // Check if row exists
  const { data: existing } = await s.from('politicians').select('bioguide_id,name').eq('bioguide_id', BIOGUIDE_ID).maybeSingle();

  const payload = {
    bioguide_id: BIOGUIDE_ID,
    name: polForScoring.name,
    office: polForScoring.office,
    office_level: polForScoring.officeLevel,
    party: polForScoring.party,
    district: 'District 06',
    jurisdiction: polForScoring.jurisdiction,
    jurisdiction_type: polForScoring.jurisdictionType,
    photo_url: null,
    corruption_score: result.score,
    aipac_funding: 0,
    juice_box_tier: polForScoring.juiceBoxTier,
    total_funds: polForScoring.totalFundsRaised,
    top5_donors: topDonors,
    israel_lobby_total: 0,
    israel_lobby_breakdown: israelLobbyBreakdown,
    contribution_breakdown: contributionBreakdown,
    is_active: false,
    is_candidate: true,
    running_for: 'U.S. House FL-06 (2026)',
    years_in_office: 0,
    bio: polForScoring.bio,
    term_start: null,
    term_end: null,
    social_media: polForScoring.socialMedia,
    source_ids: polForScoring.source_ids,
    data_source: polForScoring.dataSource,
    lobbying_records: [],
    voting_records: [],
    court_records: [],
    updated_at: nowIso,
  };

  if (existing) {
    console.log(`\nUpdating existing row for ${existing.name}...`);
    const { error } = await s.from('politicians').update(payload).eq('bioguide_id', BIOGUIDE_ID);
    if (error) throw error;
  } else {
    console.log(`\nInserting new row for Aaron Baker...`);
    const { error } = await s.from('politicians').insert({ ...payload, created_at: nowIso });
    if (error) throw error;
  }

  // Verify
  const { data: verify } = await s.from('politicians').select('bioguide_id,name,corruption_score,juice_box_tier,total_funds,aipac_funding,israel_lobby_total,party,district,is_candidate,running_for').eq('bioguide_id', BIOGUIDE_ID).single();
  console.log('\n=== DB ROW VERIFIED ===');
  console.log(JSON.stringify(verify, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
