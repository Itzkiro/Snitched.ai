#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * One-off corruption-score recomputation for the two OH 2026 governor
 * candidates (Vivek Ramaswamy and Amy Acton) using an EXTENDED rubric:
 *
 *   1. legalRedFlags (25%)  — court_records, severity-classified
 *   2. selfFunding (15%)    — % of funds from candidate's own pocket
 *   3. socialStance (40%)   — hand-coded press-known positions, including
 *                             "always silent on war" penalty
 *   4. existingFactors (20%) — re-uses the existing computeCorruptionScore
 *                              for PAC ratio / lobbying / donor forensics
 *
 * Stance positions are HAND-CODED here — Vivek and Acton are well-documented
 * public figures. Edit the STANCES table to override.
 *
 * Does NOT touch lib/corruption-score.ts so the other ~6,729 politicians are
 * unaffected. Once this rubric is validated it can be promoted into the
 * shared algorithm.
 *
 * Usage:
 *   npx tsx scripts/score-vivek-acton.ts --dry-run
 *   npx tsx scripts/score-vivek-acton.ts --write
 */

import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

// ---------------------------------------------------------------------------
// Stance rubric — hand-coded per candidate from public record
// ---------------------------------------------------------------------------

interface Stances {
  proIsrael: boolean;          // +10
  proWar: boolean;             // +10
  silentOnWar: boolean;        // +5  (silent OR skeptical-but-not-actively-condemning — "why wouldn't they condemn?")
  proAiDataCenters: boolean;   // +5
  proForeignAid: boolean;      // +5
  proOverdevelopment: boolean; // +5
  proCovidMeasures: boolean;   // +15 (gov-mandated shutdowns / mask mandates / gathering bans / vaccine mandates)
  notes: string;               // citation / basis
}

const STANCES: Record<string, Stances> = {
  'oh-gov-2026-vivek-ramaswamy': {
    proIsrael: true,           // user override (originally mixed; user said call him pro)
    proWar: false,             // anti-Ukraine intervention, anti-foreign wars (2024 prez run)
    silentOnWar: true,         // skeptical of US involvement but does not actively CONDEMN the wars (Russia-Ukraine, Israel-Gaza) — fires under broadened rule
    proAiDataCenters: true,    // founded biotech/tech entities; pro-AI buildout
    proForeignAid: false,      // explicit anti-foreign-aid stance
    proOverdevelopment: false, // no clear pro stance
    proCovidMeasures: false,   // vocally anti-mandate / anti-shutdown during 2024 prez run
    notes: '2024 prez campaign positions; user override on Israel; skeptical-but-not-condemning on wars',
  },
  'oh-gov-2026-amy-acton': {
    proIsrael: false,
    proWar: false,
    silentOnWar: true,         // public-health background, no foreign-policy posts on record
    proAiDataCenters: false,
    proForeignAid: false,
    proOverdevelopment: false,
    proCovidMeasures: true,    // OH health director who issued the gym/festival/abortion-clinic shutdowns and gathering bans (2020-2021)
    notes: 'Ex-OH health director; public-health focus; pro-shutdown / pro-mandate during COVID',
  },
};

// Hand-set self-funding amounts (CSVs / OH SOS won't show this; press-reported).
const SELF_FUNDING: Record<string, number> = {
  'oh-gov-2026-vivek-ramaswamy': 30_000_000, // pledged $30M+ of personal funds
  'oh-gov-2026-amy-acton': 0,                // grassroots, no self-funding reported
};

// Per-candidate court-classification mode:
//   'always-official' — every case where they're named defendant scored as 0pt
//   'never-official'  — disable the official-capacity carve-out entirely; every
//                       case scored by severity (policy harm counts as red flag)
//   'auto'            — keyword-based detection (default)
type CourtMode = 'always-official' | 'never-official' | 'auto';
const COURT_MODE: Record<string, CourtMode> = {
  // Acton: her COVID-era policy harm (gym shutdowns, festival bans,
  // abortion-clinic closures) should count as legal red flags AND her
  // pro-COVID stance. Disable the official-capacity carve-out completely.
  'oh-gov-2026-amy-acton': 'never-official',
  'oh-gov-2026-vivek-ramaswamy': 'auto',
};

// ---------------------------------------------------------------------------
// Court severity classifier
// ---------------------------------------------------------------------------

interface CourtSeverity { severity: 'critical' | 'high' | 'medium' | 'low' | 'official'; points: number; reason: string; }

/**
 * Detects cases brought against the politician in their OFFICIAL capacity
 * (e.g., regulatory orders, public-health shutdowns) — not personal corruption.
 * Pattern: "X v. [LastName]" + regulatory/public-health/emergency-order context.
 */
