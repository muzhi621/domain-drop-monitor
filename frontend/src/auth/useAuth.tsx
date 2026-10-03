import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost } from '../api/client';

interface AuthState {
  authed: boolean;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  authed: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ authed: boolean }>('/auth/me')
      .then((r) => setAuthed(Boolean(r.data?.authed)))
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, []);

  const login = async (password: string) => {
    const r = await apiPost<null>('/auth/login', { password });
    if (r.code === 0) setAuthed(true);
    else throw new Error(r.message || '登录失败');
  };

  const logout = async () => {
    await apiPost<null>('/auth/logout', {});
    setAuthed(false);
  };

  return (
    <AuthContext.Provider value={{ authed, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
