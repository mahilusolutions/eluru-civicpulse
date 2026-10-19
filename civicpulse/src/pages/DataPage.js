import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCw } from 'lucide-react';
import { getRollFiles, importVotersJson, retryRollFile, uploadRollPdf } from '../api/data';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmButton from '../components/ui/ConfirmButton';
import DataList, { CardShell } from '../components/ui/DataList';
import FileDropzone from '../components/ui/FileDropzone';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { DetailRow, FilterField, FilterPanel, MiniFact, Pill, StatStrip, btnTool, inputSm, useViewMode, ViewSwitch } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { fmt } from '../utils/voterFormat';

const STATUS = {
  queued: { label: 'Waiting', color: 'var(--viz-neutral)' },
  ocr: { label: 'Reading', color: 'var(--viz-active)' },
  ready: { label: 'Ready', color: 'var(--viz-good)' },
  needs_import: { label: 'Needs spreadsheet', color: 'var(--viz-warn)' },
  failed: { label: 'Failed', color: 'var(--viz-crit)' },
};
const statusOf = (s) => STATUS[String(s || '').toLowerCase()] || { label: String(s || '—'), color: 'var(--viz-unknown)' };
const RUNNING = ['queued', 'ocr', 'pending', 'processing'];

function stageLabel(stage) {
  const s = String(stage || '').toLowerCase();
  if (s === 'render') return 'Preparing';
  if (s === 'ocr' || s === 'reading') return 'Reading';
  if (s === 'done') return 'Done';
  return 'Waiting';
}

function etaLabel(sec) {
  if (sec == null || Number.isNaN(sec)) return null;
  if (sec <= 0) return 'almost done';
  if (sec < 60) return `about ${sec}s left`;
  return `about ${Math.ceil(sec / 60)} min left`;
}

/** Header names in a spreadsheet can be written many ways: "Voter ID", "voter_id", "EPIC"… */
const norm = (h) => String(h).trim().toLowerCase().replace(/^"|"$/g, '').replace(/[\s-]+/g, '_');

function parseSpreadsheet(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(norm);
  return lines.slice(1).map((line) => {
    const cols = line.match(/(".*?"|[^,]+)/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || '').replace(/^"|"$/g, '').trim();
    });
    return {
      epic: row.epic || row.voter_id || row.voterid || null,
      name: row.name || row.elector_name || row.voter_name || 'Unknown',
      age: row.age ? Number(row.age) : null,
      gender: row.gender || row.sex || null,
      house_no: row.house_no || row.house || row.house_number || null,
      serial_no: row.serial_no || row.slno || row.serial ? Number(row.serial_no || row.slno || row.serial) : null,
      status: row.status || 'active',
    };
  });
}

