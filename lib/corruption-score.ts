/**
 * Corruption Score v2 Algorithm
 * =============================
 * Computes a data-driven corruption/influence score (0-100) for politicians.
 *
 * Data sources: FEC API (federal), VoterFocus (county-level), FL Division
 * of Elections (state-level), social media monitoring, lobbying disclosures.
 *
 * Input signals (weighted):
 *   1. PAC/Lobby Contribution Ratio (30%) — what % of funding comes from PACs
 *      vs individual donors. Derives breakdown from top5Donors when full
 *      contributionBreakdown isn't available.
 *   2. Lobbying Connections (20%) — how many lobbyist registrations link to them.
 *   3. Voting Alignment with Donor Interests (25%) — do they vote in ways that
 *      benefit their biggest donors. Placeholder until voting data flows in.
 *   4. Transparency Score (10%) — how much data is publicly available, social
 *      media presence, source IDs available.
 *   5. Campaign Finance Red Flags (15%) — suspicious patterns: self-funding,
 *      donor concentration, PAC ratio, Israel lobby influence.
 *
 * v2 improvements over v1:
 *   - Derives contribution breakdown from top5Donors when available
 *   - Self-funding detection (politician is their own top donor)
 *   - Better transparency scoring for VoterFocus data
 *   - Recognizes data_source field for FEC/VoterFocus/FLDOE
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

/** No data = no score. Placeholders contribute nothing. */
const PLACEHOLDER_SCORE = 0;

/** Weight configuration — must sum to 1.0 */
const BASE_WEIGHTS = {
  pacContributionRatio: 0.30,
  lobbyingConnections: 0.20,
  votingAlignment: 0.25,
  transparency: 0.10,
  campaignFinanceRedFlags: 0.15,
} as const;

/**
 * Dynamically redistribute weight to favor factors with real data.
 * Placeholder factors get reduced weight, real data factors absorb it.
 */
function getAdjustedWeights(dataAvailable: Record<string, boolean>): Record<string, number> {
  const keys = Object.keys(BASE_WEIGHTS) as (keyof typeof BASE_WEIGHTS)[];
  const realKeys = keys.filter(k => dataAvailable[k]);
  const placeholderKeys = keys.filter(k => !dataAvailable[k]);

  const adjusted: Record<string, number> = {};
  for (const k of keys) adjusted[k] = BASE_WEIGHTS[k];

  if (realKeys.length === 0 || realKeys.length === keys.length) return adjusted;

  // Placeholder factors keep 30% of their original weight, rest redistributed
  const PLACEHOLDER_WEIGHT_KEEP = 0.3;
  let redistributed = 0;

  for (const k of placeholderKeys) {
    const reduction = adjusted[k] * (1 - PLACEHOLDER_WEIGHT_KEEP);
    adjusted[k] = adjusted[k] * PLACEHOLDER_WEIGHT_KEEP;
    redistributed += reduction;
  }

  // Distribute to real-data factors proportionally, but cap max weight at 40%
  const MAX_SINGLE_WEIGHT = 0.40;
  const realTotal = realKeys.reduce((s, k) => s + BASE_WEIGHTS[k], 0);
  for (const k of realKeys) {
    adjusted[k] += redistributed * (BASE_WEIGHTS[k] / realTotal);
  }

  // Cap any single factor and redistribute overflow
  let overflow = 0;
  const uncappedKeys: string[] = [];
  for (const k of realKeys) {
    if (adjusted[k] > MAX_SINGLE_WEIGHT) {
      overflow += adjusted[k] - MAX_SINGLE_WEIGHT;
      adjusted[k] = MAX_SINGLE_WEIGHT;
    } else {
      uncappedKeys.push(k);
    }
  }
  if (overflow > 0 && uncappedKeys.length > 0) {
    const uncappedTotal = uncappedKeys.reduce((s, k) => s + adjusted[k], 0);
    for (const k of uncappedKeys) {
      adjusted[k] += overflow * (adjusted[k] / uncappedTotal);
    }
  }

  return adjusted;
}

