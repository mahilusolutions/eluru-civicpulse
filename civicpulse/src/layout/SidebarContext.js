import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const SidebarContext = createContext(null);
const STORAGE_KEY = 'civicpulse_sidebar_collapsed';

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === '1';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed() {
        setCollapsed((prev) => !prev);
      },
      mobileOpen,
      setMobileOpen,
      openMobile() {
        setMobileOpen(true);
      },
      closeMobile() {
        setMobileOpen(false);
      },
    }),
    [collapsed, mobileOpen]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
