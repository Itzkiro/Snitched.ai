import 'dotenv/config';
import * as fs from 'fs';
const KEY = process.env.FEC_API_KEY!;
(async () => {
  const out: string[] = [];
  for (const cy of [2008, 2014, 2020, 2024, 2026]) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
    u.searchParams.set('api_key', KEY);
    u.searchParams.set('committee_id', 'C00306555');
    u.searchParams.set('two_year_transaction_period', String(cy));
    u.searchParams.set('is_individual', 'true');
    u.searchParams.set('per_page', '3');
    const r = await fetch(u.toString()).then(r => r.json()) as { pagination?: { count?: number }; results?: unknown[] };
    const line = `cy ${cy}  count=${r.pagination?.count ?? '?'}  results=${r.results?.length ?? 0}`;
    out.push(line);
    console.log(line);
    await new Promise(r => setTimeout(r, 400));
  }
  fs.writeFileSync('/tmp/warner-cy.out', out.join('\n'));
})();
