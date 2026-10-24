import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, signIn, signOut } from '../api/auth';
import { ROLE_LABELS } from './roles';

const AuthContext = createContext(null);

/**
 * The signed-in person comes from the server (a secure cookie the page cannot read). Nothing about
 * who you are or what you may do is kept in browser storage.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getMe();
      setUser(data?.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('civicpulse_role'); // left over from the old demo login
    } catch {
      /* storage may be blocked */
    }
    refresh();
  }, [refresh]);

  // The server says the session ended, or a new password must be chosen first.
  useEffect(() => {
    const ended = () => setUser(null);
    const mustChange = () => setUser((u) => (u ? { ...u, must_change_password: true } : u));
    window.addEventListener('civicpulse:session-ended', ended);
    window.addEventListener('civicpulse:password-change-required', mustChange);
    return () => {
      window.removeEventListener('civicpulse:session-ended', ended);
      window.removeEventListener('civicpulse:password-change-required', mustChange);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await signIn(username, password);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    try {
      await signOut();
    } catch {
      /* the cookie is cleared by the server; if it could not be reached the session still expires by itself */
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      role: user?.role || null,
      roleLabel: user ? user.role_label || ROLE_LABELS[user.role] : null,
      username: user?.username || null,
      fullName: user?.full_name || null,
      isAuthenticated: Boolean(user),
      mustChangePassword: Boolean(user?.must_change_password),
      login,
      logout,
      refresh,
      setUser,
    }),
    [user, loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
