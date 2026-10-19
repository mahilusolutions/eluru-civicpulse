import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fmt, pct } from '../../utils/voterFormat';

/* ---------- tooltip ---------- */

/** One tooltip per chart: marks call show(event, {title, rows}) and hide(). */
export function useChartTooltip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);

  const show = useCallback((event, content) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const target = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || target.left + target.width / 2;
    const y = event.clientY || target.top;
    setTip({
      ...content,
      left: Math.min(Math.max(x - box.left, 80), Math.max(box.width - 80, 80)),
      top: y - box.top,
    });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs shadow-soft"
      style={{ left: tip.left, top: tip.top - 8 }}
    >
      <p className="font-semibold text-[var(--ink)]">{tip.title}</p>
      {tip.rows.map((row) => (
        <p key={row.label} className="mt-0.5 flex items-center gap-1.5 text-[var(--muted)]">
          {row.color ? (
            <span className="h-0.5 w-3 rounded" style={{ background: row.color }} />
          ) : null}
          <span className="font-bold tabular-nums text-[var(--ink)]">{row.value}</span>
          <span>{row.label}</span>
        </p>
      ))}
    </div>
  ) : null;

  return { ref, show, hide, node };
}

export function ChartCard({ title, subtitle, action, children, className = '', center = false }) {
  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3.5 shadow-soft ${className}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[var(--ink)]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className={`min-w-0 flex-1 ${center ? 'flex flex-col justify-center' : ''}`}>{children}</div>
    </section>
  );
}

function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Gender donut ---------- */

const GENDER_ROWS = [
  { key: 'M', label: 'Male', color: 'var(--viz-male)' },
  { key: 'F', label: 'Female', color: 'var(--viz-female)' },
  { key: 'U', label: 'Not read', color: 'var(--viz-unknown)' },
];

