import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Handshake, MapPin, MessageSquareWarning, RefreshCw, Search, UserX } from 'lucide-react';
import { getDashboardSummary } from '../api/dashboard';
import { getVoterStats } from '../api/voters';
import { useAuth } from '../auth/AuthContext';
import AlertBanner from '../components/ui/AlertBanner';
import PageSkeleton from "../components/ui/PageSkeleton";
import PageHeader from '../components/ui/PageHeader';
import { Pill, StatStrip, btnTool, btnToolPrimary } from '../components/ui/kit';
import { AgePyramid, ChartCard, GenderDonut } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { REACH_STEPS, reachStep, reachedPct, stationName } from '../utils/boothFormat';
import { fmt, niceName } from '../utils/voterFormat';

const TYPE_LABEL = { door: 'Visit', phone: 'Call', whatsapp: 'WhatsApp', sms: 'SMS', event: 'Event', other: 'Other' };
const URGENCY_COLOR = { Critical: 'var(--viz-crit)', High: 'var(--viz-serious)', Medium: 'var(--viz-active)', Low: 'var(--viz-unknown)' };

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <h2 className="text-sm font-bold text-[var(--ink)]">{title}</h2>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

const seeAll = (to, label = 'See all') => (
  <Link to={to} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-[var(--brand)] hover:underline">
    {label}
    <ArrowRight className="h-3 w-3" />
  </Link>
);

