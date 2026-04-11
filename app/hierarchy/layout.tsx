import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hierarchy',
  description: 'Navigate the Florida government hierarchy — drill down from federal to county level and trace every politician through the structure.',
};

export default function HierarchyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
