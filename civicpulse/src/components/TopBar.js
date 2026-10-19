import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS, ROLE_OPTIONS } from '../auth/roles';
import { useSidebar } from '../layout/SidebarContext';
import ThemeToggle from './ThemeToggle';

export default function TopBar() {
  const { role, roleLabel, login, logout } = useAuth();
  const { openMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const pageTitle = useMemo(() => {
    const match = NAV_ITEMS.find((item) => item.path === location.pathname);
    return match?.label || 'Workspace';
  }, [location.pathname]);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate('/');
  }

  function handleRoleChange(event) {
    login(event.target.value);
    setMenuOpen(false);
    navigate('/app/dashboard');
  }

  return (
    <header className="z-20 flex h-14 w-full shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-elevated)]/90 px-4 backdrop-blur-md sm:px-5 lg:px-6">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink)] lg:hidden"
        onClick={openMobile}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          Eluru · AC S01-65
        </p>
        <h1 className="truncate text-sm font-bold text-[var(--ink)] sm:text-base">
          {pageTitle}
        </h1>
      </div>

      <div className="mx-auto hidden max-w-md flex-1 md:block">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search voters, booths, wards…"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--brand)]"
          />
        </label>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle compact className="h-9 w-9 justify-center px-0" />

        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--muted)] transition hover:text-[var(--ink)]"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] py-1.5 pl-1.5 pr-2.5 text-left transition hover:border-[var(--brand)]"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-bold text-white">
              {(roleLabel || 'U').slice(0, 1)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-xs font-bold text-[var(--ink)]">
                {roleLabel}
              </span>
              <span className="block truncate text-[10px] text-[var(--muted)]">
                Mahilu · Eluru
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
          </button>

          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 cursor-default"
                aria-label="Close account menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-2 shadow-soft">
                <div className="mb-2 rounded-xl bg-[var(--bg-muted)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-[var(--brand)]" />
                    <div>
                      <p className="text-sm font-bold">{roleLabel}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        Signed in for Eluru
                      </p>
                    </div>
                  </div>
                </div>

                <label className="mb-1 block px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Switch role
                </label>
                <select
                  value={role || ''}
                  onChange={handleRoleChange}
                  className="mb-2 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--brand)]"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:bg-[var(--bg-muted)]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
