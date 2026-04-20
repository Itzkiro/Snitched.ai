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

/** Weight configuration — must sum to 1.0
 * v6: campaignFinanceRedFlags weight raised to 0.30 so Israel-lobby
 * capture signals (min 30pt floor, max 50pt penalty on that factor)
 * have proportional impact on the final score. Other weights compressed.
 * Previous v5 weights kept in comment for audit:
 *   pac 0.32, lobby 0.18, voting 0.22, redflags 0.18, forensics 0.10 */
const BASE_WEIGHTS = {
  pacContributionRatio: 0.25,
  lobbyingConnections: 0.15,
  votingAlignment: 0.20,
  campaignFinanceRedFlags: 0.30,
  donorForensicsScore: 0.10,
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
    if (!d.name) continue;
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

  // If we have an explicit breakdown (even all zeros) OR totalRaised > 0, treat as real data
  const hasExplicitBreakdown = p.contributionBreakdown !== undefined && p.contributionBreakdown !== null;

  if (!effectiveBreakdown) {
    if (hasExplicitBreakdown) {
      // Explicit empty/zero breakdown — treat as real data (no funds raised, zero PAC)
      return {
        key: 'pacContributionRatio',
        label: 'PAC/Lobby Funding Ratio',
        rawScore: 0,
        weight: WEIGHTS.pacContributionRatio,
        weightedScore: 0,
        dataAvailable: true,
        explanation: 'No campaign funds raised — no PAC contributions to analyze.',
      };
    }
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

  if (totalRaised === 0) {
    return {
      key: 'pacContributionRatio',
      label: 'PAC/Lobby Funding Ratio',
      rawScore: 0,
      weight: WEIGHTS.pacContributionRatio,
      weightedScore: 0,
      dataAvailable: true,
      explanation: 'No campaign funds raised — no PAC contributions to analyze.',
    };
  }

  // v6.1: reclassify known Israel-lobby bundlers (individuals who are AIPAC
  // members giving in personal capacity) as PAC-side money, since they're
  // coordinated through the lobby, not grassroots. Also caps bundlers at
  // the reported individual total so we never over-move money.
  const lobbyBundlers = Math.min(
    p.israelLobbyBreakdown?.bundlers ?? 0,
    effectiveBreakdown.individuals,
  );
  const pacTotalBase = effectiveBreakdown.aipac + effectiveBreakdown.otherPACs + effectiveBreakdown.corporate;
  const pacTotal = pacTotalBase + lobbyBundlers;
  const individualTotal = Math.max(0, effectiveBreakdown.individuals - lobbyBundlers);

  let pacRatio = pacTotal / totalRaised;
  pacRatio = Math.min(1, Math.max(0, pacRatio));

  // v6.1: israelLobbyTotal already INCLUDES aipacFunding (AIPAC is a subset
  // of the Israel-lobby universe). Taking the max instead of summing fixes a
  // double-count bug that inflated Israel amount by ~30% for every politician.
  const israelLobbyAmount = Math.max(
    p.israelLobbyTotal ?? 0,
    p.aipacFunding ?? 0,
  );
  const israelLobbyRatio = israelLobbyAmount / totalRaised;
  // v6.6: only apply the 30pt "any Israel money" floor when the amount is
  // meaningful (≥ \$10,000). Below that it's likely a single historical
  // donation — punishing the same politician who has then publicly
  // rejected AIPAC (e.g., Thomas Massie, \$5K from 2013, voted against
  // every pro-AIPAC measure since) is a false positive.
  const ISRAEL_FLOOR_THRESHOLD = 10_000;
  const israelPenalty = israelLobbyAmount >= ISRAEL_FLOOR_THRESHOLD
    ? Math.max(30, Math.min(50, israelLobbyRatio * 100 * 3))
    : israelLobbyAmount > 0
      ? Math.min(10, israelLobbyRatio * 100 * 3)  // token historical donation
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
  // null/undefined = no data yet (placeholder)
  // [] (empty array) = data fetched, zero findings (real data, score 0)
  if (p.lobbyingRecords === undefined || p.lobbyingRecords === null) {
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

  const records = p.lobbyingRecords;

  if (records.length === 0) {
    return {
      key: 'lobbyingConnections',
      label: 'Lobbying Connections',
      rawScore: 0,
      weight: WEIGHTS.lobbyingConnections,
      weightedScore: 0,
      dataAvailable: true,
      explanation: 'No lobbying disclosure filings found for this politician.',
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
  // null/undefined = no data yet (placeholder)
  // [] = data fetched, zero roll-call votes found (real data, score 0)
  const votesSource = ((p as unknown as { votingRecords?: unknown }).votingRecords ?? p.votes) as unknown;

  if (votesSource === undefined || votesSource === null) {
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

  const votes = (Array.isArray(votesSource) ? votesSource : []) as NonNullable<Politician['votes']>;

  if (votes.length === 0) {
    return {
      key: 'votingAlignment',
      label: 'Voting Alignment with Donors',
      rawScore: 0,
      weight: WEIGHTS.votingAlignment,
      weightedScore: 0,
      dataAvailable: true,
      explanation: 'No roll-call voting records found for this politician (not a voting officeholder).',
    };
  }

  const israelFundingRatio = (p.totalFundsRaised ?? 0) > 0
    ? (p.israelLobbyTotal ?? 0) / (p.totalFundsRaised ?? 1)
    : 0;

  // v6.1: expanded to cover Iran sanctions / war-powers / BDS / Yemen / Gaza
  // which are all AIPAC-priority votes that the narrow original list missed.
  const israelKeywords = [
    'israel', 'israeli', 'iron dome', 'jerusalem', 'palestinian', 'palestine',
    'hamas', 'hezbollah', 'antisemit', 'anti-semit', 'zionis', 'zionism',
    'iran', 'tehran', 'yemen', 'houthi', 'gaza', 'bds', 'boycott',
    'west bank', 'golan', 'netanyahu', 'idf',
    'from the river to the sea',
  ];
  const defenseKeywords = ['defense', 'military', 'arms', 'weapon', 'nato', 'aid', 'war powers'];

  // Normalize vote records — support both camelCase (Vote type) and snake_case (DB shape)
  const getTitle = (v: any): string => (v.billTitle || v.bill_title || '').toLowerCase();
  const getSummary = (v: any): string => (v.billSummary || v.bill_summary || '').toLowerCase();
  const getVote = (v: any): string => v.voteValue || v.vote_position || '';

  const israelVotes = votes.filter((v: any) =>
    israelKeywords.some(kw => getTitle(v).includes(kw) || getSummary(v).includes(kw))
  );
  const defenseVotes = votes.filter((v: any) =>
    defenseKeywords.some(kw => getTitle(v).includes(kw) || getSummary(v).includes(kw))
  );

  let rawScore = 0;

  // v6.1: trigger Israel-aware branch on either ratio OR absolute dollars,
  // not ratio alone — lifetime aggregates dilute the ratio for long-serving
  // members even when absolute capture is huge.
  const israelAbsolute = Math.max(p.israelLobbyTotal ?? 0, p.aipacFunding ?? 0);
  const hasIsraelCapture = israelFundingRatio > 0.02 || israelAbsolute >= 500_000;

  if (hasIsraelCapture && israelVotes.length > 0) {
    // Fall back to an explicit `israel_aligned` flag when the vote record
    // carries one (set by ingest scripts that classify anti-Israel measures
    // correctly — e.g., "Nay on War Powers resolution" or "Nay on Greene
    // amendment to strip Israel funding" both count as aligned even though
    // they're Nay votes).
    const alignedCount = israelVotes.filter((v: any) => {
      if (typeof v.israel_aligned === 'boolean') return v.israel_aligned;
      const vote = getVote(v);
      return vote === 'Yes' || vote === 'Yea';
    }).length;
    const alignmentRate = alignedCount / israelVotes.length;
    // Use ratio-weighted component OR absolute-capture component, whichever is higher
    const ratioComponent = israelFundingRatio * 200;
    const absoluteComponent = israelAbsolute >= 100_000
      ? Math.min(40, Math.log10(israelAbsolute / 100_000) * 25)
      : 0;
    rawScore = Math.round(alignmentRate * 60 + Math.max(ratioComponent, absoluteComponent));
    // Sustained high-alignment + high-capture = ceiling bonus
    if (alignmentRate >= 0.70 && (israelFundingRatio >= 0.04 || israelAbsolute >= 1_000_000)) {
      rawScore = Math.max(rawScore, 85);
    }
    rawScore = Math.min(100, rawScore);
  } else if (israelFundingRatio > 0.01 && defenseVotes.length > 0) {
    // Some Israel funding + defense votes — moderate signal
    const yesDefense = defenseVotes.filter((v: any) => {
      const vote = getVote(v);
      return vote === 'Yes' || vote === 'Yea';
    }).length;
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

// Transparency factor removed — lack of public data is not corruption

// ---------------------------------------------------------------------------
// Factor 5: Campaign Finance Red Flags (15%)
// ---------------------------------------------------------------------------

function scoreCampaignFinanceRedFlags(p: Politician): CorruptionFactor {
  const totalRaised = p.totalFundsRaised ?? 0;
  const breakdown = p.contributionBreakdown;
  const contributions = p.contributions ?? [];
  const donors = p.top5Donors ?? [];

  const hasExplicitBreakdown = breakdown !== undefined && breakdown !== null;

  if (totalRaised === 0 && !hasExplicitBreakdown && donors.length === 0) {
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
  // v6.5: skip ActBlue / WinRed / Anedot — they're payment-processor conduits
  // that aggregate small-dollar donations, not single donors. Treating them
  // as "top donor X% of total" produces false corruption flags for anyone
  // running a grassroots small-dollar operation. Skip the politician's own
  // joint fundraising committees too (e.g., "MAST VICTORY COMMITTEE").
  const PLATFORM_CONDUIT_RE = /^(ACTBLUE|WINRED|ANEDOT)(\s|,|$)|VICTORY COMMITTEE|JOINT FUNDRAISING/i;
  const firstRealDonor = donors.find(d => d.name && !PLATFORM_CONDUIT_RE.test(d.name.trim()));
  if (firstRealDonor && totalRaised > 0) {
    const topDonorAmount = firstRealDonor.amount;
    const topDonorPct = topDonorAmount / totalRaised;
    const nameParts = p.name.toLowerCase().split(/\s+/);
    const isSelfDonor = firstRealDonor.name
      ? nameParts.some(part => firstRealDonor.name.toLowerCase().includes(part))
      : false;

    if (!isSelfDonor) {
      if (topDonorPct > 0.20) {
        redFlagPoints += 25;
        flags.push(`Top donor "${firstRealDonor.name}" is ${(topDonorPct * 100).toFixed(1)}% of total`);
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

  // Red flag 4: IMMEDIATE FLAG — meaningful Israel lobby / AIPAC money
  // v6.1: israelLobbyTotal already INCLUDES aipacFunding — take the max,
  // don't sum, to avoid 30% double-count on every AIPAC-backed politician.
  // v6.6: threshold raised to \$10K so token historical donations don't
  // trigger the full red flag on otherwise-clean politicians.
  const israelTotal = Math.max(p.israelLobbyTotal ?? 0, p.aipacFunding ?? 0);
  if (israelTotal >= 10_000) {
    // Baseline hard penalty
    redFlagPoints += 50;
    const israelStr = israelTotal >= 1_000_000 ? `$${(israelTotal / 1_000_000).toFixed(1)}M` : israelTotal >= 1_000 ? `$${(israelTotal / 1_000).toFixed(0)}K` : `$${israelTotal}`;
    flags.push(`🚨 FOREIGN LOBBY: ${israelStr} from Israel lobby/AIPAC — immediate red flag`);

    // v6.1: absolute-dollar Israel capture bonus on top of the ratio-based
    // cap. Log scale so every order of magnitude of sustained AIPAC dollars
    // adds measurable weight. Calibration:
    //   $100K  -> 0 pts
    //   $500K  -> 14 pts
    //   $1M    -> 20 pts
    //   $2.24M -> 28 pts (Mast lifetime)
    //   $5M    -> 34 pts
    //   $10M   -> 40 pts (cap)
    if (israelTotal >= 100_000) {
      const absoluteBonus = Math.min(40, Math.log10(israelTotal / 100_000) * 20);
      redFlagPoints += Math.round(absoluteBonus);
      flags.push(`Absolute-\$ capture bonus: +${Math.round(absoluteBonus)} pts (sustained high-dollar lobby relationship)`);
    }

    // v6.2: multi-tier capture escalators — each $500K of Israel money
    // adds a stacking red flag. Compounds with absolute-$ bonus above.
    //   >= $1M:     +10 pts, "BOUGHT" tier
    //   >= $2M:     +15 pts, "FULLY BOUGHT" tier
    //   >= $5M:     +25 pts, "OWNED" tier
    if (israelTotal >= 5_000_000) {
      redFlagPoints += 25;
      flags.push('🚨 OWNED: $5M+ Israel-lobby capture');
    } else if (israelTotal >= 2_000_000) {
      redFlagPoints += 15;
      flags.push('🚨 FULLY BOUGHT: $2M+ Israel-lobby capture');
    } else if (israelTotal >= 1_000_000) {
      redFlagPoints += 10;
      flags.push('🚨 BOUGHT: $1M+ Israel-lobby capture');
    }

    // v6.2: lobbying-income absolute red flag — sustained 6-figure lobbying
    // presence is a separate corruption signal from Israel-lobby money.
    const lobbyIncome = (p.lobbyingRecords ?? []).reduce(
      (sum, r) => sum + (Number((r as { income?: number }).income) || 0),
      0,
    );
    if (lobbyIncome >= 1_000_000) {
      redFlagPoints += 15;
      flags.push(`Lobbying income \$${(lobbyIncome / 1_000_000).toFixed(1)}M — high lobbyist saturation`);
    } else if (lobbyIncome >= 500_000) {
      redFlagPoints += 8;
      flags.push(`Lobbying income \$${(lobbyIncome / 1_000).toFixed(0)}K`);
    }

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
    dataAvailable: hasExplicitBreakdown || totalRaised > 0 || contributions.length > 0 || donors.length > 0,
    explanation: flags.length > 0
      ? `${flags.length} red flag(s): ${flags.join('; ')}.`
      : 'No red flags detected in available finance data.',
  };
}

// ---------------------------------------------------------------------------
// Factor 5: Donor Forensics (v5)
// ---------------------------------------------------------------------------

/**
 * Content-neutral donor-pattern anomaly detection.
 * Scores five forensic signals computed from itemized donor data:
 *   - missingEmployerRatio: blank/"Information Requested" on >$200 donors
 *   - outOfStatePct: fraction giving from outside politician's jurisdiction
 *   - householdBundling: max donors sharing an address
 *   - donationStdDev: coefficient of variation of donation amounts
 *   - platformOpacity: fraction routed through ActBlue/WinRed without disclosure
 *
 * Signals are thresholded and summed — no single signal can spike the score.
 * Placeholder (rawScore=0) when donorForensics is absent.
 */
function scoreDonorForensics(p: Politician): CorruptionFactor {
  const forensics = p.donorForensics;

  if (!forensics || forensics.itemizedCount === 0) {
    return {
      key: 'donorForensicsScore',
      label: 'Donor Pattern Forensics',
      rawScore: PLACEHOLDER_SCORE,
      weight: WEIGHTS.donorForensicsScore,
      weightedScore: PLACEHOLDER_SCORE * WEIGHTS.donorForensicsScore,
      dataAvailable: false,
      explanation: 'No itemized donor data — forensic signals not yet computed.',
    };
  }

  const flags: string[] = [];
  let rawScore = 0;

  // Missing employer >40% = meaningful disclosure gap (FEC/state law requires
  // employer/occupation for itemized donors >$200). Scale 40-80% → 0-30 pts.
  if (forensics.missingEmployerRatio >= 0.4) {
    const penalty = Math.min(30, ((forensics.missingEmployerRatio - 0.4) / 0.4) * 30);
    rawScore += penalty;
    flags.push(`${Math.round(forensics.missingEmployerRatio * 100)}% of itemized donors missing employer`);
  }

  // Out-of-state >50% for a state-level race is unusual. Scale 50-90% → 0-20 pts.
  if (forensics.outOfStatePct >= 0.5) {
    const penalty = Math.min(20, ((forensics.outOfStatePct - 0.5) / 0.4) * 20);
    rawScore += penalty;
    flags.push(`${Math.round(forensics.outOfStatePct * 100)}% out-of-state donors`);
  }

  // Household bundling: >5% of itemized at max + shared address is a classic
  // straw-donor pattern. Scale 5-25% → 0-25 pts.
  if (forensics.householdBundling >= 0.05) {
    const penalty = Math.min(25, ((forensics.householdBundling - 0.05) / 0.20) * 25);
    rawScore += penalty;
    flags.push(`${Math.round(forensics.householdBundling * 100)}% household-bundling pattern`);
  }

  // Coefficient of variation < 0.3 means donations are abnormally uniform —
  // real grassroots has a long tail. Scale 0.3 down to 0 → 0-15 pts.
  if (forensics.donationStdDev < 0.3 && forensics.donationStdDev >= 0) {
    const penalty = Math.min(15, ((0.3 - forensics.donationStdDev) / 0.3) * 15);
    rawScore += penalty;
    flags.push(`donation amounts abnormally uniform (CV=${forensics.donationStdDev.toFixed(2)})`);
  }

  // v6.5: platform_opacity removed from score contribution. ActBlue/WinRed/
  // Anedot are neutral donation processors — small donors legitimately route
  // through them. High routing is a function of grassroots fundraising style,
  // not corruption. Field still tracked on the forensics struct for
  // transparency/display but contributes 0 points to the score.
  void forensics.platformOpacity;

  const finalRaw = Math.min(100, Math.round(rawScore));

  return {
    key: 'donorForensicsScore',
    label: 'Donor Pattern Forensics',
    rawScore: finalRaw,
    weight: WEIGHTS.donorForensicsScore,
    weightedScore: Math.round(finalRaw * WEIGHTS.donorForensicsScore * 10) / 10,
    dataAvailable: true,
    explanation: flags.length > 0
      ? `${flags.length} forensic signal(s) over ${forensics.itemizedCount} itemized donors: ${flags.join('; ')}.`
      : `${forensics.itemizedCount} itemized donors analyzed; no anomalous patterns detected.`,
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
  // First pass: compute raw scores with base weights.
  // v5: 5 factors — donorForensicsScore added for content-neutral anomaly detection.
  const factors: CorruptionFactor[] = [
    scorePacContributionRatio(politician),
    scoreLobbyingConnections(politician),
    scoreVotingAlignment(politician),
    scoreCampaignFinanceRedFlags(politician),
    scoreDonorForensics(politician),
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

  let totalScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);

  // v6.3: Sustained-capture multiplier. Politicians with Israel-lobby money
  // across 3+ consecutive cycles get a score multiplier — sustained relation-
  // ships are structurally different from one-cycle contributions.
  //   3 cycles = 1.15x
  //   4 cycles = 1.20x
  //   5+ cycles = 1.25x
  const israelCycles = (politician.israelLobbyBreakdown as { cycles_count?: number } | undefined)?.cycles_count ?? 0;
  let multiplier = 1.0;
  if (israelCycles >= 5) multiplier = 1.25;
  else if (israelCycles === 4) multiplier = 1.20;
  else if (israelCycles === 3) multiplier = 1.15;
  if (multiplier > 1.0) {
    totalScore *= multiplier;
  }

  // v6.5: Curator-added red_flags contribute to the score so manual research
  // isn't invisible in the number. Prior behavior: red_flags were only shown
  // on a separate "FLAGS" tab and didn't affect corruption_score at all.
  // That meant politicians like Amy Acton (4 curator-high-severity flags
  // re: COVID overreach + adverse court rulings) scored 0 numerically while
  // having documented concerns. Now each red flag adds raw points:
  //   high severity: +5 pts each
  //   med severity:  +2 pts each
  // Capped at +30 total so curator additions can't dominate algorithmic
  // signal — they supplement, don't replace.
  const redFlagsList = (politician.source_ids as { red_flags?: Array<{ severity?: string }> } | undefined)?.red_flags ?? [];
  if (redFlagsList.length > 0) {
    const highCount = redFlagsList.filter(f => f.severity === 'high').length;
    const medCount = redFlagsList.filter(f => f.severity === 'med').length;
    const redFlagContribution = Math.min(30, highCount * 5 + medCount * 2);
    totalScore += redFlagContribution;
  }

  // v6.3: juice_box_tier hard floors. Captured politicians can't score below
  // these thresholds — the tier is a curator-verified signal that structur-
  // ally overrides ratio-based arithmetic.
  //   compromised -> floor 45
  //   bought      -> floor 70
  //   owned       -> floor 85
  const tier = politician.juiceBoxTier;
  const tierFloor = tier === 'owned' ? 85 : tier === 'bought' ? 70 : tier === 'compromised' ? 45 : 0;
  if (tierFloor > 0 && totalScore < tierFloor) {
    totalScore = tierFloor;
  }

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
