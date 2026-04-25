import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bebas_Neue, Inter, JetBrains_Mono } from "next/font/google";
import "./globals-terminal.css";
import { TerminalProvider } from "@/components/TerminalContext";
import TerminalShell from "@/components/TerminalShell";

// Self-hosted via next/font (Phase 10 - A): eliminates third-party
// Google Fonts CDN requests. Weight selection follows PLAN-spec.md
// "Phase A":
//  - Bebas Neue: one weight (display headlines)
//  - Inter: four weights (400/500/600/700) for UI body; the heaviest
//    weight previously requested via the Google Fonts URL is dropped
//    because no component uses it.
//  - JetBrains Mono: three weights (400/500/700) - terminal/data UI
// CSS variables are applied to <body> so existing `font-family:
// 'JetBrains Mono'` etc. rules in globals-terminal.css continue to resolve.
const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

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
      <body className={`${bebasNeue.variable} ${inter.variable} ${jetBrainsMono.variable}`}>
        {/*
          Skip-link per D-27 (a11y) and UI-SPEC §11. Visually hidden until the
          element receives keyboard focus, at which point the `focus:top-2`
          rule slides it into view. The 100 ms transition matches the drawer
          animation budget (D-07) so motion reads as a single system.
        */}
        <a
          href="#main"
          className="absolute -top-12 left-2 z-[100] bg-terminal-green text-black px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] focus:top-2 transition-[top] duration-100"
        >
          Skip to content
        </a>
        <TerminalProvider>
          <Suspense>
            <TerminalShell>
              <main id="main">
                {children}
              </main>
            </TerminalShell>
          </Suspense>
        </TerminalProvider>
      </body>
    </html>
  );
}
