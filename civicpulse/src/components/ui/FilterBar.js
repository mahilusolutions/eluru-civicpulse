export default function FilterBar({ children, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
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
      className={`min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--brand)] ${className}`}
    />
  );
}

export function FilterSelect({ value, onChange, options, className = '', label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label || 'Filter'}
      className={`rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)] sm:min-w-[8.5rem] ${className}`}
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
