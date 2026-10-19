import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import {
  getRollFiles,
  importVotersJson,
  retryRollFile,
  uploadRollPdf,
} from '../api/data';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FileDropzone from '../components/ui/FileDropzone';
import FilterBar, { FilterSearch, FilterSelect } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnGhost, inputClass } from '../components/ui/Panel';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

function fmtChars(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtEta(sec) {
  if (sec == null || Number.isNaN(sec)) return null;
  if (sec <= 0) return 'almost done';
  if (sec < 60) return `about ${sec}s left`;
  return `about ${Math.ceil(sec / 60)} min left`;
}

function stageLabel(stage) {
  const s = String(stage || '').toLowerCase();
  if (s === 'render') return 'Preparing';
  if (s === 'ocr' || s === 'reading') return 'Reading';
  if (s === 'queued') return 'Waiting';
  if (s === 'done') return 'Done';
  return stage ? String(stage) : 'Waiting';
}

function ProgressCell({ row }) {
  const done = Number(row.page_done) || 0;
  const total = Number(row.page_count) || 0;
  const running = ['queued', 'ocr'].includes(String(row.parse_status || '').toLowerCase());

  if (row.parse_status === 'ready' || row.parse_status === 'needs_import') {
    return (
      <div className="tabular-nums">
        <span className="font-semibold text-[var(--ink)]">{total || '—'}</span>
        <span className="text-[var(--muted)]"> pages</span>
      </div>
    );
  }

  if (!running) {
    return <span className="tabular-nums text-[var(--muted)]">{total || '—'}</span>;
  }

  const pct = total > 0 ? Math.min(100, Math.round((100 * done) / total)) : done > 0 ? 5 : 2;
  return (
    <div className="min-w-[7rem]">
      <div className="mb-1 flex justify-between gap-2 text-[11px] tabular-nums">
        <span className="font-semibold text-[var(--ink)]">
          {total > 0 ? `${done}/${total}` : done > 0 ? `${done}…` : 'starting'}
        </span>
        <span className="text-[var(--muted)]">{stageLabel(row.ocr_stage)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {fmtEta(row.ocr_eta_seconds) ? (
        <p className="mt-0.5 text-[10px] text-[var(--muted)]">{fmtEta(row.ocr_eta_seconds)}</p>
      ) : null}
    </div>
  );
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.match(/(".*?"|[^,]+)/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || '').replace(/^"|"$/g, '').trim();
    });
    return {
      epic: row.epic || null,
      name: row.name || row.elector_name || 'Unknown',
      age: row.age ? Number(row.age) : null,
      gender: row.gender || row.sex || null,
      house_no: row.house_no || row.house || null,
      serial_no: row.serial_no || row.slno ? Number(row.serial_no || row.slno) : null,
      status: row.status || 'active',
    };
  });
}

