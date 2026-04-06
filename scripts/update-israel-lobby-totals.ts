#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Update Israel Lobby Totals from Track AIPAC Data
 *
 * Track AIPAC tracks three categories:
 *   - PACs: Direct PAC contributions from Israel lobby orgs
 *   - IE: Independent Expenditures
 *   - Lobby Donors: Individual contributors affiliated with Israel lobby orgs
 *
 * Our FEC sync only captured PAC contributions. This script updates
 * with the full totals including lobby donors.
 *
 * Data source: https://www.trackaipac.com/state/florida
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Track AIPAC data for FL federal politicians (April 2026)
// Source: https://www.trackaipac.com/state/florida
const TRACK_AIPAC_DATA: Record<string, {
  total: number;
  pacs: number;
  ie: number;
  lobbyDonors: number;
  orgs: string[];
}> = {
  'Rick Scott': { total: 2047002, pacs: 573767, ie: 0, lobbyDonors: 1473235, orgs: ['AIPAC', 'AMP', 'LAFAS', 'MMPAC', 'NORPAC', 'RJC', 'USI'] },
  'Ashley Moody': { total: 172593, pacs: 15027, ie: 0, lobbyDonors: 157566, orgs: ['AIPAC'] },
  // FL-01 through FL-28
  'Neal P. Dunn': { total: 89420, pacs: 55322, ie: 0, lobbyDonors: 34098, orgs: ['AIPAC'] },
  'Kat Cammack': { total: 170049, pacs: 74179, ie: 0, lobbyDonors: 95870, orgs: ['AIPAC', 'AMP', 'IPAC', 'RJC', 'USI'] },
  'Aaron Bean': { total: 132953, pacs: 68320, ie: 0, lobbyDonors: 64633, orgs: ['AIPAC', 'AMP', 'USI'] },
  'John H. Rutherford': { total: 115173, pacs: 64271, ie: 0, lobbyDonors: 50902, orgs: ['AIPAC', 'IPAC'] },
  'Randy Fine': { total: 1041401, pacs: 465193, ie: 0, lobbyDonors: 576208, orgs: ['AIPAC', 'AMP', 'NORPAC', 'RJC', 'SUNPAC', 'USI'] },
  'Cory Mills': { total: 106732, pacs: 36573, ie: 0, lobbyDonors: 70159, orgs: ['AIPAC', 'AMP', 'RJC', 'USI'] },
  'Mike Haridopolos': { total: 101846, pacs: 18198, ie: 0, lobbyDonors: 83648, orgs: ['AIPAC', 'AMP', 'USI'] },
  'Darren Soto': { total: 874118, pacs: 389693, ie: 0, lobbyDonors: 484425, orgs: ['AIPAC', 'BICOUNTY', 'COPAC', 'DMFI', 'FIPAC', 'MDACC', 'NACPAC', 'NORPAC', 'PHXED', 'PIA', 'SUNPAC', 'USI'] },
  // Maxwell Frost - $0 (rejects AIPAC)
  'Daniel Webster': { total: 193215, pacs: 80877, ie: 0, lobbyDonors: 112338, orgs: ['AIPAC', 'BICPAC', 'RJC', 'USI'] },
  'Gus M. Bilirakis': { total: 280369, pacs: 101892, ie: 0, lobbyDonors: 178477, orgs: ['AIPAC', 'AMP', 'BAYPAC', 'MDACC', 'NACPAC', 'RJC', 'USI', 'WAPAC'] },
  'Anna Paulina Luna': { total: 244182, pacs: 27288, ie: 0, lobbyDonors: 216894, orgs: ['AIPAC', 'AMP', 'USI'] },
  'Kathy Castor': { total: 279346, pacs: 93259, ie: 0, lobbyDonors: 186087, orgs: ['AIPAC', 'BAYPAC', 'NACPAC', 'SUNPAC', 'USI'] },
  'Vern Buchanan': { total: 368633, pacs: 80471, ie: 0, lobbyDonors: 288162, orgs: ['AIPAC', 'NACPAC', 'RJC'] },
  'W. Gregory Steube': { total: 239470, pacs: 100711, ie: 0, lobbyDonors: 138759, orgs: ['AIPAC', 'AMP', 'NACPAC', 'RJC', 'USI'] },
  'Scott Franklin': { total: 106305, pacs: 49225, ie: 0, lobbyDonors: 57080, orgs: ['AIPAC', 'AMP'] },
  'Byron Donalds': { total: 368726, pacs: 77628, ie: 0, lobbyDonors: 291098, orgs: ['AIPAC', 'AMP', 'RJC', 'USI'] },
  'Sheila Cherfilus-McCormick': { total: 555603, pacs: 342042, ie: 0, lobbyDonors: 213561, orgs: ['AIPAC', 'DMFI', 'JAC'] },
  'Brian J. Mast': { total: 2246400, pacs: 744281, ie: 0, lobbyDonors: 1502119, orgs: ['AIPAC', 'AMP', 'COPAC', 'NACPAC', 'NORPAC', 'PIA', 'RJC', 'SUNPAC', 'USI', 'ZOA'] },
  'Lois Frankel': { total: 2093531, pacs: 789310, ie: 0, lobbyDonors: 1304221, orgs: ['AIPAC', 'COPAC', 'DMFI', 'JAC', 'NACPAC', 'NORPAC', 'PIA', 'SUNPAC', 'DESERT', 'USI'] },
  'Jared Moskowitz': { total: 1546752, pacs: 727908, ie: 0, lobbyDonors: 818844, orgs: ['AIPAC', 'DMFI', 'JAC', 'MDACC', 'PHXED', 'USI'] },
  'Frederica S. Wilson': { total: 97967, pacs: 44215, ie: 0, lobbyDonors: 53752, orgs: ['AIPAC', 'NACPAC', 'SUNPAC', 'USI'] },
  'Debbie Wasserman Schultz': { total: 3459067, pacs: 1144010, ie: 0, lobbyDonors: 2315057, orgs: ['AIPAC', 'COPAC', 'DEVPAC', 'DMFI', 'FIPAC', 'GCSC', 'HVPAC', 'JAC', 'LAFAS', 'MDACC', 'MOPAC', 'NACPAC', 'NATPAC', 'NORPAC', 'PIA', 'SUNPAC', 'DESERT', 'USI', 'WAFI'] },
  'Mario Diaz-Balart': { total: 2053572, pacs: 918300, ie: 0, lobbyDonors: 1135272, orgs: ['AIPAC', 'AMP', 'BAYPAC', 'COPAC', 'HVPAC', 'NACPAC', 'RJC', 'SUNPAC', 'USI', 'WAFI'] },
  'Maria Elvira Salazar': { total: 783549, pacs: 127411, ie: 0, lobbyDonors: 656138, orgs: ['AIPAC', 'AMP', 'RJC', 'SUNPAC', 'USI'] },
  'Carlos A. Gimenez': { total: 467245, pacs: 122359, ie: 0, lobbyDonors: 344886, orgs: ['AIPAC', 'AMP', 'PIA', 'RJC', 'SUNPAC', 'USI'] },
  // Jimmy Patronis (FL-01 new)
  'Jimmy Patronis': { total: 61163, pacs: 28102, ie: 0, lobbyDonors: 33061, orgs: ['AIPAC', 'AMP', 'RJC'] },
  // Laurel Lee (FL-15)
  'Laurel Lee': { total: 161530, pacs: 46071, ie: 0, lobbyDonors: 115459, orgs: ['AIPAC', 'RJC', 'USI'] },
};