function isOfficialCapacity(rec: Record<string, unknown>, candidateName: string, mode: CourtMode): boolean {
  if (mode === 'never-official') return false;  // policy harm counts — score by severity
  const blob = `${rec.case_name || ''} ${rec.case_name_short || ''} ${rec.cause || ''} ${rec.nature_of_suit || ''}`.toLowerCase();
  const lastName = candidateName.split(/\s+/).pop()!.toLowerCase();
  const namedAsDefendant = new RegExp(`v\\.\\s*(amy\\s+)?${lastName}\\b`, 'i').test(blob);
  if (mode === 'always-official' && namedAsDefendant) return true;
  const officialContext = /shutdown|stay.?at.?home|emergency order|public health order|gathering|festival|fitness|gym|reopen|business closure|covid|coronavirus|pandemic|director of (the )?(ohio )?department of health|abortion|preterm|odh|department of health|in (his|her) official capacity/i.test(blob);
  return namedAsDefendant && officialContext;
}

function classifyCourtRecord(rec: Record<string, unknown>, candidateName: string, mode: CourtMode): CourtSeverity {
  if (isOfficialCapacity(rec, candidateName, mode)) {
    return { severity: 'official', points: 0, reason: 'official capacity (regulatory / public-health order) — not personal corruption' };
  }
  const blob = `${rec.case_name || ''} ${rec.case_name_short || ''} ${rec.cause || ''} ${rec.nature_of_suit || ''}`.toLowerCase();

  // Critical (40pt): RICO, securities fraud, indictment, bribery, conviction
  if (/\brico\b|securities fraud|indict|bribery|conviction|convicted|federal corruption/i.test(blob)) {
    return { severity: 'critical', points: 40, reason: 'RICO / securities fraud / indictment / bribery' };
  }
  // High (25pt): pump-and-dump, wire/mail fraud, ethics violation, lobbying-without-registration, sec violations
  if (/pump.?and.?dump|wire fraud|mail fraud|ethics violation|lobbying.*without|unregistered lobby|sec violation|sec law|securities law/i.test(blob)) {
    return { severity: 'high', points: 25, reason: 'pump-and-dump / fraud / ethics / unregistered lobbying' };
  }
  // Medium (15pt): civil rights, harassment, retaliation, TCPA, whistleblower
  if (/harassment|retaliation|civil rights|tcpa|telephone consumer protection|whistleblower|discrimination/i.test(blob)) {
    return { severity: 'medium', points: 15, reason: 'harassment / TCPA / civil rights / retaliation' };
  }
  // Low (5pt): everything else
  return { severity: 'low', points: 5, reason: 'routine / contract / other' };
}

// ---------------------------------------------------------------------------
// Factor scorers (return raw 0-100 so weights map cleanly)
// ---------------------------------------------------------------------------

function scoreLegalRedFlags(courtRecords: Array<Record<string, unknown>>, candidateName: string, mode: CourtMode): { raw: number; details: { name: string; severity: string; points: number }[] } {
  const details: { name: string; severity: string; points: number }[] = [];
  let total = 0;
  for (const r of courtRecords) {
    const c = classifyCourtRecord(r, candidateName, mode);
    details.push({ name: String(r.case_name || r.case_name_short || 'unknown'), severity: c.severity, points: c.points });
    total += c.points;
  }
  return { raw: Math.min(100, total), details };
}

function scoreSelfFunding(selfFundingAmount: number, totalFunds: number): { raw: number; pct: number } {
  if (totalFunds <= 0) return { raw: 0, pct: 0 };
  const pct = selfFundingAmount / totalFunds;
  // > 50% self-funded = full penalty (100); linear ramp from 0 → 100 between 0% and 50%
  const raw = Math.min(100, Math.round(pct * 200));
  return { raw, pct };
}

function scoreSocialStance(s: Stances): { raw: number; firedFlags: string[]; subtotal: number } {
  const fired: string[] = [];
  let pts = 0;
  if (s.proIsrael)           { pts += 10; fired.push('pro-Israel (+10)'); }
  if (s.proWar)              { pts += 10; fired.push('pro-war / pro-intervention (+10)'); }
  if (s.silentOnWar)         { pts +=  5; fired.push('always silent on war (+5)'); }
  if (s.proAiDataCenters)    { pts +=  5; fired.push('pro AI data center buildout (+5)'); }
  if (s.proForeignAid)       { pts +=  5; fired.push('pro foreign aid / influence (+5)'); }
  if (s.proOverdevelopment)  { pts +=  5; fired.push('pro overdevelopment (+5)'); }
  if (s.proCovidMeasures)    { pts += 15; fired.push('pro COVID measures (shutdowns / mandates / bans) (+15)'); }
  // Max possible = 55. Scale to 0-100 raw so weights work uniformly.
  return { raw: Math.round((pts / 55) * 100), firedFlags: fired, subtotal: pts };
}

// ---------------------------------------------------------------------------
// Combined score
// ---------------------------------------------------------------------------

const WEIGHTS = {
  legal: 0.25,
  self: 0.15,
  stance: 0.40,
  existing: 0.20,
};

