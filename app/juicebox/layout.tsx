import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Juice Box Leaderboard',
  description: 'Ranked leaderboard of Florida politicians by Israel lobby funding — who is bought, owned, or compromised.',
};

export default function JuiceboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
