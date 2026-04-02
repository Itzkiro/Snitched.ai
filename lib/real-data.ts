/**
 * JFK-Intel Real Data Integration
 * Phase 1: 188 Florida officials (30 federal, 158 state, 12 county)
 *
 * FUNDING DATA SOURCE:
 * - Federal politicians with FEC data: Real FEC API data from jfk-fec-full-results.json
 * - State/local politicians: No FEC data available (state filings not in FEC)
 * - dataStatus field indicates 'live' (real FEC data) vs 'no-fec-data' (no federal filings)
 *
 * To refresh FEC data, run: npx tsx data-ingestion/fetch-fec-data.ts
 */

import type { Politician } from './types';
import { computeCorruptionScore } from './corruption-score';

// Import JFK-Intel Phase 1 data (real politician bios from congress-legislators)
import floridaPoliticiansRaw from '../data-ingestion/phase1/processed/florida_politicians.json';

// Import real FEC scrape results (from Python scraper run on 2026-02-22)
import fecResultsRaw from '../data-ingestion/jfk-fec-results/jfk-fec-full-results.json';

// County data is lazy-loaded inside getAllPoliticians() to avoid bundling
// ~176KB of static data on every cold start.

// ---------------------------------------------------------------------------
// Types for raw imported data
// ---------------------------------------------------------------------------

interface RawPolitician {
  politician_id: string;
  name: string;
  office: string;
  office_level: 'federal' | 'state';
  party: 'Republican' | 'Democratic' | 'Independent';
  district: string | null;
  jurisdiction: string;
  jurisdiction_type: string;
  photo_url: string | null;
  term_start: string;
  term_end: string;
  is_active: boolean;
  bio: string | null;
  twitter_handle: string | null;
  twitter_user_id: number | null;
  facebook_page_id: string | null;
  facebook_page_url: string | null;
  instagram_handle: string | null;
  instagram_user_id: number | null;
  tiktok_handle: string | null;
  youtube_channel_id: string | null;
  source_ids: {
    bioguide_id: string | null;
    govtrack_id: string | null;
    opensecrets_id: string | null;
    fec_candidate_id: string | null;
    votesmart_id: string | null;
  };
  data_source: string;
  last_scraped: string;
}

interface FECPoliticianResult {
  politician_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  fec_candidate_id: string | null;
  has_fec_data: boolean;
  total_raised: number;
  aipac_total: number;
  aipac_count: number;
  top_donors: Array<{ name: string; total: number }>;
  breakdown: {
    aipac: number;
    other_pacs: number;
    individuals: number;
    corporate: number;
  };
  contributions: Array<{
    donor_name: string;
    donor_type: string;
    amount: number;
    date: string;
    is_aipac: boolean;
    committee_id: string;
    entity_type: string;
  }>;
  error: string | null;
}

interface FECResults {
  total_politicians: number;
  processed: number;
  with_fec_data: number;
  with_aipac_funding: number;
  errors: number;
  total_aipac_funding: number;
  total_raised_all: number;
  duration_seconds: number;
  timestamp: string;
  politicians: FECPoliticianResult[];
}

// ---------------------------------------------------------------------------
// Build FEC data lookup by politician_id
// ---------------------------------------------------------------------------

const fecResults = fecResultsRaw as FECResults;

