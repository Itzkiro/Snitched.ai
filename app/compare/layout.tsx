import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Politicians',
  description: 'Compare Florida politicians side-by-side — corruption scores, campaign finance, Israel lobby funding, and voting records.',
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
