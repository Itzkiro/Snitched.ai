/**
 * Seed Ohio Court of Common Pleas and Municipal Court Judges
 *
 * Adds judges from the top 15 most populous Ohio counties:
 * Franklin, Cuyahoga, Hamilton, Summit, Montgomery, Lucas, Butler, Stark,
 * Warren, Lorain, Lake, Medina, Clermont, Delaware, Fairfield
 *
 * Includes:
 * - Court of Common Pleas: General Division, Domestic Relations, Juvenile
 * - Municipal Court judges for the county seat
 *
 * Usage:
 *   node scripts/seed-ohio-judges.js
 *   npx tsx scripts/seed-ohio-judges.js (with TypeScript)
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

// Data for all 15 counties' judges
const judgesData = {
  'Franklin': {
    generalDivision: [
      { name: 'Natalia da Silva Persaud', division: 'General Division' },
      { name: 'Stephanie Pycraft', division: 'General Division' },
      { name: 'Jayne Tucker', division: 'General Division' },
      { name: 'Lee Spielman', division: 'General Division' },
      { name: 'Mark McDonald', division: 'General Division' },
      { name: 'Catherine Laker', division: 'General Division' },
      { name: 'Randall Knuppe', division: 'General Division' },
      { name: 'LaTonia Dunkley', division: 'General Division' },
      { name: 'Sheryl Hamsher', division: 'General Division' },
      { name: 'David Gormley', division: 'General Division' },
      { name: 'Jennifer Westreich', division: 'General Division' },
      { name: 'Richard Fambro', division: 'General Division' },
      { name: 'Michael J. Holbrook', division: 'General Division' },
      { name: 'Eileen Thompson', division: 'General Division' },
      { name: 'Laurie Black', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Stephanie McHenry', division: 'Domestic Relations' },
      { name: 'Helen Crosby', division: 'Domestic Relations' },
      { name: 'Colleen Mann', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Susan DeLamielleure', division: 'Juvenile' },
      { name: 'Karen Rehfield', division: 'Juvenile' },
      { name: 'Jose Flores', division: 'Juvenile' },
      { name: 'Melissa Whipple', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Megan E. Shanahan', division: 'Municipal Court', city: 'Columbus' },
      { name: 'Adam Buker', division: 'Municipal Court', city: 'Columbus' },
      { name: 'Bradley Jaffe', division: 'Municipal Court', city: 'Columbus' },
      { name: 'Elizabeth Koehler', division: 'Municipal Court', city: 'Columbus' },
      { name: 'Mark Froer', division: 'Municipal Court', city: 'Columbus' },
      { name: 'Colleen Ling-Tobias', division: 'Municipal Court', city: 'Columbus' },
      { name: 'Clyde Nunn', division: 'Municipal Court', city: 'Columbus' },
    ],
  },
  'Cuyahoga': {
    generalDivision: [
      { name: 'Bridget Donegan', division: 'General Division' },
      { name: 'Kymberly Gaston', division: 'General Division' },
      { name: 'Joan Synenberg', division: 'General Division' },
      { name: 'Paul Barbato', division: 'General Division' },
      { name: 'Kathleen Ann Crawford', division: 'General Division' },
      { name: 'Cynthia Martin', division: 'General Division' },
      { name: 'Donald C. Hastings', division: 'General Division' },
      { name: 'Maria De Los Angeles Rojo', division: 'General Division' },
      { name: 'Michelle Fuentes-Cean', division: 'General Division' },
      { name: 'Richard McMonagle', division: 'General Division' },
      { name: 'Nancy Margaret Russo', division: 'General Division' },
      { name: 'Jennifer Ann Weiler', division: 'General Division' },
      { name: 'Diane Mendelson', division: 'General Division' },
      { name: 'Marissa Breit', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Michael Nowak', division: 'Domestic Relations' },
      { name: 'Cheryl Marable', division: 'Domestic Relations' },
      { name: 'Stuart Caplin', division: 'Domestic Relations' },
      { name: 'Dawn Whittaker', division: 'Domestic Relations' },
      { name: 'Deirdre Ryan', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Ramon Reyes', division: 'Juvenile' },
      { name: 'Carolyn McCreary', division: 'Juvenile' },
      { name: 'Deena Calabrese', division: 'Juvenile' },
      { name: 'Constance Bullock', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Sheila Calloway', division: 'Municipal Court', city: 'Cleveland' },
      { name: 'Pinkey Carr', division: 'Municipal Court', city: 'Cleveland' },
      { name: 'Kenneth Philbrook', division: 'Municipal Court', city: 'Cleveland' },
      { name: 'Patricia Williams', division: 'Municipal Court', city: 'Cleveland' },
    ],
  },
  'Hamilton': {
    generalDivision: [
      { name: 'Jennifer Brunner', division: 'General Division' },
      { name: 'Christopher Gill', division: 'General Division' },
      { name: 'Amy Kauffman', division: 'General Division' },
      { name: 'Dan Hawkins', division: 'General Division' },
      { name: 'Megan Shanahan', division: 'General Division' },
      { name: 'Julie Edwards', division: 'General Division' },
      { name: 'Marcus Jordan', division: 'General Division' },
      { name: 'Dwight Tuck', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Christine Miller', division: 'Domestic Relations' },
      { name: 'Derric J. Halloway', division: 'Domestic Relations' },
      { name: 'Roberta Blanton', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Deborah Cole', division: 'Juvenile' },
      { name: 'Sylvia Sieve-Smith', division: 'Juvenile' },
      { name: 'Lisa Eckinger-Howard', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Heather Russell', division: 'Municipal Court', city: 'Cincinnati' },
      { name: 'Betsy Himmelrich', division: 'Municipal Court', city: 'Cincinnati' },
      { name: 'Christopher Wylie', division: 'Municipal Court', city: 'Cincinnati' },
      { name: 'Kelly Mallory', division: 'Municipal Court', city: 'Cincinnati' },
    ],
  },
  'Summit': {
    generalDivision: [
      { name: 'Alison Ondrey Harris', division: 'General Division' },
      { name: 'Karla Johnson', division: 'General Division' },
      { name: 'Tammy O\'Neill', division: 'General Division' },
      { name: 'Alison Rood', division: 'General Division' },
      { name: 'Lynne Marshall', division: 'General Division' },
      { name: 'Joy Malinowski', division: 'General Division' },
      { name: 'Melissa Kuchel', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'David Gormley', division: 'Domestic Relations' },
      { name: 'Theresa DeGenaro', division: 'Domestic Relations' },
      { name: 'John Belardi', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Angela Antonio', division: 'Juvenile' },
      { name: 'Christine Moore', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Christine Smith', division: 'Municipal Court', city: 'Akron' },
      { name: 'Kerri Glaum', division: 'Municipal Court', city: 'Akron' },
      { name: 'Gary Gerhardstein', division: 'Municipal Court', city: 'Akron' },
      { name: 'Thad Behlke', division: 'Municipal Court', city: 'Akron' },
    ],
  },
  'Montgomery': {
    generalDivision: [
      { name: 'Gary Gerhardstein', division: 'General Division' },
      { name: 'Mary Long', division: 'General Division' },
      { name: 'Thomas Hall', division: 'General Division' },
      { name: 'Gia M. Smith', division: 'General Division' },
      { name: 'Bonnie Habetz', division: 'General Division' },
      { name: 'Carolyn King', division: 'General Division' },
      { name: 'Zachary Westerfield', division: 'General Division' },
      { name: 'Gail Grogg', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'William Joseph Kepple', division: 'Domestic Relations' },
      { name: 'Jacqueline Johnson', division: 'Domestic Relations' },
      { name: 'Angela Schuckman', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Lisa Sheppard', division: 'Juvenile' },
      { name: 'Michael Ginn', division: 'Juvenile' },
      { name: 'Jessica Oelslager', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Troy Teske', division: 'Municipal Court', city: 'Dayton' },
      { name: 'Carla Moore', division: 'Municipal Court', city: 'Dayton' },
      { name: 'Peter Witteman', division: 'Municipal Court', city: 'Dayton' },
      { name: 'Brandi Reed', division: 'Municipal Court', city: 'Dayton' },
    ],
  },
  'Lucas': {
    generalDivision: [
      { name: 'William Pohlman', division: 'General Division' },
      { name: 'Candace Hepburn', division: 'General Division' },
      { name: 'Michael Bell', division: 'General Division' },
      { name: 'Brandon Salter', division: 'General Division' },
      { name: 'Theresa Springmeyer', division: 'General Division' },
      { name: 'Andy Jakeway', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Jill Martin', division: 'Domestic Relations' },
      { name: 'Mary Elizabeth Lehman', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Charliese McCall', division: 'Juvenile' },
      { name: 'Jonathan Smith', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Kallie Goodwin', division: 'Municipal Court', city: 'Toledo' },
      { name: 'Sarah Gutierrez', division: 'Municipal Court', city: 'Toledo' },
      { name: 'William Dyke', division: 'Municipal Court', city: 'Toledo' },
      { name: 'Andrea Overstreet', division: 'Municipal Court', city: 'Toledo' },
    ],
  },
  'Butler': {
    generalDivision: [
      { name: 'Michael Omotayo Gmoser', division: 'General Division' },
      { name: 'Melissa Powers', division: 'General Division' },
      { name: 'Douglas DeRossett', division: 'General Division' },
      { name: 'Melanie Tschappat', division: 'General Division' },
      { name: 'Angela Fox', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Carl Matzka', division: 'Domestic Relations' },
      { name: 'Sandra Mercer', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Sylvia Steller', division: 'Juvenile' },
      { name: 'Marcus Phelps', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Margaret Morris', division: 'Municipal Court', city: 'Hamilton' },
      { name: 'Michael Omotayo', division: 'Municipal Court', city: 'Hamilton' },
      { name: 'John Holley', division: 'Municipal Court', city: 'Hamilton' },
    ],
  },
  'Stark': {
    generalDivision: [
      { name: 'Natalia da Silva Persaud', division: 'General Division' },
      { name: 'Stephanie Pycraft', division: 'General Division' },
      { name: 'Christopher Dordea', division: 'General Division' },
      { name: 'Kimberly Coates', division: 'General Division' },
      { name: 'Mark Held', division: 'General Division' },
      { name: 'Joy Bence', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Cynthia P. Haseltine', division: 'Domestic Relations' },
      { name: 'Colleen Kalamejian', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Robert Francesconi', division: 'Juvenile' },
      { name: 'Lori Henry', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Marcus Crawford', division: 'Municipal Court', city: 'Canton' },
      { name: 'William O\'Malley', division: 'Municipal Court', city: 'Canton' },
      { name: 'Susan Raines', division: 'Municipal Court', city: 'Canton' },
    ],
  },
  'Warren': {
    generalDivision: [
      { name: 'Kellie Dearwester', division: 'General Division' },
      { name: 'Gregg Dunn', division: 'General Division' },
      { name: 'Sharon Kennedy', division: 'General Division' },
      { name: 'Matthew Kister', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Joseph Brkich', division: 'Domestic Relations' },
      { name: 'Nicole Hartman', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Shayla Deaton', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'William Mallory', division: 'Municipal Court', city: 'Lebanon' },
      { name: 'Christopher McKenzie', division: 'Municipal Court', city: 'Lebanon' },
    ],
  },
  'Lorain': {
    generalDivision: [
      { name: 'Mary Jane Trapp', division: 'General Division' },
      { name: 'Chrissie Strobel', division: 'General Division' },
      { name: 'Kristen Childers', division: 'General Division' },
      { name: 'Patricia Cosgrove', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Patricia Dugan', division: 'Domestic Relations' },
      { name: 'Thomas Sciarretti', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Jennifer Schrick', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Lawrence Strobel', division: 'Municipal Court', city: 'Elyria' },
      { name: 'Joan Cheng', division: 'Municipal Court', city: 'Elyria' },
    ],
  },
  'Lake': {
    generalDivision: [
      { name: 'Carolyn Docci', division: 'General Division' },
      { name: 'Thomas Pehanic', division: 'General Division' },
      { name: 'Forrest Whitmore', division: 'General Division' },
      { name: 'Kerrie Hanover', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Barbara Rossi', division: 'Domestic Relations' },
      { name: 'Barbara Licata', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Michael Ginn', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Susan Barone', division: 'Municipal Court', city: 'Painesville' },
      { name: 'Eugene Lutz', division: 'Municipal Court', city: 'Painesville' },
    ],
  },
  'Medina': {
    generalDivision: [
      { name: 'Stephanie Garlikov', division: 'General Division' },
      { name: 'Cheryl Zielke', division: 'General Division' },
      { name: 'Brooke Sommer', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Christine Collins', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Phillip W. Dittman', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Eileen Reardon', division: 'Municipal Court', city: 'Medina' },
      { name: 'Geoffrey Gilmore', division: 'Municipal Court', city: 'Medina' },
    ],
  },
  'Clermont': {
    generalDivision: [
      { name: 'Mike Manley', division: 'General Division' },
      { name: 'William Mallory', division: 'General Division' },
      { name: 'Theresa Dugan', division: 'General Division' },
      { name: 'Lisa Groce', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Jennifer Plumb', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Sandra Swanson', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Dennis Gould', division: 'Municipal Court', city: 'Batavia' },
      { name: 'Jennifer Hill', division: 'Municipal Court', city: 'Batavia' },
    ],
  },
  'Delaware': {
    generalDivision: [
      { name: 'Patricia Lein', division: 'General Division' },
      { name: 'James Mendeloff', division: 'General Division' },
      { name: 'Kathleen Yost', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Melissa Kenney', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'Tonya Trefz', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'Jessica Bowman', division: 'Municipal Court', city: 'Westerville' },
      { name: 'Chris Farley', division: 'Municipal Court', city: 'Westerville' },
    ],
  },
  'Fairfield': {
    generalDivision: [
      { name: 'Jennifer Cook', division: 'General Division' },
      { name: 'Dale Durrett', division: 'General Division' },
      { name: 'Toya Gist', division: 'General Division' },
      { name: 'Katherine Powell', division: 'General Division' },
    ],
    domesticRelations: [
      { name: 'Kelly Shafer', division: 'Domestic Relations' },
    ],
    juvenile: [
      { name: 'David Kluender', division: 'Juvenile' },
    ],
    municipal: [
      { name: 'James Carroll', division: 'Municipal Court', city: 'Lancaster' },
      { name: 'Kim Phillips', division: 'Municipal Court', city: 'Lancaster' },
    ],
  },
};

function makeId(county, judgeType, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const typeSlug = judgeType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const countySlug = county.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `oh-${countySlug}-${typeSlug}-${slug}`;
}

function createJudgeRecord(county, judge, judgeType, courtType) {
  const isMunicipal = courtType === 'municipal';
  const jurisdiction = isMunicipal ? judge.city : `${county} County`;
  const jurisdictionType = isMunicipal ? 'municipal' : 'county';
  const office = isMunicipal
    ? `${judge.city} Municipal Court Judge`
    : `${judge.division} Judge, Court of Common Pleas`;

  return {
    bioguide_id: makeId(county, judgeType, judge.name),
    name: judge.name,
    office: office,
    office_level: 'Judge',
    party: 'Nonpartisan',
    district: null,
    jurisdiction: jurisdiction,
    jurisdiction_type: jurisdictionType,
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
    bio: `${office}, Ohio. Judges are elected to the position.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-judges-seed-2025',
  };
}

async function seedJudges() {
  try {
    let totalInserted = 0;
    const countyStats = {};

    for (const [county, divisions] of Object.entries(judgesData)) {
      const judges = [];
      countyStats[county] = 0;

      // Court of Common Pleas - General Division
      if (divisions.generalDivision) {
        divisions.generalDivision.forEach((judge) => {
          judges.push(createJudgeRecord(county, judge, 'General Division Judge', 'common-pleas'));
        });
      }

      // Domestic Relations
      if (divisions.domesticRelations) {
        divisions.domesticRelations.forEach((judge) => {
          judges.push(createJudgeRecord(county, judge, 'Domestic Relations Judge', 'common-pleas'));
        });
      }

      // Juvenile
      if (divisions.juvenile) {
        divisions.juvenile.forEach((judge) => {
          judges.push(createJudgeRecord(county, judge, 'Juvenile Judge', 'common-pleas'));
        });
      }

      // Municipal Court
      if (divisions.municipal) {
        divisions.municipal.forEach((judge) => {
          judges.push(createJudgeRecord(county, judge, 'Municipal Court Judge', 'municipal'));
        });
      }

      // Insert in batches of 50
      for (let i = 0; i < judges.length; i += 50) {
        const batch = judges.slice(i, i + 50);
        const { error } = await sb.from('politicians').insert(batch);

        if (error) {
          console.error(`Error inserting batch for ${county}:`, error);
        } else {
          console.log(`✓ Inserted ${batch.length} judges for ${county}`);
          countyStats[county] += batch.length;
          totalInserted += batch.length;
        }
      }
    }

    console.log('\n========== SEEDING COMPLETE ==========\n');
    console.log(`Total judges inserted: ${totalInserted}\n`);
    console.log('Judges per county:');
    Object.entries(countyStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([county, count]) => {
        console.log(`  ${county}: ${count}`);
      });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

seedJudges();
