import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Database,
  Handshake,
  MapPinned,
  MessageSquareWarning,
} from 'lucide-react';
import { getDashboardSummary } from '../api/dashboard';
import { useAuth } from '../auth/AuthContext';
import AlertBanner from '../components/ui/AlertBanner';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnGhost, btnPrimary } from '../components/ui/Panel';
import ProgressBar from '../components/ui/ProgressBar';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';

const NEXT_STEPS = [
  {
    title: 'Upload more roll PDFs',
    body: 'Only a few parts are loaded. Add PDFs so every booth has voters.',
    to: '/app/data',
    icon: Database,
    label: 'Go to Data',
  },
  {
    title: 'Log outreach visits',
    body: 'Record door visits and calls so coverage moves above 0%.',
    to: '/app/outreach',
    icon: Handshake,
    label: 'Log outreach',
  },
  {
    title: 'Raise civic issues',
    body: 'Track ward problems and follow them to resolution.',
    to: '/app/issues',
    icon: MessageSquareWarning,
    label: 'Open issues',
  },
];

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
  const topBooths = data?.topBooths || data?.top_booths || [];
  const recentIssues = data?.recentIssues || data?.recent_issues || [];
  const showNext = recentIssues.length === 0 || topBooths.every((b) => !(b.coverage_pct > 0));

  return (
    <section className="space-y-6">
      <PageHeader
        description={`Hello, ${roleLabel} — booths, voters, and what needs attention today.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/app/voters" className={btnGhost}>
              Voters
            </Link>
            <Link to="/app/data" className={btnPrimary}>
              Upload data
            </Link>
          </div>
        }
      />

      <AlertBanner tone="danger">{error}</AlertBanner>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, i) => (
          <Panel
            key={stat.label}
            className="relative overflow-hidden p-4 transition hover:-translate-y-0.5"
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20"
              style={{
                background:
                  i % 2 === 0
                    ? 'radial-gradient(circle, var(--brand), transparent 70%)'
                    : 'radial-gradient(circle, var(--accent), transparent 70%)',
              }}
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Panel>
        ))}
      </div>

      {showNext ? (
        <div className="grid gap-3 md:grid-cols-3">
          {NEXT_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Panel key={step.title} className="flex flex-col p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="text-sm font-bold text-[var(--ink)]">{step.title}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
                <Link
                  to={step.to}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]"
                >
                  {step.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Panel>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-[var(--brand)]" />
              <h3 className="text-sm font-bold text-[var(--ink)]">Top booths</h3>
            </div>
            <Link to="/app/booths" className="text-xs font-semibold text-[var(--brand)]">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)] px-4">
            {topBooths.length === 0 ? (
              <li className="py-8 text-center text-sm text-[var(--muted)]">
                No booths yet. Upload a roll PDF from Data.
              </li>
            ) : (
              topBooths.slice(0, 6).map((row) => (
                <li key={row.part_no} className="py-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <p className="min-w-0 truncate font-semibold text-[var(--ink)]">
                      Part {row.part_no}
                      <span className="font-normal text-[var(--muted)]">
                        {' '}
                        · {row.area_name || 'Eluru'}
                      </span>
                    </p>
                    <span className="shrink-0 text-xs font-medium text-[var(--muted)]">
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
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4 text-[var(--brand)]" />
              <h3 className="text-sm font-bold text-[var(--ink)]">Recent issues</h3>
            </div>
            <Link to="/app/issues" className="text-xs font-semibold text-[var(--brand)]">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)] px-4">
            {recentIssues.length === 0 ? (
              <li className="py-8 text-center text-sm text-[var(--muted)]">
                No issues logged yet.{' '}
                <Link to="/app/issues" className="font-semibold text-[var(--brand)]">
                  Add one
                </Link>
              </li>
            ) : (
              recentIssues.slice(0, 6).map((issue) => (
                <li key={issue.id} className="flex items-start justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{issue.title}</p>
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
