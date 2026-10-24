import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  Search,
  UserRound,
} from 'lucide-react';
import { getVoters } from '../api/voters';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS } from '../auth/roles';
import { useSidebar } from '../layout/SidebarContext';
import ThemeToggle from './ThemeToggle';
import VoterModal from './voters/VoterModal';
import { niceName } from '../utils/voterFormat';

export default function TopBar() {
  const { roleLabel, fullName, username, logout } = useAuth();
  const { openMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  const pageTitle = useMemo(() => {
    const match = NAV_ITEMS.find((item) => item.path === location.pathname);
    return match?.label || 'Workspace';
  }, [location.pathname]);

  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [viewId, setViewId] = useState(null);
  const boxRef = useRef(null);
  const text = query.trim();

  // Suggestions: look up matching voters shortly after the last key.
  useEffect(() => {
    if (text.length < 2) {
      setHits([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      getVoters({ q: text, limit: 8 })
        .then((data) => {
          if (cancelled) return;
          setHits(data?.rows || []);
          setActive(-1);
        })
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text]);

  // Close the list when clicking elsewhere.
  useEffect(() => {
    const away = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  function pick(voter) {
    setOpen(false);
    setViewId(voter.id);
  }

  function handleSearch(event) {
    event.preventDefault();
    if (active >= 0 && hits[active]) return pick(hits[active]);
    setOpen(false);
    return navigate(text ? `/app/voters?q=${encodeURIComponent(text)}` : '/app/voters');
  }

  function handleKey(event) {
    if (event.key === 'ArrowDown' && hits.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === 'ArrowUp' && hits.length) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  function handleChangePassword() {
    setMenuOpen(false);
    navigate('/change-password');
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

      <div ref={boxRef} className="relative mx-auto hidden max-w-md flex-1 md:block">
        <form onSubmit={handleSearch} role="search" className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            aria-label="Search voters"
            autoComplete="off"
            placeholder="Search voters by name, ID or house…"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--brand)]"
          />
        </form>

        {open && text.length >= 2 ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_12px_40px_-12px_rgba(15,27,45,0.35)]">
            {searching && !hits.length ? <p className="px-3 py-3 text-sm text-[var(--muted)]">Searching…</p> : null}
            {!searching && !hits.length ? <p className="px-3 py-3 text-sm text-[var(--muted)]">No voters match “{text}”.</p> : null}
            <ul role="listbox">
              {hits.map((v, i) => (
                <li key={v.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onClick={() => pick(v)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${i === active ? 'bg-[var(--bg-muted)]' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--ink)]">{niceName(v.name)}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        Booth {v.part_no}
                        {v.house_number ? ` · House ${v.house_number}` : ''}
                        {v.section_name ? ` · ${niceName(v.section_name)}` : ''}
                        {v.epic ? ` · ${v.epic}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">{v.age != null ? `Age ${v.age}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
            {hits.length ? (
              <button
                type="button"
                onClick={handleSearch}
                className="block w-full border-t border-[var(--line)] px-3 py-2 text-left text-xs font-semibold text-[var(--brand)] hover:bg-[var(--bg-muted)]"
              >
                See all results for “{text}”
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle compact className="h-9 w-9 justify-center px-0" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] py-1.5 pl-1.5 pr-2.5 text-left transition hover:border-[var(--brand)]"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-bold text-white">
              {(fullName || username || 'U').trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-xs font-bold text-[var(--ink)]">
                {fullName || username}
              </span>
              <span className="block truncate text-[10px] text-[var(--muted)]">
                {roleLabel}
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
                <div className="mb-2 rounded-xl bg-[var(--bg-muted)] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{fullName || username}</p>
                      <p className="truncate font-mono text-[11px] text-[var(--muted)]">{username}</p>
                    </div>
                  </div>
                  <p className="mt-2 inline-flex rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand)] ring-1 ring-[var(--line)]">{roleLabel}</p>
                </div>

                <button
                  type="button"
                  onClick={handleChangePassword}
                  className="mb-1 inline-flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:bg-[var(--bg-muted)]"
                >
                  <KeyRound className="h-4 w-4" />
                  Change password
                </button>

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
      {viewId != null ? <VoterModal id={viewId} onClose={() => setViewId(null)} onSelect={setViewId} /> : null}
    </header>
  );
}