/** Map from politician_id -> real FEC data */
const fecDataByPoliticianId: Map<string, FECPoliticianResult> = new Map();
for (const fecPol of fecResults.politicians) {
  fecDataByPoliticianId.set(fecPol.politician_id, fecPol);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateYearsInOffice(termStart: string): number {
  const start = new Date(termStart);
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
  return Math.max(0, Math.round(years * 10) / 10);
}

/**
 * Calculate juice box tier from Israel lobby percentage of total funds
 */
function calculateJuiceBoxTier(israelLobbyTotal: number, totalFundsRaised: number): 'none' | 'compromised' | 'bought' | 'owned' {
  if (totalFundsRaised === 0 || israelLobbyTotal === 0) return 'none';
  const pct = (israelLobbyTotal / totalFundsRaised) * 100;
  if (pct >= 15) return 'owned';
  if (pct >= 8) return 'bought';
  if (pct >= 3) return 'compromised';
  return 'none';
}

/**
 * Build funding data from REAL FEC results for a politician
 */
function buildRealFundingData(fecData: FECPoliticianResult): {
  totalFundsRaised: number;
  top3Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  top5Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  contributionBreakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number };
  aipacFunding: number;
  israelLobbyTotal: number;
  israelLobbyBreakdown: { total: number; pacs: number; ie: number; bundlers: number };
  juiceBoxTier: 'none' | 'compromised' | 'bought' | 'owned';
} {
  // Calculate total raised from contribution breakdown if total_raised is 0
  const breakdownTotal = fecData.breakdown.aipac +
    fecData.breakdown.other_pacs +
    fecData.breakdown.individuals +
    fecData.breakdown.corporate;
  const totalFundsRaised = fecData.total_raised > 0 ? fecData.total_raised : breakdownTotal;

  const aipacFunding = fecData.breakdown.aipac;
  // Israel lobby total = AIPAC + any other Israel-related PAC contributions
  // In the existing data, aipac_total is the broadest Israel lobby measure
  const israelLobbyTotal = fecData.aipac_total;

  // Build top donors from the aggregated list (real FEC data)
  const top5Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }> = [];

  // Aggregate contributions by donor for better top donor list
  const donorAgg: Record<string, { amount: number; type: string; isAipac: boolean }> = {};
  for (const contrib of fecData.contributions) {
    const key = contrib.donor_name;
    if (!donorAgg[key]) {
      donorAgg[key] = { amount: 0, type: contrib.donor_type, isAipac: contrib.is_aipac };
    }
    donorAgg[key].amount += contrib.amount;
  }

  const sortedDonors = Object.entries(donorAgg)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 5);

  for (const [name, data] of sortedDonors) {
    let donorType: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' = 'PAC';
    if (data.isAipac) {
      donorType = 'Israel-PAC';
    } else if (data.type === 'Individual') {
      donorType = 'Individual';
    } else if (data.type === 'Corporate') {
      donorType = 'Corporate';
    }
    top5Donors.push({
      name,
      amount: Math.round(data.amount * 100) / 100,
      type: donorType,
    });
  }

  // Also use fecData.top_donors if our aggregation yielded fewer
  if (top5Donors.length === 0 && fecData.top_donors.length > 0) {
    for (const d of fecData.top_donors.slice(0, 5)) {
      top5Donors.push({
        name: d.name,
        amount: Math.round(d.total * 100) / 100,
        type: 'PAC',
      });
    }
  }

  const top3Donors = top5Donors.slice(0, 3);

  const juiceBoxTier = calculateJuiceBoxTier(israelLobbyTotal, totalFundsRaised);

  return {
    totalFundsRaised: Math.round(totalFundsRaised),
    top3Donors,
    top5Donors,
    contributionBreakdown: {
      aipac: Math.round(aipacFunding),
      otherPACs: Math.round(fecData.breakdown.other_pacs),
      individuals: Math.round(fecData.breakdown.individuals),
      corporate: Math.round(fecData.breakdown.corporate),
    },
    aipacFunding: Math.round(aipacFunding),
    israelLobbyTotal: Math.round(israelLobbyTotal),
    israelLobbyBreakdown: {
      total: Math.round(israelLobbyTotal),
      pacs: Math.round(aipacFunding),
      ie: 0,       // IE data requires separate FEC schedule_e fetch (run fetch-fec-data.ts)
      bundlers: 0,  // Bundler data not available from FEC API directly
    },
    juiceBoxTier,
  };
}

/**
 * Build zero funding data for politicians without FEC data
 * (state/local officials not in FEC database)
 */
function buildZeroFundingData(): {
  totalFundsRaised: number;
  top3Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  top5Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  contributionBreakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number };
  aipacFunding: number;
  israelLobbyTotal: number;
  israelLobbyBreakdown: { total: number; pacs: number; ie: number; bundlers: number };
  juiceBoxTier: 'none' | 'compromised' | 'bought' | 'owned';
} {
  return {
    totalFundsRaised: 0,
    top3Donors: [],
    top5Donors: [],
    contributionBreakdown: { aipac: 0, otherPACs: 0, individuals: 0, corporate: 0 },
    aipacFunding: 0,
    israelLobbyTotal: 0,
    israelLobbyBreakdown: { total: 0, pacs: 0, ie: 0, bundlers: 0 },
    juiceBoxTier: 'none',
  };
}

