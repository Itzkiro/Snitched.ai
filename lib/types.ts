export type Party = 'Democrat' | 'Republican' | 'Independent' | 'Nonpartisan' | 'Other';

export type JurisdictionType = 
  | 'federal' 
  | 'state_executive' 
  | 'state_legislature' 
  | 'judiciary'
  | 'county' 
  | 'municipal' 
  | 'special_district';

export type OfficeLevel = 
  | 'US Senator' 
  | 'US Representative' 
  | 'Governor' 
  | 'State Senator' 
  | 'State Representative'
  | 'County Commissioner'
  | 'Sheriff'
  | 'Clerk of Court'
  | 'Property Appraiser'
  | 'Tax Collector'
  | 'Supervisor of Elections'
  | 'Mayor'
  | 'City Council'
  | 'School Board'
  | 'Judge'
  | 'City Commissioner'
  | 'State Attorney'
  | 'Public Defender'
  | 'Soil & Water'
  | 'Superintendent'
  | 'District Attorney'
  | 'Tax Commissioner'
  | 'Probate Judge'
  | 'Commission Chair'
  | 'County Administrator'
  | 'Prosecutor'
  | 'County Auditor'
  | 'County Treasurer'
  | 'County Recorder'
  | 'County Coroner'
  | 'County Engineer'
  | 'Clerk of Courts';

export type JuiceBoxTier = 'none' | 'compromised' | 'bought' | 'owned';

export interface Tag {
  type: string;
  label: string;
  color: string;
  value?: string | number;
}

export interface Politician {
  id: string;
  name: string;
  office: string;
  officeLevel: OfficeLevel;
  party: Party;
  district?: string;
  jurisdiction: string;
  jurisdictionType: JurisdictionType;
  photoUrl?: string;
  corruptionScore: number; // 0-100
  corruptionScoreDetails?: CorruptionScoreResult;
  juiceBoxTier: JuiceBoxTier;
  aipacFunding: number;
  topDonor?: {
    name: string;
    amount: number;
  };
  totalFundsRaised?: number;
  top3Donors?: Array<{
    name: string;
    amount: number;
    type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC';
  }>;
  top5Donors?: Array<{
    name: string;
    amount: number;
    type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC';
  }>;
  contributionBreakdown?: {
    aipac: number;
    otherPACs: number;
    individuals: number;
    corporate: number;
  };
  israelLobbyTotal?: number;
  israelLobbyBreakdown?: {
    total: number;
    pacs: number;
    ie: number; // Independent Expenditures
    bundlers: number;
    ie_details?: Array<{
      committee_name: string;
      committee_id: string;
      amount: number;
      support_oppose: string;
      is_israel_lobby: boolean;
    }>;
  };
  termStart?: string;
  termEnd?: string;
  yearsInOffice?: number;
  isActive: boolean;
  isCandidate?: boolean;
  runningFor?: string;
  tags: Tag[];
  bio?: string;
  socialMedia?: {
    twitterHandle?: string;
    twitterUserId?: string;
    facebookPageId?: string;
    facebookPageUrl?: string;
    instagramHandle?: string;
    instagramUserId?: string;
    tiktokHandle?: string;
    youtubeChannelId?: string;
  };
  // JFK-Intel source IDs for API lookups
  source_ids?: {
    bioguide_id?: string;
    govtrack_id?: string;
    opensecrets_id?: string;
    fec_candidate_id?: string;
    votesmart_id?: string;
  };
  // Data source metadata
  dataStatus?: 'live' | 'mock';
  dataSource?: string;
  lastUpdated?: string;
  contributions?: Contribution[];
  courtCases?: CourtCase[];
  votes?: Vote[];
  socialPosts?: SocialPost[];
  lobbyingRecords?: LobbyingRecord[];
}

export interface Contribution {
  id: string;
  politicianId: string;
  donorName: string;
  donorType: 'PAC' | 'Individual' | 'Corporate';
  amount: number;
  date: string;
  isAipac: boolean;
}

export interface CourtCase {
  id: string;
  politicianId: string;
  caseNumber: string;
  court: string;
  caseType: string;
  status: 'Active' | 'Closed' | 'Pending';
  summary: string;
  filedDate: string;
  url?: string;
  dateTerminated?: string;
}

export interface Vote {
  id: string;
  politicianId: string;
  billNumber: string;
  billTitle: string;
  voteValue: 'Yes' | 'No' | 'Abstain' | 'Absent';
  date: string;
  billSummary: string;
  category: string;
}

