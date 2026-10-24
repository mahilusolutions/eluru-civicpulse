import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Eye, KeyRound, LogOut, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck, UserX, X } from 'lucide-react';
import {
  approveRequest, createUser, deleteAccessRequest, deleteUser, listAccessRequests, listUsers, rejectRequest, resetUserPassword, revokeUserSessions, updateAccessRequest, updateUser,
} from '../api/access';
import { useAuth } from '../auth/AuthContext';
import { REQUESTABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_OPTIONS } from '../auth/roles';
import AlertBanner from '../components/ui/AlertBanner';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { btnPrimary, inputClass } from '../components/ui/Panel';
import { FilterField, FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, useViewMode } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { alnumUpper, mobileDigits, nameOnly } from '../utils/inputFilters';
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
const iconBtn = 'rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-40';
const dangerIconBtn = 'rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40';

function Detail({ label, children, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-[var(--ink)]">{children || '—'}</p>
    </div>
  );
}

/** A labelled box with its own error line, for the edit and add forms. */
function Box({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* optional */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Are-you-sure box used for every delete. */
function ConfirmDelete({ title, subtitle, children, confirmLabel = 'Delete', onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
          <button type="button" onClick={go} disabled={busy} className={`${btnPrimary} !bg-red-600 !py-2`}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <div className="text-sm leading-relaxed text-[var(--ink-soft)]">{children}</div>
    </Modal>
  );
}

// ------------------------------------------------------------------ one request, all details
function RequestModal({ row, onClose, onAccept, onReject, onEdit, onDelete }) {
  const pending = row.status === 'pending';
  return (
    <Modal
      title={row.full_name}
      subtitle={`${row.reference} · sent ${when(row.created_at)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onDelete} className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button type="button" onClick={onClose} className={cancelBtn}>Close</button>
          {pending ? (
            <>
              <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button type="button" onClick={onReject} className="rounded-xl border border-red-500/40 px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10">Reject</button>
              <button type="button" onClick={onAccept} className={`${btnPrimary} !py-2`}>Accept and create account</button>
            </>
          ) : null}
        </>
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
            <Detail label="Account">{row.account_username || 'The account was deleted'}</Detail>
            <Detail label="Role given">{ROLE_LABELS[row.account_role] || row.account_role}</Detail>
            <Detail label="Login collected by the applicant">{row.credential_revealed_at ? `Yes, ${when(row.credential_revealed_at)}` : 'Not yet'}</Detail>
          </>
        ) : null}
        {row.admin_note ? <Detail label={row.status === 'rejected' ? 'Reason given' : 'Note to the applicant'} wide>{row.admin_note}</Detail> : null}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ edit a waiting request
function EditRequestModal({ row, onClose, onDone }) {
  const [f, setF] = useState({
    full_name: row.full_name || '', mobile: row.mobile || '', email: row.email || '', designation: row.designation || '', area: row.area || '',
    requested_role: row.requested_role, voter_id: row.voter_id || '', reason: row.reason || '', referred_by: row.referred_by || '',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, clean) => (e) => {
    setF((x) => ({ ...x, [k]: clean ? clean(e.target.value) : e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await updateAccessRequest(row.id, f);
      onDone(`Request ${row.reference} updated.`);
    } catch (err) {
      setMessage(err.message);
      if (err.errors) setErrors(err.errors);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Edit request"
      subtitle={`${row.reference} · still waiting`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className={`${btnPrimary} !py-2`}>{busy ? 'Saving…' : 'Save changes'}</button>
        </>
      }
    >
      <AlertBanner tone="danger" className="mb-3">{message}</AlertBanner>
      <div className="grid gap-4 sm:grid-cols-2">
        <Box id="e_name" label="Full name" error={errors.full_name}><input id="e_name" value={f.full_name} onChange={set('full_name', nameOnly)} maxLength={80} className={inputClass} /></Box>
        <Box id="e_mobile" label="Mobile number" error={errors.mobile}><input id="e_mobile" value={f.mobile} onChange={set('mobile', mobileDigits)} inputMode="numeric" className={inputClass} /></Box>
        <Box id="e_email" label="Email" error={errors.email}><input id="e_email" value={f.email} onChange={set('email')} maxLength={120} className={inputClass} /></Box>
        <Box id="e_vid" label="Voter ID" error={errors.voter_id}><input id="e_vid" value={f.voter_id} onChange={set('voter_id', alnumUpper)} maxLength={16} className={inputClass} /></Box>
        <Box id="e_desig" label="Role or organisation" error={errors.designation}><input id="e_desig" value={f.designation} onChange={set('designation')} maxLength={80} className={inputClass} /></Box>
        <Box id="e_area" label="Ward, booth or locality" error={errors.area}><input id="e_area" value={f.area} onChange={set('area')} maxLength={120} className={inputClass} /></Box>
        <Box id="e_role" label="Access requested" error={errors.requested_role}>
          <select id="e_role" value={f.requested_role} onChange={set('requested_role')} className={inputClass}>
            {REQUESTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Box>
        <Box id="e_ref" label="Recommended by" error={errors.referred_by}><input id="e_ref" value={f.referred_by} onChange={set('referred_by')} maxLength={120} className={inputClass} /></Box>
        <div className="sm:col-span-2">
          <Box id="e_reason" label="Why access is needed" error={errors.reason}><textarea id="e_reason" value={f.reason} onChange={set('reason')} rows={3} maxLength={500} className={`${inputClass} resize-y`} /></Box>
        </div>
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
          <button type="button" onClick={confirm} disabled={busy} className={`${btnPrimary} !py-2`}>{busy ? 'Creating…' : 'Create account'}</button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <p className="mb-3 text-sm text-[var(--ink-soft)]">
        {row.full_name} asked for <span className="font-semibold">{ROLE_LABELS[row.requested_role]}</span> access for <span className="font-semibold">{row.area}</span>.
      </p>
      <label htmlFor="role" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Role to give</label>
      <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
        {REQUESTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{ROLE_DESCRIPTIONS[role]}</p>
      <label htmlFor="note" className="mb-1.5 mt-4 block text-xs font-semibold text-[var(--muted)]">Note for the applicant (optional)</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} placeholder="A short message the applicant will see with their login" className={`${inputClass} resize-y`} />
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
          <button type="button" onClick={confirm} disabled={busy || reason.trim().length < 5} className={`${btnPrimary} !bg-red-600 !py-2`}>{busy ? 'Rejecting…' : 'Reject request'}</button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <label htmlFor="why" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Reason (the applicant will see this)</label>
      <textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={300} autoFocus placeholder="Why the request is not approved" className={`${inputClass} resize-y`} />
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
  const [open, setOpen] = useState(null); // { row, mode: view | accept | reject | edit | delete }
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

  const actions = (r) => (
    <span className="inline-flex items-center gap-1.5">
      {r.status === 'pending' ? (
        <>
          <button type="button" onClick={() => setOpen({ row: r, mode: 'accept' })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:brightness-110">
            <Check className="h-3.5 w-3.5" />
            Accept
          </button>
          <button type="button" onClick={() => setOpen({ row: r, mode: 'reject' })} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/10">
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </>
      ) : null}
      <button type="button" onClick={() => setOpen({ row: r, mode: 'view' })} title="Read the request" aria-label="Read the request" className={iconBtn}>
        <Eye className="h-4 w-4" />
      </button>
      {r.status === 'pending' ? (
        <button type="button" onClick={() => setOpen({ row: r, mode: 'edit' })} title="Edit the details" aria-label="Edit the details" className={iconBtn}>
          <Pencil className="h-4 w-4" />
        </button>
      ) : null}
      <button type="button" onClick={() => setOpen({ row: r, mode: 'delete' })} title="Delete this request" aria-label="Delete this request" className={dangerIconBtn}>
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
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
    { key: 'actions', header: 'Actions', truncate: false, align: 'right', sticky: 'right', cell: actions, width: '20rem' },
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

      {open?.mode === 'view' ? (
        <RequestModal
          row={open.row}
          onClose={() => setOpen(null)}
          onAccept={() => setOpen({ row: open.row, mode: 'accept' })}
          onReject={() => setOpen({ row: open.row, mode: 'reject' })}
          onEdit={() => setOpen({ row: open.row, mode: 'edit' })}
          onDelete={() => setOpen({ row: open.row, mode: 'delete' })}
        />
      ) : null}
      {open?.mode === 'accept' ? <AcceptModal row={open.row} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.mode === 'reject' ? <RejectModal row={open.row} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.mode === 'edit' ? <EditRequestModal row={open.row} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.mode === 'delete' ? (
        <ConfirmDelete
          title="Delete this request?"
          subtitle={`${open.row.full_name} · ${open.row.reference}`}
          onClose={() => setOpen(null)}
          onConfirm={async () => {
            await deleteAccessRequest(open.row.id);
            done(`Request ${open.row.reference} deleted.`);
          }}
        >
          <p>It is removed from the list for good, and the applicant can no longer check it with the reference number.</p>
          {open.row.status === 'approved' ? <p className="mt-2 font-semibold">The account that was created from it is not deleted. Remove it from the Accounts tab if you want it gone too.</p> : null}
        </ConfirmDelete>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ add / edit an account
function AccountFormModal({ user, self, onClose, onDone }) {
  const editing = Boolean(user);
  const [f, setF] = useState({
    full_name: user?.full_name || '', username: user?.username || '', mobile: user?.mobile || '', email: user?.email || '', role: user?.role || 'volunteer', status: user?.status || 'active',
  });
  const [typed, setTyped] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k, clean) => (e) => {
    setF((x) => ({ ...x, [k]: clean ? clean(e.target.value) : e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function save() {
    setBusy(true);
    setMessage('');
    setErrors({});
    try {
      if (editing) {
        const changes = {};
        ['full_name', 'username', 'mobile', 'email', 'role', 'status'].forEach((k) => {
          if (String(f[k] ?? '') !== String(user[k] ?? '')) changes[k] = f[k];
        });
        if (!Object.keys(changes).length) {
          setMessage('Nothing was changed.');
          setBusy(false);
          return;
        }
        await updateUser(user.id, changes);
        onDone(`${f.username} updated.`);
      } else {
        const payload = { full_name: f.full_name, mobile: f.mobile, email: f.email, role: f.role, username: f.username || undefined, password: typed ? password : undefined };
        setResult(await createUser(payload));
        setBusy(false);
      }
    } catch (err) {
      setMessage(err.message);
      if (err.errors) setErrors(err.errors);
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal
        title="Account created"
        subtitle={f.full_name}
        size="md"
        onClose={() => onDone(`Account ${result.username} created.`)}
        footer={<button type="button" onClick={() => onDone(`Account ${result.username} created.`)} className={`${btnPrimary} !py-2`}>Done</button>}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] p-3.5">
            <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Username</dt>
            <dd className="mt-1 flex flex-wrap items-center justify-between gap-2"><span className="select-all break-all font-mono text-lg font-bold">{result.username}</span><CopyButton text={result.username} /></dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3.5">
            <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Temporary password</dt>
            <dd className="mt-1 flex flex-wrap items-center justify-between gap-2"><span className="select-all break-all font-mono text-lg font-bold">{result.password}</span><CopyButton text={result.password} /></dd>
          </div>
        </dl>
        <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <span className="font-bold">Shown only now.</span> Pass these on privately. {result.role_label}: the person must choose their own password the first time they sign in.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={editing ? 'Edit account' : 'Add account'}
      subtitle={editing ? `${user.username}${self ? ' · this is you' : ''}` : 'For someone who did not use the request form'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className={`${btnPrimary} !py-2`}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</button>
        </>
      }
    >
      <AlertBanner tone="danger" className="mb-3">{message}</AlertBanner>
      <div className="grid gap-4 sm:grid-cols-2">
        <Box id="a_name" label="Full name" error={errors.full_name}><input id="a_name" value={f.full_name} onChange={set('full_name', nameOnly)} maxLength={80} className={inputClass} placeholder="Full name" /></Box>
        <Box id="a_user" label={editing ? 'Username' : 'Username (optional)'} error={errors.username} hint={editing ? 'Changing it signs the person out.' : 'Leave empty to create one from the name and mobile.'}>
          <input id="a_user" value={f.username} onChange={set('username', (v) => v.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} maxLength={30} className={`${inputClass} font-mono`} placeholder={editing ? 'Username' : 'Created automatically'} autoCapitalize="none" spellCheck={false} />
        </Box>
        <Box id="a_mobile" label="Mobile number" error={errors.mobile}><input id="a_mobile" value={f.mobile} onChange={set('mobile', mobileDigits)} inputMode="numeric" className={inputClass} placeholder="10-digit mobile number" /></Box>
        <Box id="a_email" label="Email" error={errors.email}><input id="a_email" value={f.email} onChange={set('email')} maxLength={120} className={inputClass} placeholder="Email address" /></Box>
        <Box id="a_role" label="Role" error={errors.role} hint={ROLE_DESCRIPTIONS[f.role]}>
          <select id="a_role" value={f.role} onChange={set('role')} disabled={editing && self} className={inputClass}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Box>
        {editing ? (
          <Box id="a_status" label="Status" error={errors.status} hint={self ? 'You cannot disable yourself.' : 'A disabled account cannot sign in.'}>
            <select id="a_status" value={f.status} onChange={set('status')} disabled={self} className={inputClass}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </Box>
        ) : null}
      </div>

      {f.role === 'super_admin' && (!editing || user.role !== 'super_admin') ? (
        <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          A Super Admin can see everything, approve new users and delete accounts. Give this role only to people you fully trust.
        </p>
      ) : null}

      {!editing ? (
        <div className="mt-5 rounded-xl border border-[var(--line)] p-3.5">
          <p className="text-xs font-semibold text-[var(--muted)]">Temporary password</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="radio" name="pw" checked={!typed} onChange={() => setTyped(false)} className="accent-[var(--brand)]" />
              Make a random one (recommended)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="radio" name="pw" checked={typed} onChange={() => setTyped(true)} className="accent-[var(--brand)]" />
              I will type one
            </label>
          </div>
          {typed ? (
            <div className="mt-3">
              <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} font-mono`} placeholder="At least 8 characters" autoComplete="off" spellCheck={false} aria-label="Temporary password" />
              {errors.password ? <p className="mt-1 text-xs font-medium text-red-600">{errors.password}</p> : null}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]">Either way it is only temporary: the person must choose their own password when they first sign in.</p>
        </div>
      ) : null}
    </Modal>
  );
}

