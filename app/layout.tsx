import type { Metadata, Viewport } from "next";
import "./globals-terminal.css";
import TerminalHeader from "@/components/TerminalHeader";

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://snitched.ai'),
  title: "SNITCHED.AI - Florida Corruption Index",
  description: "Real-Time Political Transparency // Foreign Lobby Tracking // OSINT Intelligence",
  openGraph: {
    title: "SNITCHED.AI - Florida Corruption Index",
    description: "Real-Time Political Transparency // Foreign Lobby Tracking // OSINT Intelligence",
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
    description: "Real-Time Political Transparency // Foreign Lobby Tracking // OSINT Intelligence",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body text-on-surface leading-tight bg-[#05070a]">
        <TerminalHeader />
        {children}
      </body>
    </html>
  );
}