export function GenderDonut({ genders = [], active, onPick }) {
  const { ref, show, hide, node } = useChartTooltip();
  const counts = Object.fromEntries(genders.map((g) => [g.key, g.count]));
  const rows = GENDER_ROWS.map((r) => ({ ...r, count: counts[r.key] || 0 }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = 3;
  let offset = 0;

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-5">
      {node}
      <svg viewBox="0 0 140 140" className="h-28 w-28 shrink-0" role="img" aria-label="Male and female voters">
        <g transform="rotate(-90 70 70)">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--viz-track)" strokeWidth="18" />
        {total > 0
          ? rows.map((r) => {
              if (!r.count) return null;
              const len = (r.count / total) * C;
              const dash = Math.max(len - GAP, 0.5);
              const el = (
                <circle
                  key={r.key}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={active === r.key ? 22 : 18}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  opacity={active && active !== r.key ? 0.3 : 1}
                  className="viz-fade cursor-pointer"
                  tabIndex={0}
                  onClick={() => onPick(active === r.key ? 'all' : r.key)}
                  onKeyDown={(e) => e.key === 'Enter' && onPick(active === r.key ? 'all' : r.key)}
                  onPointerMove={(e) =>
                    show(e, {
                      title: r.label,
                      rows: [{ value: fmt(r.count), label: `voters · ${pct(r.count, total)}%`, color: r.color }],
                    })
                  }
                  onPointerLeave={hide}
                  onFocus={(e) =>
                    show(e, {
                      title: r.label,
                      rows: [{ value: fmt(r.count), label: `voters · ${pct(r.count, total)}%`, color: r.color }],
                    })
                  }
                  onBlur={hide}
                />
              );
              offset += len;
              return el;
            })
          : null}
        </g>
        <g>
          <text x="70" y="68" textAnchor="middle" className="fill-[var(--ink)]" style={{ fontSize: 22, fontWeight: 800 }}>
            {fmt(total)}
          </text>
          <text x="70" y="84" textAnchor="middle" className="fill-[var(--muted)]" style={{ fontSize: 10 }}>
            voters
          </text>
        </g>
      </svg>

      <ul className="min-w-[8rem] flex-1 space-y-1.5">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onPick(active === r.key ? 'all' : r.key)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-[var(--bg-muted)] ${
                active === r.key ? 'bg-[var(--bg-muted)]' : ''
              }`}
            >
              <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: r.color }} />
              <span className="flex-1 text-[var(--ink-soft)]">{r.label}</span>
              <span className="font-bold tabular-nums text-[var(--ink)]">{fmt(r.count)}</span>
              <span className="w-9 text-right text-xs tabular-nums text-[var(--muted)]">
                {pct(r.count, total)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Age pyramid ---------- */

export function AgePyramid({ bands = [], active, onPick }) {
  const { ref, show, hide, node } = useChartTooltip();
  const rows = [...bands].reverse();
  const max = Math.max(1, ...bands.map((b) => Math.max(b.male, b.female)));
  const tip = (e, b) =>
    show(e, {
      title: `Age ${b.band}`,
      rows: [
        { value: fmt(b.male), label: 'male', color: 'var(--viz-male)' },
        { value: fmt(b.female), label: 'female', color: 'var(--viz-female)' },
        ...(b.unknown ? [{ value: fmt(b.unknown), label: 'gender not read', color: 'var(--viz-unknown)' }] : []),
      ],
    });

  return (
    <div ref={ref} className="relative">
      {node}
      <ul className="space-y-0.5">
        {rows.map((b) => {
          const dim = active && active !== b.band;
          return (
            <li key={b.band}>
              <button
                type="button"
                onClick={() => onPick(active === b.band ? 'all' : b.band)}
                onPointerMove={(e) => tip(e, b)}
                onPointerLeave={hide}
                onFocus={(e) => tip(e, b)}
                onBlur={hide}
                className={`viz-fade grid w-full grid-cols-[1fr_3.25rem_1fr] items-center gap-1 rounded-lg px-1 py-0.5 transition hover:bg-[var(--bg-muted)] ${
                  active === b.band ? 'bg-[var(--bg-muted)]' : ''
                } ${dim ? 'opacity-40' : ''}`}
                aria-label={`Age ${b.band}: ${b.male} male, ${b.female} female`}
              >
                <span className="flex items-center justify-end gap-1.5">
                  <span className="text-[11px] tabular-nums text-[var(--muted)]">{fmt(b.male)}</span>
                  <span
                    className="viz-bar-grow block h-3.5 rounded-l-[4px]"
                    style={{
                      width: `${(b.male / max) * 78}%`,
                      minWidth: b.male ? 3 : 0,
                      background: 'var(--viz-male)',
                      transformOrigin: 'right center',
                    }}
                  />
                </span>
                <span className="text-center text-xs font-semibold text-[var(--ink-soft)]">{b.band}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="viz-bar-grow block h-3.5 rounded-r-[4px]"
                    style={{
                      width: `${(b.female / max) * 78}%`,
                      minWidth: b.female ? 3 : 0,
                      background: 'var(--viz-female)',
                    }}
                  />
                  <span className="text-[11px] tabular-nums text-[var(--muted)]">{fmt(b.female)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex justify-center">
        <Legend
          items={[
            { label: 'Male', color: 'var(--viz-male)' },
            { label: 'Female', color: 'var(--viz-female)' },
          ]}
        />
      </div>
    </div>
  );
}

/* ---------- Horizontal bar list (roads, booths) ---------- */

export function BarList({ items = [], activeKey, onPick, unit = 'voters', empty = 'Nothing to show yet.', columns = false }) {
  const { ref, show, hide, node } = useChartTooltip();
  if (!items.length) return <p className="py-6 text-center text-sm text-[var(--muted)]">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);

  return (
    <div ref={ref} className="relative">
      {node}
      <ul
        className={`pr-1 ${columns ? 'gap-x-8 sm:columns-2 xl:columns-3' : 'space-y-1'} ${
          items.length > 16 ? 'max-h-80 overflow-y-auto' : ''
        }`}
      >
        {items.map((item) => {
          const dim = activeKey != null && String(activeKey) !== String(item.key);
          const tip = (e) =>
            show(e, {
              title: item.label,
              rows: [{ value: fmt(item.value), label: `${unit} · ${pct(item.value, total)}% of shown`, color: 'var(--viz-bar)' }],
            });
          return (
            <li key={item.key} className={columns ? 'mb-1 break-inside-avoid' : ''}>
              <button
                type="button"
                onClick={() => onPick(item)}
                onPointerMove={tip}
                onPointerLeave={hide}
                onFocus={tip}
                onBlur={hide}
                className={`viz-fade grid w-full grid-cols-[minmax(0,8.5rem)_1fr_4.25rem] items-center gap-2 rounded-lg px-1.5 py-0.5 text-left transition hover:bg-[var(--bg-muted)] ${
                  dim ? 'opacity-40' : ''
                } ${activeKey != null && !dim ? 'bg-[var(--bg-muted)]' : ''}`}
              >
                <span className="truncate text-xs text-[var(--ink-soft)]" title={item.label}>
                  {item.label}
                </span>
                <span className="block h-3.5 rounded-[4px] bg-[var(--viz-track)]">
                  <span
                    className="viz-bar-grow block h-full rounded-r-[4px] rounded-l-none"
                    style={{ width: `${(item.value / max) * 100}%`, background: 'var(--viz-bar)' }}
                  />
                </span>
                <span className="text-right text-xs tabular-nums text-[var(--muted)]">
                  <span className="font-semibold text-[var(--ink)]">{fmt(item.value)}</span> {item.value === 1 ? unit.replace(/s$/, '') : unit}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Data check meters ---------- */

function meterTone(value) {
  if (value >= 95) return { color: 'var(--viz-good)', Icon: CheckCircle2, text: 'Good' };
  if (value >= 70) return { color: 'var(--viz-warn)', Icon: AlertTriangle, text: 'Check' };
  return { color: 'var(--viz-crit)', Icon: AlertTriangle, text: 'Fix' };
}

export function DataCheck({ summary, activeKey, onPick }) {
  const total = summary?.total || 0;
  const rows = [
    { key: 'epic', label: 'Voter ID', have: summary?.with_epic },
    { key: 'house', label: 'House number', have: summary?.with_house },
    { key: 'age', label: 'Age', have: summary?.with_age },
    { key: 'gender', label: 'Gender', have: summary?.with_gender },
  ];
  if (!total) return <p className="py-4 text-sm text-[var(--muted)]">No voters to check.</p>;

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const have = r.have || 0;
        const value = pct(have, total);
        const missing = total - have;
        const tone = meterTone(value);
        return (
          <li key={r.key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[var(--ink-soft)]">{r.label}</span>
              <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                <tone.Icon className="h-3.5 w-3.5" style={{ color: tone.color }} />
                <span className="font-bold tabular-nums text-[var(--ink)]">{value}%</span>
                {tone.text}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--viz-track)]">
              <div
                className="viz-bar-grow h-full rounded-full"
                style={{ width: `${value}%`, background: tone.color }}
              />
            </div>
            {missing > 0 ? (
              <button
                type="button"
                onClick={() => onPick(activeKey === r.key ? 'all' : r.key)}
                className={`mt-1 text-[11px] font-semibold underline-offset-2 hover:underline ${
                  activeKey === r.key ? 'text-[var(--ink)]' : 'text-[var(--brand)]'
                }`}
              >
                {activeKey === r.key ? 'Showing' : 'Show'} {fmt(missing)} without {r.label.toLowerCase()}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Column chart (one value per day / step) ---------- */

/** data: [{ key, label, value, title? }]. Bars grow from a single baseline; hover shows the value. */
export function ColumnChart({ data = [], unit = '', height = 120, showEvery = 1 }) {
  const { ref, show, hide, node } = useChartTooltip();
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <div ref={ref} className="relative">
      {node}
      <div className="flex items-end gap-1" style={{ height }} role="img" aria-label={`${total} in total`}>
        {data.map((d) => {
          const tip = (e) => show(e, { title: d.title || d.label, rows: [{ value: fmt(d.value), label: unit, color: 'var(--viz-bar)' }] });
          return (
            <button
              key={d.key}
              type="button"
              onPointerMove={tip}
              onPointerLeave={hide}
              onFocus={tip}
              onBlur={hide}
              aria-label={`${d.title || d.label}: ${d.value} ${unit}`}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span
                className="block w-full rounded-t-[4px] transition group-hover:brightness-110"
                style={{ height: `${d.value ? Math.max(4, (d.value / max) * 100) : 0}%`, background: 'var(--viz-bar)', minHeight: d.value ? 4 : 0 }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 border-t border-[var(--line)] pt-1">
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-[var(--muted)]">
            {i % showEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
