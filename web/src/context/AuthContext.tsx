import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, tokens } from '../api/client';
import type { User, Business } from '../types';

interface AuthState {
  user: User | null;
  businesses: Business[];
  business: Business | null; // active book
  loading: boolean;
  setSession: (user: User, access: string, refresh: string) => Promise<void>;
  switchBusiness: (b: Business) => void;
  reloadBusinesses: () => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBusinesses = useCallback(async () => {
    const res = await api.get('/businesses');
    const list: Business[] = res.data.data;
    setBusinesses(list);
    const savedId = localStorage.getItem('bk_business');
    const active = list.find((b) => b.id === savedId) || list[0] || null;
    setBusiness(active);
    if (active) localStorage.setItem('bk_business', active.id);
  }, []);

  useEffect(() => {
    (async () => {
      if (!tokens.access) return setLoading(false);
      try {
        const me = await api.get('/auth/me');
        setUser(me.data.data);
        await loadBusinesses();
      } catch {
        tokens.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBusinesses]);

  const setSession = async (u: User, access: string, refresh: string) => {
    tokens.set(access, refresh);
    setUser(u);
    await loadBusinesses();
  };

  const refreshUser = async () => {
    const me = await api.get('/auth/me');
    setUser(me.data.data);
  };

  const switchBusiness = (b: Business) => {
    setBusiness(b);
    localStorage.setItem('bk_business', b.id);
  };

  const logout = () => {
    api.post('/auth/logout', { refreshToken: tokens.refresh }).catch(() => {});
    tokens.clear();
    localStorage.removeItem('bk_business');
    setUser(null);
    setBusinesses([]);
    setBusiness(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, businesses, business, loading, setSession, switchBusiness, reloadBusinesses: loadBusinesses, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
