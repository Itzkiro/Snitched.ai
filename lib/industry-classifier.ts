/**
 * Industry Classifier for Campaign Finance Contributions
 *
 * Classifies contributors by industry/sector using employer and occupation fields.
 * This is Snitched.ai's self-built alternative to OpenSecrets' proprietary coding system.
 *
 * Coverage: ~80% accuracy via keyword matching. The remaining 20% falls into "Unclassified".
 */

export type IndustrySector =
  | 'Israel Lobby'
  | 'Defense'
  | 'Legal'
  | 'Real Estate'
  | 'Healthcare'
  | 'Finance'
  | 'Energy'
  | 'Tech'
  | 'Education'
  | 'Agriculture'
  | 'Construction'
  | 'Hospitality'
  | 'Media'
  | 'Transportation'
  | 'Pharma'
  | 'Insurance'
  | 'Telecom'
  | 'Retail'
  | 'Manufacturing'
  | 'Labor'
  | 'Lobby Firm'
  | 'Political Party'
  | 'Self-Funded'
  | 'Retired'
  | 'Homemaker'
  | 'Unclassified';

interface ClassificationRule {
  sector: IndustrySector;
  /** Keywords to match against donor name, employer, or occupation (case-insensitive) */
  keywords: string[];
  /** If true, only match against donor/committee name (not employer/occupation) */
  nameOnly?: boolean;
}

/**
 * Rules are ordered by priority — first match wins.
 * Israel Lobby is checked first so it's never misclassified as generic "PAC".
 */
