import type { Metadata } from "next";
import "./globals-terminal.css";
import TerminalHeader from "@/components/TerminalHeader";

export const metadata: Metadata = {
  metadataBase: new URL('https://snitched.ai'),
  title: "SNITCHED.AI - Florida Corruption Index",
  description: "Real-Time Political Transparency • Foreign Lobby Tracking • OSINT Intelligence",
  openGraph: {
    title: "SNITCHED.AI - Florida Corruption Index",
    description: "Real-Time Political Transparency • Foreign Lobby Tracking • OSINT Intelligence",
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
    title: "SNITCHED.AI - Florida Corruption Index",
    description: "Real-Time Political Transparency • Foreign Lobby Tracking • OSINT Intelligence",
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
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <TerminalHeader />
        {children}
      </body>
    </html>
  );
}
