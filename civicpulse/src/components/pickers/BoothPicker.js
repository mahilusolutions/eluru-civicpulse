import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { stationName } from '../../utils/boothFormat';
import { fmt } from '../../utils/voterFormat';

/**
 * Choose booths from a searchable checklist.
 * taken: { [partNo]: "Ward 3" } marks booths already used elsewhere (they can still be picked and are moved).
 */
export default function BoothPicker({ booths = [], value = [], onChange, taken = {} }) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value), [value]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return booths.filter((b) => !q || String(b.part_no) === q || stationName(b.polling_station_name, b.part_no).toLowerCase().includes(q));
  }, [booths, query]);

  function toggle(part) {
    const next = new Set(selected);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    onChange([...next].sort((a, b) => a - b));
  }

  if (!booths.length) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-xs text-[var(--muted)]">
        No booths yet. Upload a voter list from Data first.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a booth…"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          aria-label="Find a booth"
        />
        <span className="whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">{selected.size} chosen</span>
      </div>
      <ul className="max-h-48 divide-y divide-[var(--line)] overflow-y-auto">
        {shown.map((b) => (
          <li key={b.part_no}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-[var(--bg-muted)]">
              <input type="checkbox" checked={selected.has(b.part_no)} onChange={() => toggle(b.part_no)} className="h-4 w-4 accent-[var(--brand)]" />
              <span className="font-bold tabular-nums text-[var(--ink)]">{b.part_no}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--ink-soft)]">{stationName(b.polling_station_name, b.part_no)}</span>
              {taken[b.part_no] && !selected.has(b.part_no) ? <span className="whitespace-nowrap text-[10px] text-[var(--muted)]">in {taken[b.part_no]}</span> : null}
              <span className="whitespace-nowrap text-[11px] text-[var(--muted)]">{fmt(b.voters ?? b.voter_count)} voters</span>
            </label>
          </li>
        ))}
        {!shown.length ? <li className="px-3 py-4 text-center text-xs text-[var(--muted)]">No booth matches “{query}”.</li> : null}
      </ul>
    </div>
  );
}
