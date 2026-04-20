#!/usr/bin/env npx tsx
/**
 * Bulk Research — Florida Officials via built-in Research Agent
 *
 * Uses lib/research-agent.ts deepResearch() to investigate each FL official:
 *   - FEC campaign finance (if FEC_API_KEY set)
 *   - CourtListener court records
 *   - Lobbying records from DB
 *   - Exa web intelligence (if EXA_API_KEY set)
 *   - Social media posts from DB
 *   - Voting records from DB
 *
 * Stores results (bio, financials, court records) back in Supabase.
 *
 * Usage:
 *   npx tsx scripts/research-fl-bulk.ts
 *   npx tsx scripts/research-fl-bulk.ts --limit 50
 *   npx tsx scripts/research-fl-bulk.ts --offset 100 --limit 50
 *   npx tsx scripts/research-fl-bulk.ts --dry-run
 *   npx tsx scripts/research-fl-bulk.ts --verbose
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { deepResearch, type InvestigationReport } from '../lib/research-agent';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 1000;
const DELAY_BETWEEN_OFFICIALS_MS = 1000; // 1s delay between officials (multiple API calls per official)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateBio(report: InvestigationReport): string {
  const { politician, financials, courtRecords, lobbying, webIntel, votingRecord } = report;
  const lines: string[] = [];

  lines.push(`${politician.name} serves as ${politician.office} (${politician.party}).`);

  // Financial summary
  if (financials.totalFunds > 0) {
    lines.push(`Total campaign funds: $${(financials.totalFunds / 1000).toFixed(0)}K.`);
    if (financials.grassrootsRatio > 0) {
      lines.push(`Grassroots funding ratio: ${financials.grassrootsRatio}%.`);
    }
    if (financials.foreignInfluenceFlag) {
      lines.push('FLAG: Foreign influence detected via Israel lobby funding.');
    }
    if (financials.top5Donors.length > 0) {
      const donorList = financials.top5Donors.map(d => `${d.name} ($${(d.amount ?? 0).toLocaleString()})`).join(', ');
      lines.push(`Top donors: ${donorList}.`);
    }
  }

  // Court records
  if (courtRecords.length > 0) {
    lines.push(`${courtRecords.length} court record(s) found.`);
    const topCases = courtRecords.slice(0, 3).map(c =>
      `${c.caseName || 'Unknown case'}${c.dateFiled ? ` (filed ${c.dateFiled})` : ''}`
    );
    lines.push(`Notable: ${topCases.join('; ')}.`);
  }

  // Lobbying
  if (lobbying.totalFilings > 0) {
    lines.push(`${lobbying.totalFilings} lobbying filing(s), $${(lobbying.totalIncome / 1000).toFixed(0)}K total.`);
    if (lobbying.revolvingDoorCount > 0) {
      lines.push(`${lobbying.revolvingDoorCount} revolving door connection(s).`);
    }
  }

  // Scandals
  if (webIntel.scandalFlags.length > 0) {
    lines.push(`Scandal indicators: ${webIntel.scandalFlags.join('; ')}.`);
  }

  // Key findings from web
  if (webIntel.keyFindings.length > 0) {
    lines.push(`Key findings: ${webIntel.keyFindings.slice(0, 3).join(' ')}`);
  }

  // Voting
  if (votingRecord.totalVotes > 0) {
    lines.push(`Voting record: ${votingRecord.yeaCount} yea, ${votingRecord.nayCount} nay, ${votingRecord.absentCount} absent (${votingRecord.totalVotes} total).`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fetch FL officials needing research
// ---------------------------------------------------------------------------

async function fetchFlOfficials(skipResearched: boolean): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('politicians')
      .select('*')
      .or('bioguide_id.like.fl-%,jurisdiction.eq.Florida')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error || !data || data.length === 0) break;
    all.push(...data);
    offset += BATCH_SIZE;
    if (data.length < BATCH_SIZE) break;
  }

  // Deduplicate
  const seen = new Set<string>();
  const deduped = all.filter(p => {
    const id = p.bioguide_id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (skipResearched) {
    // Only officials without a substantive bio (< 50 chars)
    return deduped.filter(p => !p.bio || (p.bio as string).length <= 50);
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const force = args.includes('--force');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx !== -1 ? parseInt(args[offsetIdx + 1], 10) : 0;

  console.log('=== FL Official Research — Built-in Agent ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`FEC_API_KEY: ${process.env.FEC_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`EXA_API_KEY: ${process.env.EXA_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`COURTLISTENER_TOKEN: ${process.env.COURTLISTENER_TOKEN ? 'configured' : 'MISSING'}`);
  if (limit !== Infinity) console.log(`Limit: ${limit}`);
  if (startOffset > 0) console.log(`Offset: ${startOffset}`);
  console.log();

  const officials = await fetchFlOfficials(!force);
  const toProcess = officials.slice(startOffset, startOffset + limit);

  console.log(`Found ${officials.length} FL officials needing research`);
  console.log(`Processing ${toProcess.length} (offset ${startOffset})...`);
  console.log();

  let researched = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const pol = toProcess[i];
    const name = pol.name as string;
    const progress = `[${i + 1}/${toProcess.length}]`;

    try {
      if (dryRun) {
        console.log(`${progress} [DRY] Would research: ${name}`);
        researched++;
        continue;
      }

      console.log(`${progress} Researching: ${name}...`);

      const report = await deepResearch(pol, supabase);
      researched++;

      if (verbose) {
        for (const line of report.log) console.log(`  ${line}`);
      }

      // Generate bio from report
      const bio = generateBio(report);

      // Build update payload
      const updates: Record<string, unknown> = {
        bio,
        updated_at: new Date().toISOString(),
      };

      // Update financials if we got new data
      if (report.financials.totalFunds > 0 && report.financials.totalFunds !== Number(pol.total_funds)) {
        updates.total_funds = report.financials.totalFunds;
      }
      if (report.financials.top5Donors.length > 0) {
        updates.top5_donors = report.financials.top5Donors;
      }
      if (report.financials.contributionBreakdown) {
        updates.contribution_breakdown = report.financials.contributionBreakdown;
      }
      if (report.financials.fecId && !((pol.source_ids as Record<string, string>)?.fec_candidate_id)) {
        updates.source_ids = {
          ...(pol.source_ids as Record<string, unknown> || {}),
          fec_candidate_id: report.financials.fecId,
        };
      }

      // Update court records if we found new ones and they didn't exist
      if (report.courtRecords.length > 0 && !pol.court_records) {
        updates.court_records = report.courtRecords.map(r => ({
          id: r.id,
          case_name: r.caseName || (r as unknown as Record<string, unknown>).case_name,
          case_name_short: r.caseNameShort || (r as unknown as Record<string, unknown>).case_name_short,
          court: r.court,
          court_id: r.courtId || (r as unknown as Record<string, unknown>).court_id,
          docket_number: r.docketNumber || (r as unknown as Record<string, unknown>).docket_number,
          date_filed: r.dateFiled || (r as unknown as Record<string, unknown>).date_filed,
          date_terminated: r.dateTerminated || (r as unknown as Record<string, unknown>).date_terminated,
          cause: r.cause,
          nature_of_suit: r.natureOfSuit || (r as unknown as Record<string, unknown>).nature_of_suit,
          url: r.url,
          source: r.source || 'courtlistener',
        }));
      }

      const { error: updateError } = await supabase
        .from('politicians')
        .update(updates)
        .eq('bioguide_id', pol.bioguide_id as string);

      if (updateError) {
        console.error(`${progress} ✗ DB error: ${updateError.message}`);
        errors++;
      } else {
        const fundInfo = report.financials.totalFunds > 0
          ? ` | $${(report.financials.totalFunds / 1000).toFixed(0)}K`
          : '';
        const courtInfo = report.courtRecords.length > 0
          ? ` | ${report.courtRecords.length} court records`
          : '';
        const flagInfo = report.financials.foreignInfluenceFlag ? ' | ⚠ FOREIGN INFLUENCE' : '';
        const scandalInfo = report.webIntel.scandalFlags.length > 0
          ? ` | ${report.webIntel.scandalFlags.length} scandal flags`
          : '';

        console.log(`${progress} ✓ ${name}${fundInfo}${courtInfo}${flagInfo}${scandalInfo}`);
        updated++;
      }

      await sleep(DELAY_BETWEEN_OFFICIALS_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('Rate limit') || message.includes('429') || message.includes('rate limit')) {
        console.error(`\n⚠ Rate limited at ${progress}. Stopping — re-run to continue.`);
        break;
      }

      console.error(`${progress} ✗ ${name}: ${message}`);
      errors++;
    }
  }

  console.log();
  console.log('=== Summary ===');
  console.log(`Researched: ${researched}`);
  console.log(`Updated:    ${updated}`);
  console.log(`Errors:     ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