// Alias for backward compat in factor functions (they read WEIGHTS directly)
// Actual weights are computed dynamically in computeCorruptionScore
const WEIGHTS = BASE_WEIGHTS;

// ---------------------------------------------------------------------------
// Helpers: Derive contribution breakdown from top5Donors
// ---------------------------------------------------------------------------

/**
 * When contributionBreakdown isn't set (e.g., VoterFocus data), derive an
 * approximate breakdown from top5Donors type classification.
 */
function deriveBreakdownFromDonors(p: Politician): {
  individuals: number;
  corporate: number;
  pacs: number;
  aipac: number;
  other: number;
} | null {
  const donors = p.top5Donors ?? [];
  const totalRaised = p.totalFundsRaised ?? 0;

  if (donors.length === 0 || totalRaised === 0) return null;

  let individuals = 0;
  let corporate = 0;
  let pacs = 0;
  let aipac = 0;
  let other = 0;

  for (const d of donors) {
    const amount = d.amount ?? 0;
    switch (d.type) {
      case 'Individual':
        individuals += amount;
        break;
      case 'Corporate':
        corporate += amount;
        break;
      case 'PAC':
        pacs += amount;
        break;
      case 'Israel-PAC':
        aipac += amount;
        pacs += amount;
        break;
      default:
        other += amount;
    }
  }

  // The top 5 donors represent a sample. Extrapolate for the rest.
  const top5Total = donors.reduce((s, d) => s + (d.amount ?? 0), 0);
  const remainder = Math.max(0, totalRaised - top5Total);

  // Assume remainder is proportionally similar to top 5 distribution
  if (top5Total > 0 && remainder > 0) {
    const scale = remainder / top5Total;
    individuals += individuals * scale;
    corporate += corporate * scale;
    pacs += pacs * scale;
    aipac += aipac * scale;
    other += other * scale;
  }

  return { individuals, corporate, pacs, aipac, other };
}

/**
 * Detect if a politician is self-funding heavily.
 * Returns the self-funding amount and percentage if detected.
 */
function detectSelfFunding(p: Politician): { amount: number; percentage: number } {
  const donors = p.top5Donors ?? [];
  const totalRaised = p.totalFundsRaised ?? 0;
  if (donors.length === 0 || totalRaised === 0) return { amount: 0, percentage: 0 };

  const nameParts = p.name.toLowerCase().split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts[0];

  let selfFundingTotal = 0;

  for (const d of donors) {
    const donorName = d.name.toLowerCase();
    // Match: same last name AND (same first name OR type is "Other" which VoterFocus uses for self)
    const donorParts = donorName.split(/\s+/);
    const hasLastName = donorParts.some(part => part === lastName);
    const hasFirstName = donorParts.some(part => part === firstName);

    if (hasLastName && hasFirstName) {
      selfFundingTotal += d.amount;
    }
  }

  return {
    amount: selfFundingTotal,
    percentage: totalRaised > 0 ? selfFundingTotal / totalRaised : 0,
  };
}

// ---------------------------------------------------------------------------
// Factor 1: PAC / Lobby Contribution Ratio (30%)
// ---------------------------------------------------------------------------

