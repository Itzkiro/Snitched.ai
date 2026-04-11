import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Social Intel',
  description: 'Real-time monitoring of Florida politician social media activity — scraped from public posts and profiles.',
};

export default function SocialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
