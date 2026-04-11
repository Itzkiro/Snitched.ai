/**
 * Seed California County & City Elected Officials into Supabase
 *
 * Usage:
 *   node scripts/seed-california-county-officials.js
 *
 * Inserts elected officials for 30 California counties + 9 major cities.
 * Each official gets a bioguide_id in the format: ca-[county]-[office]-[name]
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeId(county, office, name) {
  return `ca-${slugify(county)}-${slugify(office)}-${slugify(name)}`;
}

function official(county, name, office, party, jurisdictionType = 'county') {
  const jurisdiction = jurisdictionType === 'county'
    ? `${county} County`
    : county; // for cities, county param is city name
  return {
    bioguide_id: jurisdictionType === 'county'
      ? makeId(county, office, name)
      : `ca-city-${slugify(county)}-${slugify(office)}-${slugify(name)}`,
    name,
    office,
    office_level: jurisdictionType === 'county' ? 'county' : 'city',
    party,
    jurisdiction,
    jurisdiction_type: jurisdictionType,
    is_active: true,
    is_candidate: false,
    corruption_score: 0,
    aipac_funding: 0,
    data_source: 'manual',
  };
}

// Helper to create board of supervisors entries
function supervisors(county, members) {
  return members.map(([name, party], i) =>
    official(county, name, `Board of Supervisors, District ${i + 1}`, party)
  );
}

function countyOfficials(county, officials_list) {
  return officials_list.map(([name, office, party]) =>
    official(county, name, office, party)
  );
}

// ==================== BATCH 1: Top 15 Counties ====================

const losAngelesCounty = [
  ...supervisors('Los Angeles', [
    ['Hilda L. Solis', 'Democrat'],
    ['Holly J. Mitchell', 'Democrat'],
    ['Lindsey P. Horvath', 'Democrat'],
    ['Janice Hahn', 'Democrat'],
    ['Kathryn Barger', 'Republican'],
  ]),
  ...countyOfficials('Los Angeles', [
    ['Robert Luna', 'Sheriff', 'Democrat'],
    ['Nathan Hochman', 'District Attorney', 'Independent'],
    ['Dean C. Logan', 'Registrar-Recorder/County Clerk', 'Nonpartisan'],
    ['Jeff Prang', 'Assessor', 'Democrat'],
    ['Keith Knox', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Arlene Barrera', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const sanDiegoCounty = [
  ...supervisors('San Diego', [
    ['Nora Vargas', 'Democrat'],
    ['Joel Anderson', 'Republican'],
    ['Terra Lawson-Remer', 'Democrat'],
    ['Monica Montgomery Steppe', 'Democrat'],
    ['Paloma Aguirre', 'Democrat'],
  ]),
  ...countyOfficials('San Diego', [
    ['Kelly Martinez', 'Sheriff', 'Nonpartisan'],
    ['Summer Stephan', 'District Attorney', 'Republican'],
    ['Jordan Z. Marks', 'Assessor/Recorder/County Clerk', 'Nonpartisan'],
    ['Larry Cohen', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Tracy Sandoval', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const orangeCounty = [
  ...supervisors('Orange', [
    ['Janet Nguyen', 'Republican'],
    ['Vicente Sarmiento', 'Democrat'],
    ['Donald P. Wagner', 'Republican'],
    ['Doug Chaffee', 'Democrat'],
    ['Katrina Foley', 'Democrat'],
  ]),
  ...countyOfficials('Orange', [
    ['Don Barnes', 'Sheriff-Coroner', 'Republican'],
    ['Todd Spitzer', 'District Attorney', 'Republican'],
    ['Claude Parrish', 'Assessor', 'Republican'],
    ['Shari L. Freidenrich', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Andrew Hamilton', 'Auditor-Controller', 'Nonpartisan'],
    ['Hugh Nguyen', 'County Clerk-Recorder', 'Republican'],
  ]),
];

const riversideCounty = [
  ...supervisors('Riverside', [
    ['Jose Medina', 'Democrat'],
    ['Karen Spiegel', 'Republican'],
    ['Chuck Washington', 'Democrat'],
    ['V. Manuel Perez', 'Democrat'],
    ['Yxstian Gutierrez', 'Democrat'],
  ]),
  ...countyOfficials('Riverside', [
    ['Chad Bianco', 'Sheriff-Coroner', 'Republican'],
    ['Mike Hestrin', 'District Attorney', 'Republican'],
    ['Peter Aldana', 'Assessor-County Clerk-Recorder', 'Nonpartisan'],
    ['Matthew Bynum', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Ben Christensen', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const sanBernardinoCounty = [
  ...supervisors('San Bernardino', [
    ['Paul Cook', 'Republican'],
    ['Jesse Armendarez', 'Republican'],
    ['Dawn Rowe', 'Republican'],
    ['Curt Hagman', 'Republican'],
    ['Joe Baca Jr.', 'Democrat'],
  ]),
  ...countyOfficials('San Bernardino', [
    ['Shannon Dicus', 'Sheriff-Coroner', 'Republican'],
    ['Jason Anderson', 'District Attorney', 'Republican'],
    ['Josie Gonzales', 'Assessor-Recorder-County Clerk', 'Democrat'],
    ['Ensen Mason', 'Auditor-Controller/Treasurer/Tax Collector', 'Nonpartisan'],
  ]),
];

const santaClaraCounty = [
  ...supervisors('Santa Clara', [
    ['Sylvia Arenas', 'Democrat'],
    ['Betty Duong', 'Democrat'],
    ['Otto Lee', 'Democrat'],
    ['Susan Ellenberg', 'Democrat'],
    ['Margaret Abe-Koga', 'Democrat'],
  ]),
  ...countyOfficials('Santa Clara', [
    ['Bob Jonsen', 'Sheriff', 'Nonpartisan'],
    ['Jeff Rosen', 'District Attorney', 'Democrat'],
    ['Neysa Fligor', 'Assessor', 'Democrat'],
    ['Tiffany Lennear', 'County Clerk-Recorder', 'Nonpartisan'],
    ['Shannon Bushey', 'Registrar of Voters', 'Nonpartisan'],
  ]),
];

const alamedaCounty = [
  ...supervisors('Alameda', [
    ['David Haubert', 'Democrat'],
    ['Elisa Márquez', 'Democrat'],
    ['Lena Tam', 'Democrat'],
    ['Nate Miley', 'Democrat'],
    ['Keith Carson', 'Democrat'],
  ]),
  ...countyOfficials('Alameda', [
    ['Yesenia Sanchez', 'Sheriff', 'Democrat'],
    ['Ursula Jones Dickson', 'District Attorney', 'Democrat'],
    ['Phong La', 'Assessor', 'Democrat'],
    ['Tim Dupuis', 'Registrar of Voters', 'Nonpartisan'],
    ['Melissa Wilk', 'Auditor-Controller/Clerk-Recorder', 'Nonpartisan'],
  ]),
];

const sacramentoCounty = [
  ...supervisors('Sacramento', [
    ['Phil Serna', 'Democrat'],
    ['Patrick Kennedy', 'Republican'],
    ['Rich Desmond', 'Republican'],
    ['Rosario Rodriguez', 'Democrat'],
    ['Pat Hume', 'Republican'],
  ]),
  ...countyOfficials('Sacramento', [
    ['Jim Cooper', 'Sheriff', 'Democrat'],
    ['Thien Ho', 'District Attorney', 'Nonpartisan'],
    ['Christina Wynn', 'Assessor', 'Nonpartisan'],
    ['Lisa Janton', 'Clerk-Recorder', 'Nonpartisan'],
    ['Jorge Oseguera', 'Inspector General', 'Nonpartisan'],
  ]),
];

const contraCostaCounty = [
  ...supervisors('Contra Costa', [
    ['John Gioia', 'Democrat'],
    ['Candace Andersen', 'Republican'],
    ['Diane Burgis', 'Nonpartisan'],
    ['Ken Carlson', 'Democrat'],
    ['Shanelle Scales-Preston', 'Democrat'],
  ]),
  ...countyOfficials('Contra Costa', [
    ['David Livingston', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Diana Becton', 'District Attorney', 'Democrat'],
    ['Gus Kramer', 'Assessor', 'Nonpartisan'],
    ['Russell Watts', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Bob Campbell', 'Auditor-Controller', 'Nonpartisan'],
    ['Debi Cooper', 'Clerk-Recorder', 'Nonpartisan'],
  ]),
];

const fresnoCounty = [
  ...supervisors('Fresno', [
    ['Garry Bredefeld', 'Republican'],
    ['Brian Pacheco', 'Democrat'],
    ['Buddy Mendes', 'Republican'],
    ['Nathan Magsig', 'Republican'],
    ['Brandon Vang', 'Democrat'],
  ]),
  ...countyOfficials('Fresno', [
    ['John Zanoni', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Lisa Smittcamp', 'District Attorney', 'Republican'],
    ['Paul Dictos', 'Assessor-Recorder', 'Nonpartisan'],
    ['Oscar Garcia', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Oscar Villarreal', 'Auditor-Controller/Treasurer-Tax Collector', 'Nonpartisan'],
  ]),
];

const sanFranciscoCounty = [
  // SF is a consolidated city-county
  official('San Francisco', 'Daniel Lurie', 'Mayor', 'Democrat'),
  official('San Francisco', 'Connie Chan', 'Board of Supervisors, District 1', 'Democrat'),
  official('San Francisco', 'Catherine Stefani', 'Board of Supervisors, District 2', 'Democrat'),
  official('San Francisco', 'Aaron Peskin', 'Board of Supervisors, District 3', 'Democrat'),
  official('San Francisco', 'Joel Engardio', 'Board of Supervisors, District 4', 'Democrat'),
  official('San Francisco', 'Bilal Mahmood', 'Board of Supervisors, District 5', 'Democrat'),
  official('San Francisco', 'Matt Dorsey', 'Board of Supervisors, District 6', 'Democrat'),
  official('San Francisco', 'Myrna Melgar', 'Board of Supervisors, District 7', 'Democrat'),
  official('San Francisco', 'Rafael Mandelman', 'Board of Supervisors, District 8', 'Democrat'),
  official('San Francisco', 'Jackie Fielder', 'Board of Supervisors, District 9', 'Democrat'),
  official('San Francisco', 'Shamann Walton', 'Board of Supervisors, District 10', 'Democrat'),
  official('San Francisco', 'Chyanne Chen', 'Board of Supervisors, District 11', 'Democrat'),
  ...countyOfficials('San Francisco', [
    ['Paul Miyamoto', 'Sheriff', 'Democrat'],
    ['Brooke Jenkins', 'District Attorney', 'Democrat'],
    ['Joaquín Torres', 'Assessor-Recorder', 'Democrat'],
    ['José Cisneros', 'Treasurer', 'Democrat'],
    ['Ben Rosenfield', 'Controller', 'Nonpartisan'],
  ]),
];

const venturaCounty = [
  ...supervisors('Ventura', [
    ['Matt LaVere', 'Democrat'],
    ['Jeff Gorell', 'Republican'],
    ['Kelly Long', 'Republican'],
    ['Janice Parvin', 'Republican'],
    ['Vianey Lopez', 'Democrat'],
  ]),
  ...countyOfficials('Ventura', [
    ['Jim Fryhoff', 'Sheriff', 'Nonpartisan'],
    ['Erik Nasarenko', 'District Attorney', 'Democrat'],
    ['Dan Goodwin', 'Assessor', 'Nonpartisan'],
    ['Steven Hintz', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Jeffrey Burgh', 'Auditor-Controller', 'Nonpartisan'],
    ['Mark Lunn', 'Clerk-Recorder', 'Nonpartisan'],
  ]),
];

const sanMateoCounty = [
  ...supervisors('San Mateo', [
    ['Jackie Speier', 'Democrat'],
    ['Noelia Corzo', 'Democrat'],
    ['Ray Mueller', 'Democrat'],
    ['Lisa Gauthier', 'Democrat'],
    ['David Canepa', 'Democrat'],
  ]),
  ...countyOfficials('San Mateo', [
    ['Christina Corpus', 'Sheriff-Coroner', 'Democrat'],
    ['Stephen Wagstaffe', 'District Attorney', 'Nonpartisan'],
    ['Mark Church', 'Assessor-County Clerk-Recorder', 'Democrat'],
    ['Sandie Arnott', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Juan Raigoza', 'Controller', 'Nonpartisan'],
  ]),
];

const kernCounty = [
  ...supervisors('Kern', [
    ['Phillip Peters', 'Republican'],
    ['Chris Parlier', 'Republican'],
    ['Jeff Flores', 'Republican'],
    ['David Couch', 'Republican'],
    ['Leticia Perez', 'Democrat'],
  ]),
  ...countyOfficials('Kern', [
    ['Donny Youngblood', 'Sheriff-Coroner', 'Republican'],
    ['Cynthia Zimmer', 'District Attorney', 'Republican'],
    ['Jon Lifquist', 'Assessor-Recorder', 'Republican'],
    ['Jordan Kaufman', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Mary B. Bedard', 'Auditor-Controller-County Clerk', 'Nonpartisan'],
  ]),
];

const sanJoaquinCounty = [
  ...supervisors('San Joaquin', [
    ['Miguel Villapudua', 'Democrat'],
    ['Paul Canepa', 'Republican'],
    ['Sonny Dhaliwal', 'Democrat'],
    ['Steven J. Ding', 'Republican'],
    ['Robert Rickman', 'Republican'],
  ]),
  ...countyOfficials('San Joaquin', [
    ['Patrick Withrow', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Ron Freitas', 'District Attorney', 'Nonpartisan'],
    ['Steve Bestolarides', 'Assessor', 'Nonpartisan'],
    ['Den Okubo', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Parandeh Kia', 'Auditor-Controller', 'Nonpartisan'],
    ['Lynda Mowery', 'Clerk-Recorder', 'Nonpartisan'],
  ]),
];

// ==================== BATCH 2: Counties 16-30 ====================

const sonomaCounty = [
  ...supervisors('Sonoma', [
    ['Rebecca Hermosillo', 'Democrat'],
    ['David Rabbitt', 'Democrat'],
    ['Chris Coursey', 'Democrat'],
    ['James Gore', 'Democrat'],
    ['Lynda Hopkins', 'Democrat'],
  ]),
  ...countyOfficials('Sonoma', [
    ['Eddie Engram', 'Sheriff', 'Nonpartisan'],
    ['Carla Rodriguez', 'District Attorney', 'Democrat'],
    ['Erick Roeser', 'Assessor-Recorder', 'Nonpartisan'],
    ['Erick Roeser', 'County Clerk', 'Nonpartisan'],
    ['Deva Marie Proto', 'Clerk-Recorder-Assessor', 'Nonpartisan'],
  ]),
];

const stanislausCounty = [
  ...supervisors('Stanislaus', [
    ['Buck Condit', 'Republican'],
    ['Vito Chiesa', 'Republican'],
    ['Jeff Grover', 'Republican'],
    ['Terry Withrow', 'Republican'],
    ['Mani Grewal', 'Democrat'],
  ]),
  ...countyOfficials('Stanislaus', [
    ['Jeff Dirkse', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Birgit Fladager', 'District Attorney', 'Republican'],
    ['Don Gaekle', 'Assessor', 'Nonpartisan'],
    ['Gordon Ford', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Vicki Loner', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const tulareCounty = [
  ...supervisors('Tulare', [
    ['Larry Micari', 'Republican'],
    ['Pete Vander Poel', 'Republican'],
    ['Amy Shuklian', 'Republican'],
    ['Eddie Valero', 'Republican'],
    ['Dennis Townsend', 'Republican'],
  ]),
  ...countyOfficials('Tulare', [
    ['Mike Boudreaux', 'Sheriff-Coroner', 'Republican'],
    ['Tim Ward', 'District Attorney', 'Republican'],
    ['Roland Hill', 'Assessor/Clerk-Recorder', 'Nonpartisan'],
    ['Kim Gunderson', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Jennifer Baquera', 'Auditor-Controller/County Clerk', 'Nonpartisan'],
  ]),
];

const santaBarbaraCounty = [
  ...supervisors('Santa Barbara', [
    ['Das Williams', 'Democrat'],
    ['Laura Capps', 'Democrat'],
    ['Joan Hartmann', 'Democrat'],
    ['Bob Nelson', 'Republican'],
    ['Steve Lavagnino', 'Republican'],
  ]),
  ...countyOfficials('Santa Barbara', [
    ['Bill Brown', 'Sheriff-Coroner', 'Nonpartisan'],
    ['John Savrnoch', 'District Attorney', 'Republican'],
    ['Joes Holland', 'Assessor', 'Nonpartisan'],
    ['Harry Hagen', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Betsy Schaffer', 'Auditor-Controller', 'Nonpartisan'],
    ['Joseph Holland', 'Clerk-Recorder-Assessor', 'Nonpartisan'],
  ]),
];

const solanoCounty = [
  ...supervisors('Solano', [
    ['Mitch Mashburn', 'Republican'],
    ['Monica Brown', 'Democrat'],
    ['Wanda Williams', 'Democrat'],
    ['Jim Spering', 'Democrat'],
    ['Erin Hannigan', 'Democrat'],
  ]),
  ...countyOfficials('Solano', [
    ['Thomas Ferrara', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Krishna Abrams', 'District Attorney', 'Democrat'],
    ['Marc Tonnesen', 'Assessor-Recorder', 'Nonpartisan'],
    ['Charles Lomeli', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Simona Padilla-Scholtens', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const montereyCounty = [
  ...supervisors('Monterey', [
    ['Luis Alejo', 'Democrat'],
    ['Glenn Church', 'Republican'],
    ['Chris Lopez', 'Democrat'],
    ['Wendy Root Askew', 'Democrat'],
    ['Mary Adams', 'Democrat'],
  ]),
  ...countyOfficials('Monterey', [
    ['Tina Nieto', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Jeannine Pacioni', 'District Attorney', 'Nonpartisan'],
    ['Seo Jin Kim', 'Assessor-County Clerk-Recorder', 'Nonpartisan'],
    ['Mary Zeeb', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Rupa Shah', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const placerCounty = [
  ...supervisors('Placer', [
    ['Bonnie Gore', 'Republican'],
    ['Shanti Landon', 'Republican'],
    ['Jim Holmes', 'Republican'],
    ['Suzanne Jones', 'Republican'],
    ['Cindy Gustafson', 'Democrat'],
  ]),
  ...countyOfficials('Placer', [
    ['Wayne Woo', 'Sheriff-Coroner', 'Republican'],
    ['Morgan Gire', 'District Attorney', 'Republican'],
    ['Jim McCauley', 'Assessor', 'Republican'],
    ['Jenine Windeshausen', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Bryan Brewer', 'Auditor-Controller', 'Nonpartisan'],
    ['Ryan Ronco', 'Clerk-Recorder/Registrar', 'Nonpartisan'],
  ]),
];

const marinCounty = [
  ...supervisors('Marin', [
    ['Mary Sackett', 'Democrat'],
    ['Brian Colbert', 'Democrat'],
    ['Stephanie Moulton-Peters', 'Democrat'],
    ['Dennis Rodoni', 'Democrat'],
    ['Eric Lucan', 'Democrat'],
  ]),
  ...countyOfficials('Marin', [
    ['Jamie Scardina', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Lori Frugoli', 'District Attorney', 'Democrat'],
    ['Jeanne Martinelli', 'Assessor-Recorder-County Clerk', 'Nonpartisan'],
    ['Gordy Gibb', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Wendy Benkert', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const santaCruzCounty = [
  ...supervisors('Santa Cruz', [
    ['Manu Koenig', 'Nonpartisan'],
    ['Zach Friend', 'Democrat'],
    ['Justin Cummings', 'Democrat'],
    ['Greg Caput', 'Republican'],
    ['Monica Martinez', 'Democrat'],
  ]),
  ...countyOfficials('Santa Cruz', [
    ['Jim Hart', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Jeff Rosell', 'District Attorney', 'Nonpartisan'],
    ['Eric Spencer', 'Assessor', 'Nonpartisan'],
    ['Fred Keeley', 'Treasurer-Tax Collector', 'Democrat'],
    ['Jake Faris', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const mercedCounty = [
  ...supervisors('Merced', [
    ['Rodrigo Espinoza', 'Democrat'],
    ['Scott Silveira', 'Republican'],
    ['Daron McDaniel', 'Republican'],
    ['Lloyd Pareira', 'Republican'],
    ['Josh Pedrozo', 'Republican'],
  ]),
  ...countyOfficials('Merced', [
    ['Vernon Warnke', 'Sheriff-Coroner', 'Republican'],
    ['Nicole Silveira', 'District Attorney', 'Nonpartisan'],
    ['Barbara Levey', 'Assessor-Recorder', 'Nonpartisan'],
    ['Karen Adams', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Robert Hatch', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const butteCounty = [
  ...supervisors('Butte', [
    ['Bill Connelly', 'Republican'],
    ['Debra Lucero', 'Democrat'],
    ['Tami Ritter', 'Democrat'],
    ['Tod Kimmelshue', 'Republican'],
    ['Doug Teeter', 'Republican'],
  ]),
  ...countyOfficials('Butte', [
    ['Kory Honea', 'Sheriff-Coroner', 'Republican'],
    ['Mike Ramsey', 'District Attorney', 'Republican'],
    ['Diane Gilliland', 'Assessor', 'Nonpartisan'],
    ['Peggy Moak', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Kim Szczurek', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const yoloCounty = [
  ...supervisors('Yolo', [
    ['Oscar Villegas', 'Democrat'],
    ['Angel Barajas', 'Democrat'],
    ['Gary Sandy', 'Democrat'],
    ['Jim Provenza', 'Democrat'],
    ['Duane Chamberlain', 'Republican'],
  ]),
  ...countyOfficials('Yolo', [
    ['Tom Lopez', 'Sheriff-Coroner', 'Nonpartisan'],
    ['Jeff Reisig', 'District Attorney', 'Republican'],
    ['Jesse Salinas', 'Assessor/Clerk-Recorder', 'Democrat'],
    ['Daniel Fruchtenicht', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Angela Faul', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const elDoradoCounty = [
  ...supervisors('El Dorado', [
    ['John Hidahl', 'Republican'],
    ['George Turnboo', 'Republican'],
    ['Wendy Thomas', 'Republican'],
    ['Lori Parlin', 'Republican'],
    ['Brooke Laine', 'Democrat'],
  ]),
  ...countyOfficials('El Dorado', [
    ['Jeff Leikauf', 'Sheriff-Coroner', 'Republican'],
    ['Vern Pierson', 'District Attorney', 'Republican'],
    ['Jenifer Montgomery', 'Assessor', 'Republican'],
    ['Karen Stanfield', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Joe Harn', 'Auditor-Controller', 'Nonpartisan'],
  ]),
];

const imperialCounty = [
  ...supervisors('Imperial', [
    ['Jesus Eduardo Escobar', 'Democrat'],
    ['Luis Plancarte', 'Democrat'],
    ['Michael Kelley', 'Republican'],
    ['Ryan Kelley', 'Republican'],
    ['Ray Castillo', 'Democrat'],
  ]),
  ...countyOfficials('Imperial', [
    ['Omar Velasco', 'Sheriff-Coroner', 'Nonpartisan'],
    ['George Gallagher', 'District Attorney', 'Nonpartisan'],
    ['Luis Terrazas', 'Assessor', 'Nonpartisan'],
    ['Josue Mercado', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Esperanza Colio-Warren', 'Auditor-Controller', 'Nonpartisan'],
    ['Chuck Storey', 'Clerk-Recorder', 'Nonpartisan'],
  ]),
];

const shastaCounty = [
  ...supervisors('Shasta', [
    ['Patrick Jones', 'Republican'],
    ['Chris Kelstrom', 'Republican'],
    ['Mary Rickert', 'Republican'],
    ['Corkey Harmon', 'Republican'],
    ['Tim Garman', 'Republican'],
  ]),
  ...countyOfficials('Shasta', [
    ['Michael L. Johnson', 'Sheriff', 'Republican'],
    ['Stephanie Bridgett', 'District Attorney', 'Republican'],
    ['Diane McBeth', 'Assessor-Recorder', 'Nonpartisan'],
    ['Bret Rinehart', 'Treasurer-Tax Collector', 'Nonpartisan'],
    ['Lauren Hartley', 'Auditor-Controller', 'Nonpartisan'],
    ['Cathy Darling Allen', 'Clerk/Registrar of Voters', 'Nonpartisan'],
  ]),
];

// ==================== MAJOR CITY OFFICIALS ====================

const losAngelesCity = [
  official('Los Angeles', 'Karen Bass', 'Mayor', 'Democrat', 'city'),
  official('Los Angeles', 'Eunisses Hernandez', 'City Council, District 1', 'Democrat', 'city'),
  official('Los Angeles', 'Paul Krekorian', 'City Council, District 2', 'Democrat', 'city'),
  official('Los Angeles', 'Bob Blumenfield', 'City Council, District 3', 'Democrat', 'city'),
  official('Los Angeles', 'Nithya Raman', 'City Council, District 4', 'Democrat', 'city'),
  official('Los Angeles', 'Katy Yaroslavsky', 'City Council, District 5', 'Democrat', 'city'),
  official('Los Angeles', 'Imelda Padilla', 'City Council, District 6', 'Democrat', 'city'),
  official('Los Angeles', 'Monica Rodriguez', 'City Council, District 7', 'Democrat', 'city'),
  official('Los Angeles', 'Marqueece Harris-Dawson', 'City Council, District 8', 'Democrat', 'city'),
  official('Los Angeles', 'Curren Price', 'City Council, District 9', 'Democrat', 'city'),
  official('Los Angeles', 'Heather Hutt', 'City Council, District 10', 'Democrat', 'city'),
  official('Los Angeles', 'Traci Park', 'City Council, District 11', 'Democrat', 'city'),
  official('Los Angeles', 'Hugo Soto-Martinez', 'City Council, District 13', 'Democrat', 'city'),
  official('Los Angeles', 'Kevin de León', 'City Council, District 14', 'Democrat', 'city'),
  official('Los Angeles', 'Tim McOsker', 'City Council, District 15', 'Democrat', 'city'),
];

const sanFranciscoCity = [
  // SF is consolidated city-county, already included above
];

const sanDiegoCity = [
  official('San Diego', 'Todd Gloria', 'Mayor', 'Democrat', 'city'),
  official('San Diego', 'Joe LaCava', 'City Council, District 1', 'Democrat', 'city'),
  official('San Diego', 'Jennifer Campbell', 'City Council, District 2', 'Democrat', 'city'),
  official('San Diego', 'Stephen Whitburn', 'City Council, District 3', 'Democrat', 'city'),
  official('San Diego', 'Henry Foster III', 'City Council, District 4', 'Democrat', 'city'),
  official('San Diego', 'Marni von Wilpert', 'City Council, District 5', 'Democrat', 'city'),
  official('San Diego', 'Kent Lee', 'City Council, District 6', 'Democrat', 'city'),
  official('San Diego', 'Raul Campillo', 'City Council, District 7', 'Democrat', 'city'),
  official('San Diego', 'Vivian Moreno', 'City Council, District 8', 'Democrat', 'city'),
  official('San Diego', 'Sean Elo-Rivera', 'City Council, District 9', 'Democrat', 'city'),
];

const sanJoseCity = [
  official('San Jose', 'Matt Mahan', 'Mayor', 'Democrat', 'city'),
  official('San Jose', 'Rosemary Kamei', 'City Council, District 1', 'Democrat', 'city'),
  official('San Jose', 'Sergio Jimenez', 'City Council, District 2', 'Democrat', 'city'),
  official('San Jose', 'Omar Torres', 'City Council, District 3', 'Democrat', 'city'),
  official('San Jose', 'David Cohen', 'City Council, District 4', 'Democrat', 'city'),
  official('San Jose', 'Peter Ortiz', 'City Council, District 5', 'Democrat', 'city'),
  official('San Jose', 'Dev Davis', 'City Council, District 6', 'Republican', 'city'),
  official('San Jose', 'Bien Doan', 'City Council, District 7', 'Democrat', 'city'),
  official('San Jose', 'Domingo Candelas', 'City Council, District 8', 'Democrat', 'city'),
  official('San Jose', 'Pam Foley', 'City Council, District 9', 'Democrat', 'city'),
  official('San Jose', 'Arjun Batra', 'City Council, District 10', 'Democrat', 'city'),
];

const sacramentoCity = [
  official('Sacramento', 'Kevin McCarty', 'Mayor', 'Democrat', 'city'),
  official('Sacramento', 'Lisa Kaplan', 'City Council, District 1', 'Democrat', 'city'),
  official('Sacramento', 'Sean Loloee', 'City Council, District 2', 'Democrat', 'city'),
  official('Sacramento', 'Karina Talamantes', 'City Council, District 3', 'Democrat', 'city'),
  official('Sacramento', 'Katie Valenzuela', 'City Council, District 4', 'Democrat', 'city'),
  official('Sacramento', 'Caity Maple', 'City Council, District 5', 'Democrat', 'city'),
  official('Sacramento', 'Eric Guerra', 'City Council, District 6', 'Democrat', 'city'),
  official('Sacramento', 'Rick Jennings', 'City Council, District 7', 'Democrat', 'city'),
  official('Sacramento', 'Mai Vang', 'City Council, District 8', 'Democrat', 'city'),
];

const longBeachCity = [
  official('Long Beach', 'Rex Richardson', 'Mayor', 'Democrat', 'city'),
  official('Long Beach', 'Mary Zendejas', 'City Council, District 1', 'Democrat', 'city'),
  official('Long Beach', 'Cindy Allen', 'City Council, District 2', 'Democrat', 'city'),
  official('Long Beach', 'Kristina Duggan', 'City Council, District 3', 'Democrat', 'city'),
  official('Long Beach', 'Daryl Supernaw', 'City Council, District 4', 'Republican', 'city'),
  official('Long Beach', 'Megan Kerr', 'City Council, District 5', 'Democrat', 'city'),
  official('Long Beach', 'Suely Saro', 'City Council, District 6', 'Democrat', 'city'),
  official('Long Beach', 'Roberto Uranga', 'City Council, District 7', 'Democrat', 'city'),
  official('Long Beach', 'Tunua Thrash-Ntuk', 'City Council, District 8', 'Democrat', 'city'),
  official('Long Beach', 'Joni Ricks-Oddie', 'City Council, District 9', 'Democrat', 'city'),
];

const oaklandCity = [
  official('Oakland', 'Sheng Thao', 'Mayor', 'Democrat', 'city'),
  official('Oakland', 'Janani Ramachandran', 'City Council, District 1', 'Democrat', 'city'),
  official('Oakland', 'Nikki Fortunato Bas', 'City Council, District 2', 'Democrat', 'city'),
  official('Oakland', 'Carroll Fife', 'City Council, District 3', 'Democrat', 'city'),
  official('Oakland', 'Noel Gallo', 'City Council, District 5', 'Democrat', 'city'),
  official('Oakland', 'Kevin Jenkins', 'City Council, District 6', 'Democrat', 'city'),
  official('Oakland', 'Treva Reid', 'City Council, District 7', 'Democrat', 'city'),
  official('Oakland', 'Sheng Thao', 'City Council At-Large', 'Democrat', 'city'),
];

const fresnoCity = [
  official('Fresno', 'Jerry Dyer', 'Mayor', 'Republican', 'city'),
  official('Fresno', 'Annalisa Perea', 'City Council, District 1', 'Democrat', 'city'),
  official('Fresno', 'Mike Karbassi', 'City Council, District 2', 'Republican', 'city'),
  official('Fresno', 'Miguel Angel Arias', 'City Council, District 3', 'Democrat', 'city'),
  official('Fresno', 'Tyler Maxwell', 'City Council, District 4', 'Republican', 'city'),
  official('Fresno', 'Luis Chavez', 'City Council, District 5', 'Democrat', 'city'),
  official('Fresno', 'Garry Bredefeld', 'City Council, District 6', 'Republican', 'city'),
  official('Fresno', 'Nelson Esparza', 'City Council, District 7', 'Democrat', 'city'),
];

const anaheimCity = [
  official('Anaheim', 'Ashleigh Aitken', 'Mayor', 'Democrat', 'city'),
  official('Anaheim', 'Carlos Leon', 'City Council, District 1', 'Democrat', 'city'),
  official('Anaheim', 'Carlos Diaz', 'City Council, District 2', 'Democrat', 'city'),
  official('Anaheim', 'Natalie Rubalcava', 'City Council, District 3', 'Democrat', 'city'),
  official('Anaheim', 'Avelino Valencia', 'City Council, District 4', 'Democrat', 'city'),
  official('Anaheim', 'Steve Faessel', 'City Council, District 5', 'Republican', 'city'),
  official('Anaheim', 'Gloria Ma\'ae', 'City Council, District 6', 'Republican', 'city'),
];

// ==================== COMBINE ALL ====================

const allOfficials = [
  ...losAngelesCounty,
  ...sanDiegoCounty,
  ...orangeCounty,
  ...riversideCounty,
  ...sanBernardinoCounty,
  ...santaClaraCounty,
  ...alamedaCounty,
  ...sacramentoCounty,
  ...contraCostaCounty,
  ...fresnoCounty,
  ...sanFranciscoCounty,
  ...venturaCounty,
  ...sanMateoCounty,
  ...kernCounty,
  ...sanJoaquinCounty,
  ...sonomaCounty,
  ...stanislausCounty,
  ...tulareCounty,
  ...santaBarbaraCounty,
  ...solanoCounty,
  ...montereyCounty,
  ...placerCounty,
  ...marinCounty,
  ...santaCruzCounty,
  ...mercedCounty,
  ...butteCounty,
  ...yoloCounty,
  ...elDoradoCounty,
  ...imperialCounty,
  ...shastaCounty,
  // Cities
  ...losAngelesCity,
  ...sanDiegoCity,
  ...sanJoseCity,
  ...sacramentoCity,
  ...longBeachCity,
  ...oaklandCity,
  ...fresnoCity,
  ...anaheimCity,
];

// ==================== INSERT LOGIC ====================

async function insertBatch(records, batchLabel) {
  const { data, error } = await sb
    .from('politicians')
    .upsert(records, { onConflict: 'bioguide_id' });

  if (error) {
    console.error(`[ERROR] ${batchLabel}: ${error.message}`);
    return 0;
  }
  console.log(`[OK] ${batchLabel}: ${records.length} officials upserted`);
  return records.length;
}

async function main() {
  console.log('=== Seeding California County & City Officials ===');
  console.log(`Total officials to insert: ${allOfficials.length}\n`);

  // De-duplicate by bioguide_id (in case of any collisions)
  const seen = new Set();
  const deduplicated = allOfficials.filter((o) => {
    if (seen.has(o.bioguide_id)) {
      console.warn(`[WARN] Duplicate bioguide_id skipped: ${o.bioguide_id}`);
      return false;
    }
    seen.add(o.bioguide_id);
    return true;
  });

  console.log(`After dedup: ${deduplicated.length} unique officials\n`);

  // Insert in batches of 50
  const BATCH_SIZE = 50;
  let totalInserted = 0;

  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const count = await insertBatch(batch, `Batch ${batchNum}`);
    totalInserted += count;
  }

  // Print summary per county/city
  console.log('\n=== SUMMARY BY JURISDICTION ===');
  const byCounts = {};
  for (const o of deduplicated) {
    const key = o.jurisdiction;
    byCounts[key] = (byCounts[key] || 0) + 1;
  }
  for (const [jurisdiction, count] of Object.entries(byCounts).sort()) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }

  console.log(`\n=== TOTAL: ${totalInserted} officials inserted/updated ===`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