/**
 * Build partial funding data for politicians with FEC total_raised but no
 * itemized contribution records. This happens when the FEC scraper retrieved
 * the candidate filing summary (which includes total_raised) but was unable
 * to fetch individual schedule_a receipts (rate limits, timeouts, etc.).
 *
 * We still show the real total_raised so the user sees actual FEC numbers.
 */
function buildPartialFundingData(fecData: FECPoliticianResult): {
  totalFundsRaised: number;
  top3Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  top5Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  contributionBreakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number };
  aipacFunding: number;
  israelLobbyTotal: number;
  israelLobbyBreakdown: { total: number; pacs: number; ie: number; bundlers: number };
  juiceBoxTier: 'none' | 'compromised' | 'bought' | 'owned';
} {
  const totalFundsRaised = fecData.total_raised;
  const aipacFunding = fecData.aipac_total || 0;
  const israelLobbyTotal = fecData.aipac_total || 0;

  // Use whatever breakdown data exists (may be all zeros)
  const breakdownAipac = fecData.breakdown.aipac || 0;
  const breakdownOther = fecData.breakdown.other_pacs || 0;
  const breakdownIndiv = fecData.breakdown.individuals || 0;
  const breakdownCorp = fecData.breakdown.corporate || 0;

  // Build top donors from the aggregated list if available
  const top5Donors: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }> = [];
  if (fecData.top_donors && fecData.top_donors.length > 0) {
    for (const d of fecData.top_donors.slice(0, 5)) {
      top5Donors.push({
        name: d.name,
        amount: Math.round(d.total * 100) / 100,
        type: 'PAC',
      });
    }
  }

  const juiceBoxTier = calculateJuiceBoxTier(israelLobbyTotal, totalFundsRaised);

  return {
    totalFundsRaised: Math.round(totalFundsRaised),
    top3Donors: top5Donors.slice(0, 3),
    top5Donors,
    contributionBreakdown: {
      aipac: Math.round(breakdownAipac),
      otherPACs: Math.round(breakdownOther),
      individuals: Math.round(breakdownIndiv),
      corporate: Math.round(breakdownCorp),
    },
    aipacFunding: Math.round(aipacFunding),
    israelLobbyTotal: Math.round(israelLobbyTotal),
    israelLobbyBreakdown: {
      total: Math.round(israelLobbyTotal),
      pacs: Math.round(breakdownAipac),
      ie: 0,
      bundlers: 0,
    },
    juiceBoxTier,
  };
}

// ---------------------------------------------------------------------------
// Convert raw politician to app Politician type
// ---------------------------------------------------------------------------

