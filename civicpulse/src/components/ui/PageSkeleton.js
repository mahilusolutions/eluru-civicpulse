import { useLocation } from "react-router-dom";

/** One grey placeholder bar. */
export function Bone({ className = "", style }) {
  return (
    <span
      aria-hidden
      style={style}
      className={`block animate-pulse rounded-md bg-[var(--viz-track)] ${className}`}
    />
  );
}

const card =
  "rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft";

function StatStrip({ cells = 5 }) {
  return (
    <div
      className={`${card} grid grid-cols-2 divide-[var(--line)] overflow-hidden md:grid-cols-5 md:divide-x`}
    >
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="space-y-2.5 p-4">
          <Bone className="h-3 w-20" />
          <Bone className="h-6 w-16" />
          <Bone className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function ChartCard({ rows = 4 }) {
  return (
    <div className={`${card} p-4`}>
      <Bone className="h-4 w-32" />
      <Bone className="mt-2 h-3 w-48" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Bone
            key={i}
            className="h-3.5"
            style={{ width: `${88 - i * 14}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ListCard() {
  return (
    <div className={card}>
      <div className="border-b border-[var(--line)] p-4">
        <Bone className="h-4 w-36" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[var(--line)] p-4 last:border-b-0"
        >
          <Bone className="h-9 w-9 shrink-0 !rounded-xl" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3.5 w-3/4" />
            <Bone className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Same layout as the Dashboard: summary strip, three charts, three lists. */
function DashboardSkeleton({ bare }) {
  return (
    <div className="w-full space-y-3">
      {bare ? null : (
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-4 w-64" />
          <div className="flex gap-2">
            <Bone className="h-9 w-9 !rounded-xl" />
            <Bone className="h-9 w-28 !rounded-xl" />
            <Bone className="h-9 w-36 !rounded-xl" />
          </div>
        </div>
      )}
      <StatStrip />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard rows={3} />
        <ChartCard rows={5} />
        <ChartCard rows={2} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ListCard />
        <ListCard />
        <ListCard />
      </div>
    </div>
  );
}

/** Same layout as the list pages: filter bar, summary strip, then rows. */
function ListSkeleton() {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Bone className="h-4 w-72" />
        <div className="flex gap-2">
          <Bone className="h-9 w-24 !rounded-xl" />
          <Bone className="h-9 w-32 !rounded-xl" />
        </div>
      </div>
      <div className={`${card} p-3`}>
        <Bone className="h-10 w-full !rounded-xl" />
      </div>
      <StatStrip cells={4} />
      <div className={card}>
        <div className="border-b border-[var(--line)] p-3">
          <Bone className="h-3 w-full" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-[var(--line)] px-3 py-3.5 last:border-b-0"
          >
            <Bone className="h-3.5 w-10" />
            <Bone className="h-3.5 w-1/4" />
            <Bone className="h-3.5 flex-1" />
            <Bone className="hidden h-3.5 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** bare: the page already shows its own heading, so leave the heading row out. */
export default function PageSkeleton({ variant = "list", bare = false }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {variant === "dashboard" ? (
        <DashboardSkeleton bare={bare} />
      ) : (
        <ListSkeleton />
      )}
    </div>
  );
}

/** Suspense fallback: picks the layout that matches the page being opened. */
export function RouteSkeleton() {
  const { pathname } = useLocation();
  return (
    <PageSkeleton
      variant={pathname === "/app/dashboard" ? "dashboard" : "list"}
    />
  );
}