async function main() {
  console.log('='.repeat(60));
  console.log('  Update Israel Lobby Totals from Track AIPAC');
  console.log('='.repeat(60));

  let updated = 0;
  let errors = 0;
  let notFound = 0;

  for (const [name, data] of Object.entries(TRACK_AIPAC_DATA)) {
    // Find politician by name
    const { data: rows, error: findError } = await supabase
      .from('politicians')
      .select('bioguide_id, name, israel_lobby_total')
      .ilike('name', `%${name}%`)
      .limit(1);

    if (findError || !rows || rows.length === 0) {
      console.log(`  NOT FOUND: ${name}`);
      notFound++;
      continue;
    }

    const pol = rows[0];
    const oldTotal = pol.israel_lobby_total || 0;

    const { error: updateError } = await supabase
      .from('politicians')
      .update({
        israel_lobby_total: data.total,
        aipac_funding: data.pacs,
        israel_lobby_breakdown: {
          total: data.total,
          pacs: data.pacs,
          ie: data.ie,
          bundlers: data.lobbyDonors,
          orgs: data.orgs,
        },
      })
      .eq('bioguide_id', pol.bioguide_id);

    if (updateError) {
      console.error(`  ERROR: ${name}: ${updateError.message}`);
      errors++;
    } else {
      const change = data.total - oldTotal;
      console.log(`  ${name.padEnd(30)} $${oldTotal.toLocaleString().padStart(12)} -> $${data.total.toLocaleString().padStart(12)} (+$${change.toLocaleString()})`);
      updated++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  Updated: ${updated} | Not found: ${notFound} | Errors: ${errors}`);
  console.log(`  Total Israel lobby now tracked: $${Object.values(TRACK_AIPAC_DATA).reduce((s, d) => s + d.total, 0).toLocaleString()}`);
  console.log('='.repeat(60));
}

main();