function gradeFor(score: number): string {
  if (score >= 80) return 'F';
  if (score >= 60) return 'D';
  if (score >= 40) return 'C';
  if (score >= 20) return 'B';
  return 'A';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || !argv.includes('--write');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('='.repeat(70));
  console.log('  EXTENDED-RUBRIC SCORING: Vivek Ramaswamy + Amy Acton');
  console.log('='.repeat(70));
  console.log(dryRun ? '  [DRY RUN — no DB write]\n' : '  [LIVE — writing to Supabase]\n');

  for (const bioguideId of Object.keys(STANCES)) {
    const { data: pol, error } = await supabase
      .from('politicians').select('*').eq('bioguide_id', bioguideId).single();
    if (error || !pol) { console.error(`Skip ${bioguideId}: ${error?.message}`); continue; }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`${pol.name} (${bioguideId})`);
    console.log(`${'─'.repeat(70)}`);

    // 1. Legal red flags
    const courts = (pol.court_records || []) as Array<Record<string, unknown>>;
    const legal = scoreLegalRedFlags(courts, pol.name, COURT_MODE[bioguideId] ?? 'auto');
    const legalWeighted = legal.raw * WEIGHTS.legal;
    console.log(`\n[legal] ${courts.length} records → raw ${legal.raw}/100, weighted ${legalWeighted.toFixed(1)}`);
    for (const d of legal.details) console.log(`  - ${d.severity.padEnd(8)} ${d.points}pt  ${d.name.slice(0, 80)}`);

    // 2. Self funding
    const selfAmt = SELF_FUNDING[bioguideId] ?? 0;
    const totalFunds = Number(pol.total_funds) || 0;
    const self = scoreSelfFunding(selfAmt, totalFunds);
    const selfWeighted = self.raw * WEIGHTS.self;
    console.log(`\n[self]  $${selfAmt.toLocaleString()} of $${totalFunds.toLocaleString()} (${(self.pct * 100).toFixed(1)}%) → raw ${self.raw}/100, weighted ${selfWeighted.toFixed(1)}`);

    // 3. Social stance
    const stances = STANCES[bioguideId];
    const stance = scoreSocialStance(stances);
    const stanceWeighted = stance.raw * WEIGHTS.stance;
    console.log(`\n[stance] ${stance.subtotal}/55 raw stance pts → raw ${stance.raw}/100, weighted ${stanceWeighted.toFixed(1)}`);
    for (const f of stance.firedFlags) console.log(`  ✓ ${f}`);
    if (stance.firedFlags.length === 0) console.log(`  (no stance penalties)`);
    console.log(`  basis: ${stances.notes}`);

    // 4. Existing factors via current algorithm
    const polForExisting: Politician = {
      id: bioguideId,
      name: pol.name,
      office: pol.office,
      officeLevel: pol.office_level,
      party: pol.party,
      jurisdiction: pol.jurisdiction,
      jurisdictionType: pol.jurisdiction_type,
      corruptionScore: pol.corruption_score,
      juiceBoxTier: pol.juice_box_tier,
      aipacFunding: Number(pol.aipac_funding) || 0,
      totalFundsRaised: totalFunds,
      top5Donors: (pol.top5_donors as Politician['top5Donors']) || [],
      contributionBreakdown: pol.contribution_breakdown || { aipac: 0, otherPACs: 0, individuals: 0, corporate: 0 },
      israelLobbyTotal: Number(pol.israel_lobby_total) || 0,
      israelLobbyBreakdown: pol.israel_lobby_breakdown || { total: 0, pacs: 0, ie: 0, bundlers: 0 },
      isActive: pol.is_active ?? false,
      isCandidate: true,
      runningFor: pol.running_for ?? '',
      tags: [],
      bio: pol.bio,
      socialMedia: pol.social_media || {},
      dataSource: pol.data_source,
      courtCases: [],
      lobbyingRecords: pol.lobbying_records || [],
      votes: [],
    };
    const existing = computeCorruptionScore(polForExisting);
    const existingWeighted = existing.score * WEIGHTS.existing;
    console.log(`\n[existing] computeCorruptionScore → raw ${existing.score}/100, weighted ${existingWeighted.toFixed(1)}`);

    // Combined
    const combined = Math.round(legalWeighted + selfWeighted + stanceWeighted + existingWeighted);
    const finalScore = Math.min(100, Math.max(0, combined));
    const grade = gradeFor(finalScore);
    console.log(`\n${'═'.repeat(40)}`);
    console.log(`  COMBINED: ${pol.corruption_score} → ${finalScore} (grade ${grade})`);
    console.log(`${'═'.repeat(40)}`);

    if (!dryRun) {
      const { error: updErr } = await supabase
        .from('politicians')
        .update({ corruption_score: finalScore, updated_at: new Date().toISOString() })
        .eq('bioguide_id', bioguideId);
      if (updErr) console.error(`  WRITE FAILED: ${updErr.message}`);
      else console.log(`  ✓ Wrote corruption_score=${finalScore}`);
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Nothing written. Re-run with --write to persist.' : 'Done.'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