function Progress({ row }) {
  const done = Number(row.page_done) || 0;
  const total = Number(row.page_count) || 0;
  const state = String(row.parse_status || '').toLowerCase();
  if (state === 'ready' || state === 'needs_import') {
    return (
      <span className="whitespace-nowrap tabular-nums">
        <span className="font-semibold text-[var(--ink)]">{total || '—'}</span> <span className="text-[var(--muted)]">pages</span>
      </span>
    );
  }
  if (!RUNNING.includes(state)) return <span className="text-[var(--muted)]">—</span>;
  const pct = total > 0 ? Math.min(100, Math.round((100 * done) / total)) : done > 0 ? 5 : 2;
  return (
    <div className="min-w-[8rem]">
      <div className="mb-1 flex justify-between gap-2 text-[11px] tabular-nums">
        <span className="font-semibold text-[var(--ink)]">{total > 0 ? `${done}/${total}` : done > 0 ? `${done}…` : 'starting'}</span>
        <span className="text-[var(--muted)]">{stageLabel(row.ocr_stage)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {etaLabel(row.ocr_eta_seconds) ? <p className="mt-0.5 text-[10px] text-[var(--muted)]">{etaLabel(row.ocr_eta_seconds)}</p> : null}
    </div>
  );
}

function FileModal({ file, onClose }) {
  const state = statusOf(file.parse_status);
  return (
    <Modal title={`Booth ${file.part_no ?? '—'} · voter list`} subtitle={<Pill color={state.color}>{state.label}</Pill>} badge={file.part_no ?? '—'} size="md" onClose={onClose}>
      {file.error_message ? <AlertBanner tone="danger" className="mb-3">{file.error_message}</AlertBanner> : null}
      <dl>
        <DetailRow label="Pages">{file.page_count ? String(file.page_count) : null}</DetailRow>
        <DetailRow label="Voters read">{file.voter_count != null ? fmt(file.voter_count) : null}</DetailRow>
        <DetailRow label="Time taken">{file.duration_ms != null ? `${Math.round(file.duration_ms / 1000)} seconds` : etaLabel(file.ocr_eta_seconds)}</DetailRow>
        <DetailRow label="Saved">{file.extracted_at ? new Date(file.extracted_at).toLocaleString() : 'Not yet'}</DetailRow>
        <DetailRow label="File name">{file.filename}</DetailRow>
      </dl>
    </Modal>
  );
}

export default function DataPage() {
  const { data: files, loading, error, reload } = useApi(getRollFiles, []);
  const list = useMemo(() => files || [], [files]);

  const [uploading, setUploading] = useState(false);
  const [importPart, setImportPart] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useViewMode('civicpulse_data_view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(null);

  const inFlight = list.some((f) => RUNNING.includes(String(f.parse_status || '').toLowerCase()));

  // Quiet background update while a file is being read: numbers change, the page does not flash.
  useEffect(() => {
    if (!inFlight) return undefined;
    const t = setInterval(() => reload({ silent: true }), 3000);
    return () => clearInterval(t);
  }, [inFlight, reload]);

  useEffect(() => setPage(1), [query, statusFilter, pageSize]);

  const stats = useMemo(
    () => ({
      total: list.length,
      reading: list.filter((f) => ['queued', 'ocr'].includes(f.parse_status)).length,
      waiting: list.filter((f) => f.parse_status === 'needs_import').length,
      ready: list.filter((f) => f.parse_status === 'ready').length,
      voters: list.reduce((s, f) => s + (f.voter_count || 0), 0),
    }),
    [list]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((f) => (!q || (f.filename || '').toLowerCase().includes(q) || String(f.part_no || '') === q) && (statusFilter === 'all' || f.parse_status === statusFilter));
  }, [list, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: filtered.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, filtered.length), total: filtered.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const onUploadPdf = useCallback(
    async (picked) => {
      const file = picked?.[0];
      if (!file) return;
      setUploading(true);
      setMessage('');
      try {
        const result = await uploadRollPdf(file);
        setMessage(`Booth ${result.part_no ?? '?'} uploaded. Reading will start shortly.`);
        setTimeout(() => reload({ silent: true }), 800);
      } catch (err) {
        setMessage(err.message);
      } finally {
        setUploading(false);
      }
    },
    [reload]
  );

  const onImportSheet = useCallback(
    async (picked) => {
      const file = picked?.[0];
      if (!file) return;
      if (!importPart) {
        setMessage('Enter the booth number first.');
        return;
      }
      setUploading(true);
      setMessage('');
      try {
        const voters = parseSpreadsheet(await file.text()).filter((v) => v.name !== 'Unknown');
        if (!voters.length) throw new Error('No voters found in this spreadsheet');
        const result = await importVotersJson(Number(importPart), voters);
        setMessage(`${fmt(result.imported)} voters added to booth ${result.part_no}.`);
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

  /** Finished files ask first: reading again replaces the voters of that booth. */
  const retryControl = (f) =>
    f.parse_status === 'ready' ? (
      <ConfirmButton label="Read again" confirmLabel="Yes, replace voters" onConfirm={() => onRetry(f.id)} disabled={busyId === f.id} />
    ) : RUNNING.includes(String(f.parse_status)) ? null : (
      <button type="button" disabled={busyId === f.id} onClick={() => onRetry(f.id)} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] transition hover:text-[var(--brand)] disabled:opacity-50">
        Retry
      </button>
    );

  const columns = useMemo(
    () => [
      { key: 'part_no', header: 'Booth', accessor: 'part_no', align: 'center', className: 'font-bold tabular-nums', width: '4.5rem', sticky: 'left', stickyOffset: 0 },
      { key: 'file', header: 'File', truncate: false, cell: (f) => <span className="inline-block max-w-[24rem] truncate align-middle font-semibold text-[var(--ink)]" title={f.filename}>{f.filename}</span> },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (f) => (
          <div className="space-y-1">
            <Pill color={statusOf(f.parse_status).color}>{statusOf(f.parse_status).label}</Pill>
            {f.error_message ? <p className="max-w-[12rem] truncate text-[10px] text-[var(--danger)]" title={f.error_message}>{f.error_message}</p> : null}
          </div>
        ),
        width: '9.5rem',
      },
      { key: 'progress', header: 'Progress', truncate: false, cell: (f) => <Progress row={f} />, width: '9rem' },
      { key: 'voters', header: 'Voters', accessor: (f) => fmt(f.voter_count ?? 0), align: 'right', className: 'tabular-nums font-semibold', width: '5rem' },
      {
        key: 'actions',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '12rem',
        cell: (f) => (
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={() => setSelected(f)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
              <Eye className="h-3.5 w-3.5" />
              View
            </button>
            {f.parse_status === 'needs_import' && f.part_no ? (
              <button type="button" onClick={() => { setImportPart(String(f.part_no)); setMessage(`Booth ${f.part_no} is ready for a spreadsheet. Drop it in the box above.`); }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] hover:underline">
                Add voters
              </button>
            ) : (
              retryControl(f)
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId]
  );

  const renderCard = (f) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">{f.part_no ?? '—'}</span>
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-bold leading-snug text-[var(--ink)]">{f.filename}</p>
          <div className="mt-1.5">
            <Pill color={statusOf(f.parse_status).color}>{statusOf(f.parse_status).label}</Pill>
          </div>
        </div>
        <button type="button" onClick={() => setSelected(f)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
          <Eye className="h-3.5 w-3.5" />
          View
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Progress"><Progress row={f} /></MiniFact>
        <MiniFact label="Voters">{fmt(f.voter_count ?? 0)}</MiniFact>
      </dl>
      {f.error_message ? <p className="mt-2 text-xs text-[var(--danger)]">{f.error_message}</p> : null}
      <div className="mt-2 flex justify-end">{f.parse_status === 'needs_import' ? null : retryControl(f)}</div>
    </CardShell>
  );

  const chips = [
    query && { key: 'q', label: `“${query}”`, onRemove: () => setQuery('') },
    statusFilter !== 'all' && { key: 's', label: statusOf(statusFilter).label, onRemove: () => setStatusFilter('all') },
  ].filter(Boolean);

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Upload each booth's voter list PDF. Progress updates quietly while a file is being read."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <a href="/templates/voters-import-template.csv" download className={btnTool}>
              <Download className="h-3.5 w-3.5" />
              Spreadsheet template
            </a>
            <button type="button" onClick={() => reload()} className={btnTool}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </>
        }
      />

      <StatStrip
        items={[
          { label: 'Files', value: fmt(stats.total), hint: 'voter lists uploaded' },
          { label: 'Being read', value: fmt(stats.reading), hint: stats.reading ? 'updating every few seconds' : 'nothing in progress' },
          { label: 'Needs spreadsheet', value: fmt(stats.waiting), hint: 'could not be read fully' },
          { label: 'Ready', value: fmt(stats.ready), hint: 'ready to use' },
          { label: 'Voters', value: fmt(stats.voters), hint: 'across all files' },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <FileDropzone accept="application/pdf,.pdf" busy={uploading} onFiles={onUploadPdf} title="Drop a voter list PDF here" hint="We read every page and fill in the voter details" />
        <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[var(--ink)]">Add voters from a spreadsheet</p>
            <input type="number" min={1} max={247} value={importPart} onChange={(e) => setImportPart(e.target.value)} placeholder="Booth no." aria-label="Booth number" className={`${inputSm} !w-28`} />
          </div>
          <FileDropzone accept=".csv,text/csv" icon="csv" busy={uploading} onFiles={onImportSheet} title={importPart ? `Spreadsheet for booth ${importPart}` : 'Enter the booth number, then drop the spreadsheet'} hint="Columns: voter ID, name, age, gender, house number" />
        </div>
      </div>

      <AlertBanner tone="info">{message}</AlertBanner>
      <AlertBanner tone="danger">{error}</AlertBanner>

      <FilterPanel search={query} onSearch={setQuery} placeholder="Search booth number or file name…" chips={chips} onClearAll={() => { setQuery(''); setStatusFilter('all'); }} cols="md:grid-cols-4">
        <FilterField label="Status" className="col-span-2 md:col-span-1">
          <FilterSelect label="Status" className="w-full" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All files' }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
        </FilterField>
      </FilterPanel>

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="id"
        renderCard={renderCard}
        loading={loading && !files}
        pagination={paging}
        emptyTitle={chips.length ? 'No files match these filters' : 'No voter lists yet'}
        emptyDescription={chips.length ? 'Try removing a filter.' : 'Drop a voter list PDF above to get started.'}
      />

      {selected ? <FileModal file={list.find((f) => String(f.id) === String(selected.id)) || selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
