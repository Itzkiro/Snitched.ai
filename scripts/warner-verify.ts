import 'dotenv/config';
import * as fs from 'fs';
const KEY = process.env.FEC_API_KEY!;

(async () => {
  const lines: string[] = [];
  function log(s: string) { lines.push(s); console.log(s); }

  // Try candidate_id filter instead of committee_id
  for (const cy of [2020, 2024, 2026]) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
    u.searchParams.set('api_key', KEY);
    u.searchParams.set('candidate_id', 'S6VA00093');
    u.searchParams.set('two_year_transaction_period', String(cy));
    u.searchParams.set('is_individual', 'true');
    u.searchParams.set('per_page', '3');
    const r = await fetch(u.toString()).then(r => r.json()) as { pagination?: { count?: number }; results?: Array<{ contributor_name?: string; contribution_receipt_amount?: number }> };
    log(`candidate_id=S6VA00093 cy=${cy}  count=${r.pagination?.count ?? '?'}`);
    for (const x of (r.results || []).slice(0, 3)) log(`    ${x.contributor_name}  $${x.contribution_receipt_amount}`);
    await new Promise(r => setTimeout(r, 500));
  }

  // Also try all committees associated with Warner
  const cmts = await fetch(`https://api.open.fec.gov/v1/candidate/S6VA00093/committees/?api_key=${KEY}&per_page=20`).then(r => r.json()) as { results?: Array<{ committee_id?: string; name?: string; designation_full?: string; committee_type_full?: string }> };
  log('\nAll committees for Warner:');
  for (const c of (cmts.results || [])) log(`  ${c.committee_id}  ${c.name}  (${c.designation_full}, ${c.committee_type_full})`);

  fs.writeFileSync('/tmp/warner-verify.out', lines.join('\n'));
})();
