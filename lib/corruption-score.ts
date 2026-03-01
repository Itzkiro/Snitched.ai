/**
 * Corruption Score v1 Algorithm
 * =============================
 * Computes a data-driven corruption/influence score (0-100) for politicians.
 *
 * Input signals (weighted):
 *   1. PAC/Lobby Contribution Ratio (30%) — what % of funding comes from PACs
 *      vs individual donors. Higher PAC dependence = higher score.
 *   2. Lobbying Connections (20%) — how many lobbyist registrations link to them.
 *      More lobbying connections = higher score.
 *   3. Voting Alignment with Donor Interests (25%) — do they vote in ways that
 *      benefit their biggest donors. Placeholder until voting data flows in.
 *   4. Transparency Score (10%) — how much data is publicly available, do they
 *      disclose, are FEC records complete.
 *   5. Campaign Finance Red Flags (15%) — FEC complaints, suspicious donation
 *      patterns (concentration from single sources, large last-minute donations).
 *
 * Output:
 *   - Score 0-100 (0 = clean, 100 = maximally corrupt/influenced)
 *   - Letter grade: A (0-20), B (21-40), C (41-60), D (61-80), F (81-100)
 *   - Factor breakdown showing which signals contributed most
 *   - Confidence level (high/medium/low) based on data completeness
 *
 * Design principle: The algorithm improves as more data sources come online.
 * Factors with missing data contribute a neutral placeholder score and reduce
 * the confidence level rather than inflating or deflating the final score.
 */

