import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRollFile, getRollFiles, retryRollFile, uploadRollPdf } from '../api/data';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmButton from '../components/ui/ConfirmButton';
import DataList, { CardShell } from '../components/ui/DataList';
import FileDropzone from '../components/ui/FileDropzone';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { DetailRow, FilterField, FilterPanel, MiniFact, Pill, StatStrip, btnTool, useViewMode, ViewSwitch } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { fmt } from '../utils/voterFormat';

const STATUS = {
  queued: { label: 'Waiting', color: 'var(--viz-neutral)' },
  ocr: { label: 'Reading', color: 'var(--viz-active)' },
  ready: { label: 'Ready', color: 'var(--viz-good)' },
  needs_import: { label: 'Needs a check', color: 'var(--viz-warn)' },
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

const bytes = (n) => (n == null ? null : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const outOf = (n, total) => (total ? `${fmt(n)} of ${fmt(total)} (${Math.round((100 * n) / total)}%)` : fmt(n));
const stamp = (iso) => (iso ? new Date(iso).toLocaleString() : null);

function Section({ title, children }) {
  return (
    <section className="mt-5 first:mt-0">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{title}</p>
      <dl>{children}</dl>
    </section>
  );
}

/** Everything known about one uploaded voter list: the file, how it was read, what came out of it, and the polling station. */
function FileModal({ file, onClose }) {
  const state = statusOf(file.parse_status);
  const d = useApi(() => getRollFile(file.id), [file.id, file.parse_status]);
  const x = d.data || {};
  const s = x.stats && x.stats.voters ? x.stats : null;
  const roll = x.roll || {};
  const booth = x.booth || {};
  const pages = x.page_count || file.page_count;
  const took = (x.document?.durationMs ?? file.duration_ms) != null ? `${Math.round((x.document?.durationMs ?? file.duration_ms) / 1000)} seconds` : etaLabel(file.ocr_eta_seconds);

  return (
    <Modal
      title={`Booth ${file.part_no ?? '—'} · voter list`}
      subtitle={<Pill color={state.color}>{state.label}</Pill>}
      badge={file.part_no ?? '—'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
          {s && file.part_no != null ? (
            <Link to={`/app/voters?part=${file.part_no}`} className="inline-flex items-center rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110">
              See the {fmt(s.voters)} voters
            </Link>
          ) : null}
        </>
      }
    >
      {file.error_message ? <AlertBanner tone="danger" className="mb-3">{file.error_message}</AlertBanner> : null}
      <AlertBanner tone="danger" className="mb-3">{d.error}</AlertBanner>

      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Section title="The file">
            <DetailRow label="File name">{file.filename}</DetailRow>
            <DetailRow label="Booth">{file.part_no != null ? String(file.part_no) : null}</DetailRow>
            <DetailRow label="Language">{x.language}</DetailRow>
            <DetailRow label="File size">{bytes(x.size_bytes)}</DetailRow>
            <DetailRow label="Uploaded on">{stamp(x.uploaded_at || file.uploaded_at)}</DetailRow>
          </Section>
          <Section title="How it was read">
            <DetailRow label="Pages">{pages ? String(pages) : null}</DetailRow>
            <DetailRow label="Pages with voters">{s ? String(s.pages_with_voters) : null}</DetailRow>
            <DetailRow label="Time taken">{took}</DetailRow>
            <DetailRow label="Finished on">{stamp(x.processed_at || file.extracted_at) || 'Not yet'}</DetailRow>
          </Section>
        </div>

        <div>
          <Section title="What was read">
            {s ? (
              <>
                <DetailRow label="Voters">{fmt(s.voters)}</DetailRow>
                <DetailRow label="Men · Women">{`${fmt(s.male)} · ${fmt(s.female)}${s.voters - s.male - s.female ? ` (+${fmt(s.voters - s.male - s.female)} not read)` : ''}`}</DetailRow>
                <DetailRow label="Voter ID read">{outOf(s.with_epic, s.voters)}</DetailRow>
                <DetailRow label="Age read">{outOf(s.with_age, s.voters)}</DetailRow>
                <DetailRow label="House number read">{outOf(s.with_house, s.voters)}</DetailRow>
                <DetailRow label="Average age">{s.avg_age != null ? `${Math.round(s.avg_age)} years` : null}</DetailRow>
                <DetailRow label="Households">{fmt(s.households)}</DetailRow>
                <DetailRow label="Roads">{fmt(s.roads)}</DetailRow>
                <DetailRow label="Phone numbers saved">{outOf(s.with_phone, s.voters)}</DetailRow>
                <DetailRow label="List numbers">{s.first_serial != null ? `${s.first_serial} to ${s.last_serial}` : null}</DetailRow>
              </>
            ) : (
              <p className="py-2 text-sm text-[var(--muted)]">{d.loading ? 'Loading…' : 'No voters saved from this file yet.'}</p>
            )}
          </Section>
          <Section title="Polling station">
            <DetailRow label="Name">{booth.pollingStationName && !/^Polling Station Part \d+$/.test(booth.pollingStationName) ? booth.pollingStationName : null}</DetailRow>
            <DetailRow label="Address">{booth.pollingStationAddress}</DetailRow>
            <DetailRow label="Area">{booth.areaName && !/^Part \d+$/.test(booth.areaName) ? booth.areaName : null}</DetailRow>
            <DetailRow label="Assembly">{roll.assembly}</DetailRow>
            <DetailRow label="List published">{roll.publication_date}</DetailRow>
          </Section>
        </div>
      </div>
    </Modal>
  );
}

export default function DataPage() {
  const { data: files, loading, error, reload } = useApi(getRollFiles, []);
  const list = useMemo(() => files || [], [files]);

  const [uploading, setUploading] = useState(false);
  const [queue, setQueue] = useState([]); // one row per PDF picked: waiting / uploading / done / error
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

  const patchRow = useCallback((id, changes) => setQueue((rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r))), []);

  // Several PDFs at once: sent one after another so each stays under the server's 50 MB request limit.
  const onUploadPdf = useCallback(
    async (picked) => {
      const chosen = Array.from(picked || []);
      if (!chosen.length) return;
      // What is already uploaded (waiting, being read, or done) is never uploaded again.
      const alive = ['queued', 'ocr', 'ready', 'needs_import'];
      const knownNames = new Set(list.filter((f) => alive.includes(f.parse_status)).map((f) => f.filename));
      const knownParts = new Map(list.filter((f) => alive.includes(f.parse_status) && f.part_no != null).map((f) => [Number(f.part_no), f.filename]));
      const partOf = (name) => {
        const m = String(name).match(/[-_](?:ENG|TEL)-(\d+)/i);
        return m ? Number(m[1]) : null;
      };
      const seen = new Set();
      const seenParts = new Set();
      const rows = chosen.map((file, i) => {
        const id = `${Date.now()}-${i}`;
        const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
        const part = partOf(file.name);
        const dup = seen.has(file.name);
        seen.add(file.name);
        const dupPart = part != null && seenParts.has(part);
        if (part != null) seenParts.add(part);
        let status = 'waiting';
        let problem = '';
        if (!isPdf) [status, problem] = ['error', 'Not a PDF file'];
        else if (dup) [status, problem] = ['skipped', 'Same file chosen twice'];
        else if (file.size > 50 * 1024 * 1024) [status, problem] = ['error', 'Larger than 50 MB'];
        else if (knownNames.has(file.name)) [status, problem] = ['skipped', 'Already uploaded'];
        else if (part != null && knownParts.has(part)) [status, problem] = ['skipped', `Booth ${part} is already uploaded`];
        else if (dupPart) [status, problem] = ['skipped', `Booth ${part} chosen twice`];
        return { id, file, name: file.name, size: file.size, status, pct: 0, problem };
      });
      setQueue(rows);
      setUploading(true);
      setMessage('');
      let done = 0;
      for (const row of rows) {
        if (row.status !== 'waiting') continue;
        patchRow(row.id, { status: 'uploading', pct: 0 });
        try {
          const result = await uploadRollPdf(row.file, (pct) => patchRow(row.id, { pct }));
          done += 1;
          patchRow(row.id, { status: 'done', pct: 100, part_no: result?.part_no });
        } catch (err) {
          // 409 = the server found it is already there (someone else uploaded it a moment ago): not a failure
          if (err.status === 409) {
            row.status = 'skipped';
            patchRow(row.id, { status: 'skipped', problem: err.message });
          } else {
            row.status = 'error';
            patchRow(row.id, { status: 'error', problem: err.message || 'Upload failed' });
          }
        }
      }
      setUploading(false);
      const skipped = rows.filter((r) => r.status === 'skipped').length;
      const failed = rows.filter((r) => r.status === 'error').length;
      setMessage(
        done
          ? `${done} voter list${done === 1 ? '' : 's'} uploaded. Reading starts automatically, one file at a time.${skipped ? ` ${skipped} skipped because already uploaded.` : ''}${failed ? ` ${failed} could not be uploaded.` : ''}`
          : skipped && !failed
            ? `Nothing new to upload: ${skipped === 1 ? 'that file is' : 'those files are'} already uploaded.`
            : 'No files were uploaded.'
      );
      setTimeout(() => reload({ silent: true }), 800);
    },
    [list, patchRow, reload]
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
    f.parse_status === 'ready' || f.parse_status === 'needs_import' ? (
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
            {retryControl(f)}
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
      <div className="mt-2 flex justify-end">{retryControl(f)}</div>
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
          { label: 'Needs a check', value: fmt(stats.waiting), hint: 'read, but some details are missing' },
          { label: 'Ready', value: fmt(stats.ready), hint: 'ready to use' },
          { label: 'Voters', value: fmt(stats.voters), hint: 'across all files' },
        ]}
      />

      <FileDropzone accept="application/pdf,.pdf" multiple busy={uploading} onFiles={onUploadPdf} title="Drop voter list PDFs here, one or many" hint="Choose several files at once. We read every page and fill in the voter details. Files already uploaded are skipped." />

      <AlertBanner tone="info">{message}</AlertBanner>
      <AlertBanner tone="danger">{error}</AlertBanner>

      {queue.length ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3 shadow-soft">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[var(--ink)]">
              Uploading {queue.length} file{queue.length === 1 ? '' : 's'} ·{' '}
              <span className="font-semibold text-[var(--muted)]">
                {queue.filter((r) => r.status === 'done').length} uploaded
                {queue.some((r) => r.status === 'skipped') ? `, ${queue.filter((r) => r.status === 'skipped').length} skipped (already there)` : ''}
                {queue.some((r) => r.status === 'error') ? `, ${queue.filter((r) => r.status === 'error').length} failed` : ''}
              </span>
            </p>
            {!uploading ? (
              <button type="button" onClick={() => setQueue([])} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
                Clear list
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {queue.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]" title={r.name}>
                    {r.name}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]">
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{ width: `${r.status === 'error' || r.status === 'skipped' ? 100 : r.pct}%`, background: r.status === 'error' ? '#d64545' : r.status === 'skipped' ? '#d9a441' : 'var(--brand)' }}
                    />
                  </div>
                </div>
                <span className="w-44 shrink-0 text-right text-xs text-[var(--muted)]">
                  {r.status === 'waiting' ? 'Waiting…' : null}
                  {r.status === 'uploading' ? `Uploading ${r.pct}%` : null}
                  {r.status === 'done' ? `Uploaded${r.part_no ? ` · booth ${r.part_no}` : ''}` : null}
                  {r.status === 'error' ? <span className="font-semibold text-[#d64545]">{r.problem}</span> : null}
                  {r.status === 'skipped' ? <span className="font-semibold text-[var(--ink-soft)]">Skipped · {r.problem}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
