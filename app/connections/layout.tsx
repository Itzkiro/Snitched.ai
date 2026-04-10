import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connections Map',
  description: 'Cross-politician network analysis — visualize donor, PAC, and corporate connections across Florida politicians.',
};

export default function ConnectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
