import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Eye, Phone, Plus, RefreshCw } from 'lucide-react';
import { getBooths } from '../api/booths';
import { createTeamMember, deleteTeamMember, getTeam, updateTeamMember } from '../api/team';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import BoothPicker from '../components/pickers/BoothPicker';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmButton from '../components/ui/ConfirmButton';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { Field, btnPrimary } from '../components/ui/Panel';
import { FilterField, FilterPanel, Meter, MiniFact, Pill, StatStrip, ViewSwitch, btnTool, btnToolPrimary, inputSm, useChartsOpen, useDebouncedSearch, useViewMode } from '../components/ui/kit';
import { BarList, ChartCard } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { fmt, initials, pct } from '../utils/voterFormat';

const ROLE_CHOICES = ['Coordinator', 'Booth Agent', 'Volunteer', 'Admin'];

const boothsLabel = (parts = [], max = 4) => (parts.length ? (parts.length > max ? `${parts.slice(0, max).join(', ')} +${parts.length - max}` : parts.join(', ')) : 'None yet');

function PersonModal({ person, booths, canEdit, onClose, onSaved }) {
  const isNew = !person;
  const [form, setForm] = useState({
    name: person?.name || '',
    role: person?.role || 'Booth Agent',
    zone: person?.zone || '',
    phone: person?.phone || '',
    status: person?.status || 'Active',
    assigned_parts: person?.assigned_parts || [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isNew) await createTeamMember(form);
      else await updateTeamMember(person.id, form);
      onSaved(isNew ? `${form.name} added to the team.` : 'Changes saved.');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteTeamMember(person.id);
      onSaved(`${person.name} removed from the team.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const roleChoices = ROLE_CHOICES.includes(form.role) ? ROLE_CHOICES : [form.role, ...ROLE_CHOICES];

  return (
    <Modal
      title={isNew ? 'Add a team member' : person.name}
      subtitle={isNew ? 'Coordinators, booth agents and volunteers.' : `${person.role}${person.zone ? ` · ${person.zone}` : ''}`}
      size="md"
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            {!isNew ? <ConfirmButton label="Remove" confirmLabel="Yes, remove" onConfirm={remove} disabled={busy} /> : null}
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
              Cancel
            </button>
            <button type="submit" form="person-form" disabled={busy} className={`${btnPrimary} !py-2`}>
              {busy ? 'Saving…' : isNew ? 'Add to team' : 'Save changes'}
            </button>
          </>
        ) : null
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="person-form" onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input required autoFocus={isNew} disabled={!canEdit} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputSm} />
          </Field>
          <Field label="Role">
            <select disabled={!canEdit} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputSm}>
              {roleChoices.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Phone (optional)">
            <input disabled={!canEdit} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98480 12345" className={inputSm} />
          </Field>
          <Field label="Area or zone (optional)">
            <input disabled={!canEdit} maxLength={120} value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="e.g. Sanivarapu Peta" className={inputSm} />
          </Field>
        </div>
        {!isNew ? (
          <Field label="Status">
            <select disabled={!canEdit} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputSm}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>
        ) : null}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Booths they look after</p>
          {canEdit ? (
            <BoothPicker booths={booths} value={form.assigned_parts} onChange={(parts) => setForm({ ...form, assigned_parts: parts })} />
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">{boothsLabel(form.assigned_parts, 20)}</p>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default function TeamPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);

  const teamApi = useApi(getTeam, []);
  const boothsApi = useApi(getBooths, []);
  const team = useMemo(() => teamApi.data || [], [teamApi.data]);
  const booths = useMemo(() => boothsApi.data || [], [boothsApi.data]);

  const [params, setParams] = useSearchParams();
  const f = { q: params.get('q') || '', role: params.get('role') || 'all', status: params.get('status') || 'all' };
  const patch = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([k, v]) => (v == null || v === '' || v === 'all' ? next.delete(k) : next.set(k, v)));
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );
  const [search, setSearch] = useDebouncedSearch(f.q, (v) => patch({ q: v }));

  const [view, setView] = useViewMode('civicpulse_team_view');
  const [chartsOpen, setChartsOpen] = useChartsOpen('civicpulse_team_charts');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState('');

  const sig = JSON.stringify(f);
  useEffect(() => setPage(1), [sig, pageSize]);

  const roles = useMemo(() => [...new Set(team.map((m) => m.role))].sort(), [team]);
  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return team.filter(
      (m) =>
        (f.role === 'all' || m.role === f.role) &&
        (f.status === 'all' || m.status === f.status) &&
        (!needle || m.name.toLowerCase().includes(needle) || (m.zone || '').toLowerCase().includes(needle) || (m.phone || '').includes(needle) || m.assigned_parts.some((p) => String(p) === needle))
    );
  }, [team, f.q, f.role, f.status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: filtered.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, filtered.length), total: filtered.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const refresh = () => teamApi.reload({ silent: true });
  const covered = new Set(team.filter((m) => m.status === 'Active').flatMap((m) => m.assigned_parts));
  const coveredCount = booths.filter((b) => covered.has(b.part_no)).length;

  const chips = [
    f.q && { key: 'q', label: `“${f.q}”`, onRemove: () => setSearch('') },
    f.role !== 'all' && { key: 'role', label: f.role, onRemove: () => patch({ role: '' }) },
    f.status !== 'all' && { key: 'status', label: f.status, onRemove: () => patch({ status: '' }) },
  ].filter(Boolean);

  const phoneCell = (m) => (m.phone ? <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[var(--brand)] hover:underline"><Phone className="h-3 w-3" />{m.phone}</a> : <span className="text-[var(--muted)]">—</span>);

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        truncate: false,
        sticky: 'left',
        stickyOffset: 0,
        cell: (m) => (
          <div className="flex min-w-[11rem] items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-bold text-white" aria-hidden>
              {initials(m.name)}
            </span>
            <span className="font-semibold text-[var(--ink)]">{m.name}</span>
          </div>
        ),
      },
      { key: 'role', header: 'Role', accessor: 'role', width: '8rem' },
      { key: 'zone', header: 'Area', accessor: (m) => m.zone || '—' },
      { key: 'phone', header: 'Phone', truncate: false, cell: phoneCell },
      { key: 'booths', header: 'Booths', truncate: false, cell: (m) => <span className="whitespace-nowrap tabular-nums">{m.assigned_parts.length} <span className="text-[var(--muted)]">· {boothsLabel(m.assigned_parts, 4)}</span></span> },
      { key: 'status', header: 'Status', truncate: false, cell: (m) => <Pill color={m.status === 'Active' ? 'var(--viz-good)' : 'var(--viz-unknown)'}>{m.status}</Pill>, width: '7rem' },
      {
        key: 'open',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '5.5rem',
        cell: (m) => (
          <button type="button" onClick={() => setOpen(m)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
            <Eye className="h-3.5 w-3.5" />
            {canEdit ? 'Edit' : 'View'}
          </button>
        ),
      },
    ],
    [canEdit]
  );

  const renderCard = (m) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white" aria-hidden>
          {initials(m.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[var(--ink)]">{m.name}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {m.role}
            {m.zone ? ` · ${m.zone}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(m)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
          <Eye className="h-3.5 w-3.5" />
          {canEdit ? 'Edit' : 'View'}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Phone">{m.phone ? phoneCell(m) : null}</MiniFact>
        <MiniFact label="Status"><Pill color={m.status === 'Active' ? 'var(--viz-good)' : 'var(--viz-unknown)'}>{m.status}</Pill></MiniFact>
        <MiniFact label="Booths" className="col-span-2">{boothsLabel(m.assigned_parts, 8)}</MiniFact>
      </dl>
    </CardShell>
  );

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="The people running the campaign: coordinators, booth agents and volunteers, and which booths each one looks after."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" onClick={() => setChartsOpen((o) => !o)} className={btnTool} aria-pressed={chartsOpen}>
              <BarChart3 className="h-3.5 w-3.5" />
              {chartsOpen ? 'Hide charts' : 'Show charts'}
            </button>
            <button type="button" onClick={refresh} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {canEdit ? (
              <button type="button" onClick={() => setOpen('new')} className={btnToolPrimary}>
                <Plus className="h-3.5 w-3.5" />
                Add team member
              </button>
            ) : null}
          </>
        }
      />

      <FilterPanel search={search} onSearch={setSearch} placeholder="Search by name, area, phone or booth number…" chips={chips} onClearAll={() => { setSearch(''); setParams({}, { replace: true }); }} cols="md:grid-cols-3">
        <FilterField label="Role">
          <FilterSelect label="Role" className="w-full" value={f.role} onChange={(v) => patch({ role: v })} options={[{ value: 'all', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r }))]} />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect label="Status" className="w-full" value={f.status} onChange={(v) => patch({ status: v })} options={[{ value: 'all', label: 'Anyone' }, { value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
        </FilterField>
      </FilterPanel>

      <AlertBanner tone="danger">{teamApi.error || boothsApi.error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Team members', value: fmt(team.length), hint: `${fmt(team.filter((m) => m.status === 'Active').length)} active` },
          { label: 'Booth agents', value: fmt(team.filter((m) => m.role === 'Booth Agent').length), hint: 'on the ground' },
          { label: 'Coordinators', value: fmt(team.filter((m) => m.role === 'Coordinator').length), hint: 'looking after areas' },
          { label: 'Booths covered', value: `${fmt(coveredCount)} of ${fmt(booths.length)}`, hint: 'have an active team member' },
        ]}
      />

      {chartsOpen && team.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ChartCard title="Who is on the team" subtitle="Click a role to filter">
            <BarList unit="people" items={roles.map((r) => ({ key: r, label: r, value: team.filter((m) => m.role === r).length }))} activeKey={f.role === 'all' ? null : f.role} onPick={(item) => patch({ role: f.role === item.key ? '' : item.key })} />
          </ChartCard>
          <ChartCard center title="How well are booths covered?">
            <ul className="space-y-2.5">
              <Meter label="Booths with someone assigned" value={pct(coveredCount, booths.length)} detail={`${fmt(coveredCount)} of ${fmt(booths.length)}`} />
              <Meter label="Team members with a phone number" value={pct(team.filter((m) => m.phone).length, team.length)} detail={`${fmt(team.filter((m) => m.phone).length)} of ${fmt(team.length)}`} />
            </ul>
          </ChartCard>
        </div>
      ) : null}

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="id"
        renderCard={renderCard}
        loading={teamApi.loading && !teamApi.data}
        pagination={paging}
        emptyTitle={chips.length ? 'No one matches these filters' : 'No team members yet'}
        emptyDescription={chips.length ? 'Try removing a filter.' : canEdit ? 'Choose “Add team member” to add your first coordinator or booth agent.' : 'Team members will appear here once they are added.'}
      />

      {open ? (
        <PersonModal
          person={open === 'new' ? null : open}
          booths={booths}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
