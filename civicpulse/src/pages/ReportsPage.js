import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadReportCsv, getReport } from '../api/reports';
import AlertBanner from '../components/ui/AlertBanner';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnGhost, btnPrimary } from '../components/ui/Panel';

const TYPES = [
  { id: 'voters', label: 'Voters', hint: 'Full elector index' },
  { id: 'booths', label: 'Booths', hint: 'Coverage and agents' },
  { id: 'issues', label: 'Issues', hint: 'Civic tickets' },
  { id: 'outreach', label: 'Outreach', hint: 'Field activity' },
];

export default function ReportsPage() {
  const [busy, setBusy] = useState(null);
  const [last, setLast] = useState(null);
  const [error, setError] = useState('');

  async function onDownload(type) {
    setBusy(type);
    setError('');
    try {
      const data = await downloadReportCsv(type);
      setLast({ type, count: data.count });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function onCount(type) {
    setBusy(type);
    setError('');
    try {
      const data = await getReport(type);
      setLast({ type, count: data.count, preview: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Reports" description="Download CSV exports for meetings." />
      <AlertBanner tone="danger">{error}</AlertBanner>
      {last ? (
        <AlertBanner tone="success">
          {last.preview ? 'Counted' : 'Downloaded'} {last.type} · {last.count} rows
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {TYPES.map((t) => (
          <Panel key={t.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-bold text-[var(--ink)]">{t.label}</p>
              <p className="text-xs text-[var(--muted)]">{t.hint}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => onCount(t.id)}
                className={btnGhost}
              >
                Count
              </button>
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => onDownload(t.id)}
                className={btnPrimary}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CSV
              </button>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}
