#!/usr/bin/env npx tsx
/**
 * Convert existing jfk-fec-full-results.json into the new fec-contributions.json format.
 * This lets us use the real FEC data that was already scraped by the Python scripts
 * without waiting for a new API fetch.
 *
 * Usage: npx tsx data-ingestion/convert-existing-fec-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface OldResult {
  politician_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  fec_candidate_id: string | null;
  has_fec_data: boolean;
  total_raised: number;
  aipac_total: number;
  aipac_count: number;
  top_donors: Array<{ name: string; total: number }>;
  breakdown: {
    aipac: number;
    other_pacs: number;
    individuals: number;
    corporate: number;
  };
  contributions: Array<{
    donor_name: string;
    donor_type: string;
    amount: number;
    date: string;
    is_aipac: boolean;
    committee_id: string;
    entity_type: string;
  }>;
  error: string | null;
}

interface OldData {
  total_politicians: number;
  processed: number;
  with_fec_data: number;
  with_aipac_funding: number;
  errors: number;
  total_aipac_funding: number;
  total_raised_all: number;
  politicians: OldResult[];
}

function main() {
  const oldPath = path.join(__dirname, 'jfk-fec-results/jfk-fec-full-results.json');
  const newPath = path.join(__dirname, 'fec-contributions.json');

  console.log('Converting existing FEC data to new format...');
  console.log(`  Input:  ${oldPath}`);
  console.log(`  Output: ${newPath}`);

  const rawData = fs.readFileSync(oldPath, 'utf-8');
  const oldData: OldData = JSON.parse(rawData);

  console.log(`  Old data: ${oldData.politicians.length} politicians, ${oldData.with_fec_data} with FEC data`);

  const politicians: Record<string, any> = {};

  for (const old of oldData.politicians) {
    // Aggregate donors from contributions
    const donorTotals: Record<string, { amount: number; type: string; count: number }> = {};
    const israelDonorTotals: Record<string, { amount: number; count: number; committee_id?: string }> = {};

    for (const contrib of old.contributions || []) {
      const key = contrib.donor_name;
      const donorType = contrib.is_aipac ? 'Israel-PAC' : (
        contrib.donor_type === 'SuperPAC' ? 'PAC' : contrib.donor_type
      );

      if (!donorTotals[key]) {
        donorTotals[key] = { amount: 0, type: donorType, count: 0 };
      }
      donorTotals[key].amount += contrib.amount;
      donorTotals[key].count++;

      if (contrib.is_aipac) {
        if (!israelDonorTotals[key]) {
          israelDonorTotals[key] = { amount: 0, count: 0, committee_id: contrib.committee_id };
        }
        israelDonorTotals[key].amount += contrib.amount;
        israelDonorTotals[key].count++;
      }
    }

    const topDonors = Object.entries(donorTotals)
      .map(([name, data]) => ({
        name,
        amount: Math.round(data.amount * 100) / 100,
        type: data.type as 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC',
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    const israelLobbyDonors = Object.entries(israelDonorTotals)
      .map(([name, data]) => ({
        name,
        amount: Math.round(data.amount * 100) / 100,
        count: data.count,
        committee_id: data.committee_id,
      }))
      .sort((a, b) => b.amount - a.amount);

    politicians[old.politician_id] = {
      politician_id: old.politician_id,
      name: old.name,
      fec_candidate_id: old.fec_candidate_id || '',
      office: old.office,
      party: old.party,
      has_fec_data: old.has_fec_data,
      total_raised: old.total_raised,
      total_disbursed: 0,
      israel_lobby_total: old.aipac_total, // In old data, "aipac" was used broadly
      israel_lobby_pac_total: old.breakdown.aipac,
      israel_lobby_ie_total: 0, // Old script didn't fetch IEs
      aipac_direct: old.breakdown.aipac,
      aipac_ie: 0,
      breakdown: {
        pacs: old.breakdown.other_pacs,
        individuals: old.breakdown.individuals,
        corporate: old.breakdown.corporate,
        israel_lobby: old.breakdown.aipac,
      },
      top_donors: topDonors,
      contribution_count: (old.contributions || []).length,
      israel_lobby_donors: israelLobbyDonors,
      independent_expenditures: [],
      cycles_covered: [2024],
      last_fetched: new Date().toISOString(),
      error: old.error,
    };
  }

  const withFecData = Object.values(politicians).filter((p: any) => p.has_fec_data).length;
  const withIsraelLobby = Object.values(politicians).filter((p: any) => p.israel_lobby_total > 0).length;
  const totalIsraelLobby = Object.values(politicians).reduce((sum: number, p: any) => sum + p.israel_lobby_total, 0);

  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      fec_api_key_type: 'converted_from_python_scrape',
      cycles: [2024],
      total_politicians: oldData.politicians.length,
      with_fec_data: withFecData,
      with_israel_lobby: withIsraelLobby,
      total_israel_lobby_funding: totalIsraelLobby,
    },
    politicians,
  };

  fs.writeFileSync(newPath, JSON.stringify(output, null, 2));

  console.log('\nConversion complete!');
  console.log(`  Politicians: ${Object.keys(politicians).length}`);
  console.log(`  With FEC data: ${withFecData}`);
  console.log(`  With Israel lobby: ${withIsraelLobby}`);
  console.log(`  Total Israel lobby: $${totalIsraelLobby.toLocaleString()}`);
  console.log(`\nOutput: ${newPath}`);
}

main();
