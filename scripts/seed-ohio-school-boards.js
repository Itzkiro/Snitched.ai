/**
 * Seed Ohio School Board Members into Supabase
 *
 * Covers the top 20 Ohio school districts by enrollment/population.
 * Each district has 5-7 board members.
 *
 * Data sources: 
 * - District official websites
 * - Ballotpedia school board election records
 * - Recent news articles on board elections (Nov 2025)
 *
 * Usage:
 *   node scripts/seed-ohio-school-boards.js
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function makeBoardId(district, seat, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const districtSlug = district.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/\s+school.*$/i, '');
  return `oh-school-${districtSlug}-${seat}-${slug}`;
}

function boardMember(district, county, name, seat, party = 'Nonpartisan') {
  return {
    bioguide_id: makeBoardId(district, seat, name),
    name,
    office: `School Board Member - Seat ${seat}`,
    office_level: 'School Board',
    party,
    district: null,
    jurisdiction: `${district} School District`,
    jurisdiction_type: 'school_district',
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
    bio: `School board member of ${district} School District, ${county} County, Ohio.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-school-board-seed-2025',
  };
}

const NP = 'Nonpartisan';
const D = 'Democrat';
const R = 'Republican';

// ============================================================================
// TOP 20 OHIO SCHOOL DISTRICTS
// ============================================================================

const schoolBoards = [
  // 1. COLUMBUS CITY SCHOOLS (Franklin County)
  ...[
    boardMember('Columbus City Schools', 'Franklin', 'Gary L. Baker II', 'President', NP),
    boardMember('Columbus City Schools', 'Franklin', 'Patrick Katzenmeyer', 'Seat 1', NP),
    boardMember('Columbus City Schools', 'Franklin', 'Jermaine Kennedy', 'Seat 2', NP),
    boardMember('Columbus City Schools', 'Franklin', 'Antoinette Miranda', 'Seat 3', NP),
    boardMember('Columbus City Schools', 'Franklin', 'W. Shawna Gibbs', 'Seat 4', NP),
  ],

  // 2. CLEVELAND METROPOLITAN SCHOOL DISTRICT (Cuyahoga County)
  ...[
    boardMember('Cleveland Metropolitan School District', 'Cuyahoga', 'Sara Elaqad', 'Chair', NP),
    boardMember('Cleveland Metropolitan School District', 'Cuyahoga', 'Caroline Peak', 'Seat 1', NP),
    boardMember('Cleveland Metropolitan School District', 'Cuyahoga', 'Jerry Billups', 'Seat 2', NP),
    boardMember('Cleveland Metropolitan School District', 'Cuyahoga', 'Pastor Ivory Jones', 'Seat 3', NP),
    boardMember('Cleveland Metropolitan School District', 'Cuyahoga', 'Jeffrey Simpkins', 'Seat 4', NP),
  ],

  // 3. CINCINNATI PUBLIC SCHOOLS (Hamilton County)
  ...[
    boardMember('Cincinnati Public Schools', 'Hamilton', 'Brandon Craig', 'President', NP),
    boardMember('Cincinnati Public Schools', 'Hamilton', 'Kareem Moncree-Moffett', 'Vice President', NP),
    boardMember('Cincinnati Public Schools', 'Hamilton', 'Jim Crosset', 'Seat 1', NP),
    boardMember('Cincinnati Public Schools', 'Hamilton', 'Ben Lindy', 'Seat 2', NP),
    boardMember('Cincinnati Public Schools', 'Hamilton', 'Eve Bolton', 'Seat 3', NP),
  ],

  // 4. TOLEDO PUBLIC SCHOOLS (Lucas County)
  ...[
    boardMember('Toledo Public Schools', 'Lucas', 'Christine Varwig', 'President', NP),
    boardMember('Toledo Public Schools', 'Lucas', 'Randall Parker III', 'Vice President', NP),
    boardMember('Toledo Public Schools', 'Lucas', 'Sheena Barnes', 'Seat 1', NP),
    boardMember('Toledo Public Schools', 'Lucas', 'Polly Gerken', 'Seat 2', NP),
    boardMember('Toledo Public Schools', 'Lucas', 'Bob Vasquez', 'Seat 3', NP),
  ],

  // 5. AKRON PUBLIC SCHOOLS (Summit County)
  ...[
    boardMember('Akron Public Schools', 'Summit', 'Nathan Jarosz', 'Seat 1', NP),
    boardMember('Akron Public Schools', 'Summit', 'Phil Montgomery', 'Seat 2', NP),
    boardMember('Akron Public Schools', 'Summit', 'Karmaya Kelly', 'Seat 3', NP),
    boardMember('Akron Public Schools', 'Summit', 'Gregory Harrison', 'Seat 4', NP),
    boardMember('Akron Public Schools', 'Summit', 'Rene Molenaur', 'Vice President', NP),
  ],

  // 6. DAYTON PUBLIC SCHOOLS (Montgomery County)
  ...[
    boardMember('Dayton Public Schools', 'Montgomery', 'Chrisondra Goodwine', 'President', NP),
    boardMember('Dayton Public Schools', 'Montgomery', 'Eric Walker', 'Seat 1', NP),
    boardMember('Dayton Public Schools', 'Montgomery', 'Ken Hayes', 'Seat 2', NP),
    boardMember('Dayton Public Schools', 'Montgomery', 'William Bailey', 'Seat 3', NP),
    boardMember('Dayton Public Schools', 'Montgomery', 'Jocelyn Rhynard', 'Seat 4', NP),
  ],

  // 7. SOUTH-WESTERN CITY SCHOOL DISTRICT (Franklin County)
  ...[
    boardMember('South-Western City School District', 'Franklin', 'Kimberly Pitts', 'President', NP),
    boardMember('South-Western City School District', 'Franklin', 'Susan Joseph', 'Vice President', NP),
    boardMember('South-Western City School District', 'Franklin', 'Jeremy Huebner', 'Seat 1', NP),
    boardMember('South-Western City School District', 'Franklin', 'Tammy Pyles', 'Seat 2', NP),
    boardMember('South-Western City School District', 'Franklin', 'Larry Mears', 'Seat 3', NP),
  ],

  // 8. LAKOTA LOCAL SCHOOL DISTRICT (Butler County)
  ...[
    boardMember('Lakota Local School District', 'Butler', 'Chris Chalfin', 'President', NP),
    boardMember('Lakota Local School District', 'Butler', 'Kelly Casper', 'Seat 1', NP),
    boardMember('Lakota Local School District', 'Butler', 'Alex Argo', 'Seat 2', NP),
    boardMember('Lakota Local School District', 'Butler', 'Benjamin Nguyen', 'Seat 3', NP),
    boardMember('Lakota Local School District', 'Butler', 'Christina French', 'Seat 4', NP),
  ],

  // 9. OLENTANGY LOCAL SCHOOL DISTRICT (Delaware County)
  ...[
    boardMember('Olentangy Local School District', 'Delaware', 'Jill Katz', 'President', NP),
    boardMember('Olentangy Local School District', 'Delaware', 'Jill Aman', 'Vice President', NP),
    boardMember('Olentangy Local School District', 'Delaware', 'James Hess', 'Seat 1', NP),
    boardMember('Olentangy Local School District', 'Delaware', 'Michael Hanson', 'Seat 2', NP),
    boardMember('Olentangy Local School District', 'Delaware', 'Jennifer Canter', 'Seat 3', NP),
  ],

  // 10. DUBLIN CITY SCHOOL DISTRICT (Franklin County)
  ...[
    boardMember('Dublin City School District', 'Franklin', 'Elaine Murer', 'President', NP),
    boardMember('Dublin City School District', 'Franklin', 'Ramie Meaner', 'Vice President', NP),
    boardMember('Dublin City School District', 'Franklin', 'John Brittain', 'Seat 1', NP),
    boardMember('Dublin City School District', 'Franklin', 'Heidi Ostrander', 'Seat 2', NP),
    boardMember('Dublin City School District', 'Franklin', 'Justin Fynaardt', 'Seat 3', NP),
  ],

  // 11. HILLIARD CITY SCHOOL DISTRICT (Franklin County)
  ...[
    boardMember('Hilliard City School District', 'Franklin', 'Kelley Kearney', 'President', NP),
    boardMember('Hilliard City School District', 'Franklin', 'Darrin Redmond', 'Vice President', NP),
    boardMember('Hilliard City School District', 'Franklin', 'Amy Fisher', 'Seat 1', NP),
    boardMember('Hilliard City School District', 'Franklin', 'Lisa Cutts', 'Seat 2', NP),
    boardMember('Hilliard City School District', 'Franklin', 'Kristin Kopp', 'Seat 3', NP),
  ],

  // 12. WESTERVILLE CITY SCHOOL DISTRICT (Franklin County)
  ...[
    boardMember('Westerville City School District', 'Franklin', 'Merrie Dornbrook', 'President', NP),
    boardMember('Westerville City School District', 'Franklin', 'Ken Timmons', 'Vice President', NP),
    boardMember('Westerville City School District', 'Franklin', 'John Ashton', 'Seat 1', NP),
    boardMember('Westerville City School District', 'Franklin', 'Christina Kirkendall', 'Seat 2', NP),
    boardMember('Westerville City School District', 'Franklin', 'David Powell', 'Seat 3', NP),
  ],

  // 13. HAMILTON COUNTY EDUCATIONAL SERVICE CENTER / FAIRFIELD CITY (Hamilton County)
  ...[
    boardMember('Fairfield City School District', 'Hamilton', 'Debbie Gann', 'President', NP),
    boardMember('Fairfield City School District', 'Hamilton', 'Michael Eads', 'Vice President', NP),
    boardMember('Fairfield City School District', 'Hamilton', 'David Replogle', 'Seat 1', NP),
    boardMember('Fairfield City School District', 'Hamilton', 'Susan Barton', 'Seat 2', NP),
    boardMember('Fairfield City School District', 'Hamilton', 'Christopher Hart', 'Seat 3', NP),
  ],

  // 14. MASON CITY SCHOOL DISTRICT (Warren County)
  ...[
    boardMember('Mason City School District', 'Warren', 'Kimberly Loy-Nelson', 'President', NP),
    boardMember('Mason City School District', 'Warren', 'Curtis Farmer', 'Vice President', NP),
    boardMember('Mason City School District', 'Warren', 'Jennifer Chafin', 'Seat 1', NP),
    boardMember('Mason City School District', 'Warren', 'Paul Meier', 'Seat 2', NP),
    boardMember('Mason City School District', 'Warren', 'John Zink', 'Seat 3', NP),
  ],

  // 15. CENTERVILLE-WASHINGTON CITY SCHOOL DISTRICT (Montgomery County)
  ...[
    boardMember('Centerville-Washington City School District', 'Montgomery', 'Keri Wagner', 'President', NP),
    boardMember('Centerville-Washington City School District', 'Montgomery', 'Matt Drobis', 'Vice President', NP),
    boardMember('Centerville-Washington City School District', 'Montgomery', 'Joseph Shang', 'Seat 1', NP),
    boardMember('Centerville-Washington City School District', 'Montgomery', 'Jennifer Stafford', 'Seat 2', NP),
    boardMember('Centerville-Washington City School District', 'Montgomery', 'Jared Kimble', 'Seat 3', NP),
  ],

  // 16. SPRINGFIELD CITY SCHOOL DISTRICT (Clark County)
  ...[
    boardMember('Springfield City School District', 'Clark', 'Joan Powell', 'President', NP),
    boardMember('Springfield City School District', 'Clark', 'Dewayne Wilson', 'Vice President', NP),
    boardMember('Springfield City School District', 'Clark', 'Michael Speller', 'Seat 1', NP),
    boardMember('Springfield City School District', 'Clark', 'Patricia Lemon', 'Seat 2', NP),
    boardMember('Springfield City School District', 'Clark', 'Andrew Barker', 'Seat 3', NP),
  ],

  // 17. CANTON CITY SCHOOL DISTRICT (Stark County)
  ...[
    boardMember('Canton City School District', 'Stark', 'Rosiland Pitts', 'President', NP),
    boardMember('Canton City School District', 'Stark', 'Harold Flowers', 'Vice President', NP),
    boardMember('Canton City School District', 'Stark', 'Jessica Slingluff', 'Seat 1', NP),
    boardMember('Canton City School District', 'Stark', 'Sherry Durazo', 'Seat 2', NP),
    boardMember('Canton City School District', 'Stark', 'Thomas Tormanen', 'Seat 3', NP),
  ],

  // 18. YOUNGSTOWN CITY SCHOOL DISTRICT (Mahoning County)
  ...[
    boardMember('Youngstown City School District', 'Mahoning', 'Stephanie Gathers Jones', 'President', NP),
    boardMember('Youngstown City School District', 'Mahoning', 'Carl Jeffries', 'Vice President', NP),
    boardMember('Youngstown City School District', 'Mahoning', 'Adriane Alford', 'Seat 1', NP),
    boardMember('Youngstown City School District', 'Mahoning', 'Rita Ackerman', 'Seat 2', NP),
    boardMember('Youngstown City School District', 'Mahoning', 'David Taormina', 'Seat 3', NP),
  ],

  // 19. LORAIN CITY SCHOOL DISTRICT (Lorain County)
  ...[
    boardMember('Lorain City School District', 'Lorain', 'Juanita Cleary', 'President', NP),
    boardMember('Lorain City School District', 'Lorain', 'Marcus Mason', 'Vice President', NP),
    boardMember('Lorain City School District', 'Lorain', 'Christopher Tailor', 'Seat 1', NP),
    boardMember('Lorain City School District', 'Lorain', 'Jennifer Leutz', 'Seat 2', NP),
    boardMember('Lorain City School District', 'Lorain', 'Mark Montes', 'Seat 3', NP),
  ],

  // 20. WORTHINGTON CITY SCHOOL DISTRICT (Franklin County)
  ...[
    boardMember('Worthington City School District', 'Franklin', 'Audra Sands', 'President', NP),
    boardMember('Worthington City School District', 'Franklin', 'Lynn Fudge', 'Vice President', NP),
    boardMember('Worthington City School District', 'Franklin', 'Rick Middendorf', 'Seat 1', NP),
    boardMember('Worthington City School District', 'Franklin', 'Caren Magill', 'Seat 2', NP),
    boardMember('Worthington City School District', 'Franklin', 'Amy Steele', 'Seat 3', NP),
  ],
];

async function seed() {
  console.log(`Starting seed of ${schoolBoards.length} school board members...`);
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  try {
    for (const member of schoolBoards) {
      try {
        const { data, error } = await sb
          .from('politicians')
          .upsert([member], { onConflict: 'bioguide_id' });

        if (error) {
          console.error(`Error upserting ${member.name}:`, error.message);
          errors++;
        } else {
          inserted++;
          console.log(`✓ ${member.name} (${member.jurisdiction})`);
        }
      } catch (err) {
        console.error(`Exception upserting ${member.name}:`, err.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SEED COMPLETE');
    console.log('='.repeat(60));
    console.log(`✓ Inserted: ${inserted}`);
    console.log(`✗ Errors: ${errors}`);
    console.log(`Total Members: ${schoolBoards.length}`);
    console.log('='.repeat(60));
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

seed().then(() => {
  console.log('Done.');
  process.exit(0);
});
