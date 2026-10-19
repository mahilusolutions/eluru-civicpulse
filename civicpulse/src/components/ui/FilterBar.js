export default function FilterBar({ children, className = '' }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)]/90 p-2.5 shadow-soft sm:flex-row sm:flex-wrap sm:items-center ${className}`}
    >
      {children}
    </div>
  );
}

export function FilterSearch({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15 ${className}`}
    />
  );
}

export function FilterSelect({ value, onChange, options, className = '', label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label || 'Filter'}
      className={`rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] sm:min-w-[9rem] ${className}`}
    >
      {options.map((opt) => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const text = typeof opt === 'object' ? opt.label : opt;
        return (
          <option key={String(val)} value={val}>
            {text}
          </option>
        );
      })}
    </select>
  );
}
