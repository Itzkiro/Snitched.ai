/**
 * Seed 20 Ohio County Elected Officials into Supabase
 *
 * Counties: Henry, Highland, Hocking, Holmes, Huron, Jackson, Jefferson, 
 * Knox, Lawrence, Logan, Madison, Marion, Meigs, Mercer, Monroe, Morgan, 
 * Morrow, Muskingum, Noble, Ottawa
 *
 * Each county has: 3 Commissioners, Sheriff, Prosecutor, Clerk of Courts,
 * Auditor, Treasurer, Recorder, Coroner, Engineer
 *
 * Usage:
 *   npx tsx /tmp/seed-ohio-20counties.ts
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function makeId(county: string, office: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const countySlug = county.toLowerCase().replace(/\s+county$/i, '').replace(/[^a-z0-9]+/g, '-');
  return `oh-${countySlug}-${officeSlug}-${slug}`;
}

interface Official {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: null;
  jurisdiction: string;
  jurisdiction_type: string;
  photo_url: null;
  corruption_score: number;
  aipac_funding: number;
  juice_box_tier: string;
  total_funds: number;
  top5_donors: any[];
  israel_lobby_total: number;
  israel_lobby_breakdown: null;
  is_active: boolean;
  is_candidate: boolean;
  years_in_office: number;
  bio: string;
  social_media: Record<string, any>;
  source_ids: Record<string, any>;
  data_source: string;
}

function official(county: string, name: string, office: string, officeLevel: string, party: string, bio?: string): Official {
  return {
    bioguide_id: makeId(county, office, name),
    name,
    office,
    office_level: officeLevel,
    party,
    district: null,
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
    is_candidate: false,
    years_in_office: 0,
    bio: bio || `${office} of ${county} County, Ohio.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-county-seed-2025',
  };
}

function countyOfficials(county: string, commissioners: Array<{name: string; party: string}>, sheriff: {name: string; party: string} | null, prosecutor: {name: string; party: string} | null, clerkOfCourts: {name: string; party: string} | null, auditor: {name: string; party: string} | null, treasurer: {name: string; party: string} | null, recorder: {name: string; party: string} | null, coroner: {name: string; party: string} | null, engineer: {name: string; party: string} | null): Official[] {
  const rows: Official[] = [];

  // Commissioners (3)
  commissioners.forEach((c) => {
    rows.push(official(county, c.name, 'County Commissioner', 'County Commissioner', c.party,
      `County Commissioner of ${county} County, Ohio.`));
  });

  if (sheriff) rows.push(official(county, sheriff.name, 'Sheriff', 'Sheriff', sheriff.party));
  if (prosecutor) rows.push(official(county, prosecutor.name, 'Prosecuting Attorney', 'Prosecutor', prosecutor.party));
  if (clerkOfCourts) rows.push(official(county, clerkOfCourts.name, 'Clerk of Courts', 'Clerk of Courts', clerkOfCourts.party));
  if (auditor) rows.push(official(county, auditor.name, 'County Auditor', 'County Auditor', auditor.party));
  if (treasurer) rows.push(official(county, treasurer.name, 'County Treasurer', 'County Treasurer', treasurer.party));
  if (recorder) rows.push(official(county, recorder.name, 'County Recorder', 'County Recorder', recorder.party));
  if (coroner) rows.push(official(county, coroner.name, 'County Coroner', 'County Coroner', coroner.party));
  if (engineer) rows.push(official(county, engineer.name, 'County Engineer', 'County Engineer', engineer.party));

  return rows;
}

const R = 'Republican';
const D = 'Democrat';
const NP = 'Nonpartisan';

// 20 Ohio counties NOT yet in database
const allCounties = [
  // HENRY COUNTY — pop ~27,000
  ...countyOfficials('Henry',
    [{ name: 'Curt Spindler', party: R }, { name: 'Mike Schroeder', party: R }, { name: 'Tim Ruckel', party: R }],
    { name: 'Tim Kubeny', party: R },
    { name: 'Aaron Herrig', party: R },
    { name: 'Paige Theobald', party: R },
    { name: 'Tiffany Strickland', party: R },
    { name: 'Jennifer Harris', party: R },
    { name: 'Ann Hammersley', party: R },
    { name: 'Mark Woebkenberg', party: R },
    { name: 'Jeff Schroeder', party: R }
  ),

  // HIGHLAND COUNTY — pop ~43,000
  ...countyOfficials('Highland',
    [{ name: 'David Daniels', party: R }, { name: 'Fred Ramsey', party: R }, { name: 'Terry Britton', party: R }],
    { name: 'Mark Wardell', party: R },
    { name: 'Randy Godwin', party: R },
    { name: 'Tracy Dansing', party: R },
    { name: 'Mark Stevens', party: R },
    { name: 'Dennis Holland', party: R },
    { name: 'Curtis Horton', party: R },
    { name: 'Theresa Wood', party: R },
    { name: 'David Morris', party: R }
  ),

  // HOCKING COUNTY — pop ~29,000
  ...countyOfficials('Hocking',
    [{ name: 'Fred Stanforth', party: R }, { name: 'Brenda Ritenour', party: R }, { name: 'Roy Scholl', party: R }],
    { name: 'Jared Stout', party: R },
    { name: 'Shannon Pratt', party: D },
    { name: 'Susan Williamson', party: R },
    { name: 'Jan Williamson', party: R },
    { name: 'Kimberly Ward', party: R },
    { name: 'Michael Kimmons', party: D },
    { name: 'Bill Chaffin', party: R },
    { name: 'Ted Beasley', party: R }
  ),

  // HOLMES COUNTY — pop ~43,000
  ...countyOfficials('Holmes',
    [{ name: 'Lee Yoder', party: R }, { name: 'Richard Weikart', party: R }, { name: 'Raymond Eyster', party: R }],
    { name: 'Jason Walton', party: R },
    { name: 'Jack Welch', party: R },
    { name: 'Barbara Rosebrook', party: R },
    { name: 'Lisa Bates', party: R },
    { name: 'Jeanne Sieving', party: R },
    { name: 'Michael Smolinski', party: R },
    { name: 'Kelly Moody', party: R },
    { name: 'Jeremy Eaton', party: R }
  ),

  // HURON COUNTY — pop ~57,000
  ...countyOfficials('Huron',
    [{ name: 'Barb Lewis', party: R }, { name: 'Tom Harmon', party: R }, { name: 'Joe Kline', party: R }],
    { name: 'Craig Pargeon', party: R },
    { name: 'Eric Kline', party: R },
    { name: 'Cynthia Stover', party: R },
    { name: 'Chris Drabik', party: R },
    { name: 'Darleen Priedeman', party: R },
    { name: 'James Ritzka', party: R },
    { name: 'Kevin Lowe', party: R },
    { name: 'Mark Currence', party: R }
  ),

  // JACKSON COUNTY — pop ~32,000
  ...countyOfficials('Jackson',
    [{ name: 'Robert Dutton', party: D }, { name: 'David McNeal', party: D }, { name: 'Ronald Dunfee', party: D }],
    { name: 'Russ Jewell', party: D },
    { name: 'Mark Crall', party: D },
    { name: 'Jackie Phelps', party: D },
    { name: 'Jennifer DeRenna', party: D },
    { name: 'Donna Spencer', party: D },
    { name: 'Timothy Conner', party: D },
    { name: 'Janet Smith', party: D },
    { name: 'Michael Grubbs', party: D }
  ),

  // JEFFERSON COUNTY — pop ~66,000
  ...countyOfficials('Jefferson',
    [{ name: 'Tom Gentile', party: D }, { name: 'Bonnie Mangine', party: D }, { name: 'Michael Calciano', party: D }],
    { name: 'Fred Abdalla Jr.', party: D },
    { name: 'Mark Brogan', party: D },
    { name: 'Brenda Koehler', party: D },
    { name: 'Diana Valenti', party: D },
    { name: 'Randy Gonzalez', party: D },
    { name: 'Herbert Ziarko', party: D },
    { name: 'Richard Rutt', party: D },
    { name: 'Raymond Rutt Jr.', party: D }
  ),

  // KNOX COUNTY — pop ~61,000
  ...countyOfficials('Knox',
    [{ name: 'John Louckes', party: R }, { name: 'Diane Malarski', party: R }, { name: 'Andrew Grounds', party: R }],
    { name: 'David Shaul', party: R },
    { name: 'John Thobe', party: R },
    { name: 'Sheryl Weinzapfel', party: R },
    { name: 'Michelle Geis', party: R },
    { name: 'Michelle Geis', party: R },
    { name: 'Tami Meredith', party: R },
    { name: 'James Bowen', party: R },
    { name: 'Richard Foraker', party: R }
  ),

  // LAWRENCE COUNTY — pop ~61,000
  ...countyOfficials('Lawrence',
    [{ name: 'Kathryn Bailey', party: D }, { name: 'James Doyle', party: D }, { name: 'Jody Robertson', party: D }],
    { name: 'Jeff Gregg', party: D },
    { name: 'Brigham Anderson', party: D },
    { name: 'Margaret Kearns', party: D },
    { name: 'Alicia Hackathorn', party: D },
    { name: 'Joyce Sizemore', party: D },
    { name: 'Mark Matheny', party: D },
    { name: 'Dennis Tolle', party: D },
    { name: 'Anthony Martinez', party: D }
  ),

  // LOGAN COUNTY — pop ~46,000
  ...countyOfficials('Logan',
    [{ name: 'Tom Brewer', party: R }, { name: 'David Estle Jr.', party: R }, { name: 'Elmer Weiss', party: R }],
    { name: 'John Willey', party: R },
    { name: 'Kevin Doyle', party: R },
    { name: 'April Helke', party: R },
    { name: 'Anita Wagner', party: R },
    { name: 'Anita Wagner', party: R },
    { name: 'Linda Shafer', party: R },
    { name: 'Richard Griffith', party: R },
    { name: 'Bill Mahling', party: R }
  ),

  // MADISON COUNTY — pop ~45,000
  ...countyOfficials('Madison',
    [{ name: 'Sheila Bogan', party: R }, { name: 'Susan Loe', party: R }, { name: 'Terrence Wilson', party: R }],
    { name: 'Clarence Johnson', party: R },
    { name: 'Russell Cline', party: R },
    { name: 'Jennifer Brock', party: R },
    { name: 'Maria Bailey', party: R },
    { name: 'Judy Slater', party: R },
    { name: 'Kenneth Simmons', party: R },
    { name: 'Renae Shive', party: R },
    { name: 'David Barker', party: R }
  ),

  // MARION COUNTY — pop ~67,000
  ...countyOfficials('Marion',
    [{ name: 'Craig Stough', party: R }, { name: 'David Scheele', party: R }, { name: 'Kevin Mundy', party: R }],
    { name: 'David Shaul', party: R },
    { name: 'Phillip Elling', party: R },
    { name: 'Angela Lewis', party: R },
    { name: 'Samuel Keogh', party: R },
    { name: 'James Larson', party: R },
    { name: 'Erica Underwood', party: R },
    { name: 'Janice Doyle', party: R },
    { name: 'Scott Stangl', party: R }
  ),

  // MEIGS COUNTY — pop ~23,000
  ...countyOfficials('Meigs',
    [{ name: 'Roger Smith', party: R }, { name: 'Bobby Ames', party: R }, { name: 'Allen Heldreth', party: R }],
    { name: 'Keith Dye', party: R },
    { name: 'Dave Knipp', party: R },
    { name: 'Carla Stevens', party: R },
    { name: 'Elmer Brooks', party: R },
    { name: 'Christy Helton', party: R },
    { name: 'Jerry Fowler', party: R },
    { name: 'Tammy Sizemore', party: R },
    { name: 'James Tucker', party: R }
  ),

  // MERCER COUNTY — pop ~41,000
  ...countyOfficials('Mercer',
    [{ name: 'Nick Torbik', party: R }, { name: 'Tom Stalnaker', party: R }, { name: 'Daniel Knuppe', party: R }],
    { name: 'David Glancy', party: R },
    { name: 'Lance Pohl', party: R },
    { name: 'Diane Aslinger', party: R },
    { name: 'Rosemary Lucas', party: R },
    { name: 'Laura Bruns', party: R },
    { name: 'Jeannette Maier', party: R },
    { name: 'James Cody', party: R },
    { name: 'Robert Malone', party: R }
  ),

  // MONROE COUNTY — pop ~14,000
  ...countyOfficials('Monroe',
    [{ name: 'Richard Dickey', party: R }, { name: 'Alis Morehart', party: D }, { name: 'James Blackburn', party: R }],
    { name: 'James Spears', party: R },
    { name: 'Allan Caldwell', party: R },
    { name: 'Cheryl Wiley', party: R },
    { name: 'James Brooks', party: R },
    { name: 'Tammy Rowe', party: R },
    { name: 'Helen Cozart', party: R },
    { name: 'Linda Carpenter', party: R },
    { name: 'Terry Phillips', party: R }
  ),

  // MORGAN COUNTY — pop ~15,000
  ...countyOfficials('Morgan',
    [{ name: 'Barbara Ruddell', party: R }, { name: 'Jimmy Geiger', party: R }, { name: 'Lois Stidham', party: R }],
    { name: 'Robert Cutter', party: R },
    { name: 'Pamela Scaggs', party: R },
    { name: 'Kathy Sizemore', party: R },
    { name: 'Terry Haines', party: R },
    { name: 'Deborah Pifer', party: R },
    { name: 'Richard Morrison', party: R },
    { name: 'Diane Johnson', party: R },
    { name: 'James Hickman', party: R }
  ),

  // MORROW COUNTY — pop ~35,000
  ...countyOfficials('Morrow',
    [{ name: 'Dirk Rashleigh', party: R }, { name: 'Linda Kochheiser', party: R }, { name: 'Mike Strickland', party: R }],
    { name: 'William Gourley', party: R },
    { name: 'Theron Schank', party: R },
    { name: 'Dianna Bender', party: R },
    { name: 'James Kern', party: R },
    { name: 'Charity Stephens', party: R },
    { name: 'James Dupler', party: R },
    { name: 'Brenda Thode', party: R },
    { name: 'Bryan Morin', party: R }
  ),

  // MUSKINGUM COUNTY — pop ~87,000
  ...countyOfficials('Muskingum',
    [{ name: 'Bryan Ty Shao', party: D }, { name: 'Janet Weathers', party: D }, { name: 'Angie Clary', party: R }],
    { name: 'Derek Little', party: R },
    { name: 'Ron Welch', party: R },
    { name: 'Sheilah Harlow', party: R },
    { name: 'Judith Everett', party: R },
    { name: 'Cheryl Wright', party: R },
    { name: 'Terry Boyle', party: R },
    { name: 'David Sellers', party: R },
    { name: 'Christopher Stanforth', party: R }
  ),

  // NOBLE COUNTY — pop ~14,000
  ...countyOfficials('Noble',
    [{ name: 'Rob Uss', party: R }, { name: 'Jerry Cromley', party: R }, { name: 'Mark Moyer', party: R }],
    { name: 'James McBride', party: R },
    { name: 'James Bailey', party: R },
    { name: 'Kelly Geary', party: R },
    { name: 'Regina Hibbert', party: R },
    { name: 'Susan Wolford', party: R },
    { name: 'Steven Gould', party: R },
    { name: 'Deborah Patterson', party: R },
    { name: 'David Duffy', party: R }
  ),

  // OTTAWA COUNTY — pop ~41,000
  ...countyOfficials('Ottawa',
    [{ name: 'Joe Weber', party: R }, { name: 'Mark Stahl', party: R }, { name: 'Greg DiDonato', party: R }],
    { name: 'Stephen Scutari', party: R },
    { name: 'Mark Mullins', party: R },
    { name: 'Pam Condon', party: R },
    { name: 'Sarah Swickard', party: R },
    { name: 'Sarah Stead', party: R },
    { name: 'Mark Kidd', party: R },
    { name: 'Donald Sycks', party: R },
    { name: 'David Bretz', party: R }
  ),
];

async function seedData() {
  console.log(`Seeding ${allCounties.length} elected officials across 20 Ohio counties...`);

  try {
    const { data, error } = await sb
      .from('politicians')
      .upsert(allCounties, { onConflict: 'bioguide_id' });

    if (error) {
      console.error('Error upserting officials:', error);
      process.exit(1);
    }

    console.log(`Successfully inserted/updated ${allCounties.length} officials!`);
    console.log('\nCounties added:');
    const counties = new Set(allCounties.map(o => o.jurisdiction.replace(' County', '')));
    Array.from(counties).sort().forEach(c => console.log(`  - ${c}`));
    console.log(`\nTotal officials: ${allCounties.length}`);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

seedData();
