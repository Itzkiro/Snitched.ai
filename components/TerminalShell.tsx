'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTerminal } from './TerminalContext';
import TerminalHeader from './TerminalHeader';
import ComingSoon, { isStateLive } from './ComingSoon';

export default function TerminalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { entered } = useTerminal();
  const stateParam = searchParams.get('state');

  // Embed and dossier pages render bare — no header, no shell
  if (pathname.startsWith('/embed') || pathname.startsWith('/politician/')) return <>{children}</>;

  // On the homepage, only show header after user clicks "Enter Terminal"
  // On all other pages, always show the header
  const showHeader = pathname !== '/' || entered;

  // Show Coming Soon wall for non-live states (except homepage landing)
  const showComingSoon = stateParam && !isStateLive(stateParam) && pathname !== '/';

  return (
    <>
      {showHeader && <TerminalHeader />}
      {showComingSoon ? <ComingSoon stateCode={stateParam} /> : children}
    </>
  );
}
