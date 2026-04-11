/**
 * Seed Supabase with elected officials for top 30 Georgia counties by population,
 * plus major city officials (Atlanta, Savannah, Augusta, Columbus, Macon, Athens).
 *
 * Officials per county: Board of Commissioners/Chair, Sheriff, District Attorney,
 * Clerk of Court, Tax Commissioner, Probate Judge.
 *
 * Usage:
 *   npx tsx scripts/seed-georgia-counties.ts
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://xwaejtxqhwendbbdiowa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfficialRecord {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: string | null;
  jurisdiction: string;
  jurisdiction_type: string;
  photo_url: string | null;
  corruption_score: number;
  aipac_funding: number;
  juice_box_tier: string;
  total_funds: number;
  top5_donors: unknown[];
  israel_lobby_total: number;
  israel_lobby_breakdown: unknown | null;
  is_active: boolean;
  years_in_office: number;
  bio: string;
  term_start: string | null;
  term_end: string | null;
  social_media: Record<string, unknown>;
  source_ids: Record<string, unknown>;
  data_source: string;
}

// ---------------------------------------------------------------------------
// Helper: create an official record
// ---------------------------------------------------------------------------

function official(
  county: string,
  office: string,
  officeLevel: string,
  name: string,
  party: string,
  bio: string,
  district: string | null = null,
): OfficialRecord {
  const slug = county.toLowerCase().replace(/\s+/g, '-');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  return {
    bioguide_id: `ga-${slug}-${officeSlug}-${nameSlug}`,
    name,
    office,
    office_level: officeLevel,
    party,
    district,
    jurisdiction: `${county} County`,
    jurisdiction_type: 'county',
    photo_url: null,
    corruption_score: 0,
    aipac_funding: 0,
    juice_box_tier: 'none',
    total_funds: 0,
    top5_donors: [],
    israel_lobby_total: 0,
    israel_lobby_breakdown: null,
    is_active: true,
    years_in_office: 0,
    bio,
    term_start: null,
    term_end: null,
    social_media: {},
    source_ids: {},
    data_source: 'ga-county-seed-2026',
  };
}

function cityOfficial(
  city: string,
  office: string,
  officeLevel: string,
  name: string,
  party: string,
  bio: string,
  district: string | null = null,
): OfficialRecord {
  const slug = city.toLowerCase().replace(/\s+/g, '-');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  return {
    bioguide_id: `ga-city-${slug}-${officeSlug}-${nameSlug}`,
    name,
    office,
    office_level: officeLevel,
    party,
    district,
    jurisdiction: `City of ${city}`,
    jurisdiction_type: 'municipal',
    photo_url: null,
    corruption_score: 0,
    aipac_funding: 0,
    juice_box_tier: 'none',
    total_funds: 0,
    top5_donors: [],
    israel_lobby_total: 0,
    israel_lobby_breakdown: null,
    is_active: true,
    years_in_office: 0,
    bio,
    term_start: null,
    term_end: null,
    social_media: {},
    source_ids: {},
    data_source: 'ga-city-seed-2026',
  };
}

// ---------------------------------------------------------------------------
// BATCH 1: Fulton, Gwinnett, Cobb, DeKalb, Chatham, Cherokee, Forsyth, Henry,
//          Richmond, Clayton, Hall, Muscogee, Bibb, Columbia, Douglas
// ---------------------------------------------------------------------------

const batch1: OfficialRecord[] = [

  // =========================================================================
  // FULTON COUNTY (Population ~1,066,000 - includes most of Atlanta)
  // =========================================================================
  official('Fulton', 'Commission Chair', 'Commission Chair', 'Robb Pitts', 'Democrat',
    'Chairman of Fulton County Board of Commissioners. Long-serving public official in Fulton County government.'),
  official('Fulton', 'County Commissioner District 1', 'County Commissioner', 'Khadijah Abdur-Rahman', 'Democrat',
    'Fulton County Commissioner representing District 1.', 'District 1'),
  official('Fulton', 'County Commissioner District 2', 'County Commissioner', 'Bob Ellis', 'Republican',
    'Fulton County Commissioner representing District 2 (North Fulton).', 'District 2'),
  official('Fulton', 'County Commissioner District 3', 'County Commissioner', 'Dana Barrett', 'Democrat',
    'Fulton County Commissioner representing District 3.', 'District 3'),
  official('Fulton', 'County Commissioner District 4', 'County Commissioner', 'Natalie Hall', 'Democrat',
    'Fulton County Commissioner representing District 4.', 'District 4'),
  official('Fulton', 'County Commissioner District 5', 'County Commissioner', 'Marvin Arrington Jr.', 'Democrat',
    'Fulton County Commissioner representing District 5.', 'District 5'),
  official('Fulton', 'County Commissioner District 6', 'County Commissioner', 'Joe Carn', 'Democrat',
    'Fulton County Commissioner representing District 6.', 'District 6'),
  official('Fulton', 'Sheriff', 'Sheriff', 'Patrick Labat', 'Democrat',
    'Fulton County Sheriff. Responsible for county jail operations and court security.'),
  official('Fulton', 'District Attorney', 'District Attorney', 'Fani Willis', 'Democrat',
    'Fulton County District Attorney. Prosecutes criminal cases in Fulton County.'),
  official('Fulton', 'Clerk of Superior Court', 'Clerk of Court', 'Che Alexander', 'Democrat',
    'Fulton County Clerk of Superior Court. Manages court records and filings.'),
  official('Fulton', 'Tax Commissioner', 'Tax Commissioner', 'Arthur Ferdinand', 'Democrat',
    'Fulton County Tax Commissioner. Oversees property tax collection and motor vehicle registration.'),
  official('Fulton', 'Probate Judge', 'Probate Judge', 'Kenya Johnson', 'Nonpartisan',
    'Fulton County Probate Judge. Handles wills, estates, guardianships, and marriage licenses.'),

  // =========================================================================
  // GWINNETT COUNTY (Population ~957,000)
  // =========================================================================
  official('Gwinnett', 'Commission Chair', 'Commission Chair', 'Nicole Love Hendrickson', 'Democrat',
    'Chairwoman of Gwinnett County Board of Commissioners. First Black woman to lead Gwinnett County.'),
  official('Gwinnett', 'County Commissioner District 1', 'County Commissioner', 'Kirkland Carden', 'Democrat',
    'Gwinnett County Commissioner representing District 1.', 'District 1'),
  official('Gwinnett', 'County Commissioner District 2', 'County Commissioner', 'Ben Ku', 'Democrat',
    'Gwinnett County Commissioner representing District 2.', 'District 2'),
  official('Gwinnett', 'County Commissioner District 3', 'County Commissioner', 'Jasper Watkins III', 'Democrat',
    'Gwinnett County Commissioner representing District 3.', 'District 3'),
  official('Gwinnett', 'County Commissioner District 4', 'County Commissioner', 'Marlene Fosque', 'Democrat',
    'Gwinnett County Commissioner representing District 4.', 'District 4'),
  official('Gwinnett', 'Sheriff', 'Sheriff', 'Keybo Taylor', 'Democrat',
    'Gwinnett County Sheriff. First Black sheriff of Gwinnett County.'),
  official('Gwinnett', 'District Attorney', 'District Attorney', 'Patsy Austin-Gatson', 'Democrat',
    'Gwinnett County District Attorney. Prosecutes criminal cases in Gwinnett County.'),
  official('Gwinnett', 'Clerk of Superior Court', 'Clerk of Court', 'Tiana Garner', 'Democrat',
    'Gwinnett County Clerk of Superior Court.'),
  official('Gwinnett', 'Tax Commissioner', 'Tax Commissioner', 'Tiffany Porter', 'Democrat',
    'Gwinnett County Tax Commissioner.'),
  official('Gwinnett', 'Probate Judge', 'Probate Judge', 'Rashida Oliver', 'Nonpartisan',
    'Gwinnett County Probate Judge.'),

  // =========================================================================
  // COBB COUNTY (Population ~766,000)
  // =========================================================================
  official('Cobb', 'Commission Chair', 'Commission Chair', 'Lisa Cupid', 'Democrat',
    'Chairwoman of Cobb County Board of Commissioners. First Black woman to serve as Chair.'),
  official('Cobb', 'County Commissioner District 1', 'County Commissioner', 'Keli Gambrill', 'Republican',
    'Cobb County Commissioner representing District 1.', 'District 1'),
  official('Cobb', 'County Commissioner District 2', 'County Commissioner', 'Jerica Richardson', 'Democrat',
    'Cobb County Commissioner representing District 2.', 'District 2'),
  official('Cobb', 'County Commissioner District 3', 'County Commissioner', 'JoAnn Birrell', 'Republican',
    'Cobb County Commissioner representing District 3.', 'District 3'),
  official('Cobb', 'County Commissioner District 4', 'County Commissioner', 'Monique Sheffield', 'Democrat',
    'Cobb County Commissioner representing District 4.', 'District 4'),
  official('Cobb', 'Sheriff', 'Sheriff', 'Craig Owens', 'Democrat',
    'Cobb County Sheriff. First Black sheriff of Cobb County.'),
  official('Cobb', 'District Attorney', 'District Attorney', 'Flynn Broady Jr.', 'Democrat',
    'Cobb County District Attorney (Cobb Judicial Circuit).'),
  official('Cobb', 'Clerk of Superior Court', 'Clerk of Court', 'Connie Taylor', 'Democrat',
    'Cobb County Clerk of Superior Court.'),
  official('Cobb', 'Tax Commissioner', 'Tax Commissioner', 'Carla Jackson', 'Democrat',
    'Cobb County Tax Commissioner.'),
  official('Cobb', 'Probate Judge', 'Probate Judge', 'Kelli Wolk', 'Nonpartisan',
    'Cobb County Probate Judge.'),

  // =========================================================================
  // DEKALB COUNTY (Population ~764,000)
  // =========================================================================
  official('DeKalb', 'CEO', 'Commission Chair', 'Michael Thurmond', 'Democrat',
    'DeKalb County CEO. Former Georgia Labor Commissioner. Highest elected official in DeKalb County.'),
  official('DeKalb', 'County Commissioner District 1', 'County Commissioner', 'Robert Patrick', 'Democrat',
    'DeKalb County Commissioner representing District 1.', 'District 1'),
  official('DeKalb', 'County Commissioner District 2', 'County Commissioner', 'Marshall Orson', 'Republican',
    'DeKalb County Commissioner representing District 2.', 'District 2'),
  official('DeKalb', 'County Commissioner District 3', 'County Commissioner', 'Larry Johnson', 'Democrat',
    'DeKalb County Commissioner representing District 3. Serves as Commission Chair.', 'District 3'),
  official('DeKalb', 'County Commissioner District 4', 'County Commissioner', 'Steve Bradshaw', 'Democrat',
    'DeKalb County Commissioner representing District 4.', 'District 4'),
  official('DeKalb', 'County Commissioner District 5', 'County Commissioner', 'Mereda Davis Johnson', 'Democrat',
    'DeKalb County Commissioner representing District 5.', 'District 5'),
  official('DeKalb', 'County Commissioner District 6', 'County Commissioner', 'Ted Terry', 'Democrat',
    'DeKalb County Commissioner representing District 6. Former Mayor of Clarkston.', 'District 6'),
  official('DeKalb', 'County Commissioner District 7', 'County Commissioner', 'Lorraine Cochran-Johnson', 'Democrat',
    'DeKalb County Commissioner representing District 7.', 'District 7'),
  official('DeKalb', 'Sheriff', 'Sheriff', 'Melody Maddox', 'Democrat',
    'DeKalb County Sheriff.'),
  official('DeKalb', 'District Attorney', 'District Attorney', 'Sherry Boston', 'Democrat',
    'DeKalb County District Attorney (Stone Mountain Judicial Circuit).'),
  official('DeKalb', 'Clerk of Superior Court', 'Clerk of Court', 'Debra DeBerry', 'Democrat',
    'DeKalb County Clerk of Superior Court.'),
  official('DeKalb', 'Tax Commissioner', 'Tax Commissioner', 'Irvin Johnson', 'Democrat',
    'DeKalb County Tax Commissioner.'),
  official('DeKalb', 'Probate Judge', 'Probate Judge', 'Clarence Seeliger', 'Nonpartisan',
    'DeKalb County Probate Judge.'),

  // =========================================================================
  // CHATHAM COUNTY (Population ~295,000 - includes Savannah)
  // =========================================================================
  official('Chatham', 'Commission Chair', 'Commission Chair', 'Chester Ellis', 'Democrat',
    'Chairman of Chatham County Commission.'),
  official('Chatham', 'County Commissioner District 1', 'County Commissioner', 'Bobby Lockett', 'Democrat',
    'Chatham County Commissioner representing District 1.', 'District 1'),
  official('Chatham', 'County Commissioner District 2', 'County Commissioner', 'Tony Thomas', 'Democrat',
    'Chatham County Commissioner representing District 2.', 'District 2'),
  official('Chatham', 'County Commissioner District 3', 'County Commissioner', 'Tanya Milton', 'Democrat',
    'Chatham County Commissioner representing District 3.', 'District 3'),
  official('Chatham', 'County Commissioner District 4', 'County Commissioner', 'Helen Stone', 'Republican',
    'Chatham County Commissioner representing District 4.', 'District 4'),
  official('Chatham', 'County Commissioner District 5', 'County Commissioner', 'Dean Kicklighter', 'Republican',
    'Chatham County Commissioner representing District 5.', 'District 5'),
  official('Chatham', 'County Commissioner District 6', 'County Commissioner', 'Larry Stuber', 'Republican',
    'Chatham County Commissioner representing District 6.', 'District 6'),
  official('Chatham', 'County Commissioner District 7', 'County Commissioner', 'Patrick Shay', 'Republican',
    'Chatham County Commissioner representing District 7.', 'District 7'),
  official('Chatham', 'County Commissioner District 8', 'County Commissioner', 'Aaron Whitely', 'Democrat',
    'Chatham County Commissioner representing District 8.', 'District 8'),
  official('Chatham', 'Sheriff', 'Sheriff', 'John Wilcher', 'Republican',
    'Chatham County Sheriff.'),
  official('Chatham', 'District Attorney', 'District Attorney', 'Shalena Cook Jones', 'Democrat',
    'Chatham County District Attorney (Eastern Judicial Circuit).'),
  official('Chatham', 'Clerk of Superior Court', 'Clerk of Court', 'Tammie Mosley', 'Democrat',
    'Chatham County Clerk of Superior Court.'),
  official('Chatham', 'Tax Commissioner', 'Tax Commissioner', 'Shawn Kachmar', 'Republican',
    'Chatham County Tax Commissioner.'),
  official('Chatham', 'Probate Judge', 'Probate Judge', 'Harris Odell', 'Nonpartisan',
    'Chatham County Probate Judge.'),

  // =========================================================================
  // CHEROKEE COUNTY (Population ~266,000)
  // =========================================================================
  official('Cherokee', 'Commission Chair', 'Commission Chair', 'Harry Johnston', 'Republican',
    'Chairman of Cherokee County Board of Commissioners.'),
  official('Cherokee', 'County Commissioner District 1', 'County Commissioner', 'Richard Weatherby', 'Republican',
    'Cherokee County Commissioner representing District 1.', 'District 1'),
  official('Cherokee', 'County Commissioner District 2', 'County Commissioner', 'Benny Carter', 'Republican',
    'Cherokee County Commissioner representing District 2.', 'District 2'),
  official('Cherokee', 'County Commissioner District 3', 'County Commissioner', 'Ray Gunnin', 'Republican',
    'Cherokee County Commissioner representing District 3.', 'District 3'),
  official('Cherokee', 'County Commissioner District 4', 'County Commissioner', 'Jeff Watkins', 'Republican',
    'Cherokee County Commissioner representing District 4.', 'District 4'),
  official('Cherokee', 'Sheriff', 'Sheriff', 'Frank Reynolds', 'Republican',
    'Cherokee County Sheriff.'),
  official('Cherokee', 'District Attorney', 'District Attorney', 'Shannon Wallace', 'Republican',
    'Cherokee County District Attorney (Blue Ridge Judicial Circuit).'),
  official('Cherokee', 'Clerk of Superior Court', 'Clerk of Court', 'Patty Baker', 'Republican',
    'Cherokee County Clerk of Superior Court.'),
  official('Cherokee', 'Tax Commissioner', 'Tax Commissioner', 'Sonya Little', 'Republican',
    'Cherokee County Tax Commissioner.'),
  official('Cherokee', 'Probate Judge', 'Probate Judge', 'Keith Wood', 'Nonpartisan',
    'Cherokee County Probate Judge.'),

  // =========================================================================
  // FORSYTH COUNTY (Population ~260,000)
  // =========================================================================
  official('Forsyth', 'Commission Chair', 'Commission Chair', 'Laura Semanson', 'Republican',
    'Chairwoman of Forsyth County Board of Commissioners.'),
  official('Forsyth', 'County Commissioner District 1', 'County Commissioner', 'Molly Cooper', 'Republican',
    'Forsyth County Commissioner representing District 1.', 'District 1'),
  official('Forsyth', 'County Commissioner District 2', 'County Commissioner', 'Alfred John', 'Republican',
    'Forsyth County Commissioner representing District 2.', 'District 2'),
  official('Forsyth', 'County Commissioner District 3', 'County Commissioner', 'Todd Levent', 'Republican',
    'Forsyth County Commissioner representing District 3.', 'District 3'),
  official('Forsyth', 'County Commissioner District 4', 'County Commissioner', 'Cindy Jones Mills', 'Republican',
    'Forsyth County Commissioner representing District 4.', 'District 4'),
  official('Forsyth', 'Sheriff', 'Sheriff', 'Ron Freeman', 'Republican',
    'Forsyth County Sheriff.'),
  official('Forsyth', 'District Attorney', 'District Attorney', 'Penny Penn', 'Republican',
    'Forsyth County District Attorney (Bell-Forsyth Judicial Circuit).'),
  official('Forsyth', 'Clerk of Superior Court', 'Clerk of Court', 'Greg Allen', 'Republican',
    'Forsyth County Clerk of Superior Court.'),
  official('Forsyth', 'Tax Commissioner', 'Tax Commissioner', 'Kristin Morrissey', 'Republican',
    'Forsyth County Tax Commissioner.'),
  official('Forsyth', 'Probate Judge', 'Probate Judge', 'Dennis Blackmon', 'Nonpartisan',
    'Forsyth County Probate Judge.'),

  // =========================================================================
  // HENRY COUNTY (Population ~240,000)
  // =========================================================================
  official('Henry', 'Commission Chair', 'Commission Chair', 'Carlotta Harrell', 'Democrat',
    'Chairwoman of Henry County Board of Commissioners.'),
  official('Henry', 'County Commissioner District 1', 'County Commissioner', 'Johnny Wilson', 'Democrat',
    'Henry County Commissioner representing District 1.', 'District 1'),
  official('Henry', 'County Commissioner District 2', 'County Commissioner', 'Dee Clemmons', 'Democrat',
    'Henry County Commissioner representing District 2.', 'District 2'),
  official('Henry', 'County Commissioner District 3', 'County Commissioner', 'Vivian Thomas', 'Democrat',
    'Henry County Commissioner representing District 3.', 'District 3'),
  official('Henry', 'County Commissioner District 4', 'County Commissioner', 'June Wood', 'Republican',
    'Henry County Commissioner representing District 4.', 'District 4'),
  official('Henry', 'Sheriff', 'Sheriff', 'Reginald Scandrett', 'Democrat',
    'Henry County Sheriff.'),
  official('Henry', 'District Attorney', 'District Attorney', 'Darius Pattillo', 'Democrat',
    'Henry County District Attorney (Flint Judicial Circuit).'),
  official('Henry', 'Clerk of Superior Court', 'Clerk of Court', 'Barbara Harrison', 'Democrat',
    'Henry County Clerk of Superior Court.'),
  official('Henry', 'Tax Commissioner', 'Tax Commissioner', 'LaTonya Baker', 'Democrat',
    'Henry County Tax Commissioner.'),
  official('Henry', 'Probate Judge', 'Probate Judge', 'Brian Amero', 'Nonpartisan',
    'Henry County Probate Judge.'),

  // =========================================================================
  // RICHMOND COUNTY (Population ~206,000 - includes Augusta)
  // =========================================================================
  official('Richmond', 'Mayor (Augusta-Richmond)', 'Mayor', 'Garnett Johnson', 'Democrat',
    'Mayor of Augusta-Richmond County (consolidated government).'),
  official('Richmond', 'County Commissioner District 1', 'County Commissioner', 'Jordan Johnson', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 1.', 'District 1'),
  official('Richmond', 'County Commissioner District 2', 'County Commissioner', 'Dennis Williams', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 2.', 'District 2'),
  official('Richmond', 'County Commissioner District 3', 'County Commissioner', 'Catherine Smith McKnight', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 3.', 'District 3'),
  official('Richmond', 'County Commissioner District 4', 'County Commissioner', 'Alvin Mason', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 4.', 'District 4'),
  official('Richmond', 'County Commissioner District 5', 'County Commissioner', 'Bobby Williams', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 5.', 'District 5'),
  official('Richmond', 'County Commissioner District 6', 'County Commissioner', 'Sean Frantom', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 6.', 'District 6'),
  official('Richmond', 'County Commissioner District 7', 'County Commissioner', 'Francine Scott', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 7.', 'District 7'),
  official('Richmond', 'County Commissioner District 8', 'County Commissioner', 'Brandon Garrett', 'Republican',
    'Augusta-Richmond County Commissioner representing District 8.', 'District 8'),
  official('Richmond', 'County Commissioner District 9', 'County Commissioner', 'John Clarke', 'Republican',
    'Augusta-Richmond County Commissioner representing District 9.', 'District 9'),
  official('Richmond', 'County Commissioner District 10', 'County Commissioner', 'Ben Hasan', 'Democrat',
    'Augusta-Richmond County Commissioner representing District 10.', 'District 10'),
  official('Richmond', 'Sheriff', 'Sheriff', 'Richard Roundtree', 'Democrat',
    'Richmond County Sheriff.'),
  official('Richmond', 'District Attorney', 'District Attorney', 'Jared Williams', 'Democrat',
    'Richmond County District Attorney (Augusta Judicial Circuit).'),
  official('Richmond', 'Clerk of Superior Court', 'Clerk of Court', 'Elaine Johnson', 'Democrat',
    'Richmond County Clerk of Superior Court.'),
  official('Richmond', 'Tax Commissioner', 'Tax Commissioner', 'Steven Kendrick', 'Democrat',
    'Richmond County Tax Commissioner.'),
  official('Richmond', 'Probate Judge', 'Probate Judge', 'Fredericka Sheppard', 'Nonpartisan',
    'Richmond County Probate Judge.'),

  // =========================================================================
  // CLAYTON COUNTY (Population ~297,000)
  // =========================================================================
  official('Clayton', 'Commission Chair', 'Commission Chair', 'Jeffrey Turner', 'Democrat',
    'Chairman of Clayton County Board of Commissioners.'),
  official('Clayton', 'County Commissioner District 1', 'County Commissioner', 'Sonna Singleton Gregory', 'Democrat',
    'Clayton County Commissioner representing District 1.', 'District 1'),
  official('Clayton', 'County Commissioner District 2', 'County Commissioner', 'DeMont Davis', 'Democrat',
    'Clayton County Commissioner representing District 2.', 'District 2'),
  official('Clayton', 'County Commissioner District 3', 'County Commissioner', 'Felicia Franklin', 'Democrat',
    'Clayton County Commissioner representing District 3.', 'District 3'),
  official('Clayton', 'County Commissioner District 4', 'County Commissioner', 'Alieka Anderson', 'Democrat',
    'Clayton County Commissioner representing District 4.', 'District 4'),
  official('Clayton', 'Sheriff', 'Sheriff', 'Levon Allen', 'Democrat',
    'Clayton County Sheriff.'),
  official('Clayton', 'District Attorney', 'District Attorney', 'Charles Brooks', 'Democrat',
    'Clayton County District Attorney (Clayton Judicial Circuit).'),
  official('Clayton', 'Clerk of Superior Court', 'Clerk of Court', 'Ramona Howard', 'Democrat',
    'Clayton County Clerk of Superior Court.'),
  official('Clayton', 'Tax Commissioner', 'Tax Commissioner', 'Tisa Smart', 'Democrat',
    'Clayton County Tax Commissioner.'),
  official('Clayton', 'Probate Judge', 'Probate Judge', 'Shana Rooks Malone', 'Nonpartisan',
    'Clayton County Probate Judge.'),

  // =========================================================================
  // HALL COUNTY (Population ~210,000)
  // =========================================================================
  official('Hall', 'Commission Chair', 'Commission Chair', 'Richard Higgins', 'Republican',
    'Chairman of Hall County Board of Commissioners.'),
  official('Hall', 'County Commissioner District 1', 'County Commissioner', 'Billy Powell', 'Republican',
    'Hall County Commissioner representing District 1.', 'District 1'),
  official('Hall', 'County Commissioner District 2', 'County Commissioner', 'Steve Gailey', 'Republican',
    'Hall County Commissioner representing District 2.', 'District 2'),
  official('Hall', 'County Commissioner District 3', 'County Commissioner', 'Scott Gibbs', 'Republican',
    'Hall County Commissioner representing District 3.', 'District 3'),
  official('Hall', 'County Commissioner District 4', 'County Commissioner', 'Jeff Stowe', 'Republican',
    'Hall County Commissioner representing District 4.', 'District 4'),
  official('Hall', 'Sheriff', 'Sheriff', 'Gerald Couch', 'Republican',
    'Hall County Sheriff.'),
  official('Hall', 'District Attorney', 'District Attorney', 'Lee Darragh', 'Republican',
    'Hall County District Attorney (Northeastern Judicial Circuit).'),
  official('Hall', 'Clerk of Superior Court', 'Clerk of Court', 'Dwight Wood', 'Republican',
    'Hall County Clerk of Superior Court.'),
  official('Hall', 'Tax Commissioner', 'Tax Commissioner', 'Robbie Chandler', 'Republican',
    'Hall County Tax Commissioner.'),
  official('Hall', 'Probate Judge', 'Probate Judge', 'Dwight Billingslea', 'Nonpartisan',
    'Hall County Probate Judge.'),

  // =========================================================================
  // MUSCOGEE COUNTY (Population ~206,000 - includes Columbus)
  // =========================================================================
  official('Muscogee', 'Mayor (Columbus-Muscogee)', 'Mayor', 'Skip Henderson', 'Nonpartisan',
    'Mayor of Columbus-Muscogee County (consolidated government).'),
  official('Muscogee', 'Council Member District 1', 'City Council', 'Jerry Barnes', 'Nonpartisan',
    'Columbus Council Member representing District 1.', 'District 1'),
  official('Muscogee', 'Council Member District 2', 'City Council', 'Glenn Davis', 'Nonpartisan',
    'Columbus Council Member representing District 2.', 'District 2'),
  official('Muscogee', 'Council Member District 3', 'City Council', 'Bruce Huff', 'Nonpartisan',
    'Columbus Council Member representing District 3.', 'District 3'),
  official('Muscogee', 'Council Member District 4', 'City Council', 'Toyia Tucker', 'Nonpartisan',
    'Columbus Council Member representing District 4.', 'District 4'),
  official('Muscogee', 'Council Member District 5', 'City Council', 'Charmaine Crabb', 'Nonpartisan',
    'Columbus Council Member representing District 5.', 'District 5'),
  official('Muscogee', 'Council Member District 6', 'City Council', 'R. Gary Allen', 'Nonpartisan',
    'Columbus Council Member representing District 6.', 'District 6'),
  official('Muscogee', 'Council Member District 7', 'City Council', 'Mimi Woodson', 'Nonpartisan',
    'Columbus Council Member representing District 7.', 'District 7'),
  official('Muscogee', 'Council Member District 8', 'City Council', 'Pops Barnes', 'Nonpartisan',
    'Columbus Council Member representing District 8.', 'District 8'),
  official('Muscogee', 'Council At-Large Post 9', 'City Council', 'Judy Thomas', 'Nonpartisan',
    'Columbus Council At-Large Member Post 9.', 'At-Large'),
  official('Muscogee', 'Council At-Large Post 10', 'City Council', 'Walker Garrett', 'Nonpartisan',
    'Columbus Council At-Large Member Post 10.', 'At-Large'),
  official('Muscogee', 'Sheriff', 'Sheriff', 'Greg Countryman', 'Democrat',
    'Muscogee County Sheriff.'),
  official('Muscogee', 'District Attorney', 'District Attorney', 'Mark Jones', 'Democrat',
    'Muscogee County District Attorney (Chattahoochee Judicial Circuit).'),
  official('Muscogee', 'Clerk of Superior Court', 'Clerk of Court', 'Linda Pierce', 'Democrat',
    'Muscogee County Clerk of Superior Court.'),
  official('Muscogee', 'Tax Commissioner', 'Tax Commissioner', 'Lula Huff', 'Democrat',
    'Muscogee County Tax Commissioner.'),
  official('Muscogee', 'Probate Judge', 'Probate Judge', 'Kathy Amos', 'Nonpartisan',
    'Muscogee County Probate Judge.'),

  // =========================================================================
  // BIBB COUNTY (Population ~155,000 - includes Macon)
  // =========================================================================
  official('Bibb', 'Mayor (Macon-Bibb)', 'Mayor', 'Lester Miller', 'Nonpartisan',
    'Mayor of Macon-Bibb County (consolidated government).'),
  official('Bibb', 'County Commissioner District 1', 'County Commissioner', 'Virgil Watkins', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 1.', 'District 1'),
  official('Bibb', 'County Commissioner District 2', 'County Commissioner', 'Larry Schlesinger', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 2.', 'District 2'),
  official('Bibb', 'County Commissioner District 3', 'County Commissioner', 'Elaine Lucas', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 3.', 'District 3'),
  official('Bibb', 'County Commissioner District 4', 'County Commissioner', 'Scotty Shepherd', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 4.', 'District 4'),
  official('Bibb', 'County Commissioner District 5', 'County Commissioner', 'Seth Clark', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 5.', 'District 5'),
  official('Bibb', 'County Commissioner District 6', 'County Commissioner', 'Mallory Jones', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 6.', 'District 6'),
  official('Bibb', 'County Commissioner District 7', 'County Commissioner', 'Al Tillman', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 7.', 'District 7'),
  official('Bibb', 'County Commissioner District 8', 'County Commissioner', 'Valerie Wynn', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 8.', 'District 8'),
  official('Bibb', 'County Commissioner District 9', 'County Commissioner', 'Joe Allen', 'Nonpartisan',
    'Macon-Bibb County Commissioner representing District 9.', 'District 9'),
  official('Bibb', 'Sheriff', 'Sheriff', 'David Davis', 'Democrat',
    'Bibb County Sheriff.'),
  official('Bibb', 'District Attorney', 'District Attorney', 'Anita Reynolds Howard', 'Democrat',
    'Bibb County District Attorney (Macon Judicial Circuit).'),
  official('Bibb', 'Clerk of Superior Court', 'Clerk of Court', 'Erica Woodford', 'Democrat',
    'Bibb County Clerk of Superior Court.'),
  official('Bibb', 'Tax Commissioner', 'Tax Commissioner', 'Wade McCord', 'Nonpartisan',
    'Bibb County Tax Commissioner.'),
  official('Bibb', 'Probate Judge', 'Probate Judge', 'Sarah Harris', 'Nonpartisan',
    'Bibb County Probate Judge.'),

  // =========================================================================
  // COLUMBIA COUNTY (Population ~160,000)
  // =========================================================================
  official('Columbia', 'Commission Chair', 'Commission Chair', 'Doug Duncan', 'Republican',
    'Chairman of Columbia County Board of Commissioners.'),
  official('Columbia', 'County Commissioner District 1', 'County Commissioner', 'Ron Cross', 'Republican',
    'Columbia County Commissioner representing District 1.', 'District 1'),
  official('Columbia', 'County Commissioner District 2', 'County Commissioner', 'Gary Richardson', 'Republican',
    'Columbia County Commissioner representing District 2.', 'District 2'),
  official('Columbia', 'County Commissioner District 3', 'County Commissioner', 'Bruce Azarelli', 'Republican',
    'Columbia County Commissioner representing District 3.', 'District 3'),
  official('Columbia', 'County Commissioner District 4', 'County Commissioner', 'Travis McKeithen', 'Republican',
    'Columbia County Commissioner representing District 4.', 'District 4'),
  official('Columbia', 'Sheriff', 'Sheriff', 'Buddy Head', 'Republican',
    'Columbia County Sheriff.'),
  official('Columbia', 'District Attorney', 'District Attorney', 'Bobby Christine', 'Republican',
    'Columbia County District Attorney (Columbia Judicial Circuit).'),
  official('Columbia', 'Clerk of Superior Court', 'Clerk of Court', 'Cindy Mason', 'Republican',
    'Columbia County Clerk of Superior Court.'),
  official('Columbia', 'Tax Commissioner', 'Tax Commissioner', 'Elaine Stewart', 'Republican',
    'Columbia County Tax Commissioner.'),
  official('Columbia', 'Probate Judge', 'Probate Judge', 'Barbara Bowen', 'Nonpartisan',
    'Columbia County Probate Judge.'),

  // =========================================================================
  // DOUGLAS COUNTY (Population ~148,000)
  // =========================================================================
  official('Douglas', 'Commission Chair', 'Commission Chair', 'Romona Jackson Jones', 'Democrat',
    'Chairwoman of Douglas County Board of Commissioners.'),
  official('Douglas', 'County Commissioner District 1', 'County Commissioner', 'Kelly Robinson', 'Democrat',
    'Douglas County Commissioner representing District 1.', 'District 1'),
  official('Douglas', 'County Commissioner District 2', 'County Commissioner', 'Tara Blas', 'Democrat',
    'Douglas County Commissioner representing District 2.', 'District 2'),
  official('Douglas', 'County Commissioner District 3', 'County Commissioner', 'Henry Mitchell', 'Democrat',
    'Douglas County Commissioner representing District 3.', 'District 3'),
  official('Douglas', 'County Commissioner District 4', 'County Commissioner', 'Ann Jones Guider', 'Democrat',
    'Douglas County Commissioner representing District 4.', 'District 4'),
  official('Douglas', 'Sheriff', 'Sheriff', 'Tim Pounds', 'Republican',
    'Douglas County Sheriff.'),
  official('Douglas', 'District Attorney', 'District Attorney', 'Dalia Racine', 'Democrat',
    'Douglas County District Attorney (Douglas Judicial Circuit).'),
  official('Douglas', 'Clerk of Superior Court', 'Clerk of Court', 'Janet Holbrook', 'Republican',
    'Douglas County Clerk of Superior Court.'),
  official('Douglas', 'Tax Commissioner', 'Tax Commissioner', 'Greg Jones', 'Democrat',
    'Douglas County Tax Commissioner.'),
  official('Douglas', 'Probate Judge', 'Probate Judge', 'Christina Peterson', 'Nonpartisan',
    'Douglas County Probate Judge.'),
];

// ---------------------------------------------------------------------------
// BATCH 2: Paulding, Clarke, Houston, Fayette, Bartow, Newton, Carroll,
//          Coweta, Lowndes, Whitfield, Glynn, Floyd, Rockdale, Barrow, Troup
// ---------------------------------------------------------------------------

const batch2: OfficialRecord[] = [

  // =========================================================================
  // PAULDING COUNTY (Population ~175,000)
  // =========================================================================
  official('Paulding', 'Commission Chair', 'Commission Chair', 'David Carmichael', 'Republican',
    'Chairman of Paulding County Board of Commissioners.'),
  official('Paulding', 'County Commissioner Post 1', 'County Commissioner', 'Mark Payne', 'Republican',
    'Paulding County Commissioner Post 1.', 'Post 1'),
  official('Paulding', 'County Commissioner Post 2', 'County Commissioner', 'Keith Brooks', 'Republican',
    'Paulding County Commissioner Post 2.', 'Post 2'),
  official('Paulding', 'County Commissioner Post 3', 'County Commissioner', 'Brian Stover', 'Republican',
    'Paulding County Commissioner Post 3.', 'Post 3'),
  official('Paulding', 'County Commissioner Post 4', 'County Commissioner', 'Todd Pownall', 'Republican',
    'Paulding County Commissioner Post 4.', 'Post 4'),
  official('Paulding', 'Sheriff', 'Sheriff', 'Ashley Henson', 'Republican',
    'Paulding County Sheriff.'),
  official('Paulding', 'District Attorney', 'District Attorney', 'Matthew Simmons', 'Republican',
    'Paulding County District Attorney (Paulding Judicial Circuit).'),
  official('Paulding', 'Clerk of Superior Court', 'Clerk of Court', 'Sheila Benson', 'Republican',
    'Paulding County Clerk of Superior Court.'),
  official('Paulding', 'Tax Commissioner', 'Tax Commissioner', 'Matt Avery', 'Republican',
    'Paulding County Tax Commissioner.'),
  official('Paulding', 'Probate Judge', 'Probate Judge', 'Brenda Weaver', 'Nonpartisan',
    'Paulding County Probate Judge.'),

  // =========================================================================
  // CLARKE COUNTY (Population ~130,000 - includes Athens)
  // =========================================================================
  official('Clarke', 'Mayor (Athens-Clarke)', 'Mayor', 'Kelly Girtz', 'Democrat',
    'Mayor of Athens-Clarke County (unified government). Former Clarke County Commissioner.'),
  official('Clarke', 'County Commissioner District 1', 'County Commissioner', 'Ovita Thornton', 'Democrat',
    'Athens-Clarke County Commissioner representing District 1.', 'District 1'),
  official('Clarke', 'County Commissioner District 2', 'County Commissioner', 'Mariah Parker', 'Democrat',
    'Athens-Clarke County Commissioner representing District 2.', 'District 2'),
  official('Clarke', 'County Commissioner District 3', 'County Commissioner', 'Melissa Link', 'Democrat',
    'Athens-Clarke County Commissioner representing District 3.', 'District 3'),
  official('Clarke', 'County Commissioner District 4', 'County Commissioner', 'Allison Wright', 'Democrat',
    'Athens-Clarke County Commissioner representing District 4.', 'District 4'),
  official('Clarke', 'County Commissioner District 5', 'County Commissioner', 'Tim Denson', 'Democrat',
    'Athens-Clarke County Commissioner representing District 5.', 'District 5'),
  official('Clarke', 'County Commissioner District 6', 'County Commissioner', 'Jerry NeSmith', 'Democrat',
    'Athens-Clarke County Commissioner representing District 6.', 'District 6'),
  official('Clarke', 'County Commissioner District 7', 'County Commissioner', 'Patrick Davenport', 'Democrat',
    'Athens-Clarke County Commissioner representing District 7.', 'District 7'),
  official('Clarke', 'County Commissioner District 8', 'County Commissioner', 'Carol Myers', 'Democrat',
    'Athens-Clarke County Commissioner representing District 8.', 'District 8'),
  official('Clarke', 'County Commissioner District 9', 'County Commissioner', 'Tiffany Taylor', 'Democrat',
    'Athens-Clarke County Commissioner representing District 9.', 'District 9'),
  official('Clarke', 'County Commissioner District 10', 'County Commissioner', 'Mike Hamby', 'Republican',
    'Athens-Clarke County Commissioner representing District 10.', 'District 10'),
  official('Clarke', 'Sheriff', 'Sheriff', 'John Q. Williams', 'Democrat',
    'Clarke County Sheriff.'),
  official('Clarke', 'District Attorney', 'District Attorney', 'Deborah Gonzalez', 'Democrat',
    'Clarke County District Attorney (Western Judicial Circuit).'),
  official('Clarke', 'Clerk of Superior Court', 'Clerk of Court', 'Beverly Logan', 'Democrat',
    'Clarke County Clerk of Superior Court.'),
  official('Clarke', 'Tax Commissioner', 'Tax Commissioner', 'Lefty Khutsishvili', 'Democrat',
    'Clarke County Tax Commissioner.'),
  official('Clarke', 'Probate Judge', 'Probate Judge', 'Susan Tate', 'Nonpartisan',
    'Clarke County Probate Judge.'),

  // =========================================================================
  // HOUSTON COUNTY (Population ~160,000)
  // =========================================================================
  official('Houston', 'Commission Chair', 'Commission Chair', 'Tommy Stalnaker', 'Republican',
    'Chairman of Houston County Board of Commissioners.'),
  official('Houston', 'County Commissioner District 1', 'County Commissioner', 'LynnDee Bozeman', 'Republican',
    'Houston County Commissioner representing District 1.', 'District 1'),
  official('Houston', 'County Commissioner District 2', 'County Commissioner', 'Daryl Hay', 'Republican',
    'Houston County Commissioner representing District 2.', 'District 2'),
  official('Houston', 'County Commissioner District 3', 'County Commissioner', 'Jay Walker', 'Republican',
    'Houston County Commissioner representing District 3.', 'District 3'),
  official('Houston', 'County Commissioner District 4', 'County Commissioner', 'Bryce Christy', 'Republican',
    'Houston County Commissioner representing District 4.', 'District 4'),
  official('Houston', 'Sheriff', 'Sheriff', 'Cullen Talton', 'Republican',
    'Houston County Sheriff.'),
  official('Houston', 'District Attorney', 'District Attorney', 'George Hartwig III', 'Republican',
    'Houston County District Attorney (Houston Judicial Circuit).'),
  official('Houston', 'Clerk of Superior Court', 'Clerk of Court', 'Carolyn Sullivan', 'Republican',
    'Houston County Clerk of Superior Court.'),
  official('Houston', 'Tax Commissioner', 'Tax Commissioner', 'Jim McBride', 'Republican',
    'Houston County Tax Commissioner.'),
  official('Houston', 'Probate Judge', 'Probate Judge', 'George McElhenney', 'Nonpartisan',
    'Houston County Probate Judge.'),

  // =========================================================================
  // FAYETTE COUNTY (Population ~118,000)
  // =========================================================================
  official('Fayette', 'Commission Chair', 'Commission Chair', 'Lee Hearn', 'Republican',
    'Chairman of Fayette County Board of Commissioners.'),
  official('Fayette', 'County Commissioner District 1', 'County Commissioner', 'Charles Oddo', 'Republican',
    'Fayette County Commissioner representing District 1.', 'District 1'),
  official('Fayette', 'County Commissioner District 2', 'County Commissioner', 'Edward Gibbons', 'Republican',
    'Fayette County Commissioner representing District 2.', 'District 2'),
  official('Fayette', 'County Commissioner District 3', 'County Commissioner', 'Rich Hoffman', 'Republican',
    'Fayette County Commissioner representing District 3.', 'District 3'),
  official('Fayette', 'County Commissioner District 4', 'County Commissioner', 'Eric Maxwell', 'Republican',
    'Fayette County Commissioner representing District 4.', 'District 4'),
  official('Fayette', 'Sheriff', 'Sheriff', 'Barry Babb', 'Republican',
    'Fayette County Sheriff.'),
  official('Fayette', 'District Attorney', 'District Attorney', 'Marie Broder', 'Republican',
    'Fayette County District Attorney (Griffin Judicial Circuit).'),
  official('Fayette', 'Clerk of Superior Court', 'Clerk of Court', 'Sheila Studdard', 'Republican',
    'Fayette County Clerk of Superior Court.'),
  official('Fayette', 'Tax Commissioner', 'Tax Commissioner', 'George Wingo', 'Republican',
    'Fayette County Tax Commissioner.'),
  official('Fayette', 'Probate Judge', 'Probate Judge', 'Ann Jackson', 'Nonpartisan',
    'Fayette County Probate Judge.'),

  // =========================================================================
  // BARTOW COUNTY (Population ~108,000)
  // =========================================================================
  official('Bartow', 'Sole Commissioner', 'Commission Chair', 'Steve Taylor', 'Republican',
    'Bartow County Sole Commissioner. Bartow uses a sole commissioner form of government.'),
  official('Bartow', 'Sheriff', 'Sheriff', 'Clark Millsap', 'Republican',
    'Bartow County Sheriff.'),
  official('Bartow', 'District Attorney', 'District Attorney', 'Rosemary Greene', 'Republican',
    'Bartow County District Attorney (Cherokee Judicial Circuit).'),
  official('Bartow', 'Clerk of Superior Court', 'Clerk of Court', 'Melba Scoggins', 'Republican',
    'Bartow County Clerk of Superior Court.'),
  official('Bartow', 'Tax Commissioner', 'Tax Commissioner', 'Steve Stewart', 'Republican',
    'Bartow County Tax Commissioner.'),
  official('Bartow', 'Probate Judge', 'Probate Judge', 'Mick Ackerman', 'Nonpartisan',
    'Bartow County Probate Judge.'),

  // =========================================================================
  // NEWTON COUNTY (Population ~114,000)
  // =========================================================================
  official('Newton', 'Commission Chair', 'Commission Chair', 'Marcello Banes', 'Democrat',
    'Chairman of Newton County Board of Commissioners.'),
  official('Newton', 'County Commissioner District 1', 'County Commissioner', 'Stan Edwards', 'Republican',
    'Newton County Commissioner representing District 1.', 'District 1'),
  official('Newton', 'County Commissioner District 2', 'County Commissioner', 'Demond Mason', 'Democrat',
    'Newton County Commissioner representing District 2.', 'District 2'),
  official('Newton', 'County Commissioner District 3', 'County Commissioner', 'Alana Sanders', 'Democrat',
    'Newton County Commissioner representing District 3.', 'District 3'),
  official('Newton', 'County Commissioner District 4', 'County Commissioner', 'J.C. Henderson', 'Democrat',
    'Newton County Commissioner representing District 4.', 'District 4'),
  official('Newton', 'County Commissioner District 5', 'County Commissioner', 'Ronnie Cowan', 'Republican',
    'Newton County Commissioner representing District 5.', 'District 5'),
  official('Newton', 'Sheriff', 'Sheriff', 'Ezell Brown', 'Democrat',
    'Newton County Sheriff.'),
  official('Newton', 'District Attorney', 'District Attorney', 'Randy McGinley', 'Republican',
    'Newton County District Attorney (Alcovy Judicial Circuit).'),
  official('Newton', 'Clerk of Superior Court', 'Clerk of Court', 'Linda Hays', 'Republican',
    'Newton County Clerk of Superior Court.'),
  official('Newton', 'Tax Commissioner', 'Tax Commissioner', 'Marcus Jordan', 'Democrat',
    'Newton County Tax Commissioner.'),
  official('Newton', 'Probate Judge', 'Probate Judge', 'Melanie Bell', 'Nonpartisan',
    'Newton County Probate Judge.'),

  // =========================================================================
  // CARROLL COUNTY (Population ~120,000)
  // =========================================================================
  official('Carroll', 'Commission Chair', 'Commission Chair', 'Michelle Morgan', 'Republican',
    'Chairwoman of Carroll County Board of Commissioners.'),
  official('Carroll', 'County Commissioner District 1', 'County Commissioner', 'Robby Fleck', 'Republican',
    'Carroll County Commissioner representing District 1.', 'District 1'),
  official('Carroll', 'County Commissioner District 2', 'County Commissioner', 'Terry Nolan', 'Republican',
    'Carroll County Commissioner representing District 2.', 'District 2'),
  official('Carroll', 'County Commissioner District 3', 'County Commissioner', 'Andrew Johnson', 'Republican',
    'Carroll County Commissioner representing District 3.', 'District 3'),
  official('Carroll', 'County Commissioner District 4', 'County Commissioner', 'Jonathan Hagen', 'Republican',
    'Carroll County Commissioner representing District 4.', 'District 4'),
  official('Carroll', 'Sheriff', 'Sheriff', 'Terry Langley', 'Republican',
    'Carroll County Sheriff.'),
  official('Carroll', 'District Attorney', 'District Attorney', 'Herb Cranford', 'Republican',
    'Carroll County District Attorney (Coweta Judicial Circuit).'),
  official('Carroll', 'Clerk of Superior Court', 'Clerk of Court', 'Alan Lee', 'Republican',
    'Carroll County Clerk of Superior Court.'),
  official('Carroll', 'Tax Commissioner', 'Tax Commissioner', 'Kent Benson', 'Republican',
    'Carroll County Tax Commissioner.'),
  official('Carroll', 'Probate Judge', 'Probate Judge', 'Steven Engram', 'Nonpartisan',
    'Carroll County Probate Judge.'),

  // =========================================================================
  // COWETA COUNTY (Population ~150,000)
  // =========================================================================
  official('Coweta', 'Commission Chair', 'Commission Chair', 'Al Smith', 'Republican',
    'Chairman of Coweta County Board of Commissioners.'),
  official('Coweta', 'County Commissioner District 1', 'County Commissioner', 'Bob Blackburn', 'Republican',
    'Coweta County Commissioner representing District 1.', 'District 1'),
  official('Coweta', 'County Commissioner District 2', 'County Commissioner', 'Tim Lassetter', 'Republican',
    'Coweta County Commissioner representing District 2.', 'District 2'),
  official('Coweta', 'County Commissioner District 3', 'County Commissioner', 'Paul Shortridge', 'Republican',
    'Coweta County Commissioner representing District 3.', 'District 3'),
  official('Coweta', 'County Commissioner District 4', 'County Commissioner', 'John Chambers', 'Republican',
    'Coweta County Commissioner representing District 4.', 'District 4'),
  official('Coweta', 'Sheriff', 'Sheriff', 'Lenn Wood', 'Republican',
    'Coweta County Sheriff.'),
  official('Coweta', 'District Attorney', 'District Attorney', 'Herb Cranford', 'Republican',
    'Coweta County District Attorney (Coweta Judicial Circuit).'),
  official('Coweta', 'Clerk of Superior Court', 'Clerk of Court', 'Cindy Brown', 'Republican',
    'Coweta County Clerk of Superior Court.'),
  official('Coweta', 'Tax Commissioner', 'Tax Commissioner', 'Faye Broome', 'Republican',
    'Coweta County Tax Commissioner.'),
  official('Coweta', 'Probate Judge', 'Probate Judge', 'Nancy Colville', 'Nonpartisan',
    'Coweta County Probate Judge.'),

  // =========================================================================
  // LOWNDES COUNTY (Population ~118,000)
  // =========================================================================
  official('Lowndes', 'Commission Chair', 'Commission Chair', 'Bill Slaughter', 'Republican',
    'Chairman of Lowndes County Board of Commissioners.'),
  official('Lowndes', 'County Commissioner District 1', 'County Commissioner', 'Joyce Evans', 'Democrat',
    'Lowndes County Commissioner representing District 1.', 'District 1'),
  official('Lowndes', 'County Commissioner District 2', 'County Commissioner', 'Demarcus Marshall', 'Democrat',
    'Lowndes County Commissioner representing District 2.', 'District 2'),
  official('Lowndes', 'County Commissioner District 3', 'County Commissioner', 'Mark Wisenbaker', 'Republican',
    'Lowndes County Commissioner representing District 3.', 'District 3'),
  official('Lowndes', 'County Commissioner District 4', 'County Commissioner', 'Clay Griner', 'Republican',
    'Lowndes County Commissioner representing District 4.', 'District 4'),
  official('Lowndes', 'County Commissioner District 5', 'County Commissioner', 'Scottie Orenstein', 'Republican',
    'Lowndes County Commissioner representing District 5.', 'District 5'),
  official('Lowndes', 'Sheriff', 'Sheriff', 'Ashley Paulk', 'Republican',
    'Lowndes County Sheriff.'),
  official('Lowndes', 'District Attorney', 'District Attorney', 'Brad Shealy', 'Republican',
    'Lowndes County District Attorney (Southern Judicial Circuit).'),
  official('Lowndes', 'Clerk of Superior Court', 'Clerk of Court', 'Sara Crow', 'Republican',
    'Lowndes County Clerk of Superior Court.'),
  official('Lowndes', 'Tax Commissioner', 'Tax Commissioner', 'Marty Griner', 'Republican',
    'Lowndes County Tax Commissioner.'),
  official('Lowndes', 'Probate Judge', 'Probate Judge', 'Chad Daughtrey', 'Nonpartisan',
    'Lowndes County Probate Judge.'),

  // =========================================================================
  // WHITFIELD COUNTY (Population ~105,000)
  // =========================================================================
  official('Whitfield', 'Commission Chair', 'Commission Chair', 'Jevin Jensen', 'Republican',
    'Chairman of Whitfield County Board of Commissioners.'),
  official('Whitfield', 'County Commissioner District 1', 'County Commissioner', 'Roger Crossen', 'Republican',
    'Whitfield County Commissioner representing District 1.', 'District 1'),
  official('Whitfield', 'County Commissioner District 2', 'County Commissioner', 'Barry Robbins', 'Republican',
    'Whitfield County Commissioner representing District 2.', 'District 2'),
  official('Whitfield', 'County Commissioner District 3', 'County Commissioner', 'Greg Jones', 'Republican',
    'Whitfield County Commissioner representing District 3.', 'District 3'),
  official('Whitfield', 'County Commissioner District 4', 'County Commissioner', 'Harold Brooker', 'Republican',
    'Whitfield County Commissioner representing District 4.', 'District 4'),
  official('Whitfield', 'Sheriff', 'Sheriff', 'Scott Chitwood', 'Republican',
    'Whitfield County Sheriff.'),
  official('Whitfield', 'District Attorney', 'District Attorney', 'Bert Poston', 'Republican',
    'Whitfield County District Attorney (Conasauga Judicial Circuit).'),
  official('Whitfield', 'Clerk of Superior Court', 'Clerk of Court', 'Melica Kendrick', 'Republican',
    'Whitfield County Clerk of Superior Court.'),
  official('Whitfield', 'Tax Commissioner', 'Tax Commissioner', 'Danny Sane', 'Republican',
    'Whitfield County Tax Commissioner.'),
  official('Whitfield', 'Probate Judge', 'Probate Judge', 'Brad Stephenson', 'Nonpartisan',
    'Whitfield County Probate Judge.'),

  // =========================================================================
  // GLYNN COUNTY (Population ~86,000)
  // =========================================================================
  official('Glynn', 'Commission Chair', 'Commission Chair', 'David O\'Berry', 'Republican',
    'Chairman of Glynn County Board of Commissioners.'),
  official('Glynn', 'County Commissioner District 1', 'County Commissioner', 'Scott Steele', 'Republican',
    'Glynn County Commissioner representing District 1.', 'District 1'),
  official('Glynn', 'County Commissioner District 2', 'County Commissioner', 'Allen Booker', 'Democrat',
    'Glynn County Commissioner representing District 2.', 'District 2'),
  official('Glynn', 'County Commissioner District 3', 'County Commissioner', 'Peter Murphy', 'Republican',
    'Glynn County Commissioner representing District 3.', 'District 3'),
  official('Glynn', 'County Commissioner District 4', 'County Commissioner', 'Walter Rafolski', 'Republican',
    'Glynn County Commissioner representing District 4.', 'District 4'),
  official('Glynn', 'County Commissioner At-Large Post 5', 'County Commissioner', 'Bill Brunson', 'Republican',
    'Glynn County Commissioner At-Large Post 5.', 'At-Large'),
  official('Glynn', 'County Commissioner At-Large Post 6', 'County Commissioner', 'Bob Coleman', 'Republican',
    'Glynn County Commissioner At-Large Post 6.', 'At-Large'),
  official('Glynn', 'Sheriff', 'Sheriff', 'E. Neal Jump', 'Republican',
    'Glynn County Sheriff.'),
  official('Glynn', 'District Attorney', 'District Attorney', 'Keith Higgins', 'Republican',
    'Glynn County District Attorney (Brunswick Judicial Circuit).'),
  official('Glynn', 'Clerk of Superior Court', 'Clerk of Court', 'Ron Adams', 'Republican',
    'Glynn County Clerk of Superior Court.'),
  official('Glynn', 'Tax Commissioner', 'Tax Commissioner', 'Tina Taylor', 'Republican',
    'Glynn County Tax Commissioner.'),
  official('Glynn', 'Probate Judge', 'Probate Judge', 'Patti Busby', 'Nonpartisan',
    'Glynn County Probate Judge.'),

  // =========================================================================
  // FLOYD COUNTY (Population ~98,000)
  // =========================================================================
  official('Floyd', 'Commission Chair', 'Commission Chair', 'Rhonda Wallace', 'Republican',
    'Chairwoman of Floyd County Board of Commissioners.'),
  official('Floyd', 'County Commissioner District 1', 'County Commissioner', 'Wright Bagby', 'Republican',
    'Floyd County Commissioner representing District 1.', 'District 1'),
  official('Floyd', 'County Commissioner District 2', 'County Commissioner', 'Scotty Hancock', 'Republican',
    'Floyd County Commissioner representing District 2.', 'District 2'),
  official('Floyd', 'County Commissioner District 3', 'County Commissioner', 'Allison Watters', 'Republican',
    'Floyd County Commissioner representing District 3.', 'District 3'),
  official('Floyd', 'County Commissioner District 4', 'County Commissioner', 'Larry Maxey', 'Democrat',
    'Floyd County Commissioner representing District 4.', 'District 4'),
  official('Floyd', 'Sheriff', 'Sheriff', 'Dave Roberson', 'Republican',
    'Floyd County Sheriff.'),
  official('Floyd', 'District Attorney', 'District Attorney', 'Leigh Patterson', 'Republican',
    'Floyd County District Attorney (Rome Judicial Circuit).'),
  official('Floyd', 'Clerk of Superior Court', 'Clerk of Court', 'Joe Pye', 'Republican',
    'Floyd County Clerk of Superior Court.'),
  official('Floyd', 'Tax Commissioner', 'Tax Commissioner', 'Chad Whitfield', 'Republican',
    'Floyd County Tax Commissioner.'),
  official('Floyd', 'Probate Judge', 'Probate Judge', 'Mike Campbell', 'Nonpartisan',
    'Floyd County Probate Judge.'),

  // =========================================================================
  // ROCKDALE COUNTY (Population ~93,000)
  // =========================================================================
  official('Rockdale', 'Commission Chair', 'Commission Chair', 'Oz Nesbitt Sr.', 'Democrat',
    'Chairman of Rockdale County Board of Commissioners.'),
  official('Rockdale', 'County Commissioner Post 1', 'County Commissioner', 'Sherri Washington', 'Democrat',
    'Rockdale County Commissioner Post 1.', 'Post 1'),
  official('Rockdale', 'County Commissioner Post 2', 'County Commissioner', 'Doreen Williams', 'Democrat',
    'Rockdale County Commissioner Post 2.', 'Post 2'),
  official('Rockdale', 'County Commissioner Post 3', 'County Commissioner', 'Sabrina McKinney', 'Democrat',
    'Rockdale County Commissioner Post 3.', 'Post 3'),
  official('Rockdale', 'Sheriff', 'Sheriff', 'Eric Levett', 'Democrat',
    'Rockdale County Sheriff.'),
  official('Rockdale', 'District Attorney', 'District Attorney', 'Alisha Johnson', 'Democrat',
    'Rockdale County District Attorney (Rockdale Judicial Circuit).'),
  official('Rockdale', 'Clerk of Superior Court', 'Clerk of Court', 'Janice Morris', 'Democrat',
    'Rockdale County Clerk of Superior Court.'),
  official('Rockdale', 'Tax Commissioner', 'Tax Commissioner', 'Tisa Smart Washington', 'Democrat',
    'Rockdale County Tax Commissioner.'),
  official('Rockdale', 'Probate Judge', 'Probate Judge', 'Clarence Cuthpert Jr.', 'Nonpartisan',
    'Rockdale County Probate Judge.'),

  // =========================================================================
  // BARROW COUNTY (Population ~83,000)
  // =========================================================================
  official('Barrow', 'Commission Chair', 'Commission Chair', 'Pat Graham', 'Republican',
    'Chairman of Barrow County Board of Commissioners.'),
  official('Barrow', 'County Commissioner District 1', 'County Commissioner', 'John Howard', 'Republican',
    'Barrow County Commissioner representing District 1.', 'District 1'),
  official('Barrow', 'County Commissioner District 2', 'County Commissioner', 'Dana Ansley', 'Republican',
    'Barrow County Commissioner representing District 2.', 'District 2'),
  official('Barrow', 'County Commissioner District 3', 'County Commissioner', 'Robert Cronan', 'Republican',
    'Barrow County Commissioner representing District 3.', 'District 3'),
  official('Barrow', 'County Commissioner District 4', 'County Commissioner', 'Neil Thompson', 'Republican',
    'Barrow County Commissioner representing District 4.', 'District 4'),
  official('Barrow', 'Sheriff', 'Sheriff', 'Jud Smith', 'Republican',
    'Barrow County Sheriff.'),
  official('Barrow', 'District Attorney', 'District Attorney', 'Brad Smith', 'Republican',
    'Barrow County District Attorney (Piedmont Judicial Circuit).'),
  official('Barrow', 'Clerk of Superior Court', 'Clerk of Court', 'Sara Wyatt', 'Republican',
    'Barrow County Clerk of Superior Court.'),
  official('Barrow', 'Tax Commissioner', 'Tax Commissioner', 'Johnny Davis', 'Republican',
    'Barrow County Tax Commissioner.'),
  official('Barrow', 'Probate Judge', 'Probate Judge', 'Shane Crowley', 'Nonpartisan',
    'Barrow County Probate Judge.'),

  // =========================================================================
  // TROUP COUNTY (Population ~73,000)
  // =========================================================================
  official('Troup', 'Commission Chair', 'Commission Chair', 'Patrick Crews', 'Republican',
    'Chairman of Troup County Board of Commissioners.'),
  official('Troup', 'County Commissioner District 1', 'County Commissioner', 'Morris Jones', 'Democrat',
    'Troup County Commissioner representing District 1.', 'District 1'),
  official('Troup', 'County Commissioner District 2', 'County Commissioner', 'Lewis Davis', 'Democrat',
    'Troup County Commissioner representing District 2.', 'District 2'),
  official('Troup', 'County Commissioner District 3', 'County Commissioner', 'Ellis Cadenhead', 'Republican',
    'Troup County Commissioner representing District 3.', 'District 3'),
  official('Troup', 'County Commissioner District 4', 'County Commissioner', 'Chuck Swanson', 'Republican',
    'Troup County Commissioner representing District 4.', 'District 4'),
  official('Troup', 'Sheriff', 'Sheriff', 'James Woodruff', 'Republican',
    'Troup County Sheriff.'),
  official('Troup', 'District Attorney', 'District Attorney', 'Herbert Franklin Jr.', 'Republican',
    'Troup County District Attorney (Troup Judicial Circuit).'),
  official('Troup', 'Clerk of Superior Court', 'Clerk of Court', 'Jackie Taylor', 'Republican',
    'Troup County Clerk of Superior Court.'),
  official('Troup', 'Tax Commissioner', 'Tax Commissioner', 'Brad Kile', 'Republican',
    'Troup County Tax Commissioner.'),
  official('Troup', 'Probate Judge', 'Probate Judge', 'Jeff Langley', 'Nonpartisan',
    'Troup County Probate Judge.'),
];

// ---------------------------------------------------------------------------
// BATCH 3: Major City Officials
// ---------------------------------------------------------------------------

const cityOfficials: OfficialRecord[] = [

  // =========================================================================
  // ATLANTA (City of Atlanta - Mayor + City Council)
  // =========================================================================
  cityOfficial('Atlanta', 'Mayor', 'Mayor', 'Andre Dickens', 'Democrat',
    'Mayor of Atlanta. Elected in 2021, serving Georgia\'s capital and largest city.'),
  cityOfficial('Atlanta', 'City Council President', 'City Council', 'Doug Shipman', 'Democrat',
    'Atlanta City Council President. Presides over council meetings and legislative agenda.'),
  cityOfficial('Atlanta', 'City Council District 1', 'City Council', 'Jason Dozier', 'Democrat',
    'Atlanta City Council member representing District 1.', 'District 1'),
  cityOfficial('Atlanta', 'City Council District 2', 'City Council', 'Amir Farokhi', 'Democrat',
    'Atlanta City Council member representing District 2.', 'District 2'),
  cityOfficial('Atlanta', 'City Council District 3', 'City Council', 'Byron Amos', 'Democrat',
    'Atlanta City Council member representing District 3.', 'District 3'),
  cityOfficial('Atlanta', 'City Council District 4', 'City Council', 'Jason Winston', 'Democrat',
    'Atlanta City Council member representing District 4.', 'District 4'),
  cityOfficial('Atlanta', 'City Council District 5', 'City Council', 'Liliana Bakhtiari', 'Democrat',
    'Atlanta City Council member representing District 5.', 'District 5'),
  cityOfficial('Atlanta', 'City Council District 6', 'City Council', 'Alex Wan', 'Democrat',
    'Atlanta City Council member representing District 6.', 'District 6'),
  cityOfficial('Atlanta', 'City Council District 7', 'City Council', 'Howard Shook', 'Democrat',
    'Atlanta City Council member representing District 7.', 'District 7'),
  cityOfficial('Atlanta', 'City Council District 8', 'City Council', 'Mary Norwood', 'Independent',
    'Atlanta City Council member representing District 8.', 'District 8'),
  cityOfficial('Atlanta', 'City Council District 9', 'City Council', 'Dustin Hillis', 'Democrat',
    'Atlanta City Council member representing District 9.', 'District 9'),
  cityOfficial('Atlanta', 'City Council District 10', 'City Council', 'Andrea Boone', 'Democrat',
    'Atlanta City Council member representing District 10.', 'District 10'),
  cityOfficial('Atlanta', 'City Council District 11', 'City Council', 'Marci Collier Overstreet', 'Democrat',
    'Atlanta City Council member representing District 11.', 'District 11'),
  cityOfficial('Atlanta', 'City Council District 12', 'City Council', 'Antonio Lewis', 'Democrat',
    'Atlanta City Council member representing District 12.', 'District 12'),
  cityOfficial('Atlanta', 'City Council At-Large Post 1', 'City Council', 'Michael Julian Bond', 'Democrat',
    'Atlanta City Council At-Large member Post 1.', 'At-Large'),
  cityOfficial('Atlanta', 'City Council At-Large Post 2', 'City Council', 'Matt Westmoreland', 'Democrat',
    'Atlanta City Council At-Large member Post 2.', 'At-Large'),
  cityOfficial('Atlanta', 'City Council At-Large Post 3', 'City Council', 'Keisha Sean Waites', 'Democrat',
    'Atlanta City Council At-Large member Post 3.', 'At-Large'),

  // =========================================================================
  // SAVANNAH
  // =========================================================================
  cityOfficial('Savannah', 'Mayor', 'Mayor', 'Van Johnson', 'Democrat',
    'Mayor of Savannah. Leading Georgia\'s oldest city and a major port city.'),
  cityOfficial('Savannah', 'Alderman At-Large Post 1', 'City Council', 'Kesha Gibson-Carter', 'Nonpartisan',
    'Savannah Alderman At-Large Post 1.', 'At-Large'),
  cityOfficial('Savannah', 'Alderman At-Large Post 2', 'City Council', 'Alicia Miller Blakely', 'Nonpartisan',
    'Savannah Alderman At-Large Post 2.', 'At-Large'),
  cityOfficial('Savannah', 'Alderman District 1', 'City Council', 'Bernetta Lanier', 'Nonpartisan',
    'Savannah Alderman representing District 1.', 'District 1'),
  cityOfficial('Savannah', 'Alderman District 2', 'City Council', 'Detric Leggett', 'Nonpartisan',
    'Savannah Alderman representing District 2.', 'District 2'),
  cityOfficial('Savannah', 'Alderman District 3', 'City Council', 'Linda Wilder-Bryan', 'Nonpartisan',
    'Savannah Alderman representing District 3.', 'District 3'),
  cityOfficial('Savannah', 'Alderman District 4', 'City Council', 'Nick Palumbo', 'Nonpartisan',
    'Savannah Alderman representing District 4.', 'District 4'),
  cityOfficial('Savannah', 'Alderman District 5', 'City Council', 'Estella Shabazz', 'Nonpartisan',
    'Savannah Alderman representing District 5.', 'District 5'),
  cityOfficial('Savannah', 'Alderman District 6', 'City Council', 'Kurtis Purtee', 'Nonpartisan',
    'Savannah Alderman representing District 6.', 'District 6'),

  // =========================================================================
  // AUGUSTA (consolidated with Richmond County - key city officials)
  // =========================================================================
  // Note: Augusta-Richmond is consolidated; county officials already listed above.
  // Adding city administrator / key appointed positions would be non-elected.

  // =========================================================================
  // COLUMBUS (consolidated with Muscogee - already listed above)
  // =========================================================================

  // =========================================================================
  // MACON (consolidated with Bibb - already listed above)
  // =========================================================================

  // =========================================================================
  // ATHENS (consolidated with Clarke - already listed above)
  // =========================================================================
];

// ---------------------------------------------------------------------------
// Main insertion logic
// ---------------------------------------------------------------------------

async function insertBatch(records: OfficialRecord[], label: string): Promise<number> {
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('politicians')
      .upsert(batch, { onConflict: 'bioguide_id' });

    if (error) {
      console.error(`  [${label}] Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  [${label}] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows upserted (${inserted}/${records.length})`);
    }
  }

  if (errors > 0) {
    console.error(`  [${label}] ${errors} records failed.`);
  }

  return inserted;
}

function countByCounty(records: OfficialRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    const key = r.jurisdiction;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  console.log('=== Georgia County Officials Seed ===\n');

  // Batch 1: Top 15 counties
  console.log('--- Batch 1: Fulton, Gwinnett, Cobb, DeKalb, Chatham, Cherokee, Forsyth, Henry, Richmond, Clayton, Hall, Muscogee, Bibb, Columbia, Douglas ---');
  const b1 = await insertBatch(batch1, 'Batch 1');

  // Batch 2: Next 15 counties
  console.log('\n--- Batch 2: Paulding, Clarke, Houston, Fayette, Bartow, Newton, Carroll, Coweta, Lowndes, Whitfield, Glynn, Floyd, Rockdale, Barrow, Troup ---');
  const b2 = await insertBatch(batch2, 'Batch 2');

  // Batch 3: Major city officials
  console.log('\n--- Batch 3: City Officials (Atlanta, Savannah) ---');
  const b3 = await insertBatch(cityOfficials, 'Cities');

  // Summary
  const totalInserted = b1 + b2 + b3;
  console.log('\n=== SUMMARY ===');
  console.log(`Total records inserted: ${totalInserted}`);
  console.log(`  Batch 1 (15 counties): ${b1}`);
  console.log(`  Batch 2 (15 counties): ${b2}`);
  console.log(`  City officials: ${b3}`);

  console.log('\n--- Per-County Breakdown ---');
  const allRecords = [...batch1, ...batch2, ...cityOfficials];
  const breakdown = countByCounty(allRecords);
  const sorted = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  for (const [jurisdiction, count] of sorted) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }

  // Final count in DB
  const { count, error: countErr } = await supabase
    .from('politicians')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error(`\nVerification count error: ${countErr.message}`);
  } else {
    console.log(`\nTotal politicians in database: ${count}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
