import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Search, Table2, X } from 'lucide-react';
import { inputClass } from './Panel';

/** Compact toolbar button (page header actions). */
export const btnTool =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60';

/** Primary toolbar button (the main action of a page, e.g. "Add ward"). */
export const btnToolPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60';

/** Form control sized for popups and filter panels. */
export const inputSm = `${inputClass} !py-2`;

/** useState that remembers its value in localStorage (safe if storage is blocked). */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved != null) return JSON.parse(saved);
    } catch {
      /* storage may be blocked */
    }
    return typeof initial === 'function' ? initial() : initial;
  });
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage may be blocked */
        }
        return resolved;
      });
    },
    [key]
  );
  return [value, set];
}

/** Table on wide screens, cards elsewhere, unless the person chose one. */
export function useViewMode(key) {
  return usePersistentState(key, () => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'table' : 'cards'));
}

/** Charts open on large screens, closed on phones, until the person chooses. */
export function useChartsOpen(key) {
  return usePersistentState(key, () => (typeof window === 'undefined' ? true : window.innerWidth >= 768));
}

export function ViewSwitch({ view, onChange }) {
  return (
    <div
      className="hidden items-center rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-0.5 md:inline-flex"
      role="group"
      aria-label="Choose how to show the list"
    >
      {[
        ['table', 'Table', Table2],
        ['cards', 'Cards', LayoutGrid],
      ].map(([id, label, ViewIcon]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={view === id}
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold transition ${
            view === id ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--brand)]'
          }`}
        >
          <ViewIcon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function FilterField({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">{label}</span>
      {children}
    </div>
  );
}

/**
 * Search box with a grid of labelled filters below it and removable "Showing:" chips.
 * chips: [{ key, label, onRemove }]
 */
export function FilterPanel({ search, onSearch, placeholder = 'Search…', children, chips = [], onClearAll, cols = 'md:grid-cols-3 xl:grid-cols-4' }) {
  return (
    <section aria-label="Filters" className="space-y-2.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3 shadow-soft">
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2 pl-10 pr-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        />
      </label>

      {children ? <div className={`grid grid-cols-2 gap-x-3 gap-y-2 ${cols}`}>{children}</div> : null}

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          <span className="text-xs font-semibold text-[var(--muted)]">Showing:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand)]/20"
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" onClick={onClearAll} className="text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline">
            Clear all
          </button>
        </div>
      ) : null}
    </section>
  );
}

const STRIP_COLS = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6' };

export function Stat({ label, value, hint, children, className = '' }) {
  return (
    <div className={`min-w-0 bg-[var(--bg-elevated)] px-3.5 py-3 ${className}`}>
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-extrabold leading-none tracking-tight text-[var(--ink)]">{value}</p>
      {children}
      {hint ? <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

/** One card of headline numbers with hairline dividers. items: Stat props. */
export function StatStrip({ items }) {
  const n = Math.min(Math.max(items.length, 2), 6);
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] shadow-soft ${STRIP_COLS[n]}`}>
      {items.map((item, i) => (
        <Stat
          key={item.label}
          {...item}
          className={`${item.className || ''} ${items.length % 2 === 1 && i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}
        />
      ))}
    </div>
  );
}

/** Small label + value used in phone cards. */
export function MiniFact({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-[var(--ink)]">{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

/** Label on the left, value on the right (popup detail lists). */
export function DetailRow({ label, children, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2 last:border-b-0">
      <dt className="shrink-0 text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-sm font-semibold text-[var(--ink)] ${mono ? 'font-mono' : ''}`}>
        {children || <span className="font-normal text-[var(--muted)]">—</span>}
      </dd>
    </div>
  );
}

export function SectionTitle({ children, className = '' }) {
  return <h3 className={`mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)] ${className}`}>{children}</h3>;
}

/** Dot + label pill used for statuses. */
export function Pill({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--bg-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
      {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </span>
  );
}

/** Horizontal meter: label, "NN% · detail", and a bar. */
export function Meter({ label, value, detail, color = 'var(--brand)' }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-[var(--ink-soft)]">{label}</span>
        <span className="text-[var(--muted)]">
          <span className="font-bold tabular-nums text-[var(--ink)]">{v}%</span>
          {detail ? ` · ${detail}` : ''}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--viz-track)]">
        <div className="viz-bar-grow h-full rounded-full" style={{ width: `${v}%`, background: color }} />
      </div>
    </li>
  );
}

/** Keep a debounced copy of a text input, in sync with a URL/query value. */
export function useDebouncedSearch(value, onCommit, delay = 300) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== value) onCommit(text.trim());
    }, delay);
    return () => clearTimeout(t);
  }, [text, value, onCommit, delay]);
  useEffect(() => {
    setText(value);
  }, [value]);
  return [text, setText];
}
