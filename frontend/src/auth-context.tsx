import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

import { api } from "@/src/api";
import { authStore } from "@/src/utils/auth";

interface AuthState {
  isAdmin: boolean;
  email: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await authStore.getToken();
    if (!token) {
      setIsAdmin(false);
      setEmail(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.authMe();
      setIsAdmin(true);
      setEmail(me.email);
    } catch {
      await authStore.clear();
      setIsAdmin(false);
      setEmail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (e: string, p: string) => {
    const r = await api.authLogin(e, p);
    await authStore.setSession(r.access_token, r.email);
    setIsAdmin(true);
    setEmail(r.email);
  };

  const setup = async (e: string, p: string) => {
    const r = await api.authSetup(e, p);
    await authStore.setSession(r.access_token, r.email);
    setIsAdmin(true);
    setEmail(r.email);
  };

  const logout = async () => {
    await authStore.clear();
    setIsAdmin(false);
    setEmail(null);
  };

  return (
    <AuthCtx.Provider value={{ isAdmin, email, loading, login, setup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
