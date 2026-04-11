import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals-terminal.css";
import { TerminalProvider } from "@/components/TerminalContext";
import TerminalShell from "@/components/TerminalShell";

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://snitched.ai'),
  title: {
    default: "Snitched.ai — Track Political Corruption in Florida",
    template: "%s | SNITCHED.AI",
  },
  description: "Track political corruption, foreign lobby influence, and campaign finance in Florida. Real-time OSINT intelligence from public records — not opinions.",
  openGraph: {
    siteName: 'SNITCHED.AI',
    title: "Snitched.ai — Track Political Corruption in Florida",
    description: "Track political corruption, foreign lobby influence, and campaign finance in Florida. Real-time OSINT intelligence from public records — not opinions.",
    images: [
      {
        url: '/og-image.png',
        width: 2752,
        height: 1536,
        alt: 'SNITCHED.AI - Florida Corruption Index',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@snitchedai',
    title: "Snitched.ai — Track Political Corruption in Florida",
    description: "Track political corruption, foreign lobby influence, and campaign finance in Florida. Real-time OSINT intelligence from public records — not opinions.",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <TerminalProvider>
          <Suspense>
            <TerminalShell>
              {children}
            </TerminalShell>
          </Suspense>
        </TerminalProvider>
      </body>
    </html>
  );
}
