import { createContext, useContext, useMemo, useState } from 'react';
import { ROLE_LABELS } from './roles';

const STORAGE_KEY = 'civicpulse_role';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => localStorage.getItem(STORAGE_KEY));

  const value = useMemo(
    () => ({
      role,
      roleLabel: role ? ROLE_LABELS[role] : null,
      isAuthenticated: Boolean(role),
      login(nextRole) {
        localStorage.setItem(STORAGE_KEY, nextRole);
        setRole(nextRole);
      },
      logout() {
        localStorage.removeItem(STORAGE_KEY);
        setRole(null);
      },
    }),
    [role]
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
