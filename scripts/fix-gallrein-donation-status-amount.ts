#!/usr/bin/env npx tsx
/**
 * Fix Ed Gallrein's stale source_ids.donation_status.amount.
 *
 * The corrected-audit on 2026-04-27 fixed israel_lobby_total $6,716,533 → $1,026,201
 * but didn't propagate to source_ids.donation_status.amount, which the
 * EmbedDossier renders with precedence over israel_lobby_total via
 * `donationStatus?.amount ?? lobby` (see app/embed/[id]/EmbedDossier.tsx).
 *
 * Result: dossier was still showing $6,721,527 in the lobby box even though
 * the underlying number was fixed.
 *
 * One-shot patch: align donation_status.amount with israel_lobby_total and
 * tighten subtext to reflect the corrected breakdown. Already applied 2026-04-27;
 * this script is for audit-trail / re-run safety.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main(): Promise<void> {
  const { data, error } = await sb
    .from('politicians')
    .select('israel_lobby_total, source_ids')
    .eq('bioguide_id', 'ky-04-2026-ed-gallrein')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'row not found');

  const realTotal = Number(data.israel_lobby_total);
  const si = { ...(data.source_ids as Record<string, unknown>) };
  const ds = { ...(si.donation_status as Record<string, unknown>) };
  const oldAmt = Number(ds.amount);

  if (Math.abs(oldAmt - realTotal) < 0.01) {
    console.log(`No-op: donation_status.amount already matches israel_lobby_total ($${realTotal.toLocaleString()})`);
    return;
  }

  ds.amount = realTotal;
  ds.subtext = 'Pro-Israel Lobby total: $54,398 RJC PAC direct + $963,803 from 573 high-conf bundlers (77.9% of donor base)';
  si.donation_status = ds;

  const { error: upErr } = await sb
    .from('politicians')
    .update({
      source_ids: si,
      data_source: 'audit_2026-04-27_gallrein_donation_status_amount_fix',
    })
    .eq('bioguide_id', 'ky-04-2026-ed-gallrein');
  if (upErr) throw new Error(upErr.message);

  console.log(`✅ donation_status.amount: $${oldAmt.toLocaleString()} → $${realTotal.toLocaleString()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