function scorePacContributionRatio(p: Politician): CorruptionFactor {
  const breakdown = p.contributionBreakdown;
  const totalRaised = p.totalFundsRaised ?? 0;

  // Try deriving breakdown from top5Donors if not available
  const derived = !breakdown && totalRaised > 0 ? deriveBreakdownFromDonors(p) : null;
  const effectiveBreakdown = breakdown ?? (derived ? {
    aipac: derived.aipac,
    otherPACs: derived.pacs - derived.aipac,
    corporate: derived.corporate,
    individuals: derived.individuals,
  } : null);

  if (!effectiveBreakdown || totalRaised === 0) {
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

  const pacTotal = effectiveBreakdown.aipac + effectiveBreakdown.otherPACs + effectiveBreakdown.corporate;
  const individualTotal = effectiveBreakdown.individuals;

  let pacRatio = pacTotal / totalRaised;
  pacRatio = Math.min(1, Math.max(0, pacRatio));

  const israelLobbyAmount = (p.israelLobbyTotal ?? 0) + (p.aipacFunding ?? 0);
  const israelLobbyRatio = israelLobbyAmount / totalRaised;
  // ANY Israel lobby money = hard penalty (min 30 points)
  const israelPenalty = israelLobbyAmount > 0
    ? Math.max(30, Math.min(50, israelLobbyRatio * 100 * 3))
    : 0;

  const individualRatio = individualTotal / totalRaised;
  const individualCredit = Math.min(15, individualRatio * 20);

  let rawScore = Math.round(pacRatio * 50 + israelPenalty - individualCredit);
  rawScore = Math.min(100, Math.max(0, rawScore));

  const pacPct = (pacRatio * 100).toFixed(1);
  const israelPct = (israelLobbyRatio * 100).toFixed(1);
  const source = breakdown ? 'full breakdown' : 'estimated from top donors';

  return {
    key: 'pacContributionRatio',
    label: 'PAC/Lobby Funding Ratio',
    rawScore,
    weight: WEIGHTS.pacContributionRatio,
    weightedScore: Math.round(rawScore * WEIGHTS.pacContributionRatio * 10) / 10,
    dataAvailable: true,
    explanation: `${pacPct}% of $${formatMoney(totalRaised)} from PACs/corporate (${source}). ${israelPct}% from Israel lobby.`,
  };
}

// ---------------------------------------------------------------------------
// Factor 2: Lobbying Connections (20%)
// ---------------------------------------------------------------------------

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

  const filingScore = Math.min(33, (records.length / 10) * 33);
  const clientScore = Math.min(33, (uniqueClients / 5) * 33);
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

  const israelFundingRatio = (p.totalFundsRaised ?? 0) > 0
    ? (p.israelLobbyTotal ?? 0) / (p.totalFundsRaised ?? 1)
    : 0;

  const israelKeywords = ['israel', 'iron dome', 'jerusalem', 'palestinian', 'hamas', 'hezbollah', 'antisemit'];
  const defenseKeywords = ['defense', 'military', 'arms', 'weapon', 'nato', 'aid'];

  const israelVotes = votes.filter(v =>
    israelKeywords.some(kw => v.billTitle.toLowerCase().includes(kw) || v.billSummary.toLowerCase().includes(kw))
  );
  const defenseVotes = votes.filter(v =>
    defenseKeywords.some(kw => v.billTitle.toLowerCase().includes(kw) || v.billSummary.toLowerCase().includes(kw))
  );

  let rawScore = 0;

  if (israelFundingRatio > 0.05 && israelVotes.length > 0) {
    const yesVotes = israelVotes.filter(v => v.voteValue === 'Yes').length;
    const alignmentRate = yesVotes / israelVotes.length;
    rawScore = Math.round(alignmentRate * 60 + israelFundingRatio * 200);
    rawScore = Math.min(100, rawScore);
  } else if (israelFundingRatio > 0.01 && defenseVotes.length > 0) {
    // Some Israel funding + defense votes — moderate signal
    const yesDefense = defenseVotes.filter(v => v.voteValue === 'Yes').length;
    const defenseAlignment = defenseVotes.length > 0 ? yesDefense / defenseVotes.length : 0;
    rawScore = Math.round(defenseAlignment * 40 + israelFundingRatio * 100);
    rawScore = Math.min(70, rawScore);
  } else if (defenseVotes.length > 0) {
    // No Israel funding but has defense votes — low baseline
    rawScore = Math.round(Math.min(40, defenseVotes.length * 3));
  } else {
    // Has vote data but no Israel/defense votes — low score (good)
    rawScore = Math.round(Math.min(20, votes.length > 10 ? 10 : 15));
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

function scoreTransparency(p: Politician): CorruptionFactor {
  let transparencyPoints = 0;
  let maxPoints = 0;

  // FEC / campaign finance data completeness (0-30 points)
  maxPoints += 30;
  const dataSource = p.dataSource ?? '';
  if (dataSource.includes('api.open.fec.gov') || dataSource === 'fec_api') {
    transparencyPoints += 30; // Full FEC data
  } else if (dataSource === 'voterfocus' || dataSource === 'fldoe') {
    transparencyPoints += 25; // VoterFocus/FLDOE data with real contributions
  } else if (dataSource.includes('total raised only')) {
    transparencyPoints += 15;
  } else if (dataSource.includes('FEC API')) {
    transparencyPoints += 10;
  }
  // State/local with no FEC obligation: partial credit
  const isFederal = p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative';
  if (!isFederal && transparencyPoints < 15) {
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

  // Campaign finance data quality (0-30 points)
  maxPoints += 30;
  const contributions = p.contributions ?? [];
  const totalRaised = p.totalFundsRaised ?? 0;
  const hasDonors = (p.top5Donors?.length ?? 0) > 0;

  if (contributions.length >= 50) {
    transparencyPoints += 30;
  } else if (contributions.length >= 10 || (hasDonors && totalRaised > 0)) {
    transparencyPoints += 20; // Has top donor data even without itemized list
  } else if (contributions.length > 0 || totalRaised > 0) {
    transparencyPoints += 10;
  }

  const transparencyRatio = maxPoints > 0 ? transparencyPoints / maxPoints : 0.5;
  const rawScore = Math.round((1 - transparencyRatio) * 100);

  const hasAnyData = idCount > 0 || contributions.length > 0 || socialCount > 0 || totalRaised > 0 || hasDonors;

  return {
    key: 'transparency',
    label: 'Transparency & Disclosure',
    rawScore,
    weight: WEIGHTS.transparency,
    weightedScore: Math.round(rawScore * WEIGHTS.transparency * 10) / 10,
    dataAvailable: hasAnyData,
    explanation: `${transparencyPoints}/${maxPoints} transparency points. ${idCount} public IDs, ${socialCount} social accounts, ${contributions.length > 0 ? `${contributions.length} itemized records` : hasDonors ? 'top donor data available' : 'no itemized records'}.`,
  };
}

// ---------------------------------------------------------------------------
// Factor 5: Campaign Finance Red Flags (15%)
// ---------------------------------------------------------------------------

function scoreCampaignFinanceRedFlags(p: Politician): CorruptionFactor {
  const totalRaised = p.totalFundsRaised ?? 0;
  const breakdown = p.contributionBreakdown;
  const contributions = p.contributions ?? [];
  const donors = p.top5Donors ?? [];

  if (totalRaised === 0 && !breakdown && donors.length === 0) {
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

  // Red flag 1: Self-funding detection (0-20 points)
  const selfFunding = detectSelfFunding(p);
  if (selfFunding.percentage > 0.50) {
    redFlagPoints += 20;
    flags.push(`${(selfFunding.percentage * 100).toFixed(0)}% self-funded ($${formatMoney(selfFunding.amount)}) — limited grassroots support`);
  } else if (selfFunding.percentage > 0.25) {
    redFlagPoints += 10;
    flags.push(`${(selfFunding.percentage * 100).toFixed(0)}% self-funded ($${formatMoney(selfFunding.amount)})`);
  }

  // Red flag 2: Donor concentration (0-25 points)
  if (donors.length > 0 && totalRaised > 0) {
    const topDonorAmount = donors[0].amount;
    const topDonorPct = topDonorAmount / totalRaised;
    // Skip if top donor is self (already flagged above)
    const nameParts = p.name.toLowerCase().split(/\s+/);
    const isSelfDonor = nameParts.some(part => donors[0].name.toLowerCase().includes(part));

    if (!isSelfDonor) {
      if (topDonorPct > 0.20) {
        redFlagPoints += 25;
        flags.push(`Top donor "${donors[0].name}" is ${(topDonorPct * 100).toFixed(1)}% of total`);
      } else if (topDonorPct > 0.10) {
        redFlagPoints += 15;
        flags.push(`Top donor is ${(topDonorPct * 100).toFixed(1)}% of total`);
      }
    }
  }

  // Red flag 3: High PAC/corporate ratio (0-25 points)
  const derived = deriveBreakdownFromDonors(p);
  const effectiveBreakdown = breakdown ?? (derived ? {
    aipac: derived.aipac,
    otherPACs: derived.pacs - derived.aipac,
    corporate: derived.corporate,
    individuals: derived.individuals,
  } : null);

  if (effectiveBreakdown && totalRaised > 0) {
    const pacRatio = (effectiveBreakdown.aipac + effectiveBreakdown.otherPACs + effectiveBreakdown.corporate) / totalRaised;
    if (pacRatio > 0.60) {
      redFlagPoints += 25;
      flags.push(`${(pacRatio * 100).toFixed(0)}% from PACs/corporate`);
    } else if (pacRatio > 0.40) {
      redFlagPoints += 15;
      flags.push(`${(pacRatio * 100).toFixed(0)}% from PACs/corporate`);
    }
  }

  // Red flag 4: IMMEDIATE FLAG — ANY Israel lobby / AIPAC money
  const israelTotal = (p.israelLobbyTotal ?? 0) + (p.aipacFunding ?? 0);
  if (israelTotal > 0) {
    // Any foreign lobby money is an immediate severe red flag
    redFlagPoints += 50;
    const israelStr = israelTotal >= 1_000_000 ? `$${(israelTotal / 1_000_000).toFixed(1)}M` : israelTotal >= 1_000 ? `$${(israelTotal / 1_000).toFixed(0)}K` : `$${israelTotal}`;
    flags.push(`🚨 FOREIGN LOBBY: ${israelStr} from Israel lobby/AIPAC — immediate red flag`);
    if (totalRaised > 0) {
      const pct = ((israelTotal / totalRaised) * 100).toFixed(1);
      flags.push(`Israel lobby = ${pct}% of total funds`);
    }
  }

  // Red flag 5: Low contribution count with high totals (possible bundling)
  if (contributions.length > 0 && totalRaised > 0) {
    const avgContribution = totalRaised / contributions.length;
    if (avgContribution > 10000) {
      redFlagPoints += 15;
      flags.push(`Avg contribution $${formatMoney(avgContribution)} (possible bundling)`);
    } else if (avgContribution > 5000) {
      redFlagPoints += 8;
    }
  }

  // Red flag 6: Has FEC candidate ID but $0 raised
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
    dataAvailable: totalRaised > 0 || contributions.length > 0 || donors.length > 0,
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

  if (availableCount >= 4 || availableWeight >= 0.80) return 'high';
  if (availableCount >= 2 || availableWeight >= 0.40) return 'medium';
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
 * Runs all five scoring factors, combines them with weights,
 * and produces a final score with breakdown.
 */
export function computeCorruptionScore(politician: Politician): CorruptionScoreResult {
  // First pass: compute raw scores with base weights
  const factors: CorruptionFactor[] = [
    scorePacContributionRatio(politician),
    scoreLobbyingConnections(politician),
    scoreVotingAlignment(politician),
    scoreTransparency(politician),
    scoreCampaignFinanceRedFlags(politician),
  ];

  // Second pass: redistribute weight to favor factors with real data
  const dataAvailable: Record<string, boolean> = {};
  for (const f of factors) dataAvailable[f.key] = f.dataAvailable;
  const adjusted = getAdjustedWeights(dataAvailable);

  // Recompute weighted scores with adjusted weights
  for (const f of factors) {
    f.weight = adjusted[f.key] ?? f.weight;
    f.weightedScore = Math.round(f.rawScore * f.weight * 10) / 10;
  }

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

export function getGradeColor(grade: CorruptionGrade): string {
  switch (grade) {
    case 'A': return '#10b981';
    case 'B': return '#22c55e';
    case 'C': return '#f59e0b';
    case 'D': return '#ef4444';
    case 'F': return '#dc2626';
  }
}

export function getConfidenceLabel(confidence: CorruptionConfidence): string {
  switch (confidence) {
    case 'high': return 'High Confidence';
    case 'medium': return 'Medium Confidence';
    case 'low': return 'Low Confidence — Limited Data';
  }
}

export function getConfidenceColor(confidence: CorruptionConfidence): string {
  switch (confidence) {
    case 'high': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'low': return '#6b7280';
  }
}
