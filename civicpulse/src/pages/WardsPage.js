import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Plus, RefreshCw } from 'lucide-react';
import { getBooths } from '../api/booths';
import { createWard, deleteWard, getWards, updateWard } from '../api/wards';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import BoothPicker from '../components/pickers/BoothPicker';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmButton from '../components/ui/ConfirmButton';
import DataList, { CardShell } from '../components/ui/DataList';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { Field, btnPrimary } from '../components/ui/Panel';
import { FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, btnToolPrimary, inputSm, useDebouncedSearch, useViewMode } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { stationName } from '../utils/boothFormat';
import { fmt } from '../utils/voterFormat';

const EMPTY = { ward_no: '', name: '', notes: '', parts: [] };

/** "1, 2, 5 +3 more" for a list of booth numbers. */
function partsLabel(parts = [], max = 6) {
  if (!parts.length) return 'No booths yet';
  const shown = parts.slice(0, max).join(', ');
  return parts.length > max ? `${shown} +${parts.length - max} more` : shown;
}

function WardModal({ ward, wards, booths, canEdit, onClose, onSaved }) {
  const isNew = !ward;
  const nextNo = useMemo(() => Math.max(0, ...wards.map((w) => w.ward_no)) + 1, [wards]);
  const [form, setForm] = useState(() => (ward ? { ward_no: ward.ward_no, name: ward.name, notes: ward.notes || '', parts: ward.parts } : { ...EMPTY, ward_no: nextNo }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const taken = useMemo(() => {
    const map = {};
    wards.forEach((w) => {
      if (ward && w.id === ward.id) return;
      w.parts.forEach((p) => {
        map[p] = `Ward ${w.ward_no}`;
      });
    });
    return map;
  }, [wards, ward]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { ...form, ward_no: Number(form.ward_no) };
      if (isNew) await createWard(payload);
      else await updateWard(ward.id, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteWard(ward.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const voters = booths.filter((b) => form.parts.includes(b.part_no)).reduce((n, b) => n + (b.voters || 0), 0);

  return (
    <Modal
      title={isNew ? 'Add a ward' : `Ward ${ward.ward_no} · ${ward.name}`}
      subtitle={isNew ? 'A ward groups booths so one coordinator can look after the whole area.' : `${ward.booth_count} booths · ${fmt(ward.voters)} voters`}
      badge={isNew ? '+' : ward.ward_no}
      size="md"
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            {!isNew ? <ConfirmButton label="Delete ward" confirmLabel="Yes, delete ward" onConfirm={remove} disabled={busy} /> : null}
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
              Cancel
            </button>
            <button type="submit" form="ward-form" disabled={busy} className={`${btnPrimary} !py-2`}>
              {busy ? 'Saving…' : isNew ? 'Add ward' : 'Save changes'}
            </button>
          </>
        ) : null
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      {canEdit ? (
        <form id="ward-form" onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <Field label="Ward number">
              <input type="number" min="1" max="999" required value={form.ward_no} onChange={(e) => setForm({ ...form, ward_no: e.target.value })} className={inputSm} />
            </Field>
            <Field label="Ward name">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sanivarapu Peta" className={inputSm} />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputSm} />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">
              Booths in this ward {form.parts.length ? `· ${form.parts.length} chosen · ${fmt(voters)} voters` : ''}
            </p>
            <BoothPicker booths={booths} value={form.parts} onChange={(parts) => setForm({ ...form, parts })} taken={taken} />
            <p className="mt-1.5 text-[11px] text-[var(--muted)]">A booth can be in one ward. Choosing a booth that is in another ward moves it here.</p>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {ward.notes ? <p className="text-sm text-[var(--ink-soft)]">{ward.notes}</p> : null}
          <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
            {ward.booths.map((b) => (
              <li key={b.part_no} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-bold tabular-nums">{b.part_no}</span>
                <span className="min-w-0 flex-1 truncate">{stationName(b.polling_station_name, b.part_no)}</span>
                <span className="text-xs text-[var(--muted)]">{fmt(b.voters)} voters</span>
              </li>
            ))}
            {!ward.booths.length ? <li className="px-3 py-4 text-center text-xs text-[var(--muted)]">No booths in this ward yet.</li> : null}
          </ul>
        </div>
      )}
    </Modal>
  );
}

export default function WardsPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);

  const wardsApi = useApi(getWards, []);
  const boothsApi = useApi(getBooths, []);
  const wards = useMemo(() => wardsApi.data || [], [wardsApi.data]);
  const booths = useMemo(() => boothsApi.data || [], [boothsApi.data]);

  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const patchQ = useCallback((value) => setParams(value ? { q: value } : {}, { replace: true }), [setParams]);
  const [search, setSearch] = useDebouncedSearch(q, patchQ);

  const [view, setView] = useViewMode('civicpulse_wards_view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(null); // null | 'new' | ward

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return wards.filter(
      (w) => !needle || String(w.ward_no) === needle || w.name.toLowerCase().includes(needle) || w.parts.some((p) => String(p) === needle)
    );
  }, [wards, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = {
    page: safePage,
    pageCount,
    from: filtered.length ? (safePage - 1) * pageSize + 1 : 0,
    to: Math.min(safePage * pageSize, filtered.length),
    total: filtered.length,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
  };

  const assigned = new Set(wards.flatMap((w) => w.parts));
  const unassigned = booths.filter((b) => !assigned.has(b.part_no));
  const wardVoters = wards.reduce((n, w) => n + w.voters, 0);

  const refresh = () => {
    wardsApi.reload({ silent: true });
    boothsApi.reload({ silent: true });
  };

  const columns = useMemo(
    () => [
      { key: 'ward_no', header: 'Ward', accessor: 'ward_no', align: 'center', className: 'font-bold tabular-nums', width: '4.5rem', sticky: 'left', stickyOffset: 0 },
      { key: 'name', header: 'Name', truncate: false, cell: (w) => <span className="font-semibold text-[var(--ink)]">{w.name}</span> },
      { key: 'booths', header: 'Booths', truncate: false, cell: (w) => <span className="tabular-nums">{w.booth_count} <span className="text-[var(--muted)]">· {partsLabel(w.parts, 5)}</span></span> },
      { key: 'voters', header: 'Voters', accessor: (w) => fmt(w.voters), align: 'right', className: 'tabular-nums font-semibold', width: '5.5rem' },
      { key: 'notes', header: 'Notes', truncate: false, cell: (w) => <span className="inline-block max-w-[16rem] truncate align-middle text-[var(--muted)]">{w.notes || '—'}</span> },
      {
        key: 'open',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '5.5rem',
        cell: (w) => (
          <button type="button" onClick={() => setOpen(w)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
            <Eye className="h-3.5 w-3.5" />
            {canEdit ? 'Edit' : 'View'}
          </button>
        ),
      },
    ],
    [canEdit]
  );

  const renderCard = (w) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">{w.ward_no}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[var(--ink)]">{w.name}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{partsLabel(w.parts, 4)}</p>
        </div>
        <button type="button" onClick={() => setOpen(w)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
          <Eye className="h-3.5 w-3.5" />
          {canEdit ? 'Edit' : 'View'}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Booths">{w.booth_count}</MiniFact>
        <MiniFact label="Voters">{fmt(w.voters)}</MiniFact>
        {w.notes ? <MiniFact label="Notes" className="col-span-2">{w.notes}</MiniFact> : null}
      </dl>
    </CardShell>
  );

  const emptyText = q ? 'Try a different name or booth number.' : canEdit ? 'Add the first ward and choose which booths belong to it.' : 'Wards will appear here once they are set up.';

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Wards group booths into areas, so one coordinator can look after a whole part of the city."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" onClick={refresh} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {canEdit ? (
              <button type="button" onClick={() => setOpen('new')} className={btnToolPrimary}>
                <Plus className="h-3.5 w-3.5" />
                Add ward
              </button>
            ) : null}
          </>
        }
      />

      <FilterPanel
        search={search}
        onSearch={setSearch}
        placeholder="Search ward name, ward number or booth number…"
        chips={q ? [{ key: 'q', label: `“${q}”`, onRemove: () => setSearch('') }] : []}
        onClearAll={() => setSearch('')}
      />

      <AlertBanner tone="danger">{wardsApi.error || boothsApi.error}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Wards', value: fmt(wards.length), hint: q ? `${fmt(filtered.length)} shown` : 'in Eluru' },
          { label: 'Booths in wards', value: `${fmt(assigned.size)} of ${fmt(booths.length)}`, hint: 'booths with a ward' },
          { label: 'Voters in wards', value: fmt(wardVoters), hint: 'people covered' },
          {
            label: 'Booths without a ward',
            value: fmt(unassigned.length),
            hint: unassigned.length ? `e.g. Booth ${unassigned.slice(0, 3).map((b) => b.part_no).join(', ')}` : 'every booth has a ward',
          },
        ]}
      />

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="id"
        renderCard={renderCard}
        loading={wardsApi.loading && !wardsApi.data}
        pagination={paging}
        emptyTitle={q ? 'No wards match' : 'No wards yet'}
        emptyDescription={emptyText}
      />

      {open ? (
        <WardModal
          ward={open === 'new' ? null : open}
          wards={wards}
          booths={booths}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onSaved={refresh}
        />
      ) : null}
    </section>
  );
}