const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  // ---- Israel Lobby (highest priority) ----
  {
    sector: 'Israel Lobby',
    keywords: [
      'AIPAC', 'AMERICAN ISRAEL PUBLIC AFFAIRS',
      'UNITED DEMOCRACY PROJECT',
      'DEMOCRATIC MAJORITY FOR ISRAEL',
      'PRO-ISRAEL AMERICA',
      'NORPAC',
      'J STREET', 'JSTREET',
      'JOINT ACTION COMMITTEE FOR POLITICAL',
      'WASHINGTON PAC',
      'ISRAEL BONDS', 'FRIENDS OF ISRAEL', 'ISRAEL ALLIES',
      'JEWISH FEDERATION', 'JEWISH NATIONAL FUND',
      'ZIONIST', 'HADASSAH',
    ],
  },

  // ---- Defense / Military ----
  {
    sector: 'Defense',
    keywords: [
      'LOCKHEED', 'RAYTHEON', 'RTX', 'NORTHROP GRUMMAN',
      'BOEING', 'GENERAL DYNAMICS', 'L3HARRIS', 'BAE SYSTEMS',
      'LEIDOS', 'SAIC', 'DEFENSE', 'MILITARY', 'ARMED FORCES',
    ],
  },

  // ---- Lobby Firms ----
  {
    sector: 'Lobby Firm',
    keywords: [
      'LOBBYING', 'LOBBYIST', 'GOVERNMENT RELATIONS',
      'PUBLIC AFFAIRS', 'GOVERNMENT AFFAIRS',
      'ADVOCACY', 'CONSULTING GROUP',
    ],
  },

  // ---- Political Party / PAC ----
  {
    sector: 'Political Party',
    keywords: [
      'REPUBLICAN PARTY', 'DEMOCRATIC PARTY',
      'REPUBLICAN NATIONAL', 'DEMOCRATIC NATIONAL',
      'GOP', 'DNC', 'RNC',
      'REPUBLICAN COMMITTEE', 'DEMOCRATIC COMMITTEE',
    ],
  },

  // ---- Legal ----
  {
    sector: 'Legal',
    keywords: [
      'ATTORNEY', 'LAWYER', 'LAW FIRM', 'LAW OFFICE',
      'LEGAL', 'COUNSEL', 'ESQUIRE', 'ESQ',
      'BARRISTER', 'SOLICITOR', 'PARALEGAL',
      'GREENBERG TRAURIG', 'HOLLAND & KNIGHT',
      'SHUTTS & BOWEN', 'GUNSTER', 'AKERMAN',
      'CARLTON FIELDS', 'GrayRobinson'.toUpperCase(),
    ],
  },

  // ---- Real Estate ----
  {
    sector: 'Real Estate',
    keywords: [
      'REAL ESTATE', 'REALTY', 'REALTOR', 'PROPERTY',
      'DEVELOPER', 'DEVELOPMENT', 'HOMEBUILDER', 'HOME BUILDER',
      'CONSTRUCTION', 'LENNAR', 'GL HOMES', 'WCI COMMUNITIES',
      'MORTGAGE', 'TITLE COMPANY', 'TITLE INSURANCE',
    ],
  },

  // ---- Healthcare ----
  {
    sector: 'Healthcare',
    keywords: [
      'PHYSICIAN', 'DOCTOR', 'SURGEON', 'DENTIST', 'NURSE',
      'HOSPITAL', 'MEDICAL', 'HEALTH CARE', 'HEALTHCARE',
      'CLINIC', 'DENTAL', 'OPTOMETRIST', 'CHIROPRACTOR',
      'HCA', 'ADVENTHEALTH', 'BAPTIST HEALTH', 'MAYO CLINIC',
    ],
  },

  // ---- Pharma ----
  {
    sector: 'Pharma',
    keywords: [
      'PHARMACEUTICAL', 'PHARMA', 'DRUG', 'BIOTECH',
      'PFIZER', 'JOHNSON & JOHNSON', 'ABBVIE', 'MERCK',
      'NOVARTIS', 'AMGEN', 'GILEAD',
    ],
  },

  // ---- Finance / Banking ----
  {
    sector: 'Finance',
    keywords: [
      'BANK', 'BANKING', 'FINANCIAL', 'INVESTMENT',
      'CAPITAL', 'SECURITIES', 'WEALTH', 'ASSET MANAGEMENT',
      'HEDGE FUND', 'PRIVATE EQUITY', 'VENTURE CAPITAL',
      'JPMORGAN', 'GOLDMAN SACHS', 'MORGAN STANLEY',
      'WELLS FARGO', 'CITIBANK', 'RAYMOND JAMES',
      'BROKER', 'TRADER', 'ACCOUNTANT', 'CPA',
    ],
  },

  // ---- Insurance ----
  {
    sector: 'Insurance',
    keywords: [
      'INSURANCE', 'UNDERWRITER', 'ACTUARY',
      'STATE FARM', 'ALLSTATE', 'GEICO', 'PROGRESSIVE',
      'CITIZENS PROPERTY', 'UNIVERSAL INSURANCE',
    ],
  },

  // ---- Energy ----
  {
    sector: 'Energy',
    keywords: [
      'ENERGY', 'OIL', 'GAS', 'PETROLEUM', 'PIPELINE',
      'SOLAR', 'WIND', 'UTILITY', 'ELECTRIC', 'POWER',
      'FPL', 'FLORIDA POWER', 'NEXTERA', 'DUKE ENERGY',
      'EXXON', 'CHEVRON', 'BP', 'SHELL',
    ],
  },

  // ---- Tech ----
  {
    sector: 'Tech',
    keywords: [
      'TECHNOLOGY', 'SOFTWARE', 'ENGINEER', 'DEVELOPER',
      'PROGRAMMER', 'COMPUTER', 'IT CONSULTANT',
      'GOOGLE', 'APPLE', 'MICROSOFT', 'META', 'AMAZON',
      'ORACLE', 'IBM', 'CISCO', 'INTEL',
      'STARTUP', 'AI ', 'ARTIFICIAL INTELLIGENCE',
      'CYBER', 'DATA SCIENCE', 'MACHINE LEARNING',
    ],
  },

  // ---- Telecom ----
  {
    sector: 'Telecom',
    keywords: [
      'TELECOM', 'TELECOMMUNICATIONS', 'AT&T', 'VERIZON',
      'T-MOBILE', 'COMCAST', 'CHARTER', 'SPECTRUM',
    ],
  },

  // ---- Education ----
  {
    sector: 'Education',
    keywords: [
      'TEACHER', 'PROFESSOR', 'EDUCATION', 'UNIVERSITY',
      'COLLEGE', 'SCHOOL', 'ACADEMIC', 'PRINCIPAL',
      'SUPERINTENDENT', 'INSTRUCTOR',
    ],
  },

  // ---- Agriculture ----
  {
    sector: 'Agriculture',
    keywords: [
      'FARM', 'RANCH', 'AGRICULTURE', 'CITRUS', 'CATTLE',
      'SUGAR', 'U.S. SUGAR', 'FLORIDA CRYSTALS',
      'CROP', 'DAIRY', 'LIVESTOCK',
    ],
  },

  // ---- Construction ----
  {
    sector: 'Construction',
    keywords: [
      'CONTRACTOR', 'BUILDER', 'PLUMBER', 'ELECTRICIAN',
      'ROOFING', 'PAVING', 'CONCRETE', 'EXCAVATION',
      'ARCHITECTURE', 'ARCHITECT', 'ENGINEERING FIRM',
    ],
  },

  // ---- Hospitality / Tourism ----
  {
    sector: 'Hospitality',
    keywords: [
      'HOTEL', 'RESORT', 'RESTAURANT', 'TOURISM',
      'HOSPITALITY', 'DISNEY', 'UNIVERSAL STUDIOS',
      'CRUISE', 'CARNIVAL', 'ROYAL CARIBBEAN',
    ],
  },

  // ---- Media ----
  {
    sector: 'Media',
    keywords: [
      'MEDIA', 'NEWS', 'BROADCAST', 'TELEVISION', 'RADIO',
      'PUBLISHING', 'JOURNALIST', 'REPORTER',
      'ADVERTISING', 'PUBLIC RELATIONS', 'PR FIRM',
    ],
  },

  // ---- Transportation ----
  {
    sector: 'Transportation',
    keywords: [
      'TRANSPORT', 'TRUCKING', 'LOGISTICS', 'SHIPPING',
      'RAILROAD', 'AIRLINE', 'AVIATION', 'PILOT',
      'AUTO DEALER', 'AUTOMOBILE', 'CAR DEALER',
    ],
  },

  // ---- Retail ----
  {
    sector: 'Retail',
    keywords: [
      'RETAIL', 'STORE', 'SHOP', 'WALMART', 'PUBLIX',
      'WINN-DIXIE', 'TARGET', 'COSTCO',
    ],
  },

  // ---- Manufacturing ----
  {
    sector: 'Manufacturing',
    keywords: [
      'MANUFACTURING', 'FACTORY', 'FABRICATION',
      'INDUSTRIAL', 'ASSEMBLY', 'PRODUCTION',
    ],
  },

  // ---- Labor / Unions ----
  {
    sector: 'Labor',
    keywords: [
      'UNION', 'AFL-CIO', 'TEAMSTERS', 'SEIU',
      'IBEW', 'FIREFIGHTERS', 'POLICE BENEVOLENT',
      'FRATERNAL ORDER', 'TEACHERS UNION', 'FEA',
      'LABORERS', 'CARPENTERS',
    ],
  },

  // ---- Self-Funded ----
  {
    sector: 'Self-Funded',
    keywords: ['SELF', 'CANDIDATE', 'PERSONAL FUNDS'],
    nameOnly: true,
  },

  // ---- Retired ----
  {
    sector: 'Retired',
    keywords: ['RETIRED', 'RETIREE', 'RETIREMENT'],
  },

  // ---- Homemaker ----
  {
    sector: 'Homemaker',
    keywords: ['HOMEMAKER', 'HOUSEWIFE', 'STAY AT HOME', 'NOT EMPLOYED', 'NONE'],
  },
];