// ------------------------------------------------------------------ accounts tab
function UsersTab() {
  const { user: me } = useAuth();
  const users = useApi(listUsers, []);
  const rows = useMemo(() => users.data || [], [users.data]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // { mode: add | edit | delete | reset, user, ... }
  const [view, setView] = useViewMode('civicpulse_users_view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const shown = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: rows.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, rows.length), total: rows.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };
  const isSelf = (u) => String(u.id) === String(me?.id);

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

  const finished = (msg) => {
    setDialog(null);
    setNotice(msg);
    users.reload({ silent: true });
  };

  const actions = (u) => {
    const self = isSelf(u);
    return (
      <span className="inline-flex items-center gap-1.5">
        {self ? <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)]"><ShieldCheck className="h-3.5 w-3.5" /> You</span> : null}
        <button type="button" onClick={() => setDialog({ mode: 'edit', user: u })} title="Edit" aria-label={`Edit ${u.username}`} className={iconBtn}>
          <Pencil className="h-4 w-4" />
        </button>
        {!self ? (
          <>
            <button type="button" disabled={busyId === u.id} title="Make a new temporary password" aria-label="Reset password" onClick={() => setDialog({ mode: 'reset', user: u })} className={iconBtn}>
              <KeyRound className="h-4 w-4" />
            </button>
            <button type="button" disabled={busyId === u.id || !u.active_sessions} title="Sign out of every device" aria-label="Sign out everywhere" onClick={() => run(u, () => revokeUserSessions(u.id), (o) => `${u.username} was signed out of ${o.revoked} device(s).`)} className={iconBtn}>
              <LogOut className="h-4 w-4" />
            </button>
            <button type="button" disabled={busyId === u.id} onClick={() => run(u, () => updateUser(u.id, { status: u.status === 'active' ? 'disabled' : 'active' }), () => `${u.username} ${u.status === 'active' ? 'disabled' : 're-enabled'}.`)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${u.status === 'active' ? 'border-amber-500/40 text-amber-700 hover:bg-amber-500/10' : 'border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10'}`}>
              {u.status === 'active' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              {u.status === 'active' ? 'Disable' : 'Enable'}
            </button>
            <button type="button" onClick={() => setDialog({ mode: 'delete', user: u })} title="Delete this account" aria-label={`Delete ${u.username}`} className={dangerIconBtn}>
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </span>
    );
  };

  const roleCell = (u) =>
    u.role === 'super_admin' || isSelf(u) ? (
      <span className="font-semibold">{ROLE_LABELS[u.role]}</span>
    ) : (
      <select value={u.role} disabled={busyId === u.id} onChange={(e) => run(u, () => updateUser(u.id, { role: e.target.value }), () => `${u.username} is now ${ROLE_LABELS[e.target.value]}.`)} aria-label={`Role of ${u.username}`} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs font-semibold outline-none focus:border-[var(--brand)]">
        {REQUESTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">Everyone who can sign in. Changing a role, disabling or deleting an account signs that person out at once.</p>
        <div className="flex items-center gap-2">
          <ViewSwitch view={view} onChange={setView} />
          <button type="button" onClick={() => setDialog({ mode: 'add' })} className={`${btnPrimary} !py-2`}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add account
          </button>
        </div>
      </div>
      <AlertBanner tone="danger">{error || users.error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>
      <DataList view={view} columns={columns} rows={shown} rowKey="id" renderCard={renderCard} loading={users.loading && !users.data} pagination={paging} emptyTitle="No accounts yet" emptyDescription="Accounts appear here when you accept a request or add one." />

      {dialog?.mode === 'add' ? <AccountFormModal onClose={() => setDialog(null)} onDone={finished} /> : null}
      {dialog?.mode === 'edit' ? <AccountFormModal user={dialog.user} self={isSelf(dialog.user)} onClose={() => setDialog(null)} onDone={finished} /> : null}
      {dialog?.mode === 'delete' ? (
        <ConfirmDelete
          title="Delete this account?"
          subtitle={`${dialog.user.username} · ${ROLE_LABELS[dialog.user.role]}`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteUser(dialog.user.id);
            finished(`Account ${dialog.user.username} deleted.`);
          }}
        >
          <p><span className="font-semibold">{dialog.user.full_name}</span> is signed out at once and can no longer sign in. This cannot be undone. Disable the account instead if you may need it again.</p>
          {dialog.user.role === 'super_admin' ? <p className="mt-2 font-semibold text-red-600">This is a Super Admin account.</p> : null}
        </ConfirmDelete>
      ) : null}
      {dialog?.mode === 'reset' ? (
        <ResetModal user={dialog.user} onClose={() => { setDialog(null); users.reload({ silent: true }); }} />
      ) : null}
    </div>
  );
}

function ResetModal({ user, onClose }) {
  const [state, setState] = useState({ busy: false, error: '', out: null });
  async function go() {
    setState({ busy: true, error: '', out: null });
    try {
      setState({ busy: false, error: '', out: await resetUserPassword(user.id) });
    } catch (err) {
      setState({ busy: false, error: err.message, out: null });
    }
  }
  const { busy, error, out } = state;
  return (
    <Modal
      title="Reset password"
      subtitle={user.username}
      size="md"
      onClose={onClose}
      footer={
        out ? (
          <button type="button" onClick={onClose} className={`${btnPrimary} !py-2`}>Done</button>
        ) : (
          <>
            <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
            <button type="button" onClick={go} disabled={busy} className={`${btnPrimary} !py-2`}>{busy ? 'Resetting…' : 'Reset password'}</button>
          </>
        )
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      {!out ? (
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">Make a new temporary password for <span className="font-semibold">{user.full_name}</span>. They are signed out everywhere and must choose a new password at the next sign-in.</p>
      ) : out.delivered === 'status_page' ? (
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          A new one-time password was created. <span className="font-semibold">{user.full_name}</span> collects it on the website under <span className="font-semibold">Check request status</span> with their reference number and mobile number. You do not see it.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--ink-soft)]">This account was not created from a request, so the temporary password is shown to you once. Pass it on privately.</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-muted)] p-4">
            <span className="select-all font-mono text-2xl font-extrabold">{out.password}</span>
            <CopyButton text={out.password} />
          </div>
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ page
export default function AccessPage({ onSummaryChanged }) {
  const [tab, setTab] = useState('requests');
  const notify = useCallback(() => window.dispatchEvent(new Event('civicpulse:requests-changed')), []);

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="People who asked for access, and everyone who can sign in. Read each request, then accept it (pick the role, the account is made for you), reject it with a reason, edit it or delete it. You can also add and manage accounts yourself."
        actions={
          <button type="button" onClick={() => notify()} className={btnTool} aria-label="Refresh">
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
