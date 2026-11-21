import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api';
import { Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; department?: string; phone?: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser((await api<{ user: User }>('/auth/me')).user);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } });
    tokenStore.set(r.token);
    setUser(r.user);
  };

  const register = async (data: { name: string; email: string; password: string; department?: string; phone?: string }) => {
    const r = await api<{ token: string; user: User }>('/auth/register', { body: data });
    tokenStore.set(r.token);
    setUser(r.user);
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  const can = (p: string) => !!user?.permissions.includes(p);

  return <Ctx.Provider value={{ user, loading, login, register, logout, refresh, can }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export type Portal = 'employee' | 'technician' | 'admin';
export const portalOf = (role: Role): Portal =>
  role === 'EMPLOYEE' ? 'employee' : role === 'TECHNICIAN' || role === 'TEAM_LEAD' ? 'technician' : 'admin';