export interface SocialPost {
  id: string;
  politicianId: string;
  platform: 'Twitter' | 'Facebook' | 'Instagram' | 'TikTok';
  content: string;
  postUrl: string;
  postedAt: string;
  sentimentScore: number; // -1 to 1
  isDeleted: boolean;
}

export interface Jurisdiction {
  id: string;
  name: string;
  type: JurisdictionType;
  parentId?: string;
  politicianCount: number;
}

// ---------------------------------------------------------------------------
// Corruption Score Algorithm Types
// ---------------------------------------------------------------------------

export type CorruptionGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type CorruptionConfidence = 'high' | 'medium' | 'low';

/** Breakdown of an individual scoring factor */
export interface CorruptionFactor {
  /** Machine-readable key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Raw score for this factor (0-100) before weighting */
  rawScore: number;
  /** Weight applied (0-1, all weights sum to 1) */
  weight: number;
  /** Weighted contribution to the final score */
  weightedScore: number;
  /** Whether this factor used real data or a placeholder */
  dataAvailable: boolean;
  /** Short explanation of how this factor was scored */
  explanation: string;
}

/** Full corruption score result for a politician */
export interface CorruptionScoreResult {
  /** Overall score 0-100 (0 = clean, 100 = maximally corrupt/influenced) */
  score: number;
  /** Letter grade: A (0-20), B (21-40), C (41-60), D (61-80), F (81-100) */
  grade: CorruptionGrade;
  /** Confidence level based on data completeness */
  confidence: CorruptionConfidence;
  /** Percentage of scoring factors that had real data (0-100) */
  dataCompleteness: number;
  /** Breakdown of each scoring factor */
  factors: CorruptionFactor[];
  /** When the score was computed */
  computedAt: string;
}

// ---------------------------------------------------------------------------
// LegiScan API Types — FL State Voting Records
// ---------------------------------------------------------------------------

export interface LegiScanSession {
  session_id: number;
  state_id: number;
  state_abbr: string;
  year_start: number;
  year_end: number;
  special: number;
  session_tag: string;
  session_title: string;
  session_name: string;
}

export interface LegiScanBillSummary {
  bill_id: number;
  number: string;
  change_hash: string;
  url: string;
  status_date: string;
  status: number;
  last_action_date: string;
  last_action: string;
  title: string;
  description: string;
}

export interface LegiScanRollCallMeta {
  roll_call_id: number;
  date: string;
  desc: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: number;
  chamber: string;
  chamber_id: number;
  url: string;
  state_link: string;
}

export interface LegiScanSponsor {
  people_id: number;
  party: string;
  role: string;
  name: string;
  first_name: string;
  last_name: string;
  district: string;
  votesmart_id: number;
  sponsor_type_id: number;
  sponsor_order: number;
}

export interface LegiScanBillDetail {
  bill_id: number;
  bill_number: string;
  bill_type: string;
  title: string;
  description: string;
  state: string;
  session_id: number;
  status: number;
  status_desc: string;
  url: string;
  state_link: string;
  sponsors: LegiScanSponsor[];
  votes: LegiScanRollCallMeta[];
}

export interface LegiScanIndividualVote {
  people_id: number;
  vote_id: number;        // 1=Yea, 2=Nay, 3=NV, 4=Absent
  vote_text: string;      // "Yea", "Nay", "NV", "Absent"
}

export interface LegiScanRollCallDetail {
  roll_call_id: number;
  bill_id: number;
  date: string;
  desc: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: number;
  chamber: string;
  chamber_id: number;
  votes: LegiScanIndividualVote[];
}

/** Processed state vote record, ready for display in the politician detail page */
export interface StateVoteRecord {
  id: string;
  politicianId: string;
  billNumber: string;
  billTitle: string;
  billDescription: string;
  billUrl: string;
  voteDate: string;
  votePosition: 'Yea' | 'Nay' | 'NV' | 'Absent';
  rollCallDesc: string;
  chamber: 'H' | 'S';
  passed: boolean;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  sessionTitle: string;
  source: 'legiscan';
}

/** People ID mapping for matching LegiScan people_id to our politician IDs */
export interface LegiScanPeopleMapping {
  people_id: number;
  politician_id: string;
  name: string;
  district: string;
  party: string;
  role: string;
  votesmart_id?: number;
}

// ---------------------------------------------------------------------------
// LDA Lobbying Disclosure Act Types — Federal Lobbying Data
// ---------------------------------------------------------------------------

/** A lobbyist individual as returned by the LDA API */
export interface LDALobbyist {
  id: number;
  prefix: string | null;
  first_name: string;
  nickname: string | null;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  covered_position: string | null;
  new: boolean;
}

