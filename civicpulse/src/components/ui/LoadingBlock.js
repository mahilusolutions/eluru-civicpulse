import { Bone } from './PageSkeleton';

/** Placeholder card shown while a list or panel loads, in the same style as the page it replaces. */
export default function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div role="status" aria-busy="true" className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft">
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-4 last:border-b-0">
          <Bone className="h-9 w-9 shrink-0 !rounded-xl" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3.5 w-1/3" />
            <Bone className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
