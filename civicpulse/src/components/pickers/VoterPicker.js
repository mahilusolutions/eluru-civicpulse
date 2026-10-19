import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { getVoters } from '../../api/voters';
import { niceName, relationLabel, roadName } from '../../utils/voterFormat';

/** Find a voter by typing part of their name, voter ID or house number. */
export default function VoterPicker({ value, onChange, autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      getVoters({ q, limit: 8 })
        .then((data) => {
          if (cancelled) return;
          setResults(data.rows || []);
          setError('');
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setBusy(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--brand)] bg-[var(--brand)]/5 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--ink)]">{niceName(value.name)}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            Booth {value.part_no}
            {value.house_number ? ` · House ${value.house_number}` : ''}
            {roadName(value) ? ` · ${roadName(value)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
          aria-label="Choose a different voter"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a name, voter ID or house number…"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          aria-label="Find a voter"
        />
      </label>
      {error ? <p className="mt-1.5 text-xs text-[var(--danger)]">{error}</p> : null}
      {query.trim().length >= 2 ? (
        <ul className="mt-1.5 max-h-56 divide-y divide-[var(--line)] overflow-y-auto rounded-xl border border-[var(--line)]">
          {results.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => onChange(v)} className="block w-full px-3 py-2 text-left transition hover:bg-[var(--bg-muted)]">
                <span className="block truncate text-sm font-semibold text-[var(--ink)]">{niceName(v.name)}</span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {relationLabel(v.relation_type)}: {niceName(v.relation_name) || '—'} · Booth {v.part_no}
                  {v.house_number ? ` · House ${v.house_number}` : ''}
                </span>
              </button>
            </li>
          ))}
          {!results.length ? (
            <li className="px-3 py-3 text-center text-xs text-[var(--muted)]">{busy ? 'Searching…' : `No voter found for “${query.trim()}”.`}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
