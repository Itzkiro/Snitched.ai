import { NextRequest, NextResponse } from 'next/server';
import { fecFetch, fecErrorResponse } from '@/lib/fec-client';

/**
 * GET /api/fec/filings
 *
 * Get financial totals and filing summaries for a candidate.
 * Proxies to: https://api.open.fec.gov/v1/candidate/{candidate_id}/totals/
 *
 * Query params:
 *   candidate_id  - (required) FEC candidate ID (e.g. "H0FL21102")
 *   cycle         - Election cycle year (default: 2024). Can pass multiple comma-separated.
 *   full_election  - "true" for full election period totals (default: true)
 *
 * Response shape:
 *   {
 *     candidate_id,
 *     totals: [{
 *       cycle, election_year, coverage_start, coverage_end,
 *       receipts, disbursements, cash_on_hand,
 *       contributions, individual_contributions,
 *       individual_itemized, individual_unitemized,
 *       pac_contributions, party_contributions,
 *       candidate_contribution, loans, loan_repayments,
 *       debts_owed, last_report_type, last_report_year
 *     }],
 *     aggregate: {
 *       total_receipts, total_disbursements,
 *       total_individual, total_pac, total_party,
 *       total_candidate_self_funding, total_loans,
 *       cycles_covered, latest_cash_on_hand
 *     }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const candidateId = searchParams.get('candidate_id');
    const cycleParam = searchParams.get('cycle') || '2024';
    const fullElection = searchParams.get('full_election') !== 'false';

    if (!candidateId) {
      return NextResponse.json(
        { error: 'candidate_id is required' },
        { status: 400 },
      );
    }

    // Support comma-separated cycles: "2024,2022"
    const cycles = cycleParam.split(',').map((c) => c.trim()).filter(Boolean);

    // Fetch totals for each requested cycle
    const allTotals: any[] = [];

    for (const cycle of cycles) {
      const data = await fecFetch(`/candidate/${candidateId}/totals/`, {
        cycle,
        per_page: 20,
        election_full: fullElection ? 'true' : 'false',
      });

      for (const result of data.results || []) {
        allTotals.push(result);
      }
    }

    if (allTotals.length === 0) {
      return NextResponse.json({
        candidate_id: candidateId,
        totals: [],
        aggregate: emptyAggregate(),
        _note: `No financial data found for candidate ${candidateId} in cycle(s) ${cycles.join(', ')}`,
      });
    }

    // Transform each totals record into a clean shape
    const totals = allTotals.map((t: any) => ({
      cycle: t.cycle || null,
      election_year: t.candidate_election_year || null,
      election_full: t.election_full ?? fullElection,
      coverage_start: t.coverage_start_date || null,
      coverage_end: t.coverage_end_date || null,

      // Money in
      receipts: num(t.receipts),
      contributions: num(t.contributions),
      individual_contributions: num(t.individual_contributions),
      individual_itemized: num(t.individual_itemized_contributions),
      individual_unitemized: num(t.individual_unitemized_contributions),
      pac_contributions: num(t.other_political_committee_contributions),
      party_contributions: num(t.political_party_committee_contributions),
      candidate_contribution: num(t.candidate_contribution),
      transfers_in: num(t.transfers_from_other_authorized_committee),
      other_receipts: num(t.other_receipts),
      federal_funds: num(t.federal_funds),

      // Money out
      disbursements: num(t.disbursements),
      operating_expenditures: num(t.operating_expenditures),
      fundraising_disbursements: num(t.fundraising_disbursements),
      other_disbursements: num(t.other_disbursements),
      transfers_out: num(t.transfers_to_other_authorized_committee),
      contribution_refunds: num(t.contribution_refunds),

      // Loans
      loans: num(t.loans),
      loans_by_candidate: num(t.loans_made_by_candidate),
      loan_repayments: num(t.loan_repayments),
      loan_repayments_candidate: num(t.loan_repayments_candidate_loans),

      // Balance sheet
      cash_on_hand: num(t.last_cash_on_hand_end_period),
      debts_owed: num(t.last_debts_owed_by_committee),
      debts_owed_to: num(t.last_debts_owed_to_committee),
      net_contributions: num(t.net_contributions),
      net_operating_expenditures: num(t.net_operating_expenditures),

      // Reporting
      last_report_type: t.last_report_type_full || null,
      last_report_year: t.last_report_year || null,
    }));

    // Build aggregate across all cycles
    // Use election_full=true records when available to avoid double-counting
    const bestTotals = deduplicateTotals(totals);

    const aggregate = {
      total_receipts: sum(bestTotals, 'receipts'),
      total_disbursements: sum(bestTotals, 'disbursements'),
      total_contributions: sum(bestTotals, 'contributions'),
      total_individual: sum(bestTotals, 'individual_contributions'),
      total_individual_itemized: sum(bestTotals, 'individual_itemized'),
      total_individual_unitemized: sum(bestTotals, 'individual_unitemized'),
      total_pac: sum(bestTotals, 'pac_contributions'),
      total_party: sum(bestTotals, 'party_contributions'),
      total_candidate_self_funding: sum(bestTotals, 'candidate_contribution'),
      total_loans: sum(bestTotals, 'loans'),
      total_loan_repayments: sum(bestTotals, 'loan_repayments'),
      cycles_covered: [...new Set(bestTotals.map((t) => t.cycle).filter(Boolean))].sort(),
      latest_cash_on_hand: bestTotals.length > 0
        ? bestTotals.reduce((max, t) => Math.max(max, t.cash_on_hand), 0)
        : 0,
      latest_debts: bestTotals.length > 0
        ? bestTotals.reduce((max, t) => Math.max(max, t.debts_owed), 0)
        : 0,
    };

    return NextResponse.json({
      candidate_id: candidateId,
      totals,
      aggregate,
    });
  } catch (error) {
    const { error: message, status } = fecErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Safely convert to number, defaulting to 0 */
function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Sum a specific field across an array of objects */
function sum(items: any[], field: string): number {
  return Math.round(items.reduce((acc, item) => acc + (item[field] || 0), 0) * 100) / 100;
}

/**
 * FEC can return both cycle-specific and full-election totals for the same
 * election year. When both exist, prefer the full-election total to avoid
 * double-counting across cycles. Group by election_year and pick the best.
 */
function deduplicateTotals(totals: any[]): any[] {
  const byElection: Record<string, any[]> = {};

  for (const t of totals) {
    const key = String(t.election_year || t.cycle || 'unknown');
    if (!byElection[key]) byElection[key] = [];
    byElection[key].push(t);
  }

  const result: any[] = [];
  for (const records of Object.values(byElection)) {
    // Prefer election_full records
    const full = records.find((r) => r.election_full === true);
    result.push(full || records[0]);
  }

  return result;
}

function emptyAggregate() {
  return {
    total_receipts: 0,
    total_disbursements: 0,
    total_contributions: 0,
    total_individual: 0,
    total_individual_itemized: 0,
    total_individual_unitemized: 0,
    total_pac: 0,
    total_party: 0,
    total_candidate_self_funding: 0,
    total_loans: 0,
    total_loan_repayments: 0,
    cycles_covered: [],
    latest_cash_on_hand: 0,
    latest_debts: 0,
  };
}