/**
 * Classify a campaign contribution by industry sector.
 *
 * @param donorName - Contributor or committee name
 * @param employer  - Contributor's employer (may be empty for PACs)
 * @param occupation - Contributor's occupation (may be empty for PACs)
 * @returns The classified industry sector
 */
export function classifyContribution(
  donorName: string,
  employer: string = '',
  occupation: string = '',
): IndustrySector {
  const nameUpper = (donorName || '').toUpperCase();
  const employerUpper = (employer || '').toUpperCase();
  const occupationUpper = (occupation || '').toUpperCase();
  const combined = `${nameUpper} ${employerUpper} ${occupationUpper}`;

  for (const rule of CLASSIFICATION_RULES) {
    const searchText = rule.nameOnly ? nameUpper : combined;
    for (const keyword of rule.keywords) {
      if (searchText.includes(keyword)) {
        return rule.sector;
      }
    }
  }

  return 'Unclassified';
}

/**
 * Check if a contribution is from the Israel lobby.
 * Uses the same patterns as the FEC sync for consistency.
 */
export function isIsraelLobby(
  donorName: string,
  employer: string = '',
  occupation: string = '',
): boolean {
  return classifyContribution(donorName, employer, occupation) === 'Israel Lobby';
}

/**
 * Aggregate contributions by sector for a politician.
 */
export function aggregateBySector(
  contributions: Array<{
    donorName: string;
    employer?: string;
    occupation?: string;
    amount: number;
  }>,
): Record<IndustrySector, number> {
  const result = {} as Record<IndustrySector, number>;

  for (const c of contributions) {
    const sector = classifyContribution(c.donorName, c.employer, c.occupation);
    result[sector] = (result[sector] || 0) + c.amount;
  }

  return result;
}
