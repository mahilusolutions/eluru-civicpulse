import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Database,
  Flag,
  Handshake,
  Home,
  Landmark,
  LayoutDashboard,
  Map,
  MapPinned,
  MessageSquareWarning,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getGroupedNavForRole } from '../auth/roles';
import { useSidebar } from '../layout/SidebarContext';
import Logo from './Logo';

const ICONS = {
  LayoutDashboard,
  Search,
  MapPinned,
  Landmark,
  Home,
  Handshake,
  MessageSquareWarning,
  ClipboardList,
  Flag,
  Map,
  Users,
  FileBarChart: BarChart3,
  Database,
  Settings,
};

function NavIcon({ name }) {
  const Cmp = ICONS[name] || LayoutDashboard;
  return <Cmp className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />;
}

function Tooltip({ label, show, children }) {
  if (!show) return children;
  return (
    <div className="group/tip relative flex w-full justify-center">
      {children}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0F1B2D] px-2 py-1 text-xs font-medium text-white shadow-lg group-hover/tip:block dark:bg-white dark:text-[#0F1B2D]">
        {label}
      </span>
    </div>
  );
}

function SidebarPanel({ onNavigate, forceExpanded = false }) {
  const { role } = useAuth();
  const { collapsed, toggleCollapsed } = useSidebar();
  const groups = getGroupedNavForRole(role);
  const isCollapsed = forceExpanded ? false : collapsed;

  return (
    <aside
      className={`flex h-full flex-col border-r border-[var(--line)] bg-[var(--bg-elevated)] transition-[width] duration-200 ease-out ${
        isCollapsed ? 'w-[72px]' : 'w-[248px]'
      }`}
    >
      <div
        className={`flex h-14 shrink-0 items-center border-b border-[var(--line)] ${
          isCollapsed ? 'justify-center px-2' : 'justify-between gap-2 px-3'
        }`}
      >
        <Logo size="nav" showWordmark={!isCollapsed} />
        {!forceExpanded ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--ink)] ${
              isCollapsed ? 'absolute left-1/2 top-[4.25rem] z-10 -translate-x-1/2 border border-[var(--line)] bg-[var(--bg-elevated)] shadow-sm' : ''
            }`}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>

      <nav
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 ${
          isCollapsed ? 'px-2 pt-8' : 'px-2'
        }`}
        aria-label="Main menu"
      >
        {groups.map((group) => (
          <div key={group.name} className={isCollapsed ? 'mb-1' : 'mb-3'}>
            {!isCollapsed ? (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                {group.name}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Tooltip key={item.path} label={item.label} show={isCollapsed}>
                  <NavLink
                    to={item.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center rounded-xl text-[13px] font-semibold transition duration-150 ${
                        isCollapsed
                          ? 'mx-auto h-9 w-9 justify-center'
                          : 'gap-2.5 px-2.5 py-2'
                      } ${
                        isActive
                          ? 'bg-[var(--brand)]/10 text-[var(--brand)] shadow-sm ring-1 ring-[var(--brand)]/20'
                          : 'text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]'
                      }`
                    }
                  >
                    <NavIcon name={item.icon} />
                    {!isCollapsed ? <span>{item.label}</span> : null}
                  </NavLink>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {!isCollapsed ? (
        <div className="shrink-0 border-t border-[var(--line)] px-3 py-3">
          <p className="text-[10px] leading-relaxed text-[var(--muted)]">
            Powered by{' '}
            <span className="font-semibold text-[var(--brand)]">
              Mahilu Solutions
            </span>
          </p>
        </div>
      ) : null}
    </aside>
  );
}

export default function Sidebar() {
  const { mobileOpen, closeMobile, collapsed } = useSidebar();

  return (
    <>
      {/* Desktop: fixed full-height sidebar; main content pads to match width */}
      <div
        className={`fixed inset-y-0 left-0 z-30 hidden lg:block ${
          collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        <SidebarPanel />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu backdrop"
            onClick={closeMobile}
          />
          <div className="absolute left-0 top-0 h-full w-[min(280px,88vw)] shadow-2xl">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-1.5 text-[var(--muted)]"
              onClick={closeMobile}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarPanel forceExpanded onNavigate={closeMobile} />
          </div>
        </div>
      ) : null}
    </>
  );
}
