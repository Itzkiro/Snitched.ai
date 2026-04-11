'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface TerminalContextValue {
  readonly entered: boolean;
  readonly enter: () => void;
  readonly exit: () => void;
}

const TerminalContext = createContext<TerminalContextValue>({
  entered: false,
  enter: () => {},
  exit: () => {},
});

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);

  const enter = () => setEntered(true);
  const exit = () => setEntered(false);

  return (
    <TerminalContext.Provider value={{ entered, enter, exit }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  return useContext(TerminalContext);
}
