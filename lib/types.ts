export type Party = 'Democrat' | 'Republican' | 'Independent' | 'Other';

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
  | 'Judge';

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
  };
  termStart: string;
  termEnd?: string;
  yearsInOffice: number;
  isActive: boolean;
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
