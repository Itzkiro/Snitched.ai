import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/export?format=csv&type=israel_lobby
 *
 * Export politician data as CSV.
 * Types: israel_lobby, corruption, funding, all
 */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'csv';
  const type = request.nextUrl.searchParams.get('type') || 'all';

  try {
    const client = getServerSupabase();
    if (!client) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    let query = client
      .from('politicians')
      .select('name, office, office_level, party, district, jurisdiction, corruption_score, total_funds, israel_lobby_total, aipac_funding, israel_lobby_breakdown, years_in_office')
      .eq('is_active', true)
      .order('name');

    if (type === 'israel_lobby') {
      query = query.gt('israel_lobby_total', 0);
    } else if (type === 'corruption') {
      query = query.gt('corruption_score', 0);
    } else if (type === 'funding') {
      query = query.gt('total_funds', 0);
    }

    const { data, error } = await query;
    if (error || !data) {
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    if (format === 'csv') {
      const headers = ['Name', 'Office', 'Office Level', 'Party', 'District', 'Jurisdiction', 'Corruption Score', 'Total Funds', 'Israel Lobby Total', 'AIPAC PACs', 'Lobby Donors', 'Years in Office'];
      const rows = data.map(row => {
        const breakdown = row.israel_lobby_breakdown as any;
        return [
          `"${(row.name || '').replace(/"/g, '""')}"`,
          `"${(row.office || '').replace(/"/g, '""')}"`,
          `"${row.office_level || ''}"`,
          row.party || '',
          `"${row.district || ''}"`,
          `"${row.jurisdiction || ''}"`,
          row.corruption_score || 0,
          row.total_funds || 0,
          row.israel_lobby_total || 0,
          breakdown?.pacs || 0,
          breakdown?.bundlers || 0,
          row.years_in_office || 0,
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      const filename = `snitched-ai-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