export default function DataPage() {
  const [uploading, setUploading] = useState(false);
  const [importPart, setImportPart] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(null);

  const { data: files, loading, error, reload } = useApi(getRollFiles, []);

  const inFlight = useMemo(
    () =>
      (files || []).some((f) =>
        ['queued', 'ocr', 'pending', 'processing'].includes(String(f.parse_status || '').toLowerCase())
      ),
    [files]
  );

  // Quiet background update — numbers change, page does not flash/reload
  useEffect(() => {
    if (!inFlight) return undefined;
    const t = setInterval(() => reload({ silent: true }), 3000);
    return () => clearInterval(t);
  }, [inFlight, reload]);

  useEffect(() => {
    if (!selected || !files) return;
    const fresh = files.find((f) => String(f.id) === String(selected.id));
    if (fresh) setSelected(fresh);
  }, [files, selected?.id]);

  const stats = useMemo(() => {
    const list = files || [];
    return {
      total: list.length,
      reading: list.filter((f) => ['queued', 'ocr'].includes(f.parse_status)).length,
      waiting: list.filter((f) => f.parse_status === 'needs_import').length,
      ready: list.filter((f) => f.parse_status === 'ready').length,
      voters: list.reduce((s, f) => s + (f.voter_count || 0), 0),
    };
  }, [files]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (files || []).filter((f) => {
      const matchQ =
        !q ||
        (f.filename || '').toLowerCase().includes(q) ||
        String(f.part_no || '').includes(q);
      return matchQ && (statusFilter === 'all' || f.parse_status === statusFilter);
    });
  }, [files, query, statusFilter]);

  const pager = usePagination(filtered, pageSize);

  const onUploadPdf = useCallback(
    async (list) => {
      const file = list?.[0];
      if (!file) return;
      setUploading(true);
      setMessage('');
      try {
        const result = await uploadRollPdf(file);
        setMessage(`Part ${result.part_no ?? '?'} uploaded. Reading will start shortly.`);
        setTimeout(() => reload({ silent: true }), 800);
      } catch (err) {
        setMessage(err.message);
      } finally {
        setUploading(false);
      }
    },
    [reload]
  );

  const onImportCsv = useCallback(
    async (list) => {
      const file = list?.[0];
      if (!file) return;
      if (!importPart) {
        setMessage('Enter a part number first.');
        return;
      }
      setUploading(true);
      setMessage('');
      try {
        const voters = parseCsv(await file.text()).filter((v) => v.name !== 'Unknown');
        if (!voters.length) throw new Error('No valid rows in this CSV');
        const result = await importVotersJson(Number(importPart), voters);
        setMessage(`${result.imported} voters added for part ${result.part_no}.`);
        reload({ silent: true });
      } catch (err) {
        setMessage(err.message);
      } finally {
        setUploading(false);
      }
    },
    [importPart, reload]
  );

  const onRetry = useCallback(
    async (id) => {
      setBusyId(id);
      try {
        await retryRollFile(id);
        setMessage('Reading started again for this file.');
        setTimeout(() => reload({ silent: true }), 800);
      } catch (err) {
        setMessage(err.message);
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  const columns = useMemo(
    () => [
      {
        key: 'part_no',
        header: 'Part',
        accessor: 'part_no',
        className: 'font-bold tabular-nums',
        width: '3.5rem',
        truncate: false,
      },
      {
        key: 'file',
        header: 'File',
        truncate: false,
        cell: (r) => (
          <button
            type="button"
            className="min-w-0 max-w-[22rem] text-left"
            title={r.filename}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(r);
            }}
          >
            <p className="break-all text-[12px] font-semibold leading-snug text-[var(--ink)] hover:underline">
              {r.filename}
            </p>
          </button>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (r) => (
          <div className="space-y-1">
            <StatusBadge tone={toneForStatus(r.parse_status)}>
              {labelForStatus(r.parse_status)}
            </StatusBadge>
            {r.error_message ? (
              <p className="max-w-[10rem] text-[10px] text-red-600" title={r.error_message}>
                {r.error_message}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'progress',
        header: 'Progress',
        truncate: false,
        cell: (r) => <ProgressCell row={r} />,
      },
      {
        key: 'chars',
        header: 'Text',
        accessor: (r) => fmtChars(r.text_length),
        align: 'right',
        className: 'tabular-nums',
        width: '4.5rem',
        truncate: false,
      },
      {
        key: 'voters',
        header: 'Voters',
        accessor: (r) => r.voter_count ?? 0,
        align: 'right',
        className: 'tabular-nums font-semibold',
        width: '5rem',
        truncate: false,
      },
      {
        key: 'actions',
        header: '',
        truncate: false,
        align: 'right',
        cell: (file) => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)]"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(file);
              }}
            >
              Details
            </button>
            {file.parse_status === 'needs_import' && file.part_no ? (
              <button
                type="button"
                className="rounded-md bg-[var(--brand)] px-2 py-1 text-[11px] font-semibold text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setImportPart(String(file.part_no));
                  setMessage(`Part ${file.part_no} ready for CSV.`);
                }}
              >
                CSV
              </button>
            ) : null}
            <button
              type="button"
              disabled={busyId === file.id}
              className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(file.id);
              }}
            >
              Retry
            </button>
          </div>
        ),
      },
    ],
    [busyId, onRetry]
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Import"
        title="Data"
        description="Upload voter roll PDFs. Progress updates quietly while each file is read."
        actions={
          <>
            <a href="/templates/voters-import-template.csv" download className={btnGhost}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Template
            </a>
            <button type="button" onClick={() => reload()} className={btnGhost}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Files', stats.total],
          ['Reading', stats.reading],
          ['Needs CSV', stats.waiting],
          ['Ready', stats.ready],
          ['Voters', stats.voters],
        ].map(([label, value]) => (
          <Panel key={label} className="px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-[var(--ink)]">{value}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <FileDropzone
          accept="application/pdf,.pdf"
          busy={uploading}
          onFiles={onUploadPdf}
          title="Drop PDF here"
          hint="We read the pages and fill voter details"
        />
        <Panel className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--ink)]">CSV import</p>
            <input
              type="number"
              min={1}
              max={247}
              value={importPart}
              onChange={(e) => setImportPart(e.target.value)}
              placeholder="Part #"
              className={`${inputClass} !w-24`}
            />
          </div>
          <FileDropzone
            accept=".csv,text/csv"
            icon="csv"
            busy={uploading}
            onFiles={onImportCsv}
            title={importPart ? `CSV for part ${importPart}` : 'Set part, then drop CSV'}
            hint="epic, name, age, gender, house_no"
          />
        </Panel>
      </div>

      <AlertBanner tone="info">{message}</AlertBanner>
      <AlertBanner tone="danger">{error}</AlertBanner>

      <div className="grid gap-3 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
        <div className="min-w-0 space-y-3">
          <FilterBar>
            <FilterSearch value={query} onChange={setQuery} placeholder="Find part or file…" />
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'queued', label: 'Waiting' },
                { value: 'ocr', label: 'Reading' },
                { value: 'needs_import', label: 'Needs CSV' },
                { value: 'ready', label: 'Ready' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </FilterBar>

          <DataTable
            columns={columns}
            rows={pager.rows}
            rowKey="id"
            loading={loading && !files}
            emptyTitle="No files yet"
            emptyDescription="Drop a voter roll PDF above to get started."
            pagination={{
              page: pager.page,
              pageCount: pager.pageCount,
              from: pager.from,
              to: pager.to,
              total: pager.total,
              pageSize,
              onPageSizeChange: setPageSize,
              onPageChange: pager.setPage,
            }}
          />
        </div>

        <Panel className="h-fit p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">File details</p>
          {!selected ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Select a file to see more details.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Part</dt>
                <dd className="font-semibold tabular-nums">{selected.part_no ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Status</dt>
                <dd>
                  <StatusBadge tone={toneForStatus(selected.parse_status)}>
                    {labelForStatus(selected.parse_status)}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Pages</dt>
                <dd className="tabular-nums">
                  {selected.page_done != null && selected.parse_status === 'ocr'
                    ? `${selected.page_done} of ${selected.page_count || '?'}`
                    : selected.page_count || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Text read</dt>
                <dd className="tabular-nums font-semibold">
                  {selected.text_length != null ? selected.text_length.toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Voters</dt>
                <dd className="tabular-nums font-semibold">{selected.voter_count ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Time</dt>
                <dd className="tabular-nums">
                  {selected.duration_ms != null
                    ? `${Math.round(selected.duration_ms / 1000)}s`
                    : fmtEta(selected.ocr_eta_seconds) || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Saved</dt>
                <dd className="text-[13px]">
                  {selected.extracted_at
                    ? new Date(selected.extracted_at).toLocaleString()
                    : 'Not yet'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">File</dt>
                <dd className="break-all text-[12px] text-[var(--muted)]">{selected.filename}</dd>
              </div>
              {selected.error_message ? (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-red-600">Problem</dt>
                  <dd className="text-[12px] text-red-700">{selected.error_message}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </Panel>
      </div>
    </section>
  );
}
