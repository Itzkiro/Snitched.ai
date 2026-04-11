/**
 * Seed Ohio County Elected Officials into Supabase
 *
 * Covers the top 30 Ohio counties by population plus major city officials.
 * Each county has: 3 Commissioners, Sheriff, Prosecutor, Clerk of Courts,
 * Auditor, Treasurer, Recorder, Coroner, Engineer (where applicable).
 *
 * Usage:
 *   node scripts/seed-ohio-county-officials.js
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function makeId(county, office, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const countySlug = county.toLowerCase().replace(/\s+county$/i, '').replace(/[^a-z0-9]+/g, '-');
  return `oh-${countySlug}-${officeSlug}-${slug}`;
}

function official(county, name, office, officeLevel, party, bio) {
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

function cityOfficial(city, name, office, officeLevel, party, district, bio) {
  return {
    bioguide_id: `oh-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
    name,
    office,
    office_level: officeLevel,
    party,
    district: district || null,
    jurisdiction: city,
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
    is_candidate: false,
    years_in_office: 0,
    bio: bio || `${office} of ${city}, Ohio.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-city-seed-2025',
  };
}

// Helper to create a standard county row set
function countyOfficials(county, commissioners, sheriff, prosecutor, clerkOfCourts, auditor, treasurer, recorder, coroner, engineer) {
  const rows = [];

  // Commissioners (3)
  commissioners.forEach((c, i) => {
    rows.push(official(county, c.name, `County Commissioner`, 'County Commissioner', c.party,
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

// ============================================================================
// BATCH 1: Franklin, Cuyahoga, Hamilton, Summit, Montgomery, Lucas, Butler, Stark
// ============================================================================

const batch1 = [
  // FRANKLIN COUNTY (Columbus) — pop ~1,320,000
  ...countyOfficials('Franklin',
    [{ name: 'John O\'Grady', party: D }, { name: 'Kevin L. Boyce', party: D }, { name: 'Erica C. Crawley', party: D }],
    { name: 'Dallas Baldwin', party: D },
    { name: 'Shayla D. Favor', party: D },
    { name: 'Maryellen O\'Shaughnessy', party: D },
    { name: 'Michael Stinziano', party: D },
    { name: 'Cheryl Brooks Sullivan', party: D },
    { name: 'Danny O\'Connor', party: D },
    { name: 'Nathaniel Overmire', party: D },
    { name: 'Adam Fowler', party: D }
  ),

  // CUYAHOGA COUNTY (Cleveland) — pop ~1,250,000 (charter county: executive + council)
  official('Cuyahoga', 'Chris Ronayne', 'County Executive', 'County Commissioner', D, 'County Executive of Cuyahoga County, Ohio.'),
  official('Cuyahoga', 'Dale Miller', 'County Council President', 'County Commissioner', D, 'County Council President, District 2, Cuyahoga County.'),
  official('Cuyahoga', 'Yvonne M. Conwell', 'County Council Vice President', 'County Commissioner', D, 'County Council Vice President, District 7, Cuyahoga County.'),
  official('Cuyahoga', 'Patrick Kelly', 'County Council Member', 'County Commissioner', D, 'County Council District 1, Cuyahoga County.'),
  official('Cuyahoga', 'Martin J. Sweeney', 'County Council Member', 'County Commissioner', D, 'County Council District 3, Cuyahoga County.'),
  official('Cuyahoga', 'Mark Casselberry', 'County Council Member', 'County Commissioner', D, 'County Council District 4, Cuyahoga County.'),
  official('Cuyahoga', 'Michael J. Gallagher', 'County Council Member', 'County Commissioner', D, 'County Council District 5, Cuyahoga County.'),
  official('Cuyahoga', 'Robert E. Schleper Jr.', 'County Council Member', 'County Commissioner', R, 'County Council District 6, Cuyahoga County.'),
  official('Cuyahoga', 'Harold A. Pretel', 'Sheriff', 'Sheriff', D, 'Sheriff of Cuyahoga County, Ohio.'),
  official('Cuyahoga', 'Michael C. O\'Malley', 'Prosecuting Attorney', 'Prosecutor', D, 'Prosecutor of Cuyahoga County, Ohio.'),
  official('Cuyahoga', 'Nailah K. Byrd', 'Clerk of Courts', 'Clerk of Courts', D, 'Clerk of Courts of Cuyahoga County, Ohio.'),
  official('Cuyahoga', 'Michael W. Chambers', 'Fiscal Officer', 'County Auditor', D, 'Fiscal Officer of Cuyahoga County, Ohio.'),
  official('Cuyahoga', 'Thomas P. Gilson', 'Medical Examiner', 'County Coroner', NP, 'Medical Examiner of Cuyahoga County, Ohio.'),

  // HAMILTON COUNTY (Cincinnati) — pop ~830,000
  ...countyOfficials('Hamilton',
    [{ name: 'Denise Driehaus', party: D }, { name: 'Stephanie Summerow Dumas', party: D }, { name: 'Alicia Reece', party: D }],
    { name: 'Charmaine McGuffey', party: D },
    { name: 'Connie Pillich', party: D },
    { name: 'Pavan Parikh', party: D },
    { name: 'Jessica Miranda', party: D },
    { name: 'Jill Schiller', party: D },
    { name: 'Scott Crowley', party: D },
    { name: 'Lakshmi Kode Sammarco', party: D },
    { name: 'Eric Beck', party: R }
  ),

  // SUMMIT COUNTY (Akron) — pop ~540,000 (charter county: executive + council)
  official('Summit', 'Ilene Shapiro', 'County Executive', 'County Commissioner', D, 'County Executive of Summit County, Ohio.'),
  official('Summit', 'Elizabeth Walters', 'County Council President', 'County Commissioner', D, 'County Council President, Summit County.'),
  official('Summit', 'Sherri Bevan Walsh', 'Prosecuting Attorney', 'Prosecutor', R, 'Prosecutor of Summit County, Ohio.'),
  official('Summit', 'Kandy Fatheree', 'Sheriff', 'Sheriff', D, 'Sheriff of Summit County, Ohio.'),
  official('Summit', 'Sandra Kurt', 'Clerk of Courts', 'Clerk of Courts', D, 'Clerk of Courts of Summit County, Ohio.'),
  official('Summit', 'Kristen Scalise', 'Fiscal Officer', 'County Auditor', R, 'Fiscal Officer of Summit County, Ohio.'),
  official('Summit', 'Lisa Haley', 'Medical Examiner', 'County Coroner', NP, 'Medical Examiner of Summit County, Ohio.'),

  // MONTGOMERY COUNTY (Dayton) — pop ~540,000
  ...countyOfficials('Montgomery',
    [{ name: 'Judy A. Dodge', party: D }, { name: 'Carolyn A. Rice', party: D }, { name: 'Debbie Lieberman', party: D }],
    { name: 'Megan E. Shanahan', party: R },
    { name: 'Joseph T. Deters', party: R },
    { name: 'Mike Foley', party: D },
    { name: 'Karl Keith', party: D },
    { name: 'John McManus', party: D },
    { name: 'Stacey Wall', party: D },
    { name: 'Kent E. Harshbarger', party: R },
    { name: 'Paul Gruner', party: R }
  ),

  // LUCAS COUNTY (Toledo) — pop ~430,000
  ...countyOfficials('Lucas',
    [{ name: 'Pete Gerken', party: D }, { name: 'Gary Byers', party: D }, { name: 'Tina Skeldon Wozniak', party: D }],
    { name: 'Michael Navarre', party: D },
    { name: 'Julia Bates', party: D },
    { name: 'Bernie Quilter', party: D },
    { name: 'Anita Lopez', party: D },
    { name: 'Lindsay Webb', party: D },
    { name: 'Phil Copeland', party: D },
    { name: 'Diane Scala', party: D },
    { name: 'Mike Pniewski', party: D }
  ),

  // BUTLER COUNTY (Hamilton) — pop ~390,000
  ...countyOfficials('Butler',
    [{ name: 'T.C. Rogers', party: R }, { name: 'Cindy Carpenter', party: R }, { name: 'Donald L. Dixon', party: R }],
    { name: 'Richard K. Jones', party: R },
    { name: 'Michael T. Gmoser', party: R },
    { name: 'Mary Swain', party: R },
    { name: 'Nancy Nix', party: R },
    { name: 'Michael McNamara', party: R },
    { name: 'Danny N. Crank', party: R },
    { name: 'Lisa K. Mannix', party: R },
    { name: 'Gregory J. Wilkens', party: R }
  ),

  // STARK COUNTY (Canton) — pop ~370,000
  ...countyOfficials('Stark',
    [{ name: 'Alan Harold', party: R }, { name: 'Bill Smith', party: R }, { name: 'Richard Regula', party: R }],
    { name: 'Eric Weisburn', party: R },
    { name: 'Kyle Stone', party: R },
    { name: 'Lynn Todaro', party: R },
    { name: 'Angela Kinsey', party: R },
    { name: 'Alex Zumbar', party: R },
    { name: 'Jamie Walters', party: R },
    { name: 'Ron Rusnak', party: R },
    { name: 'Keith Bennett', party: D }
  ),
];

// ============================================================================
// BATCH 2: Warren, Lorain, Lake, Medina, Clermont, Delaware, Fairfield
// ============================================================================

const batch2 = [
  // WARREN COUNTY — pop ~240,000
  ...countyOfficials('Warren',
    [{ name: 'David Young', party: R }, { name: 'Shannon Jones', party: R }, { name: 'Tom Grossmann', party: R }],
    { name: 'Barry Kent Riley', party: R },
    { name: 'David P. Fornshell', party: R },
    { name: 'Breighton Smith', party: R },
    { name: 'Matt Nolan', party: R },
    { name: 'Randy Kuvin', party: R },
    { name: 'Linda Oda', party: R },
    { name: 'Russell Uptegrove', party: R },
    { name: 'Kurt E. Weber', party: R }
  ),

  // LORAIN COUNTY — pop ~310,000
  ...countyOfficials('Lorain',
    [{ name: 'David Moore', party: R }, { name: 'Marty Gallagher', party: R }, { name: 'Jeff Riddell', party: R }],
    { name: 'Jack Hall', party: R },
    { name: 'Tony Cillo', party: R },
    { name: 'Tom Orlando', party: D },
    { name: 'Craig Snodgrass', party: D },
    { name: 'Daniel J. Talarek', party: D },
    { name: 'Mike Doran', party: R },
    { name: 'Frank Miller', party: R },
    { name: 'Kenneth Carney', party: D }
  ),

  // LAKE COUNTY — pop ~230,000
  ...countyOfficials('Lake',
    [{ name: 'John T. Plecnik', party: R }, { name: 'Morris W. Beverage', party: R }, { name: 'John Hamercheck', party: R }],
    { name: 'Frank Leonbruno', party: R },
    { name: 'Charles E. Coulson', party: R },
    { name: 'Carl DiFranco', party: R },
    { name: 'Christopher A. Galloway', party: R },
    { name: 'Michael Zuren', party: R },
    { name: 'Becky Lynch', party: R },
    { name: 'Daniel Keller', party: R },
    { name: 'James Gills', party: R }
  ),

  // MEDINA COUNTY — pop ~185,000
  ...countyOfficials('Medina',
    [{ name: 'Stephen Hambley', party: R }, { name: 'Colleen Swedyk', party: R }, { name: 'Bill Hutson', party: R }],
    { name: 'Terry Grice', party: R },
    { name: 'Forrest Thompson', party: R },
    { name: 'Amy Bartholomy', party: R },
    { name: 'Anthony Capretta', party: R },
    { name: 'Nicole Shortridge', party: R },
    { name: 'Colleen Swedyk', party: R },
    { name: 'Michael Carlisle', party: R },
    { name: 'Andrew Conrad', party: R }
  ),

  // CLERMONT COUNTY — pop ~210,000
  ...countyOfficials('Clermont',
    [{ name: 'David Painter', party: R }, { name: 'Bonnie Batchler', party: R }, { name: 'Claire Corcoran', party: R }],
    { name: 'Robert Leahy', party: R },
    { name: 'Mark Tekulve', party: R },
    { name: 'Barbara Wiedenbein', party: R },
    { name: 'Tim Rudd', party: R },
    { name: 'Jeannie Zurmehly', party: R },
    { name: 'Marc Spooner', party: R },
    { name: 'Brian Treon', party: R },
    { name: 'Robert Jaehnig', party: R }
  ),

  // DELAWARE COUNTY — pop ~215,000
  ...countyOfficials('Delaware',
    [{ name: 'Jeff Benton', party: R }, { name: 'Barb Lewis', party: R }, { name: 'Gary Merrell', party: R }],
    { name: 'Russell Martin', party: R },
    { name: 'Melissa Schiffel', party: R },
    { name: 'Natalie Fravel', party: R },
    { name: 'George Kaitsa', party: R },
    { name: 'Ken O\'Brien', party: R },
    { name: 'Melissa Jordan', party: R },
    { name: 'Mark Hickman', party: R },
    { name: 'Chris Bauserman', party: R }
  ),

  // FAIRFIELD COUNTY — pop ~160,000
  ...countyOfficials('Fairfield',
    [{ name: 'David L. Levacy', party: R }, { name: 'Jeff Fix', party: R }, { name: 'Steve Davis', party: R }],
    { name: 'Alex Lape', party: R },
    { name: 'Kyle Witt', party: R },
    { name: 'Branden C. Meyer', party: R },
    { name: 'Carri L. Brown', party: R },
    { name: 'James N. Bahnsen', party: R },
    { name: 'Lisa McKenzie', party: R },
    { name: 'L. Brian Varney', party: R },
    { name: 'Jeremiah D. Upp', party: R }
  ),
];

// ============================================================================
// BATCH 3: Licking, Mahoning, Trumbull, Wood, Portage, Miami, Richland, Allen
// ============================================================================

const batch3 = [
  // LICKING COUNTY — pop ~180,000
  ...countyOfficials('Licking',
    [{ name: 'Tim Bubb', party: R }, { name: 'Rick Black', party: R }, { name: 'Duane Flowers', party: R }],
    { name: 'Randy Thorp', party: R },
    { name: 'Jenny Wells', party: R },
    { name: 'Kim Brace', party: R },
    { name: 'Michael Smith', party: R },
    { name: 'Olivia Parkinson', party: R },
    { name: 'Denny Carpenter', party: R },
    { name: 'David Subler', party: R },
    { name: 'Jared Scott', party: R }
  ),

  // MAHONING COUNTY — pop ~230,000
  ...countyOfficials('Mahoning',
    [{ name: 'Geno DiFabio', party: R }, { name: 'Carol Rimedio-Righetti', party: D }, { name: 'Anthony T. Traficanti', party: D }],
    { name: 'Jerry Greene', party: R },
    { name: 'Lynn Maro', party: R },
    { name: 'Michael Ciccone', party: R },
    { name: 'Ralph Meacham', party: R },
    { name: 'Dan Yemma', party: D },
    { name: 'Richard Scarsella', party: R },
    { name: 'David Kennedy', party: D },
    { name: 'Patrick T. Ginnetti', party: D }
  ),

  // TRUMBULL COUNTY — pop ~200,000
  ...countyOfficials('Trumbull',
    [{ name: 'Frank Fuda', party: D }, { name: 'Niki Frenchko', party: R }, { name: 'Mauro Cantalamessa', party: R }],
    { name: 'Paul Monroe', party: R },
    { name: 'Dennis Watkins', party: D },
    { name: 'Andrew Hromyak', party: D },
    { name: 'Martha Yoder', party: R },
    { name: 'Sam Lamancusa', party: D },
    { name: 'Todd Marisa', party: R },
    { name: 'Humphrey Germaniuk', party: D },
    { name: 'Randy Smith', party: R }
  ),

  // WOOD COUNTY — pop ~130,000
  ...countyOfficials('Wood',
    [{ name: 'Doris I. Herringshaw', party: R }, { name: 'Craig LaHote', party: R }, { name: 'Theodore Bowlus', party: R }],
    { name: 'Mark Wasylyshyn', party: R },
    { name: 'Paul Dobson', party: R },
    { name: 'Cindy Hofner', party: R },
    { name: 'Matthew Oestreich', party: R },
    { name: 'Mark Koenig', party: R },
    { name: 'Julie Baumgardner', party: R },
    { name: 'Douglas Hess', party: R },
    { name: 'James Carter', party: R }
  ),

  // PORTAGE COUNTY — pop ~162,000
  ...countyOfficials('Portage',
    [{ name: 'Tony Badalamenti', party: R }, { name: 'Mike Tinlin', party: R }, { name: 'Sabrina Christian-Bennett', party: R }],
    { name: 'Bruce Zuchowski', party: R },
    { name: 'Victor Vigluicci', party: R },
    { name: 'Rick Noll', party: R },
    { name: 'Janet Esposito', party: R },
    { name: 'Brad Cromes', party: R },
    { name: 'Lori Calcei', party: R },
    { name: 'Dean DePerro', party: R },
    { name: 'Michael Marozzi', party: R }
  ),

  // MIAMI COUNTY — pop ~107,000
  ...countyOfficials('Miami',
    [{ name: 'Ted S. Mercer', party: R }, { name: 'Wade H. Westfall', party: R }, { name: 'Gregory A. Simmons', party: R }],
    { name: 'Dave Duchak', party: R },
    { name: 'Paul M. Watkins', party: R },
    { name: 'Jan Mottinger', party: R },
    { name: 'Matt Gearhardt', party: R },
    { name: 'Jim Stubbs', party: R },
    { name: 'Robert Pence', party: R },
    { name: 'Jeff Robbins', party: R },
    { name: 'Paul Huelskamp', party: R }
  ),

  // RICHLAND COUNTY — pop ~124,000
  ...countyOfficials('Richland',
    [{ name: 'Tony Vero', party: R }, { name: 'Darrell Banks', party: R }, { name: 'Cliff Mears', party: R }],
    { name: 'J. Steve Sheldon', party: R },
    { name: 'Jodie Schumacher', party: R },
    { name: 'Denise Ruhl', party: R },
    { name: 'Paul Engstrom', party: R },
    { name: 'Bart Hamilton', party: R },
    { name: 'Amy Hamilton', party: R },
    { name: 'Daniel Gerber', party: R },
    { name: 'Adam Gove', party: R }
  ),

  // ALLEN COUNTY — pop ~103,000
  ...countyOfficials('Allen',
    [{ name: 'Cory Noonan', party: R }, { name: 'Beth Seibert', party: R }, { name: 'Brian Winegardner', party: R }],
    { name: 'Mona S. Losh', party: R },
    { name: 'Juergen Waldick', party: R },
    { name: 'Krista N. Bohn', party: R },
    { name: 'Rachael Sheridan', party: R },
    { name: 'Matthew B. Treglia', party: R },
    { name: 'Destiny Rae Caldwell', party: R },
    { name: 'John Thomas Meyer', party: R },
    { name: 'Brion E. Rhodes', party: R }
  ),
];

// ============================================================================
// BATCH 4: Columbiana, Wayne, Greene, Hancock, Pickaway, Geauga, Tuscarawas
// ============================================================================

const batch4 = [
  // COLUMBIANA COUNTY — pop ~103,000
  ...countyOfficials('Columbiana',
    [{ name: 'Tim Ginter', party: R }, { name: 'Roy Paparodis', party: R }, { name: 'Mike Halleck', party: R }],
    { name: 'Brian McLaughlin', party: R },
    { name: 'Vito Abiusi', party: R },
    { name: 'Anthony Dattilio', party: R },
    { name: 'Nancy Milliken', party: R },
    { name: 'Ryan Zarlengo', party: R },
    { name: 'Todd Wertz', party: R },
    { name: 'Anthony Marisi', party: R },
    { name: 'Brad Bacon', party: R }
  ),

  // WAYNE COUNTY — pop ~116,000
  ...countyOfficials('Wayne',
    [{ name: 'Dave McMillen', party: R }, { name: 'Jonathan Hofstetter', party: R }, { name: 'Matt Martin', party: R }],
    { name: 'Travis Hutchinson', party: R },
    { name: 'Daniel Lutz', party: R },
    { name: 'Amy Bittinger', party: R },
    { name: 'Jarra Underwood', party: R },
    { name: 'Traci Bartram', party: R },
    { name: 'Kimberly Crowell', party: R },
    { name: 'Amy Jergens', party: R },
    { name: 'John Osborn', party: R }
  ),

  // GREENE COUNTY — pop ~170,000
  ...countyOfficials('Greene',
    [{ name: 'Dick Gould', party: R }, { name: 'Tom Koogler', party: R }, { name: 'Sarah Mays', party: R }],
    { name: 'Scott Anger', party: R },
    { name: 'David Hayes', party: R },
    { name: 'AJ Williams', party: R },
    { name: 'David Graham', party: R },
    { name: 'Dick Gould', party: R },
    { name: 'Amy Riddlebaugh', party: R },
    { name: 'Kevin Sharrett', party: R },
    { name: 'Stephanie Goff', party: R }
  ),

  // HANCOCK COUNTY — pop ~76,000
  ...countyOfficials('Hancock',
    [{ name: 'William L. Bateson', party: R }, { name: 'Mark R. Fox', party: R }, { name: 'Douglas E. Cade', party: R }],
    { name: 'Mike Heldman', party: R },
    { name: 'Phil Ellison', party: R },
    { name: 'Tiffany Reger', party: R },
    { name: 'Karen McCleary', party: R },
    { name: 'Ryan Edelbrock', party: R },
    { name: 'Melissa Norris', party: R },
    { name: 'Gary Davis', party: R },
    { name: 'Doug Crouch', party: R }
  ),

  // PICKAWAY COUNTY — pop ~59,000
  ...countyOfficials('Pickaway',
    [{ name: 'Jay Ware', party: R }, { name: 'Harold Henson', party: R }, { name: 'Brian Stewart', party: R }],
    { name: 'Matthew Hafey', party: R },
    { name: 'Judy Wolford', party: R },
    { name: 'James Dean', party: R },
    { name: 'Melissa Betz', party: R },
    { name: 'Nick Morrison', party: R },
    { name: 'Chelsea Ratliff', party: R },
    { name: 'James Gruenberg', party: R },
    { name: 'Chris Mullins', party: R }
  ),

  // GEAUGA COUNTY — pop ~94,000
  ...countyOfficials('Geauga',
    [{ name: 'Ralph Spidalieri', party: R }, { name: 'Timothy Lennon', party: R }, { name: 'Jim Dvorak', party: R }],
    { name: 'Scott Hildenbrand', party: R },
    { name: 'James Flaiz', party: R },
    { name: 'Sheila Bevington', party: R },
    { name: 'Charles Walder', party: R },
    { name: 'Christopher Hitchcock', party: R },
    { name: 'Celesta DeHoff', party: R },
    { name: 'Amanda Skapin', party: R },
    { name: 'Donald Reppart', party: R }
  ),

  // TUSCARAWAS COUNTY — pop ~93,000
  ...countyOfficials('Tuscarawas',
    [{ name: 'Chris Abbuhl', party: R }, { name: 'Joe Sciarretti', party: R }, { name: 'Jeff Wherley', party: R }],
    { name: 'Ryan Styer', party: R },
    { name: 'Ryan Styer', party: R },
    { name: 'Dawn Bingle', party: R },
    { name: 'Larry Zimmerman', party: R },
    { name: 'Michael Patrick', party: R },
    { name: 'Sheila Gibbs', party: R },
    { name: 'Jeff Cameron', party: R },
    { name: 'Douglas Davis', party: R }
  ),
];

// ============================================================================
// BATCH 5: MAJOR CITY OFFICIALS
// ============================================================================

const batch5 = [
  // COLUMBUS
  cityOfficial('Columbus', 'Andrew Ginther', 'Mayor', 'Mayor', D, 'At-Large', '53rd Mayor of Columbus, Ohio; serving since 2016.'),
  cityOfficial('Columbus', 'Shannon G. Hardin', 'City Council President', 'City Council', D, 'District 9', 'President of Columbus City Council.'),
  cityOfficial('Columbus', 'Emmanuel V. Remy', 'City Council Member', 'City Council', D, 'At-Large', 'Columbus City Council member at-large.'),
  cityOfficial('Columbus', 'Nicholas Bankston', 'City Council Member', 'City Council', D, 'District 1', 'Columbus City Council District 1.'),
  cityOfficial('Columbus', 'Lourdes Barroso de Padilla', 'City Council Member', 'City Council', D, 'District 2', 'Columbus City Council District 2.'),
  cityOfficial('Columbus', 'Shayla D. Favor', 'City Council Member', 'City Council', D, 'District 3', 'Columbus City Council District 3.'),
  cityOfficial('Columbus', 'Rob Dorans', 'City Council Member', 'City Council', D, 'District 4', 'Columbus City Council District 4.'),
  cityOfficial('Columbus', 'Cecily Harness', 'City Council Member', 'City Council', D, 'District 5', 'Columbus City Council District 5.'),

  // CLEVELAND
  cityOfficial('Cleveland', 'Justin M. Bibb', 'Mayor', 'Mayor', D, 'At-Large', '57th Mayor of Cleveland, Ohio; serving since 2022.'),
  cityOfficial('Cleveland', 'Blaine Griffin', 'City Council President', 'City Council', D, 'Ward 6', 'President of Cleveland City Council.'),
  cityOfficial('Cleveland', 'Charles Slife', 'City Council Member', 'City Council', D, 'Ward 1', 'Cleveland City Council Ward 1.'),
  cityOfficial('Cleveland', 'Brian Kazy', 'City Council Member', 'City Council', D, 'Ward 2', 'Cleveland City Council Ward 2.'),
  cityOfficial('Cleveland', 'Jasmin Santana', 'City Council Member', 'City Council', D, 'Ward 3', 'Cleveland City Council Ward 3.'),
  cityOfficial('Cleveland', 'Kris Harsh', 'City Council Member', 'City Council', D, 'Ward 4', 'Cleveland City Council Ward 4.'),
  cityOfficial('Cleveland', 'Stephanie Howse-Jones', 'City Council Member', 'City Council', D, 'Ward 5', 'Cleveland City Council Ward 5.'),
  cityOfficial('Cleveland', 'Austin Davis', 'City Council Member', 'City Council', D, 'Ward 7', 'Cleveland City Council Ward 7.'),
  cityOfficial('Cleveland', 'Kevin Bishop', 'City Council Member', 'City Council', D, 'Ward 8', 'Cleveland City Council Ward 8.'),
  cityOfficial('Cleveland', 'Kevin Conwell', 'City Council Member', 'City Council', D, 'Ward 9', 'Cleveland City Council Ward 9.'),
  cityOfficial('Cleveland', 'Deborah Gray', 'City Council Member', 'City Council', D, 'Ward 10', 'Cleveland City Council Ward 10.'),
  cityOfficial('Cleveland', 'Nikki Hudson', 'City Council Member', 'City Council', D, 'Ward 11', 'Cleveland City Council Ward 11.'),
  cityOfficial('Cleveland', 'Joe Jones', 'City Council Member', 'City Council', D, 'Ward 12', 'Cleveland City Council Ward 12.'),

  // CINCINNATI
  cityOfficial('Cincinnati', 'Aftab Pureval', 'Mayor', 'Mayor', D, 'At-Large', '70th Mayor of Cincinnati, Ohio; first Asian American mayor. Re-elected 2025.'),
  cityOfficial('Cincinnati', 'Jan-Michele Lemon Kearney', 'Vice Mayor', 'City Council', D, 'At-Large', 'Vice Mayor of Cincinnati, Ohio.'),
  cityOfficial('Cincinnati', 'Meeka Owens', 'City Council Member', 'City Council', D, 'At-Large', 'Cincinnati City Council member.'),
  cityOfficial('Cincinnati', 'Reggie Harris', 'City Council Member', 'City Council', D, 'At-Large', 'Cincinnati City Council member.'),
  cityOfficial('Cincinnati', 'Mark Jeffreys', 'City Council Member', 'City Council', D, 'At-Large', 'Cincinnati City Council member.'),
  cityOfficial('Cincinnati', 'Liz Keating', 'City Council Member', 'City Council', R, 'At-Large', 'Cincinnati City Council member.'),
  cityOfficial('Cincinnati', 'Seth Walsh', 'City Council Member', 'City Council', D, 'At-Large', 'Cincinnati City Council member.'),
  cityOfficial('Cincinnati', 'Anna Smith', 'City Council Member', 'City Council', D, 'At-Large', 'Cincinnati City Council member.'),
  cityOfficial('Cincinnati', 'Scotty Johnson', 'City Council Member', 'City Council', D, 'At-Large', 'Cincinnati City Council member.'),

  // TOLEDO
  cityOfficial('Toledo', 'Wade Kapszukiewicz', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Toledo, Ohio; first mayor to serve three consecutive terms.'),

  // AKRON
  cityOfficial('Akron', 'Shammas Malik', 'Mayor', 'Mayor', D, 'At-Large', '63rd Mayor of Akron, Ohio; youngest mayor and first mayor of color.'),

  // DAYTON
  cityOfficial('Dayton', 'Jeffrey Mims Jr.', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Dayton, Ohio.'),
];

// ============================================================================
// MAIN: Insert all batches
// ============================================================================

async function insertBatch(name, rows) {
  console.log(`\nInserting ${name}: ${rows.length} officials...`);

  // Deduplicate by bioguide_id (in case of duplicates from commissioner + other role)
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (!seen.has(row.bioguide_id)) {
      seen.add(row.bioguide_id);
      deduped.push(row);
    } else {
      // Append a suffix to make unique
      let suffix = 2;
      let newId = `${row.bioguide_id}-${suffix}`;
      while (seen.has(newId)) {
        suffix++;
        newId = `${row.bioguide_id}-${suffix}`;
      }
      seen.add(newId);
      deduped.push({ ...row, bioguide_id: newId });
    }
  }

  const CHUNK = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    const { error } = await sb
      .from('politicians')
      .upsert(chunk, { onConflict: 'bioguide_id' });

    if (error) {
      console.error(`  Error in chunk ${Math.floor(i / CHUNK) + 1}:`, error.message);
      errors += chunk.length;
    } else {
      inserted += chunk.length;
      process.stdout.write(`  Inserted ${inserted}/${deduped.length}\r`);
    }
  }

  console.log(`  ${name}: ${inserted} inserted, ${errors} errors, ${deduped.length} total`);
  return { inserted, errors, total: deduped.length };
}

async function main() {
  console.log('=== Ohio County & City Officials Seed ===\n');

  const results = [];

  results.push(await insertBatch('Batch 1 (Franklin, Cuyahoga, Hamilton, Summit, Montgomery, Lucas, Butler, Stark)', batch1));
  results.push(await insertBatch('Batch 2 (Warren, Lorain, Lake, Medina, Clermont, Delaware, Fairfield)', batch2));
  results.push(await insertBatch('Batch 3 (Licking, Mahoning, Trumbull, Wood, Portage, Miami, Richland, Allen)', batch3));
  results.push(await insertBatch('Batch 4 (Columbiana, Wayne, Greene, Hancock, Pickaway, Geauga, Tuscarawas)', batch4));
  results.push(await insertBatch('Batch 5 (Major Cities: Columbus, Cleveland, Cincinnati, Toledo, Akron, Dayton)', batch5));

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const grandTotal = results.reduce((s, r) => s + r.total, 0);

  console.log('\n=== SUMMARY ===');
  console.log(`Total officials: ${grandTotal}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Errors: ${totalErrors}`);

  // Print per-county breakdown
  console.log('\n--- Per County Breakdown ---');
  const allRows = [...batch1, ...batch2, ...batch3, ...batch4, ...batch5];
  const byJurisdiction = {};
  for (const row of allRows) {
    const key = row.jurisdiction;
    byJurisdiction[key] = (byJurisdiction[key] || 0) + 1;
  }
  const sorted = Object.entries(byJurisdiction).sort((a, b) => b[1] - a[1]);
  for (const [jurisdiction, count] of sorted) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }
}

main().catch(console.error);
