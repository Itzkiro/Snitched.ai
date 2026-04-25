import 'dotenv/config';
const KEY = process.env.FEC_API_KEY!;
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

const ISRAEL_IDS = ['C00104299','C00797472','C00797670','C00368522','C00699470','C00740936','C00687657','C00556100','C00345132','C00764126','C00441949','C00068692','C00247403','C00127811','C00139659','C00488411','C00141747','C00458935','C00265470','C00306670','C00268334','C00202481','C00791699','C00277228','C00503250'];
const WARNER_CMT = 'C00306555';

interface SchedB { disbursement_amount?: number; disbursement_date?: string; memo_text?: string; committee_name?: string; recipient_name?: string; }

(async () => {
  console.log(`Reverse scan: Israel-lobby PAC Schedule B → Warner committee (${WARNER_CMT})\n`);
  let total = 0;
  const hits: Array<{ pacId: string; amount: number; date: string; name: string }> = [];
  for (const pacId of ISRAEL_IDS) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_b/');
    u.searchParams.set('api_key', KEY);
    u.searchParams.set('committee_id', pacId);
    u.searchParams.set('recipient_committee_id', WARNER_CMT);
    u.searchParams.set('per_page', '50');
    try {
      const r = await fetch(u.toString()).then(r => r.json()) as { results?: SchedB[] };
      const rs = r.results || [];
      if (rs.length > 0) {
        for (const x of rs) {
          const amount = x.disbursement_amount || 0;
          hits.push({ pacId, amount, date: x.disbursement_date || '', name: x.committee_name || x.recipient_name || '' });
          total += amount;
        }
        console.log(`  ${pacId}  → ${rs.length} entries, sum $${rs.reduce((s, x) => s + (x.disbursement_amount || 0), 0).toLocaleString()}`);
      }
    } catch (e) {
      console.log(`  ${pacId} err`);
    }
    await sleep(350);
  }
  console.log(`\nTotal Israel-lobby PAC → Warner: $${total.toLocaleString()} (${hits.length} disbursements across ${new Set(hits.map(h => h.pacId)).size} unique PACs)`);
  hits.sort((a, b) => b.amount - a.amount);
  console.log('\nTop 15 disbursements:');
  for (const h of hits.slice(0, 15)) console.log(`  ${h.date}  ${h.pacId}  ${h.name}  $${h.amount}`);
})();
