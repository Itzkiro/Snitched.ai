#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Scrape Track AIPAC for Florida Politicians
 *
 * Pulls Israel lobby funding totals from trackaipac.com and updates Supabase.
 * This is the most accurate source for Israel lobby data — includes PAC
 * contributions AND individual lobby donors (bundlers).
 *
 * Usage:
 *   npx tsx scripts/scrape-track-aipac.ts
 *   npx tsx scripts/scrape-track-aipac.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: Supabase env vars required'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Track AIPAC Florida page
const TRACK_AIPAC_URL = 'https://www.trackaipac.com/state/florida';

async function scrapeTrackAipac(): Promise<Map<string, { total: number; pacs: number; lobbyDonors: number; orgs: string[] }>> {
  const results = new Map<string, { total: number; pacs: number; lobbyDonors: number; orgs: string[] }>();

  try {
    const resp = await fetch(TRACK_AIPAC_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      console.error(`Track AIPAC returned ${resp.status}`);
      return results;
    }

    const html = await resp.text();

    // Track AIPAC uses structured data in their page
    // Parse politician entries — they follow a pattern:
    // Name, district, party, then funding amounts
    // The exact HTML structure may change — this is a best-effort parser

    // Look for patterns like "Israel Lobby Total: $X,XXX,XXX"
    const namePattern = /class="[^"]*politician[^"]*"[^>]*>([^<]+)</gi;
    const totalPattern = /Israel Lobby Total:\s*\$([0-9,]+)/gi;

    console.log(`  Page loaded: ${html.length} bytes`);
    console.log(`  Contains "Israel Lobby Total": ${html.includes('Israel Lobby Total')}`);
    console.log(`  Contains "AIPAC": ${(html.match(/AIPAC/g) || []).length} occurrences`);

    // If the page is JavaScript-rendered (Squarespace), we may need Playwright
    if (html.includes('squarespace') && !html.includes('Israel Lobby Total')) {
      console.log('  WARNING: Page is JS-rendered. Need Playwright for scraping.');
      console.log('  Falling back to manual data import (scripts/update-israel-lobby-totals.ts)');
    }
  } catch (e: any) {
    console.error(`  Fetch error: ${e.message}`);
  }

  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('  Track AIPAC Scraper');
  console.log('='.repeat(60));
  console.log(`  Source: ${TRACK_AIPAC_URL}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  const data = await scrapeTrackAipac();

  if (data.size === 0) {
    console.log('\n  No data scraped. Track AIPAC is a Squarespace site that');
    console.log('  renders content via JavaScript. To update Israel lobby data:');
    console.log('');
    console.log('  1. Visit https://www.trackaipac.com/state/florida');
    console.log('  2. Copy the data for each politician');
    console.log('  3. Update scripts/update-israel-lobby-totals.ts');
    console.log('  4. Run: npx tsx scripts/update-israel-lobby-totals.ts');
    console.log('');
    console.log('  Or use Playwright to scrape the JS-rendered page:');
    console.log('  python3 -c "from playwright.sync_api import sync_playwright; ..."');
    return;
  }

  console.log(`\n  Scraped ${data.size} politicians`);

  if (!dryRun) {
    let updated = 0;
    for (const [name, lobby] of data) {
      const { data: rows } = await supabase
        .from('politicians')
        .select('bioguide_id')
        .ilike('name', `%${name}%`)
        .limit(1);

      if (rows && rows.length > 0) {
        await supabase.from('politicians').update({
          israel_lobby_total: lobby.total,
          aipac_funding: lobby.pacs,
          israel_lobby_breakdown: {
            total: lobby.total,
            pacs: lobby.pacs,
            ie: 0,
            bundlers: lobby.lobbyDonors,
            orgs: lobby.orgs,
          },
        }).eq('bioguide_id', rows[0].bioguide_id);
        updated++;
      }
    }
    console.log(`  Updated: ${updated}`);
  }
}

main();