function convertToPolitician(raw: RawPolitician): Politician {
  // Map office to OfficeLevel type
  let officeLevel: Politician['officeLevel'] = 'US Representative';
  if (raw.office && raw.office.includes('Senate')) {
    officeLevel = raw.office_level === 'federal' ? 'US Senator' : 'State Senator';
  } else if (raw.office && raw.office.includes('House')) {
    officeLevel = raw.office_level === 'federal' ? 'US Representative' : 'State Representative';
  } else if (raw.office && raw.office.includes('Governor')) {
    officeLevel = 'Governor';
  }

  // Map jurisdiction type
  let jurisdictionType: Politician['jurisdictionType'] = 'state_legislature';
  if (raw.office_level === 'federal') {
    jurisdictionType = 'federal';
  } else if (raw.office === 'Governor' || raw.office === 'Lieutenant Governor') {
    jurisdictionType = 'state_executive';
  } else {
    jurisdictionType = 'state_legislature';
  }

  // Look up real FEC data for this politician
  const fecData = fecDataByPoliticianId.get(raw.politician_id);
  const hasDetailedFecData = fecData?.has_fec_data === true;
  // Some politicians have total_raised from FEC filing summaries even without
  // detailed contribution records (scraper got candidate totals but hit rate
  // limits on itemized receipts). We should still show the real total_raised.
  const hasFecTotalRaised = !hasDetailedFecData && fecData != null && fecData.total_raised > 0;

  // Use real FEC data when available, otherwise show zero
  let fundingData;
  if (hasDetailedFecData && fecData) {
    fundingData = buildRealFundingData(fecData);
  } else if (hasFecTotalRaised && fecData) {
    // Has total_raised from FEC candidate filing summary but no itemized contributions.
    // Show the real total and flag that breakdown is pending a full scrape.
    fundingData = buildPartialFundingData(fecData);
  } else {
    fundingData = buildZeroFundingData();
  }

  // Determine data status
  let dataStatus: 'live' | 'mock' = 'live';
  let dataSource = raw.data_source;
  if (hasDetailedFecData) {
    dataSource = 'FEC API (api.open.fec.gov)';
  } else if (hasFecTotalRaised) {
    dataSource = 'FEC API (total raised only - itemized receipts pending)';
  } else if (fecData?.fec_candidate_id) {
    // Has FEC ID but scrape found no contribution data
    dataSource = 'FEC API (no contributions found)';
  } else {
    // State/local - no FEC data expected
    dataSource = raw.data_source;
  }

  // Build the politician object first (with temporary score of 0)
  const politician: Politician = {
    id: raw.politician_id,
    name: raw.name,
    office: raw.office,
    officeLevel,
    party: raw.party === 'Democratic' ? 'Democrat' : raw.party,
    district: raw.district || undefined,
    jurisdiction: raw.jurisdiction,
    jurisdictionType,
    photoUrl: raw.photo_url || `/politicians/${raw.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.jpg`,
    corruptionScore: 0, // Temporary — computed below
    aipacFunding: fundingData.aipacFunding,
    juiceBoxTier: fundingData.juiceBoxTier,
    totalFundsRaised: fundingData.totalFundsRaised,
    top3Donors: fundingData.top3Donors,
    top5Donors: fundingData.top5Donors,
    topDonor: fundingData.top5Donors.length > 0 ? {
      name: fundingData.top5Donors[0].name,
      amount: fundingData.top5Donors[0].amount,
    } : undefined,
    contributionBreakdown: fundingData.contributionBreakdown,
    israelLobbyTotal: fundingData.israelLobbyTotal,
    israelLobbyBreakdown: fundingData.israelLobbyBreakdown,
    isActive: raw.is_active,
    yearsInOffice: calculateYearsInOffice(raw.term_start),
    tags: hasDetailedFecData
      ? [{ type: 'data', label: 'FEC VERIFIED', color: '#10b981' }]
      : hasFecTotalRaised
        ? [{ type: 'data', label: 'FEC TOTAL ONLY', color: '#f59e0b' }]
        : [],
    bio: raw.bio || `${raw.name} represents ${raw.district || raw.jurisdiction} in the ${raw.office}.`,
    termStart: raw.term_start,
    termEnd: raw.term_end,
    socialMedia: {
      twitterHandle: raw.twitter_handle || undefined,
      twitterUserId: raw.twitter_user_id?.toString(),
      facebookPageId: raw.facebook_page_id || undefined,
      facebookPageUrl: raw.facebook_page_url || undefined,
      instagramHandle: raw.instagram_handle || undefined,
      instagramUserId: raw.instagram_user_id?.toString(),
      tiktokHandle: raw.tiktok_handle || undefined,
      youtubeChannelId: raw.youtube_channel_id || undefined,
    },
    source_ids: {
      bioguide_id: raw.source_ids.bioguide_id || undefined,
      govtrack_id: raw.source_ids.govtrack_id || undefined,
      opensecrets_id: raw.source_ids.opensecrets_id || undefined,
      fec_candidate_id: raw.source_ids.fec_candidate_id || undefined,
      votesmart_id: raw.source_ids.votesmart_id || undefined,
    },
    contributions: hasDetailedFecData && fecData ? fecData.contributions.map((c, idx) => ({
      id: `fec-${raw.politician_id}-${idx}`,
      politicianId: raw.politician_id,
      donorName: c.donor_name,
      donorType: (c.is_aipac ? 'PAC' : c.donor_type === 'Individual' ? 'Individual' : c.donor_type === 'Corporate' ? 'Corporate' : 'PAC') as 'PAC' | 'Individual' | 'Corporate',
      amount: c.amount,
      date: c.date || '',
      isAipac: c.is_aipac,
    })) : [],
    courtCases: [],
    votes: [],
    socialPosts: [],
    dataStatus,
    dataSource,
    lastUpdated: fecResults.timestamp || raw.last_scraped,
  };

  // Compute the corruption score using the v1 algorithm
  const scoreResult = computeCorruptionScore(politician);
  politician.corruptionScore = scoreResult.score;
  politician.corruptionScoreDetails = scoreResult;

  return politician;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all politicians (JFK-Intel Phase 1 + all county data)
 * Federal politicians use REAL FEC data when available.
 */
export function getAllPoliticians(): Politician[] {
  // Convert JFK-Intel Phase 1 data
  const livePoliticians = (floridaPoliticiansRaw as RawPolitician[])
    .filter(raw => raw && raw.name && raw.office)
    .map(convertToPolitician);

  // Lazy-load county data to reduce bundle size on cold starts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { volusiaCountyOfficials } = require('./volusia-county-data');
  const { flaglerCountyOfficials } = require('./flagler-county-data');
  const { putnamCountyOfficials } = require('./putnam-county-data');
  const { lakeCountyOfficials } = require('./lake-county-data');
  const { seminoleCountyOfficials } = require('./seminole-county-data');
  const { orangeCountyOfficials } = require('./orange-county-data');
  const { brevardCountyOfficials } = require('./brevard-county-data');

  // Combine all county officials (no FEC data - local level)
  const allCountyOfficials = [
    ...volusiaCountyOfficials,
    ...flaglerCountyOfficials,
    ...putnamCountyOfficials,
    ...lakeCountyOfficials,
    ...seminoleCountyOfficials,
    ...orangeCountyOfficials,
    ...brevardCountyOfficials,
  ];

  // Compute corruption scores for county officials
  const countyWithStatus = allCountyOfficials
    .filter(p => p && p.name && p.office)
    .map(p => {
      const countyPol: Politician = {
        ...p,
        totalFundsRaised: 0,
        top3Donors: [] as Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>,
        top5Donors: [] as Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>,
        topDonor: undefined,
        contributionBreakdown: { aipac: 0, otherPACs: 0, individuals: 0, corporate: 0 },
        aipacFunding: 0,
        israelLobbyTotal: 0,
        israelLobbyBreakdown: { total: 0, pacs: 0, ie: 0, bundlers: 0 },
        juiceBoxTier: 'none' as const,
        corruptionScore: 0,
        dataStatus: 'live' as const,
        dataSource: 'jfk-intel-manual (local officials - no FEC data)',
        lastUpdated: '2026-03-04T00:00:00',
      };
      const scoreResult = computeCorruptionScore(countyPol);
      countyPol.corruptionScore = scoreResult.score;
      countyPol.corruptionScoreDetails = scoreResult;
      return countyPol;
    });

  return [...livePoliticians, ...countyWithStatus].filter(p =>
    p && p.name && p.office && p.party && p.officeLevel
  );
}

/**
 * JFK-Intel + FEC Data Statistics
 */
export function getDataStats() {
  const all = getAllPoliticians();
  const federal = all.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative');
  const state = all.filter(p => p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative' || p.officeLevel === 'Governor');
  const county = all.filter(p =>
    p.jurisdictionType === 'county' || p.jurisdictionType === 'municipal'
  );
  const withDetailedFec = all.filter(p => p.dataSource?.includes('FEC API (api.open.fec.gov)'));
  const withPartialFec = all.filter(p => p.dataSource?.includes('total raised only'));
  const withAnyFec = all.filter(p => p.dataSource?.includes('FEC API') && (p.totalFundsRaised ?? 0) > 0);

  return {
    total: all.length,
    federal: federal.length,
    state: state.length,
    county: county.length,
    hasAIPACFunding: all.filter(p => p.aipacFunding > 0).length,
    withRealFECData: withDetailedFec.length,
    withPartialFECData: withPartialFec.length,
    withAnyFECData: withAnyFec.length,
    totalFECFundsTracked: withAnyFec.reduce((sum, p) => sum + (p.totalFundsRaised ?? 0), 0),
    fecScrapeDate: fecResults.timestamp,
  };
}