/** A lobbying activity entry (issue area + description + lobbyists) */
export interface LDALobbyingActivity {
  general_issue_code: string;
  general_issue_code_display: string;
  description: string;
  foreign_entity_issues: string | null;
  lobbyists: Array<{
    lobbyist: Omit<LDALobbyist, 'covered_position' | 'new'>;
    covered_position: string | null;
    new: boolean;
  }>;
  government_entities: Array<{
    id: number;
    name: string;
  }>;
}

/** An LDA registrant (the lobbying firm or self-employed lobbyist) */
export interface LDARegistrant {
  id: number;
  url: string;
  house_registrant_id: number | null;
  name: string;
  description: string | null;
  address_1: string;
  address_2: string | null;
  city: string;
  state: string;
  state_display: string;
  zip: string;
  country: string;
  country_display: string;
  ppb_country: string;
  ppb_country_display: string;
  contact_name: string;
  contact_telephone: string;
  dt_updated: string;
}

/** An LDA client (who hired the lobbying firm) */
export interface LDAClient {
  id: number;
  url: string;
  client_id: number;
  name: string;
  general_description: string | null;
  client_government_entity: boolean | null;
  client_self_select: boolean | null;
  state: string;
  state_display: string;
  country: string;
  country_display: string;
  ppb_state: string;
  ppb_state_display: string;
  ppb_country: string;
  ppb_country_display: string;
  effective_date: string;
}

/** A full LDA filing (LD-1 registration or LD-2 quarterly activity report) */
export interface LDAFiling {
  url: string;
  filing_uuid: string;
  filing_type: string;
  filing_type_display: string;
  filing_year: number;
  filing_period: string;
  filing_period_display: string;
  filing_document_url: string;
  filing_document_content_type: string;
  income: string | null;
  expenses: string | null;
  expenses_method: string | null;
  expenses_method_display: string | null;
  posted_by_name: string;
  dt_posted: string;
  termination_date: string | null;
  registrant_country: string;
  registrant_ppb_country: string | null;
  registrant: LDARegistrant;
  client: LDAClient;
  lobbying_activities: LDALobbyingActivity[];
  conviction_disclosures: unknown[];
  foreign_entities: unknown[];
  affiliated_organizations: unknown[];
}

/** LD-203 contribution item (lobbyist contributions to federal candidates/PACs) */
export interface LDAContributionItem {
  contribution_type: string;
  contribution_type_display: string;
  contributor_name: string;
  payee_name: string;
  honoree_name: string;
  amount: string;
  date: string;
}

/** An LDA contribution report (LD-203) */
export interface LDAContributionReport {
  url: string;
  filing_uuid: string;
  filing_type: string;
  filing_type_display: string;
  filing_year: number;
  filing_period: string;
  filing_period_display: string;
  filing_document_url: string;
  filer_type: string;
  filer_type_display: string;
  dt_posted: string;
  registrant: LDARegistrant;
  lobbyist: Omit<LDALobbyist, 'covered_position' | 'new'>;
  no_contributions: boolean;
  pacs: unknown[];
  contribution_items: LDAContributionItem[];
}

/** Paginated response envelope from the LDA API */
export interface LDAPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Processed lobbying record for display in the app, linked to a politician */
export interface LobbyingRecord {
  id: string;
  filingUuid: string;
  filingType: string;
  filingTypeDisplay: string;
  filingYear: number;
  filingPeriod: string;
  registrantName: string;
  registrantId: number;
  clientName: string;
  clientDescription: string | null;
  clientState: string;
  income: number | null;
  expenses: number | null;
  lobbyists: Array<{
    name: string;
    coveredPosition: string | null;
  }>;
  issueAreas: Array<{
    code: string;
    display: string;
    description: string;
  }>;
  governmentEntities: string[];
  postedDate: string;
  documentUrl: string;
  hasForeignEntities: boolean;
  /** Politician ID from our system if we matched this filing to a politician */
  matchedPoliticianId?: string;
  matchReason?: string;
}

/** Summary of lobbying activity for a single politician */
export interface PoliticianLobbyingSummary {
  politicianId: string;
  politicianName: string;
  totalFilings: number;
  totalIncome: number;
  totalExpenses: number;
  uniqueClients: number;
  uniqueRegistrants: number;
  topClients: Array<{
    name: string;
    totalIncome: number;
    filingCount: number;
  }>;
  topIssueAreas: Array<{
    code: string;
    display: string;
    count: number;
  }>;
  filings: LobbyingRecord[];
  lastUpdated: string;
}
