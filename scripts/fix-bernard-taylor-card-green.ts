#!/usr/bin/env npx tsx
/**
 * Fix Bernard Taylor (FL-21 D challenger to Mast) so his card renders GREEN.
 *
 * Two issues found 2026-04-27:
 *
 * 1. STALE ROSTER-MATCH RED_FLAGS — auto-generated 49-yr cross-ref flags
 *    were on his row matching a single $500 donor (Naomi Aberly) who has
 *    $1,500 career to JStreetPAC. JStreetPAC is the DOVISH/PROGRESSIVE
 *    Israel-policy PAC — explicitly anti-AIPAC, supports two-state, opposed
 *    Iran-deal withdrawal. JStreetPAC donors are COUNTER-SIGNALS, not
 *    AIPAC capture markers. Per Snitched's anti-AIPAC clean policy
 *    (memory: feedback_snitched_anti_aipac_is_clean), these don't count
 *    as red_flags. Moved both to source_ids.historical_red_flags with a
 *    rationale.
 *
 *    Side effect: EmbedDossier and politician detail page both have
 *    `hasRedFlags ? RED : baseline` color logic (see lib/corruption-score.ts
 *    getBinaryScoreColor + EmbedDossier line 51). Live red_flags > 0 was
 *    forcing the card RED despite score=0/grade A. Now goes GREEN.
 *
 * 2. DOUBLED total_funds — DB had $65,005 but real FEC cycle 2026 receipts
 *    are $32,502.36 (per /candidate/H6FL21034/totals/?cycle=2026). Same
 *    doubling bug Gallrein had. Fixed.
 *
 * Already applied directly to the DB; this script is for audit trail and
 * re-run safety.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const REAL_TOTAL = 32502.36;

interface RedFlag { severity?: string; label?: string; source?: string; date?: string; _archived?: string; _reason?: string }

async function main(): Promise<void> {
  const { data, error } = await sb
    .from('politicians')
    .select('total_funds, source_ids, contribution_breakdown')
    .eq('bioguide_id', 'fl-21-2026-bernard-taylor')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'row not found');

  const si = { ...(data.source_ids as Record<string, unknown>) };
  const oldFlags = (si.red_flags as RedFlag[]) ?? [];
  const historical = (si.historical_red_flags as RedFlag[]) ?? [];

  const liveFlags: RedFlag[] = [];
  for (const f of oldFlags) {
    const label = f.label ?? '';
    const isJStreetCounterSignal = /jstreet/i.test(label) || /roster-match/i.test(label);
    if (isJStreetCounterSignal) {
      historical.push({
        ...f,
        _archived: '2026-04-27',
        _reason: 'JStreetPAC counter-signal — dovish/anti-AIPAC PAC, not pro-AIPAC capture. Anti-AIPAC clean policy applies.',
      });
    } else {
      liveFlags.push(f);
    }
  }
  si.red_flags = liveFlags;
  si.historical_red_flags = historical;

  const cb = { ...(data.contribution_breakdown as Record<string, number>) };
  cb.individuals = REAL_TOTAL;

  const { error: upErr } = await sb
    .from('politicians')
    .update({
      total_funds: REAL_TOTAL,
      contribution_breakdown: cb,
      source_ids: si,
      data_source: 'audit_2026-04-27_bernard_taylor_card_green_fix',
    })
    .eq('bioguide_id', 'fl-21-2026-bernard-taylor');
  if (upErr) throw new Error(upErr.message);

  console.log(`✅ Bernard Taylor card-green fix applied`);
  console.log(`   total_funds: ${data.total_funds} → ${REAL_TOTAL}`);
  console.log(`   live red_flags: ${oldFlags.length} → ${liveFlags.length}`);
  console.log(`   archived to historical_red_flags: ${historical.length} total`);
}

main().catch(e => { console.error(e); process.exit(1); });
