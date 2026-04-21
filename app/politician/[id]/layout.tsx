import type { Metadata } from 'next';
import { getServerSupabase } from '@/lib/supabase-server';

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const client = getServerSupabase();
    if (!client) return {};

    const { data: row } = await client
      .from('politicians')
      .select('name, office, party, corruption_score, total_funds, israel_lobby_total')
      .eq('bioguide_id', id)
      .single();

    if (!row) return {};

    const name = row.name as string;
    const office = row.office as string;
    const party = row.party as string;
    const score = Number(row.corruption_score) || 0;
    const funds = Number(row.total_funds) || 0;
    const israelLobby = Number(row.israel_lobby_total) || 0;

    const fundsLabel = funds > 0 ? `$${Math.round(funds).toLocaleString('en-US')}` : '$0';
    const israelLobbyLabel = israelLobby > 0 ? `$${Math.round(israelLobby).toLocaleString('en-US')}` : '$0';

    const description = [
      `${name} (${party}) — ${office}.`,
      `Corruption Score: ${score}/100.`,
      funds > 0 ? `Total Funds: ${fundsLabel}.` : null,
      israelLobby > 0 ? `Pro-Israel Lobby: ${israelLobbyLabel}.` : null,
      'Real campaign finance data from FEC & FL Division of Elections.',
    ].filter(Boolean).join(' ');

    return {
      title: `${name} — ${office}`,
      description,
      openGraph: {
        title: `${name} — ${office}`,
        description,
        type: 'profile',
      },
      twitter: {
        card: 'summary',
        title: `${name} — ${office}`,
        description,
      },
    };
  } catch {
    return {};
  }
}

export default function PoliticianLayout({ children }: Props) {
  return children;
}
