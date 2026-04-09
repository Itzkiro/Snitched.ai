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
  description: "Real-Time Political Transparency - Foreign Lobby Tracking - OSINT Intelligence",
  openGraph: {
    title: "SNITCHED.AI - Florida Corruption Index",
    description: "Real-Time Political Transparency - Foreign Lobby Tracking - OSINT Intelligence",
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
    description: "Real-Time Political Transparency - Foreign Lobby Tracking - OSINT Intelligence",
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
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface font-mono overflow-x-hidden">
        <div className="scanline-overlay" />
        <div className="grid-bg fixed inset-0 pointer-events-none" />
        <TerminalHeader />
        <main className="lg:pl-64 pt-14 pb-12 min-h-screen relative">
          {children}
        </main>
        <footer className="fixed bottom-0 w-full z-40 py-2 px-6 flex justify-between items-center bg-[#080A0D]/80 backdrop-blur-sm border-t border-[#00FF88]/5">
          <div className="font-mono text-[0.65rem] opacity-50 text-[#00FF88]">
            DATA SYNC: REAL-TIME // FEC SOURCE CITATIONS ENABLED
          </div>
          <div className="hidden md:flex gap-6">
            <a
              className="font-mono text-[0.65rem] opacity-50 text-[#00FF88] hover:opacity-100 underline"
              href="#"
            >
              API_RESOURCES
            </a>
            <a
              className="font-mono text-[0.65rem] opacity-50 text-[#00FF88] hover:opacity-100"
              href="#"
            >
              REDACTION_POLICY
            </a>
            <a
              className="font-mono text-[0.65rem] opacity-50 text-[#00FF88] hover:opacity-100"
              href="#"
            >
              VULNERABILITY_REPORT
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
