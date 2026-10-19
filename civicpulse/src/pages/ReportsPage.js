import { useState } from 'react';
import { Building2, ClipboardList, Download, Handshake, Home, MessageSquareWarning, RefreshCw, Search, Users } from 'lucide-react';
import { downloadReportCsv, getReportsSummary } from '../api/reports';
import AlertBanner from '../components/ui/AlertBanner';
import PageHeader from '../components/ui/PageHeader';
import { btnTool } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { fmt } from '../utils/voterFormat';

const REPORTS = [
  { id: 'voters', label: 'Voters', icon: Search, unit: 'voters', one: 'voter', text: 'Every voter with name, relative, voter ID, age, gender, house number, road and status.' },
  { id: 'booths', label: 'Booths', icon: Building2, unit: 'booths', one: 'booth', text: 'Each polling station with its address, voters, agent, coordinator and how many voters were reached.' },
  { id: 'households', label: 'Households', icon: Home, unit: 'homes', one: 'home', text: 'Every home with the number of people living there and the eldest member, for planning visits.' },
  { id: 'outreach', label: 'Contacts', icon: Handshake, unit: 'contacts', one: 'contact', text: 'Every visit, call and message logged with a voter, with the result and who logged it.' },
  { id: 'issues', label: 'Issues', icon: MessageSquareWarning, unit: 'issues', one: 'issue', text: 'Local problems reported from the field with urgency, progress and the booth they belong to.' },
  { id: 'team', label: 'Team', icon: Users, unit: 'people', one: 'person', text: 'Coordinators, booth agents and volunteers with phone numbers and the booths they look after.' },
];
const COUNT_KEY = { voters: 'voters', booths: 'booths', households: 'households', outreach: 'outreach', issues: 'issues', team: 'team' };

export default function ReportsPage() {
  const { data: counts, loading, error, reload } = useApi(getReportsSummary, []);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState({});
  const [failure, setFailure] = useState('');

  async function download(type) {
    setBusy(type);
    setFailure('');
    try {
      const result = await downloadReportCsv(type);
      setDone((d) => ({ ...d, [type]: result.count }));
    } catch (err) {
      setFailure(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Download a spreadsheet for a meeting or to share. Files open in Excel or Google Sheets."
        actions={
          <button type="button" onClick={() => reload({ silent: true })} className={btnTool} aria-label="Refresh counts">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      />

      <AlertBanner tone="danger">{error || failure}</AlertBanner>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(({ id, label, icon: ReportIcon, unit, one, text }) => {
          const count = counts?.[COUNT_KEY[id]];
          return (
            <article key={id} className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)]">
                  <ReportIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-[var(--ink)]">{label}</h2>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">{loading && !counts ? 'Counting…' : `${fmt(count)} ${count === 1 ? one : unit}`}</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--ink-soft)]">{text}</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => download(id)}
                  disabled={busy === id || count === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {busy === id ? 'Preparing…' : 'Download spreadsheet'}
                </button>
                {done[id] != null ? <span className="text-xs text-[var(--ok)]">Downloaded {fmt(done[id])} rows</span> : count === 0 ? <span className="text-xs text-[var(--muted)]">Nothing to download yet</span> : null}
              </div>
            </article>
          );
        })}
      </div>

      <p className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
        <ClipboardList className="h-3.5 w-3.5" />
        Need only some voters? Use “Download list” on the Voters page: it saves exactly what you have filtered.
      </p>
    </section>
  );
}
