"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface SessionUser { id: string; email: string; name: string | null; role: string; }
const Ctx = createContext<{ user: SessionUser | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }>({
  user: null, loading: true, refresh: async () => {}, logout: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/session");
      const j = await r.json();
      setUser(j.user ?? null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = useCallback(async () => {
    await fetch("/api/auth/session", { method: "POST" }).catch(() => {});
    // logout endpoint alias
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    window.location.href = "/";
  }, []);
  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useSession() { return useContext(Ctx); }
