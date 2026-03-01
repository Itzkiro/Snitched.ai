import { NextRequest, NextResponse } from 'next/server';
import { fecFetch, fecErrorResponse, isIsraelLobbyDonor, ISRAEL_LOBBY_COMMITTEE_IDS } from '@/lib/fec-client';

/**
 * GET /api/fec/contributions
 *
 * Get committee contributions (Schedule A receipts) for a candidate.
 * Identifies AIPAC and Israel lobby contributions automatically.
 *
 * Proxies to: https://api.open.fec.gov/v1/schedules/schedule_a/
 *
 * Query params:
 *   committee_id       - (required) FEC committee ID (e.g. "C00728949")
 *   candidate_id       - Alternatively, look up committees for this candidate first
 *   cycle              - Two-year election cycle (default: 2024)
 *   contributor_name   - Filter by contributor name (partial match)
 *   contributor_type   - "individual" or "committee"
 *   min_amount         - Minimum contribution amount
 *   max_amount         - Maximum contribution amount
 *   sort               - Sort field (default: "-contribution_receipt_date")
 *   per_page           - Results per page (max 100, default: 30)
 *   last_index         - Cursor for next page (from previous response pagination)
 *   last_contribution_receipt_date - Cursor date for next page
 *
 * Response shape:
 *   {
 *     contributions: [{
 *       donor_name, donor_type, entity_type, amount, date,
 *       employer, occupation, city, state, zip,
 *       committee_id, committee_name,
 *       is_israel_lobby, israel_lobby_name,
 *       memo_text, receipt_type, receipt_type_full,
 *       fec_transaction_id
 *     }],
 *     summary: {
 *       total_count, total_amount,
 *       israel_lobby_count, israel_lobby_amount,
 *       aipac_count, aipac_amount,
 *       by_type: { individual, pac, corporate, israel_lobby }
 *     },
 *     pagination: {
 *       count, per_page,
 *       last_indexes: { last_index, last_contribution_receipt_date }
 *     }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    let committeeId = searchParams.get('committee_id') || undefined;
    const candidateId = searchParams.get('candidate_id') || undefined;
    const cycle = searchParams.get('cycle') || '2024';
    const contributorName = searchParams.get('contributor_name') || undefined;
    const contributorType = searchParams.get('contributor_type') || undefined;
    const minAmount = searchParams.get('min_amount') || undefined;
    const maxAmount = searchParams.get('max_amount') || undefined;
    const sort = searchParams.get('sort') || '-contribution_receipt_date';
    const perPage = Math.min(Number(searchParams.get('per_page') || '30'), 100);
    const lastIndex = searchParams.get('last_index') || undefined;
    const lastDate = searchParams.get('last_contribution_receipt_date') || undefined;

    // If candidate_id provided but no committee_id, look up the principal committee
    if (!committeeId && candidateId) {
      const candidateData = await fecFetch(`/candidate/${candidateId}/committees/`, {
        cycle,
        per_page: 5,
        designation: 'P', // Principal campaign committee
      });

      const committees = candidateData.results || [];
      if (committees.length === 0) {
        return NextResponse.json({
          contributions: [],
          summary: emptySummary(),
          pagination: { count: 0, per_page: perPage, last_indexes: null },
          _note: `No principal committees found for candidate ${candidateId} in cycle ${cycle}`,
        });
      }
      committeeId = committees[0].committee_id;
    }

    if (!committeeId) {
      return NextResponse.json(
        { error: 'Either committee_id or candidate_id is required' },
        { status: 400 },
      );
    }

    // Build Schedule A params
    // FEC Schedule A uses cursor-based pagination (last_index + last_contribution_receipt_date)
    const params: Record<string, string | number | undefined> = {
      committee_id: committeeId,
      two_year_transaction_period: cycle,
      sort,
      per_page: perPage,
    };

    if (contributorName) params['contributor_name'] = contributorName;
    if (contributorType) {
      // Map friendly names to FEC entity_type codes
      if (contributorType === 'individual') {
        params['contributor_type'] = 'individual';
      } else if (contributorType === 'committee') {
        params['contributor_type'] = 'committee';
      }
    }
    if (minAmount) params['min_amount'] = minAmount;
    if (maxAmount) params['max_amount'] = maxAmount;

    // Cursor-based pagination
    if (lastIndex) params['last_index'] = lastIndex;
    if (lastDate) params['last_contribution_receipt_date'] = lastDate;

    const data = await fecFetch('/schedules/schedule_a/', params);

    // Transform contributions and tag Israel lobby donors
    let totalAmount = 0;
    let israelLobbyCount = 0;
    let israelLobbyAmount = 0;
    let aipacCount = 0;
    let aipacAmount = 0;
    const byType = { individual: 0, pac: 0, corporate: 0, israel_lobby: 0 };

    const contributions = (data.results || []).map((c: any) => {
      const donorName = c.contributor_name || 'UNKNOWN';
      const contribCommitteeId = c.contributor_id || '';
      const isIsrael = isIsraelLobbyDonor(donorName, contribCommitteeId);
      const amount = Number(c.contribution_receipt_amount || 0);
      const entityType = c.entity_type || '';

      // Determine if specifically AIPAC
      const isAipac =
        contribCommitteeId === 'C00104414' ||
        donorName.toUpperCase().includes('AIPAC') ||
        donorName.toUpperCase().includes('AMERICAN ISRAEL PUBLIC AFFAIRS');

      // Accumulate summary stats
      totalAmount += amount;
      if (isIsrael) {
        israelLobbyCount++;
        israelLobbyAmount += amount;
        byType.israel_lobby += amount;
      }
      if (isAipac) {
        aipacCount++;
        aipacAmount += amount;
      }

      // Classify donor type
      let donorType: string;
      if (isIsrael) {
        donorType = 'Israel-PAC';
      } else if (entityType === 'IND') {
        donorType = 'Individual';
        byType.individual += amount;
      } else if (entityType === 'ORG') {
        donorType = 'Corporate';
        byType.corporate += amount;
      } else if (['COM', 'PAC', 'CCM', 'PTY'].includes(entityType)) {
        donorType = 'PAC';
        byType.pac += amount;
      } else {
        donorType = entityType || 'Unknown';
        byType.individual += amount; // Default to individual
      }

      return {
        donor_name: donorName,
        donor_type: donorType,
        entity_type: entityType,
        amount,
        date: c.contribution_receipt_date || '',
        employer: c.contributor_employer || null,
        occupation: c.contributor_occupation || null,
        city: c.contributor_city || null,
        state: c.contributor_state || null,
        zip: c.contributor_zip || null,
        committee_id: c.committee_id || '',
        committee_name: c.committee?.name || null,
        is_israel_lobby: isIsrael,
        israel_lobby_name: isIsrael
          ? ISRAEL_LOBBY_COMMITTEE_IDS[contribCommitteeId] || donorName
          : null,
        is_aipac: isAipac,
        memo_text: c.memo_text || null,
        receipt_type: c.receipt_type || null,
        receipt_type_full: c.receipt_type_full || null,
        fec_transaction_id: c.transaction_id || null,
      };
    });

    const pagination = data.pagination || {};

    return NextResponse.json({
      contributions,
      committee_id: committeeId,
      cycle,
      summary: {
        total_count: contributions.length,
        total_amount: Math.round(totalAmount * 100) / 100,
        israel_lobby_count: israelLobbyCount,
        israel_lobby_amount: Math.round(israelLobbyAmount * 100) / 100,
        aipac_count: aipacCount,
        aipac_amount: Math.round(aipacAmount * 100) / 100,
        by_type: {
          individual: Math.round(byType.individual * 100) / 100,
          pac: Math.round(byType.pac * 100) / 100,
          corporate: Math.round(byType.corporate * 100) / 100,
          israel_lobby: Math.round(byType.israel_lobby * 100) / 100,
        },
      },
      pagination: {
        count: pagination.count ?? 0,
        per_page: pagination.per_page ?? perPage,
        last_indexes: pagination.last_indexes || null,
      },
    });
  } catch (error) {
    const { error: message, status } = fecErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

function emptySummary() {
  return {
    total_count: 0,
    total_amount: 0,
    israel_lobby_count: 0,
    israel_lobby_amount: 0,
    aipac_count: 0,
    aipac_amount: 0,
    by_type: { individual: 0, pac: 0, corporate: 0, israel_lobby: 0 },
  };
}
