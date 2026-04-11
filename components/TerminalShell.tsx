'use client';

import { usePathname } from 'next/navigation';
import { useTerminal } from './TerminalContext';
import TerminalHeader from './TerminalHeader';

export default function TerminalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { entered } = useTerminal();

  // On the homepage, only show header after user clicks "Enter Terminal"
  // On all other pages, always show the header
  const showHeader = pathname !== '/' || entered;

  return (
    <>
      {showHeader && <TerminalHeader />}
      {children}
    </>
  );
}
