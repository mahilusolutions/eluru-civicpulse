import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Eye, KeyRound, LogOut, RefreshCw, ShieldCheck, UserCheck, UserX, X } from 'lucide-react';
import { approveRequest, listAccessRequests, listUsers, rejectRequest, resetUserPassword, revokeUserSessions, updateUser } from '../api/access';
import { REQUESTABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../auth/roles';
import AlertBanner from '../components/ui/AlertBanner';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { btnPrimary, inputClass } from '../components/ui/Panel';
import { FilterField, FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, useViewMode } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { fmt } from '../utils/voterFormat';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const ago = (iso) => {
  if (!iso) return 'Never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const STATUS = {
  pending: { label: 'Waiting', dot: '#d9822b' },
  approved: { label: 'Approved', dot: '#1f9d63' },
  rejected: { label: 'Rejected', dot: '#d64545' },
};

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--bg-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
      <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

const cancelBtn = 'rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]';

function Detail({ label, children, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-[var(--ink)]">{children || '—'}</p>
    </div>
  );
}

// ------------------------------------------------------------------ one request, all details
function RequestModal({ row, onClose, onAccept, onReject }) {
  const pending = row.status === 'pending';
  return (
    <Modal
      title={row.full_name}
      subtitle={`${row.reference} · sent ${when(row.created_at)}`}
      size="lg"
      onClose={onClose}
      footer={
        pending ? (
          <>
            <button type="button" onClick={onClose} className={cancelBtn}>Close</button>
            <button type="button" onClick={onReject} className="rounded-xl border border-red-500/40 px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10">
              Reject
            </button>
            <button type="button" onClick={onAccept} className={`${btnPrimary} !py-2`}>
              Accept and create account
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className={cancelBtn}>Close</button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill status={row.status} />
        {row.decided_at ? <span className="text-xs text-[var(--muted)]">{row.status === 'approved' ? 'Approved' : 'Rejected'} {when(row.decided_at)}{row.decided_by_name ? ` by ${row.decided_by_name}` : ''}</span> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Detail label="Name">{row.full_name}</Detail>
        <Detail label="Mobile">{row.mobile}</Detail>
        <Detail label="Email">{row.email}</Detail>
        <Detail label="Voter ID">{row.voter_id}</Detail>
        <Detail label="Role or organisation">{row.designation}</Detail>
        <Detail label="Ward, booth or locality">{row.area}</Detail>
        <Detail label="Access requested">{ROLE_LABELS[row.requested_role] || row.requested_role}</Detail>
        <Detail label="Recommended by">{row.referred_by}</Detail>
        <Detail label="Why access is needed" wide>{row.reason}</Detail>
        {row.status === 'approved' ? (
          <>
            <Detail label="Account">{row.account_username}</Detail>
            <Detail label="Role given">{ROLE_LABELS[row.account_role] || row.account_role}</Detail>
            <Detail label="Login collected by the applicant">{row.credential_revealed_at ? `Yes, ${when(row.credential_revealed_at)}` : 'Not yet'}</Detail>
          </>
        ) : null}
        {row.admin_note ? <Detail label={row.status === 'rejected' ? 'Reason given' : 'Note to the applicant'} wide>{row.admin_note}</Detail> : null}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ accept = pick the role, account is created
function AcceptModal({ row, onClose, onDone }) {
  const [role, setRole] = useState(REQUESTABLE_ROLES.includes(row.requested_role) ? row.requested_role : 'volunteer');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      setResult(await approveRequest(row.id, role, note.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal
        title="Account created"
        subtitle={row.full_name}
        size="md"
        onClose={() => onDone(`Account ${result.username} created for ${row.full_name}.`)}
        footer={<button type="button" onClick={() => onDone(`Account ${result.username} created for ${row.full_name}.`)} className={`${btnPrimary} !py-2`}>Done</button>}
      >
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Username</p>
          <p className="mt-1 select-all font-mono text-2xl font-extrabold">{result.username}</p>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Role: <span className="font-semibold">{result.role_label}</span></p>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[var(--ink-soft)]">
          A random one-time password was created. <span className="font-semibold">You do not see it.</span> The applicant opens <span className="font-semibold">Check request status</span> on the website with reference{' '}
          <span className="font-mono font-bold">{result.reference}</span> and their mobile number, and collects the login there. They must set their own password at first sign-in.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Accept and create account"
      subtitle={`${row.full_name} · ${row.reference}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
          <button type="button" onClick={confirm} disabled={busy} className={`${btnPrimary} !py-2`}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <p className="mb-3 text-sm text-[var(--ink-soft)]">
        {row.full_name} asked for <span className="font-semibold">{ROLE_LABELS[row.requested_role]}</span> access for <span className="font-semibold">{row.area}</span>.
      </p>
      <label htmlFor="role" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Role to give</label>
      <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
        {REQUESTABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{ROLE_DESCRIPTIONS[role]}</p>

      <label htmlFor="note" className="mb-1.5 mt-4 block text-xs font-semibold text-[var(--muted)]">Note for the applicant (optional)</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} placeholder="For example: Please work only on booth 14." className={`${inputClass} resize-y`} />

      <div className="mt-4 rounded-xl bg-[var(--bg-muted)] p-3 text-xs leading-relaxed text-[var(--muted)]">
        A username (first name + last initial + last 4 digits of the mobile, for example <span className="font-mono font-semibold text-[var(--ink-soft)]">ravik.2345</span>) and a random one-time password are created automatically.
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ reject = a reason the applicant will read
function RejectModal({ row, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await rejectRequest(row.id, reason.trim());
      onDone(`Request ${row.reference} rejected.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reject this request"
      subtitle={`${row.full_name} · ${row.reference}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
          <button type="button" onClick={confirm} disabled={busy || reason.trim().length < 5} className={`${btnPrimary} !bg-red-600 !py-2`}>
            {busy ? 'Rejecting…' : 'Reject request'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <label htmlFor="why" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Reason (the applicant will see this)</label>
      <textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={300} autoFocus placeholder="For example: We could not match you to a booth team. Please ask your coordinator to recommend you." className={`${inputClass} resize-y`} />
      <p className="mt-1 text-xs text-[var(--muted)]">{reason.trim().length}/300</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ requests tab
function RequestsTab({ onChanged }) {
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [view, setView] = useViewMode('civicpulse_access_view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(null); // { row, mode: 'view'|'accept'|'reject' }
  const [notice, setNotice] = useState('');

  const list = useApi(() => listAccessRequests({ status: status === 'all' ? undefined : status, q: q || undefined }), [status, q]);
  const all = useApi(() => listAccessRequests({}), []);
  const rows = useMemo(() => list.data || [], [list.data]);

  useEffect(() => setPage(1), [status, q, pageSize]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    (all.data || []).forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [all.data]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const shown = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: rows.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, rows.length), total: rows.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const refresh = useCallback(() => {
    list.reload({ silent: true });
    all.reload({ silent: true });
    onChanged();
  }, [list, all, onChanged]);

  const done = (msg) => {
    setOpen(null);
    setNotice(msg);
    refresh();
  };

  const actions = (r) =>
    r.status === 'pending' ? (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen({ row: r, mode: 'view' })} title="Read the request" aria-label="Read the request" className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <Eye className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setOpen({ row: r, mode: 'accept' })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:brightness-110">
          <Check className="h-3.5 w-3.5" />
          Accept
        </button>
        <button type="button" onClick={() => setOpen({ row: r, mode: 'reject' })} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/10">
          <X className="h-3.5 w-3.5" />
          Reject
        </button>
      </span>
    ) : (
      <button type="button" onClick={() => setOpen({ row: r, mode: 'view' })} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
    );

  const columns = [
    { key: 'ref', header: 'Reference', truncate: false, cell: (r) => <span className="whitespace-nowrap font-mono text-xs font-bold">{r.reference}</span>, width: '8.5rem' },
    { key: 'name', header: 'Applicant', truncate: false, cell: (r) => (
      <span className="block min-w-[10rem]">
        <span className="block font-semibold text-[var(--ink)]">{r.full_name}</span>
        <span className="block text-xs text-[var(--muted)]">{r.mobile}</span>
      </span>
    ) },
    { key: 'role', header: 'Wants', accessor: (r) => ROLE_LABELS[r.requested_role] || r.requested_role, width: '8rem' },
    { key: 'area', header: 'Area', truncate: false, cell: (r) => <span className="inline-block max-w-[14rem] truncate align-middle" title={r.area}>{r.area}</span> },
    { key: 'reason', header: 'Reason', truncate: false, cell: (r) => <span className="inline-block max-w-[18rem] truncate align-middle text-[var(--ink-soft)]" title={r.reason}>{r.reason}</span> },
    { key: 'sent', header: 'Sent', truncate: false, cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{ago(r.created_at)}</span>, width: '7rem' },
    { key: 'status', header: 'Status', truncate: false, cell: (r) => <StatusPill status={r.status} />, width: '7rem' },
    { key: 'actions', header: 'Actions', truncate: false, align: 'right', sticky: 'right', cell: actions, width: '17rem' },
  ];

  const renderCard = (r) => (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold leading-snug text-[var(--ink)]">{r.full_name}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{r.mobile} · {ago(r.created_at)}</p>
        </div>
        <StatusPill status={r.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Reference"><span className="font-mono text-xs">{r.reference}</span></MiniFact>
        <MiniFact label="Wants">{ROLE_LABELS[r.requested_role]}</MiniFact>
        <MiniFact label="Area" className="col-span-2">{r.area}</MiniFact>
        <MiniFact label="Reason" className="col-span-2"><span className="line-clamp-3">{r.reason}</span></MiniFact>
      </dl>
      <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-2">{actions(r)}</div>
    </CardShell>
  );

  return (
    <div className="space-y-3">
      <StatStrip
        items={[
          { label: 'Waiting', value: fmt(counts.pending), hint: counts.pending ? 'need your decision' : 'all caught up' },
          { label: 'Approved', value: fmt(counts.approved), hint: 'accounts created' },
          { label: 'Rejected', value: fmt(counts.rejected), hint: 'not approved' },
        ]}
      />
      <FilterPanel search={q} onSearch={setQ} placeholder="Search name, mobile, reference or area…" chips={q ? [{ key: 'q', label: `“${q}”`, onRemove: () => setQ('') }] : []} onClearAll={() => { setQ(''); setStatus('pending'); }} cols="md:grid-cols-4">
        <FilterField label="Show">
          <FilterSelect label="Show" className="w-full" value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Waiting for a decision' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All requests' }]} />
        </FilterField>
        <div className="col-span-2 flex items-end justify-end md:col-span-3">
          <ViewSwitch view={view} onChange={setView} />
        </div>
      </FilterPanel>
      <AlertBanner tone="danger">{list.error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>
      <DataList
        view={view}
        columns={columns}
        rows={shown}
        rowKey="id"
        renderCard={renderCard}
        loading={list.loading && !list.data}
        pagination={paging}
        emptyTitle={status === 'pending' && !q ? 'No requests waiting' : 'No requests match'}
        emptyDescription={status === 'pending' && !q ? 'New requests appear here as soon as someone submits the form on the website.' : 'Try another filter.'}
      />

      {open?.mode === 'view' ? <RequestModal row={open.row} onClose={() => setOpen(null)} onAccept={() => setOpen({ row: open.row, mode: 'accept' })} onReject={() => setOpen({ row: open.row, mode: 'reject' })} /> : null}
      {open?.mode === 'accept' ? <AcceptModal row={open.row} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.mode === 'reject' ? <RejectModal row={open.row} onClose={() => setOpen(null)} onDone={done} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ accounts tab
function UsersTab() {
  const users = useApi(listUsers, []);
  const rows = useMemo(() => users.data || [], [users.data]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [reset, setReset] = useState(null);
  const [view, setView] = useViewMode('civicpulse_users_view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const shown = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: rows.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, rows.length), total: rows.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  async function run(u, fn, okMessage) {
    setBusyId(u.id);
    setError('');
    setNotice('');
    try {
      const out = await fn();
      if (okMessage) setNotice(okMessage(out));
      users.reload({ silent: true });
      return out;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusyId(null);
    }
  }

  const protectedRow = (u) => u.role === 'super_admin';

  const actions = (u) =>
    protectedRow(u) ? (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)]"><ShieldCheck className="h-3.5 w-3.5" /> Protected</span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" disabled={busyId === u.id} title="Make a new temporary password" onClick={async () => {
          if (!window.confirm(`Reset the password for ${u.username}? They will be signed out everywhere.`)) return;
          const out = await run(u, () => resetUserPassword(u.id));
          if (out) setReset({ user: u, ...out });
        }} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50">
          <KeyRound className="h-3.5 w-3.5" />
          Reset password
        </button>
        <button type="button" disabled={busyId === u.id || !u.active_sessions} title="Sign out of every device" onClick={() => run(u, () => revokeUserSessions(u.id), (o) => `${u.username} was signed out of ${o.revoked} device(s).`)} className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-40" aria-label="Sign out everywhere">
          <LogOut className="h-4 w-4" />
        </button>
        <button type="button" disabled={busyId === u.id} onClick={() => run(u, () => updateUser(u.id, { status: u.status === 'active' ? 'disabled' : 'active' }), () => `${u.username} ${u.status === 'active' ? 'disabled' : 're-enabled'}.`)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${u.status === 'active' ? 'border-red-500/40 text-red-600 hover:bg-red-500/10' : 'border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10'}`}>
          {u.status === 'active' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
          {u.status === 'active' ? 'Disable' : 'Enable'}
        </button>
      </span>
    );

  const roleCell = (u) =>
    protectedRow(u) ? (
      <span className="font-semibold">{ROLE_LABELS[u.role]}</span>
    ) : (
      <select value={u.role} disabled={busyId === u.id} onChange={(e) => run(u, () => updateUser(u.id, { role: e.target.value }), () => `${u.username} is now ${ROLE_LABELS[e.target.value]}.`)} aria-label={`Role of ${u.username}`} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs font-semibold outline-none focus:border-[var(--brand)]">
        {REQUESTABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    );

  const columns = [
    { key: 'user', header: 'Account', truncate: false, cell: (u) => (
      <span className="block min-w-[10rem]">
        <span className="block font-mono text-sm font-bold">{u.username}</span>
        <span className="block text-xs text-[var(--muted)]">{u.full_name}{u.mobile ? ` · ${u.mobile}` : ''}</span>
      </span>
    ) },
    { key: 'role', header: 'Role', truncate: false, cell: roleCell, width: '10rem' },
    { key: 'status', header: 'Status', truncate: false, cell: (u) => (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
        <span className="h-2 w-2 rounded-full" style={{ background: u.status === 'active' ? '#1f9d63' : '#d64545' }} />
        {u.status === 'active' ? (u.must_change_password ? 'Active · password not set yet' : 'Active') : 'Disabled'}
      </span>
    ) },
    { key: 'last', header: 'Last sign-in', truncate: false, cell: (u) => <span className="whitespace-nowrap text-[var(--muted)]">{ago(u.last_login_at)}</span>, width: '8rem' },
    { key: 'sessions', header: 'Signed in on', accessor: (u) => (u.active_sessions ? `${u.active_sessions} device${u.active_sessions === 1 ? '' : 's'}` : '—'), width: '8rem' },
    { key: 'actions', header: 'Actions', truncate: false, align: 'right', sticky: 'right', cell: actions, width: '22rem' },
  ];

  const renderCard = (u) => (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-bold">{u.username}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{u.full_name}</p>
        </div>
        {roleCell(u)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Status">{u.status === 'active' ? 'Active' : 'Disabled'}</MiniFact>
        <MiniFact label="Last sign-in">{ago(u.last_login_at)}</MiniFact>
      </dl>
      <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-2">{actions(u)}</div>
    </CardShell>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">Everyone who can sign in. Changing a role or disabling an account signs that person out at once.</p>
        <ViewSwitch view={view} onChange={setView} />
      </div>
      <AlertBanner tone="danger">{error || users.error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>
      <DataList view={view} columns={columns} rows={shown} rowKey="id" renderCard={renderCard} loading={users.loading && !users.data} pagination={paging} emptyTitle="No accounts yet" emptyDescription="Accounts appear here when you accept a request." />

      {reset ? (
        <Modal title="Password reset" subtitle={reset.user.username} size="md" onClose={() => setReset(null)} footer={<button type="button" onClick={() => setReset(null)} className={`${btnPrimary} !py-2`}>Done</button>}>
          {reset.delivered === 'status_page' ? (
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              A new one-time password was created and <span className="font-semibold">{reset.user.full_name}</span> was signed out everywhere. They collect it on the website under <span className="font-semibold">Check request status</span> with their reference number and mobile number. You do not see it.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--ink-soft)]">This account was not created from a request, so the temporary password is shown to you once. Pass it on privately.</p>
              <p className="mt-3 select-all rounded-xl border border-[var(--line)] bg-[var(--bg-muted)] p-4 font-mono text-2xl font-extrabold">{reset.password}</p>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function AccessPage({ onSummaryChanged }) {
  const [tab, setTab] = useState('requests');
  const notify = useCallback(() => window.dispatchEvent(new Event('civicpulse:requests-changed')), []);

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="People who asked for access. Read each request, then accept it (pick the role, the account is made for you) or reject it with a reason."
        actions={
          <button type="button" onClick={() => { window.dispatchEvent(new Event('civicpulse:requests-changed')); }} className={btnTool} aria-label="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      />
      <div className="flex gap-1.5 rounded-xl bg-[var(--bg-muted)] p-1" role="tablist">
        {[['requests', 'New requests'], ['users', 'Accounts']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === id ? 'bg-[var(--bg-elevated)] text-[var(--brand)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'requests' ? <RequestsTab onChanged={() => { notify(); onSummaryChanged?.(); }} /> : <UsersTab />}
    </section>
  );
}
