import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface SessionPerson {
  id: string;
  name: string;
  is_admin: boolean;
}

const STORAGE_KEY = "bectavance.session";

interface SessionValue {
  person: SessionPerson | null;
  ready: boolean;
  signIn: (person: SessionPerson) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<SessionPerson | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) setPerson(JSON.parse(raw) as SessionPerson);
    } catch {
      /* rien à restaurer */
    }
    setReady(true);
  }, []);

  const signIn = useCallback((next: SessionPerson) => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPerson(next);
  }, []);

  const signOut = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setPerson(null);
  }, []);

  const value = useMemo(() => ({ person, ready, signIn, signOut }), [person, ready, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans SessionProvider");
  return value;
}