import type {
  Politician,
  CorruptionScoreResult,
  CorruptionFactor,
  CorruptionGrade,
  CorruptionConfidence,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Neutral score used when data is not available for a factor */
const PLACEHOLDER_SCORE = 30;

/** Weight configuration — must sum to 1.0 */
const WEIGHTS = {
  pacContributionRatio: 0.30,
  lobbyingConnections: 0.20,
  votingAlignment: 0.25,
  transparency: 0.10,
  campaignFinanceRedFlags: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Factor 1: PAC / Lobby Contribution Ratio (30%)
// ---------------------------------------------------------------------------

/**
 * Measures how dependent a politician is on PAC and special-interest money
 * vs grassroots individual donations.
 *
 * Scoring logic:
 * - 100% individual donors = score 0 (clean)
 * - 100% PAC/corporate donors = score 100
 * - Israel-lobby PAC money is weighted 1.5x because it represents a specific
 *   foreign-interest influence channel
 *
 * For politicians with no funding data, returns placeholder with dataAvailable=false.
 */
function scorePacContributionRatio(p: Politician): CorruptionFactor {
  const breakdown = p.contributionBreakdown;
  const totalRaised = p.totalFundsRaised ?? 0;

  if (!breakdown || totalRaised === 0) {
    return {
      key: 'pacContributionRatio',
      label: 'PAC/Lobby Funding Ratio',
      rawScore: PLACEHOLDER_SCORE,
      weight: WEIGHTS.pacContributionRatio,
      weightedScore: PLACEHOLDER_SCORE * WEIGHTS.pacContributionRatio,
      dataAvailable: false,
      explanation: 'No campaign finance data available yet.',
    };
  }

  const pacTotal = breakdown.aipac + breakdown.otherPACs + breakdown.corporate;
  const individualTotal = breakdown.individuals;

  // Base ratio: what percentage of funds come from PACs/corporate
  let pacRatio = pacTotal / totalRaised;
  pacRatio = Math.min(1, Math.max(0, pacRatio));

  // Bonus penalty for Israel-lobby concentration specifically
  const israelLobbyRatio = (p.israelLobbyTotal ?? 0) / totalRaised;
  const israelPenalty = Math.min(20, israelLobbyRatio * 100 * 1.5);

  // Individual donor ratio acts as a "clean" signal
  const individualRatio = individualTotal / totalRaised;
  const individualCredit = Math.min(15, individualRatio * 20);

  // Raw score: PAC ratio scaled to 0-100 + Israel penalty - individual credit
  let rawScore = Math.round(pacRatio * 65 + israelPenalty - individualCredit);
  rawScore = Math.min(100, Math.max(0, rawScore));

  const pacPct = (pacRatio * 100).toFixed(1);
  const israelPct = (israelLobbyRatio * 100).toFixed(1);

  return {
    key: 'pacContributionRatio',
    label: 'PAC/Lobby Funding Ratio',
    rawScore,
    weight: WEIGHTS.pacContributionRatio,
    weightedScore: Math.round(rawScore * WEIGHTS.pacContributionRatio * 10) / 10,
    dataAvailable: true,
    explanation: `${pacPct}% of $${formatMoney(totalRaised)} from PACs/corporate sources. ${israelPct}% from Israel lobby.`,
  };
}

// ---------------------------------------------------------------------------
// Factor 2: Lobbying Connections (20%)
// ---------------------------------------------------------------------------

/**
 * Measures lobbying activity connected to this politician.
 *
 * Scoring logic:
 * - Counts unique lobbying filings, unique clients, total lobbying income
 * - More connections = higher score
 * - Scaled relative to typical lobbying activity levels
 *
 * Currently uses data from LobbyingRecord[] on the politician. Falls back
 * to placeholder when lobbying data has not been ingested.
 */
function scoreLobbyingConnections(p: Politician): CorruptionFactor {
  const records = p.lobbyingRecords ?? [];

  if (records.length === 0) {
    return {
      key: 'lobbyingConnections',
      label: 'Lobbying Connections',
      rawScore: PLACEHOLDER_SCORE,
      weight: WEIGHTS.lobbyingConnections,
      weightedScore: PLACEHOLDER_SCORE * WEIGHTS.lobbyingConnections,
      dataAvailable: false,
      explanation: 'Lobbying disclosure data not yet linked to this politician.',
    };
  }

  const uniqueClients = new Set(records.map(r => r.clientName)).size;
  const uniqueRegistrants = new Set(records.map(r => r.registrantName)).size;
  const totalIncome = records.reduce((sum, r) => sum + (r.income ?? 0), 0);

  // Score components (each 0-33, sum up to ~100):
  // 1. Filing volume: 10+ filings = max (33)
  const filingScore = Math.min(33, (records.length / 10) * 33);
  // 2. Client diversity: 5+ unique clients = max (33)
  const clientScore = Math.min(33, (uniqueClients / 5) * 33);
  // 3. Income magnitude: $1M+ lobbying income = max (34)
  const incomeScore = Math.min(34, (totalIncome / 1_000_000) * 34);

  const rawScore = Math.round(filingScore + clientScore + incomeScore);

  return {
    key: 'lobbyingConnections',
    label: 'Lobbying Connections',
    rawScore: Math.min(100, rawScore),
    weight: WEIGHTS.lobbyingConnections,
    weightedScore: Math.round(Math.min(100, rawScore) * WEIGHTS.lobbyingConnections * 10) / 10,
    dataAvailable: true,
    explanation: `${records.length} filings, ${uniqueClients} clients, ${uniqueRegistrants} firms, $${formatMoney(totalIncome)} lobbying income.`,
  };
}

// ---------------------------------------------------------------------------
// Factor 3: Voting Alignment with Donor Interests (25%)
// ---------------------------------------------------------------------------

/**
 * Measures whether a politician's voting record aligns with their biggest
 * donors' interests.
 *
 * This is the most complex signal and requires:
 * - Voting records (from Congress.gov or LegiScan)
 * - Donor-interest mapping (which bills benefit which donors)
 *
 * For v1, this is largely placeholder. We DO check:
 * - Whether the politician has ANY voting records loaded
 * - Basic proxy: if they have high Israel-lobby funding AND vote on
 *   Israel-related bills, we flag that correlation
 *
 * This factor will improve dramatically once we have:
 * - Bill categorization (defense, foreign aid, etc.)
 * - Donor interest mapping
 * - Roll call vote analysis
 */
function scoreVotingAlignment(p: Politician): CorruptionFactor {
  const votes = p.votes ?? [];
  const hasVoteData = votes.length > 0;

  if (!hasVoteData) {
    return {
      key: 'votingAlignment',
      label: 'Voting Alignment with Donors',
      rawScore: PLACEHOLDER_SCORE,
      weight: WEIGHTS.votingAlignment,
      weightedScore: PLACEHOLDER_SCORE * WEIGHTS.votingAlignment,
      dataAvailable: false,
      explanation: 'Voting records not yet analyzed. Score will update when Congress.gov/LegiScan data is linked.',
    };
  }

  // Basic v1 analysis: proxy via Israel-lobby funding + pro-Israel vote patterns
  const israelFundingRatio = (p.totalFundsRaised ?? 0) > 0
    ? (p.israelLobbyTotal ?? 0) / (p.totalFundsRaised ?? 1)
    : 0;

  // Check for Israel/defense-related votes
  const israelKeywords = ['israel', 'iron dome', 'jerusalem', 'palestinian', 'hamas', 'hezbollah', 'antisemit'];
  const defenseKeywords = ['defense', 'military', 'arms', 'weapon', 'nato', 'aid'];

  const israelVotes = votes.filter(v =>
    israelKeywords.some(kw => v.billTitle.toLowerCase().includes(kw) || v.billSummary.toLowerCase().includes(kw))
  );
  const defenseVotes = votes.filter(v =>
    defenseKeywords.some(kw => v.billTitle.toLowerCase().includes(kw) || v.billSummary.toLowerCase().includes(kw))
  );

  let rawScore = PLACEHOLDER_SCORE;

  if (israelFundingRatio > 0.05 && israelVotes.length > 0) {
    // High Israel funding + voting on Israel bills = potential alignment
    const yesVotes = israelVotes.filter(v => v.voteValue === 'Yes').length;
    const alignmentRate = yesVotes / israelVotes.length;
    rawScore = Math.round(alignmentRate * 60 + israelFundingRatio * 200);
    rawScore = Math.min(100, rawScore);
  } else if (defenseVotes.length > 0) {
    // Some defense voting data available
    rawScore = Math.round(PLACEHOLDER_SCORE + defenseVotes.length * 2);
    rawScore = Math.min(70, rawScore);
  }

  return {
    key: 'votingAlignment',
    label: 'Voting Alignment with Donors',
    rawScore: Math.min(100, rawScore),
    weight: WEIGHTS.votingAlignment,
    weightedScore: Math.round(Math.min(100, rawScore) * WEIGHTS.votingAlignment * 10) / 10,
    dataAvailable: true,
    explanation: `${votes.length} votes analyzed. ${israelVotes.length} Israel-related, ${defenseVotes.length} defense-related bills.`,
  };
}

// ---------------------------------------------------------------------------
// Factor 4: Transparency Score (10%)
// ---------------------------------------------------------------------------

/**
 * Measures how transparent/accessible a politician's records are.
 *
 * A LOWER transparency score means MORE corrupt behavior (hiding things).
 * We invert it so that high opacity = high corruption score contribution.
 *
 * Checks:
 * - FEC data completeness (detailed vs total-only vs none)
 * - Social media presence (politicians who are transparent usually have public accounts)
 * - Source IDs available (bioguide, govtrack, opensecrets, etc.)
 * - Whether contributions have itemized records
 */
function scoreTransparency(p: Politician): CorruptionFactor {
  let transparencyPoints = 0;
  let maxPoints = 0;

  // FEC data completeness (0-30 points)
  maxPoints += 30;
  if (p.dataSource?.includes('api.open.fec.gov')) {
    transparencyPoints += 30; // Full FEC data
  } else if (p.dataSource?.includes('total raised only')) {
    transparencyPoints += 15; // Partial FEC data
  } else if (p.dataSource?.includes('FEC API')) {
    transparencyPoints += 10; // Has FEC ID but no data
  }
  // State/local with no FEC obligation: don't penalize
  const isFederal = p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative';
  if (!isFederal) {
    transparencyPoints += 15; // Neutral - FEC doesn't apply
  }

  // Source IDs available (0-20 points)
  maxPoints += 20;
  const sourceIds = p.source_ids ?? {};
  const idCount = [sourceIds.bioguide_id, sourceIds.govtrack_id, sourceIds.opensecrets_id, sourceIds.fec_candidate_id, sourceIds.votesmart_id]
    .filter(Boolean).length;
  transparencyPoints += Math.min(20, idCount * 4);

  // Social media presence (0-20 points)
  maxPoints += 20;
  const social = p.socialMedia ?? {};
  const socialCount = [social.twitterHandle, social.facebookPageUrl || social.facebookPageId, social.instagramHandle, social.youtubeChannelId]
    .filter(Boolean).length;
  transparencyPoints += Math.min(20, socialCount * 5);

  // Itemized contribution records (0-30 points)
  maxPoints += 30;
  const contributions = p.contributions ?? [];
  if (contributions.length >= 50) {
    transparencyPoints += 30;
  } else if (contributions.length >= 10) {
    transparencyPoints += 20;
  } else if (contributions.length > 0) {
    transparencyPoints += 10;
  }

  // Invert: high transparency = low corruption score
  const transparencyRatio = maxPoints > 0 ? transparencyPoints / maxPoints : 0.5;
  // 100% transparent = score 0, 0% transparent = score 100
  const rawScore = Math.round((1 - transparencyRatio) * 100);

  const hasAnyData = idCount > 0 || contributions.length > 0 || socialCount > 0;

  return {
    key: 'transparency',
    label: 'Transparency & Disclosure',
    rawScore,
    weight: WEIGHTS.transparency,
    weightedScore: Math.round(rawScore * WEIGHTS.transparency * 10) / 10,
    dataAvailable: hasAnyData,
    explanation: `${transparencyPoints}/${maxPoints} transparency points. ${idCount} public IDs, ${socialCount} social accounts, ${contributions.length} itemized records.`,
  };
}

// ---------------------------------------------------------------------------
// Factor 5: Campaign Finance Red Flags (15%)
// ---------------------------------------------------------------------------

/**
 * Detects suspicious patterns in campaign finance data.
 *
 * Red flags include:
 * - Extreme donor concentration (single donor is >20% of total)
 * - High PAC-to-individual ratio (>60% from PACs)
 * - Large Israel-lobby percentage (>10%)
 * - Very few but very large donations (suggests bundling)
 * - Mismatched data (has FEC ID but $0 raised — could indicate obfuscation)
 */
function scoreCampaignFinanceRedFlags(p: Politician): CorruptionFactor {
  const totalRaised = p.totalFundsRaised ?? 0;
  const breakdown = p.contributionBreakdown;
  const contributions = p.contributions ?? [];

  if (totalRaised === 0 && !breakdown) {
    return {
      key: 'campaignFinanceRedFlags',
      label: 'Campaign Finance Red Flags',
      rawScore: PLACEHOLDER_SCORE,
      weight: WEIGHTS.campaignFinanceRedFlags,
      weightedScore: PLACEHOLDER_SCORE * WEIGHTS.campaignFinanceRedFlags,
      dataAvailable: false,
      explanation: 'No campaign finance data to analyze for red flags.',
    };
  }

  let redFlagPoints = 0;
  const flags: string[] = [];

  // Red flag 1: Donor concentration (0-25 points)
  if (p.top5Donors && p.top5Donors.length > 0 && totalRaised > 0) {
    const topDonorAmount = p.top5Donors[0].amount;
    const topDonorPct = topDonorAmount / totalRaised;
    if (topDonorPct > 0.20) {
      redFlagPoints += 25;
      flags.push(`Top donor is ${(topDonorPct * 100).toFixed(1)}% of total`);
    } else if (topDonorPct > 0.10) {
      redFlagPoints += 15;
      flags.push(`Top donor is ${(topDonorPct * 100).toFixed(1)}% of total`);
    }
  }

  // Red flag 2: High PAC ratio (0-25 points)
  if (breakdown && totalRaised > 0) {
    const pacRatio = (breakdown.aipac + breakdown.otherPACs + breakdown.corporate) / totalRaised;
    if (pacRatio > 0.60) {
      redFlagPoints += 25;
      flags.push(`${(pacRatio * 100).toFixed(0)}% from PACs/corporate`);
    } else if (pacRatio > 0.40) {
      redFlagPoints += 15;
      flags.push(`${(pacRatio * 100).toFixed(0)}% from PACs/corporate`);
    }
  }

  // Red flag 3: Israel lobby concentration (0-25 points)
  if (totalRaised > 0) {
    const israelRatio = (p.israelLobbyTotal ?? 0) / totalRaised;
    if (israelRatio > 0.15) {
      redFlagPoints += 25;
      flags.push(`${(israelRatio * 100).toFixed(1)}% from Israel lobby`);
    } else if (israelRatio > 0.08) {
      redFlagPoints += 15;
      flags.push(`${(israelRatio * 100).toFixed(1)}% from Israel lobby`);
    } else if (israelRatio > 0.03) {
      redFlagPoints += 8;
      flags.push(`${(israelRatio * 100).toFixed(1)}% from Israel lobby`);
    }
  }

  // Red flag 4: Low contribution count with high totals (possible bundling) (0-15 points)
  if (contributions.length > 0 && totalRaised > 0) {
    const avgContribution = totalRaised / contributions.length;
    if (avgContribution > 10000) {
      redFlagPoints += 15;
      flags.push(`Avg contribution $${formatMoney(avgContribution)} (possible bundling)`);
    } else if (avgContribution > 5000) {
      redFlagPoints += 8;
    }
  }

  // Red flag 5: Has FEC candidate ID but $0 raised (possible data obfuscation) (0-10 points)
  if (p.source_ids?.fec_candidate_id && totalRaised === 0) {
    redFlagPoints += 10;
    flags.push('Has FEC ID but $0 raised — records may be incomplete');
  }

  const rawScore = Math.min(100, redFlagPoints);

  return {
    key: 'campaignFinanceRedFlags',
    label: 'Campaign Finance Red Flags',
    rawScore,
    weight: WEIGHTS.campaignFinanceRedFlags,
    weightedScore: Math.round(rawScore * WEIGHTS.campaignFinanceRedFlags * 10) / 10,
    dataAvailable: totalRaised > 0 || contributions.length > 0,
    explanation: flags.length > 0
      ? `${flags.length} red flag(s): ${flags.join('; ')}.`
      : 'No red flags detected in available finance data.',
  };
}

// ---------------------------------------------------------------------------
// Grade & Confidence Computation
// ---------------------------------------------------------------------------

function computeGrade(score: number): CorruptionGrade {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

function computeConfidence(factors: CorruptionFactor[]): CorruptionConfidence {
  const availableCount = factors.filter(f => f.dataAvailable).length;
  const availableWeight = factors
    .filter(f => f.dataAvailable)
    .reduce((sum, f) => sum + f.weight, 0);

  // High confidence: 4-5 factors with data OR >80% weight coverage
  if (availableCount >= 4 || availableWeight >= 0.80) return 'high';
  // Medium confidence: 2-3 factors with data OR >40% weight coverage
  if (availableCount >= 2 || availableWeight >= 0.40) return 'medium';
  // Low confidence: 0-1 factors
  return 'low';
}

function computeDataCompleteness(factors: CorruptionFactor[]): number {
  const availableWeight = factors
    .filter(f => f.dataAvailable)
    .reduce((sum, f) => sum + f.weight, 0);
  return Math.round(availableWeight * 100);
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
}

// ---------------------------------------------------------------------------
// Main: Compute Corruption Score
// ---------------------------------------------------------------------------

/**
 * Compute the corruption/influence score for a politician.
 *
 * This is the main entry point. It runs all five scoring factors, combines
 * them with their weights, and produces a final score with breakdown.
 *
 * @param politician - The Politician object with whatever data is available
 * @returns Full CorruptionScoreResult with score, grade, confidence, and factors
 */
export function computeCorruptionScore(politician: Politician): CorruptionScoreResult {
  // Run all five scoring factors
  const factors: CorruptionFactor[] = [
    scorePacContributionRatio(politician),
    scoreLobbyingConnections(politician),
    scoreVotingAlignment(politician),
    scoreTransparency(politician),
    scoreCampaignFinanceRedFlags(politician),
  ];

  // Compute weighted total score
  const totalScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
  const score = Math.round(Math.min(100, Math.max(0, totalScore)));

  return {
    score,
    grade: computeGrade(score),
    confidence: computeConfidence(factors),
    dataCompleteness: computeDataCompleteness(factors),
    factors,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Get a human-readable color for a corruption grade.
 * Useful for UI rendering.
 */
export function getGradeColor(grade: CorruptionGrade): string {
  switch (grade) {
    case 'A': return '#10b981'; // green
    case 'B': return '#22c55e'; // light green
    case 'C': return '#f59e0b'; // amber
    case 'D': return '#ef4444'; // red
    case 'F': return '#dc2626'; // dark red
  }
}

/**
 * Get a human-readable label for a confidence level.
 */
export function getConfidenceLabel(confidence: CorruptionConfidence): string {
  switch (confidence) {
    case 'high': return 'High Confidence';
    case 'medium': return 'Medium Confidence';
    case 'low': return 'Low Confidence — Limited Data';
  }
}

/**
 * Get a color for the confidence level indicator.
 */
export function getConfidenceColor(confidence: CorruptionConfidence): string {
  switch (confidence) {
    case 'high': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'low': return '#6b7280';
  }
}
