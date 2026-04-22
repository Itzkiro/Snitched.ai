import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { loadMaster, parseName } from '../lib/roster-match';
const DATA_DIR = path.join(__dirname, '..', 'data');
const master = loadMaster(DATA_DIR);
const audit = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fl28-phil-ehr-audit.json'), 'utf8'));
console.log('For each Ehr bundler match, which pro-Israel PACs did they fund?');
for (const m of audit.registry_top_matches as Array<{donor:string;state:string;to_candidate:number;pro_israel_career:number;confidence:string}>) {
  const parts = m.donor.split(',').map(s => s.trim());
  const [last, first] = parts;
  const fi = first[0] || '';
  const key = `${last.toUpperCase()}|${fi.toUpperCase()}|${(m.state||'').toUpperCase()}`;
  const entry = master.get(key);
  const pacs = entry ? [...entry.pacs] : ['(no match)'];
  console.log(`  ${m.donor}, ${m.state} [$${m.pro_israel_career.toLocaleString()} career] → PACs: ${pacs.slice(0,8).join(' | ')}`);
}