export default function DashboardPage() {
  const { roleLabel } = useAuth();
  const navigate = useNavigate();
  const summary = useApi(getDashboardSummary, []);
  const voters = useApi(() => getVoterStats({}), []);

  const t = summary.data?.totals;
  const booths = summary.data?.booths || [];
  const stats = voters.data;

  const refresh = () => {
    summary.reload({ silent: true });
    voters.reload({ silent: true });
  };

  // Things that need someone's attention, each one linking to the place that fixes it.
  const attention = t
    ? [
        t.booths_without_agent > 0 && { icon: Building2, text: `${fmt(t.booths_without_agent)} ${t.booths_without_agent === 1 ? 'booth has' : 'booths have'} no booth agent`, to: '/app/booths?assign=unassigned', action: 'Assign' },
        t.issues_open > 0 && { icon: MessageSquareWarning, text: `${fmt(t.issues_open)} open ${t.issues_open === 1 ? 'issue' : 'issues'}${t.issues_urgent ? `, ${fmt(t.issues_urgent)} urgent` : ''}`, to: '/app/issues?status=open', action: 'Review' },
        t.voters - t.reached > 0 && { icon: Handshake, text: `${fmt(t.voters - t.reached)} voters have not been reached yet`, to: '/app/outreach', action: 'Log contacts' },
        stats?.needs_check > 0 && { icon: UserX, text: `${fmt(stats.needs_check)} voters have a detail that could not be read`, to: '/app/voters?missing=any', action: 'Check' },
        booths.length > 0 && { icon: MapPin, text: 'Booth locations are needed to show the map', to: '/app/map', action: 'Open map', hide: booths.every((b) => b.lat != null) },
      ].filter((x) => x && !x.hide)
    : [];

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description={`Hello, ${roleLabel || 'there'}. Here is where the campaign stands today.`}
        actions={
          <>
            <button type="button" onClick={refresh} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <Link to="/app/voters" className={btnTool}>
              <Search className="h-3.5 w-3.5" />
              Find a voter
            </Link>
            <Link to="/app/data" className={btnToolPrimary}>
              Upload voter list
            </Link>
          </>
        }
      />

      <AlertBanner tone="danger">{summary.error || voters.error}</AlertBanner>

      {summary.loading && !summary.data ? (
        <PageSkeleton variant="dashboard" bare />
      ) : t ? (
        <>
          <StatStrip
            items={[
              { label: 'Booths', value: fmt(t.booths), hint: `${fmt(t.booths_complete)} complete` },
              { label: 'Voters', value: fmt(t.voters), hint: `${fmt(t.households)} households` },
              {
                label: 'Voters reached',
                value: `${t.reach_pct}%`,
                children: (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--viz-track)]" role="img" aria-label={`${t.reach_pct}% reached`}>
                    <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${t.reach_pct}%` }} />
                  </div>
                ),
              },
              { label: 'Contacts today', value: fmt(t.outreach_today), hint: `${fmt(t.outreach_week)} this week` },
              { label: 'Open issues', value: fmt(t.issues_open), hint: t.issues_urgent ? `${fmt(t.issues_urgent)} urgent` : 'none urgent' },
            ]}
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard center title="Men and women" subtitle="Click a group to see those voters">
              <GenderDonut genders={stats?.genders || []} active={null} onPick={(v) => v !== 'all' && navigate(`/app/voters?gender=${v}`)} />
            </ChartCard>

            <ChartCard center title="Age groups" subtitle="Click an age group to see those voters">
              <AgePyramid bands={stats?.age_bands || []} active={null} onPick={(v) => v !== 'all' && navigate(`/app/voters?age=${encodeURIComponent(v)}`)} />
            </ChartCard>

            <ChartCard className="md:col-span-2 xl:col-span-1" title="Booths at a glance" subtitle="Each square is a booth. Darker means more voters reached." action={seeAll('/app/booths', 'Open booths')}>
              {booths.length ? (
                <>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(1.6rem,1fr))] gap-1">
                    {booths.map((b) => (
                      <Link
                        key={b.part_no}
                        to={`/app/booths?q=${b.part_no}`}
                        title={`Booth ${b.part_no} · ${stationName(b.polling_station_name, b.part_no)} · ${reachedPct(b)}% reached`}
                        className="flex aspect-square items-center justify-center rounded-md text-[9px] font-bold ring-1 ring-inset ring-[var(--line)] transition hover:scale-110 hover:ring-2 hover:ring-[var(--brand)]"
                        style={{ background: reachStep(reachedPct(b)).color, color: reachedPct(b) >= 25 ? '#fff' : 'var(--ink-soft)' }}
                      >
                        {b.part_no}
                      </Link>
                    ))}
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                    {REACH_STEPS.map((s) => (
                      <li key={s.label} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-[var(--line)]" style={{ background: s.color }} />
                        {s.label}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--muted)]">Booths appear once a voter list is uploaded.</p>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Panel title="What needs attention">
              {attention.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {attention.map(({ icon: ItemIcon, text, to, action }) => (
                    <li key={to}>
                      <Link to={to} className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-[var(--bg-muted)]">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--brand)]">
                          <ItemIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-[var(--ink)]">{text}</span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-[var(--brand)]">
                          {action}
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-[var(--ink-soft)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" />
                  Nothing needs attention right now.
                </p>
              )}
            </Panel>

            <Panel title="Recent contacts" action={seeAll('/app/outreach')}>
              {summary.data.recent_outreach.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {summary.data.recent_outreach.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-[var(--ink)]">{niceName(o.voter_name)}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {TYPE_LABEL[o.type] || o.type}
                          {o.outcome ? ` · ${o.outcome}` : ''} · Booth {o.part_no}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-xs text-[var(--muted)]">{timeAgo(o.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-sm text-[var(--muted)]">
                  No contacts yet. <Link to="/app/outreach" className="font-semibold text-[var(--brand)] hover:underline">Log the first one</Link>.
                </p>
              )}
            </Panel>

            <Panel title="Recent issues" action={seeAll('/app/issues')}>
              {summary.data.recent_issues.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {summary.data.recent_issues.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-[var(--ink)]">{i.title}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {i.partNo ? `Booth ${i.partNo} · ` : ''}
                          {i.status === 'In_progress' ? 'In progress' : i.status}
                        </span>
                      </span>
                      <Pill color={URGENCY_COLOR[i.priority]}>{i.priority}</Pill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-sm text-[var(--muted)]">
                  No issues reported. <Link to="/app/issues" className="font-semibold text-[var(--brand)] hover:underline">Report one</Link>.
                </p>
              )}
            </Panel>
          </div>
        </>
      ) : null}
    </section>
  );
}
