'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface TerminalContextValue {
  readonly entered: boolean;
  readonly enter: () => void;
}

const TerminalContext = createContext<TerminalContextValue>({
  entered: false,
  enter: () => {},
});

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);

  const enter = () => setEntered(true);

  return (
    <TerminalContext.Provider value={{ entered, enter }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  return useContext(TerminalContext);
}
