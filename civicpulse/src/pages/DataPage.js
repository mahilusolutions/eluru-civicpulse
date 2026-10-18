import { useCallback, useMemo, useState } from 'react';
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

function shortName(filename = '') {
  const m = filename.match(/ENG-(\d+)/i);
  return m ? `Part ${Number(m[1])} roll` : filename;
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

  const { data: files, loading, error, reload } = useApi(getRollFiles, []);

  const stats = useMemo(() => {
    const list = files || [];
    return {
      total: list.length,
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
        setMessage(`Part ${result.part_no ?? '?'} registered.`);
        setTimeout(reload, 1000);
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
        if (!voters.length) throw new Error('No valid CSV rows');
        const result = await importVotersJson(Number(importPart), voters);
        setMessage(`${result.imported} electors loaded into part ${result.part_no}.`);
        reload();
      } catch (err) {
        setMessage(err.message);
      } finally {
        setUploading(false);
      }
    },
    [importPart, reload]
  );

  async function onRetry(id) {
    setBusyId(id);
    try {
      await retryRollFile(id);
      setMessage('Retry started.');
      setTimeout(reload, 1200);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'part_no',
        header: 'Part',
        accessor: 'part_no',
        className: 'font-bold tabular-nums',
        width: '4rem',
        truncate: false,
      },
      {
        key: 'file',
        header: 'File',
        truncate: false,
        cell: (r) => (
          <div className="min-w-0">
            <p className="font-semibold text-[var(--ink)]">{shortName(r.filename)}</p>
            <p className="truncate text-[11px] text-[var(--muted)]" title={r.filename}>
              {r.filename}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (r) => (
          <StatusBadge tone={toneForStatus(r.parse_status)}>
            {labelForStatus(r.parse_status)}
          </StatusBadge>
        ),
      },
      {
        key: 'voters',
        header: 'Electors',
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
            {file.parse_status === 'needs_import' && file.part_no ? (
              <button
                type="button"
                className="rounded-md bg-[var(--brand)] px-2 py-1 text-[11px] font-semibold text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setImportPart(String(file.part_no));
                  setMessage(`Part ${file.part_no} selected for CSV.`);
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
    [busyId]
  );

  return (
    <section className="space-y-4">
      <PageHeader
        title="Data"
        description="Register part PDFs, then load electors with CSV or OCR."
        actions={
          <>
            <a href="/templates/voters-import-template.csv" download className={btnGhost}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Template
            </a>
            <button type="button" onClick={reload} className={btnGhost}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Files', stats.total],
          ['Waiting', stats.waiting],
          ['Ready', stats.ready],
          ['Electors', stats.voters],
        ].map(([label, value]) => (
          <Panel key={label} className="px-4 py-3">
            <p className="text-xs text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{value}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <FileDropzone
          accept="application/pdf,.pdf"
          busy={uploading}
          onFiles={onUploadPdf}
          title="Drop PDF here"
          hint="…ENG-98-WI.pdf → part 98"
        />
        <Panel className="p-3">
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

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Find part or file…" />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'needs_import', label: 'Needs electors' },
            { value: 'ready', label: 'Ready' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="id"
        loading={loading}
        emptyTitle="No roll files"
        emptyDescription="Drop a PDF here, or run ingest from civicpulse-backend."
        pagination={{
          page: pager.page,
          pageCount: pager.pageCount,
          from: pager.from,
          to: pager.to,
          total: pager.total,
          pageSize,
          onPageChange: pager.setPage,
          onPageSizeChange: setPageSize,
        }}
      />
    </section>
  );
}
