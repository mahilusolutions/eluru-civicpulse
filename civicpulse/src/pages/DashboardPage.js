import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardSummary } from '../api/dashboard';
import { useAuth } from '../auth/AuthContext';
import AlertBanner from '../components/ui/AlertBanner';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import ProgressBar from '../components/ui/ProgressBar';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';
import { btnGhost } from '../components/ui/Panel';

export default function DashboardPage() {
  const { roleLabel } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingBlock label="Loading dashboard…" />;

  const stats = data?.stats || [];
  const topBooths = data?.topBooths || [];
  const recentIssues = data?.recentIssues || [];

  return (
    <section className="space-y-5">
      <PageHeader
        title={`Hello, ${roleLabel}`}
        description="Eluru campaign overview — booths, voters, and open issues."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/app/voters" className={btnGhost}>
              Voters
            </Link>
            <Link to="/app/booths" className={btnGhost}>
              Booths
            </Link>
            <Link to="/app/data" className={btnGhost}>
              Data
            </Link>
          </div>
        }
      />

      <AlertBanner tone="danger">{error}</AlertBanner>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Panel key={stat.label} className="p-4">
            <p className="text-xs font-medium text-[var(--muted)]">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--ink)]">Top booths</h3>
            <Link to="/app/booths" className="text-xs font-semibold text-[var(--brand)]">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)] px-4">
            {topBooths.length === 0 ? (
              <li className="py-6 text-sm text-[var(--muted)]">No booth data yet.</li>
            ) : (
              topBooths.slice(0, 6).map((row) => (
                <li key={row.part_no} className="py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <p className="min-w-0 truncate font-semibold text-[var(--ink)]">
                      Part {row.part_no}
                      <span className="font-normal text-[var(--muted)]">
                        {' '}
                        · {row.area_name || 'Eluru'}
                      </span>
                    </p>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {row.voter_count || 0} voters
                    </span>
                  </div>
                  <ProgressBar value={row.coverage_pct || 0} />
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--ink)]">Recent issues</h3>
            <Link to="/app/issues" className="text-xs font-semibold text-[var(--brand)]">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)] px-4">
            {recentIssues.length === 0 ? (
              <li className="py-6 text-sm text-[var(--muted)]">No issues yet.</li>
            ) : (
              recentIssues.slice(0, 6).map((issue) => (
                <li key={issue.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">
                      {issue.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      #{issue.id}
                      {issue.part_no ? ` · Part ${issue.part_no}` : ''}
                    </p>
                  </div>
                  <StatusBadge tone={toneForStatus(issue.status)}>
                    {labelForStatus(issue.status)}
                  </StatusBadge>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
