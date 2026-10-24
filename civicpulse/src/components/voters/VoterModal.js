import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, History, Home, MapPin, Pencil, X } from 'lucide-react';
import { apiAssetUrl } from '../../api/baseUrl';
import { getVoter, getVoterHistory, updateVoter } from '../../api/voters';
import { useAuth } from '../../auth/AuthContext';
import { ROLES, ROLE_LABELS } from '../../auth/roles';
import { btnPrimary, inputClass } from '../ui/Panel';
import {
  genderColor,
  genderLabel,
  initials,
  missingFields,
  niceName,
  relationLabel,
  roadName,
} from '../../utils/voterFormat';

const assetUrl = apiAssetUrl;
const label = (v) => String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** One labelled line: label on the left, value on the right. */
function Row({ label, children, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2 last:border-b-0">
      <dt className="shrink-0 text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-sm font-semibold text-[var(--ink)] ${mono ? 'font-mono' : ''}`}>
        {children || <span className="font-normal text-[var(--muted)]">Not read</span>}
      </dd>
    </div>
  );
}

function SectionTitle({ icon: IconCmp, children }) {
  return (
    <h3 className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
      {IconCmp ? <IconCmp className="h-3.5 w-3.5" /> : null}
      {children}
    </h3>
  );
}

const STATUSES = ['active', 'visited', 'callback', 'shifted', 'deceased', 'duplicate', 'inactive'];
const LEANS = ['strong_yes', 'lean_yes', 'undecided', 'lean_no', 'strong_no', 'unknown'];
const STATUS_LABEL = { active: 'Not contacted yet', visited: 'Visited', callback: 'Call back later', shifted: 'Shifted away', deceased: 'Deceased', duplicate: 'Duplicate entry', inactive: 'Inactive' };
const LEAN_LABEL = { strong_yes: 'Strongly supports', lean_yes: 'Leans yes', undecided: 'Undecided', lean_no: 'Leans no', strong_no: 'Strongly against', unknown: 'Unknown' };
const FIELD_LABEL = { name: 'Name', relation_type: 'Relation', relation_name: 'Relative name', house_no: 'House number', epic: 'Voter ID', age: 'Age', gender: 'Gender', phone: 'Phone', status: 'Status', support_lean: 'Support', relationType: 'Relation', relationName: 'Relative name', houseNo: 'House number', supportLean: 'Support' };

function Input({ label: text, children }) {
  return (
    <label className="block text-[11px] font-semibold text-[var(--muted)]">
      {text}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function EditForm({ voter, role, onCancel, onSaved }) {
  const [f, setF] = useState({
    name: voter.name || '',
    relation_type: voter.relation_type || 'father',
    relation_name: voter.relation_name || '',
    house_no: voter.house_no || '',
    age: voter.age ?? '',
    gender: voter.gender || 'U',
    epic: voter.epic || '',
    phone: voter.phone || '',
    status: voter.status || 'active',
    support_lean: voter.support_lean || 'unknown',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateVoter(voter.id, { ...f, age: f.age === '' ? null : Number(f.age), actor_role: role });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <p className="text-xs text-[var(--muted)]">Compare with the printed card on the Details view. Only change what is wrong.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name">
          <input value={f.name} onChange={set('name')} required maxLength={200} className={`${inputClass} !py-2`} />
        </Input>
        <Input label="Voter ID">
          <input value={f.epic} onChange={set('epic')} maxLength={20} className={`${inputClass} !py-2 font-mono`} />
        </Input>
        <Input label="Relation">
          <select value={f.relation_type} onChange={set('relation_type')} className={`${inputClass} !py-2`}>
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="husband">Husband</option>
            <option value="other">Other relative</option>
          </select>
        </Input>
        <Input label="Relative’s name">
          <input value={f.relation_name} onChange={set('relation_name')} maxLength={200} className={`${inputClass} !py-2`} />
        </Input>
        <Input label="House number">
          <input value={f.house_no} onChange={set('house_no')} maxLength={40} className={`${inputClass} !py-2`} />
        </Input>
        <Input label="Phone">
          <input value={f.phone} onChange={set('phone')} inputMode="tel" maxLength={20} placeholder="Optional" className={`${inputClass} !py-2`} />
        </Input>
        <Input label="Age">
          <input value={f.age} onChange={set('age')} type="number" min="18" max="120" inputMode="numeric" className={`${inputClass} !py-2`} />
        </Input>
        <Input label="Gender">
          <select value={f.gender} onChange={set('gender')} className={`${inputClass} !py-2`}>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
            <option value="U">Not known</option>
          </select>
        </Input>
        <Input label="Status">
          <select value={f.status} onChange={set('status')} className={`${inputClass} !py-2`}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Input>
        <Input label="Support">
          <select value={f.support_lean} onChange={set('support_lean')} className={`${inputClass} !py-2`}>
            {LEANS.map((s) => (
              <option key={s} value={s}>
                {LEAN_LABEL[s]}
              </option>
            ))}
          </select>
        </Input>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
          Cancel
        </button>
        <button type="submit" disabled={busy} className={`${btnPrimary} !py-2`}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function HistoryPanel({ id }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getVoterHistory(id)
      .then(setEvents)
      .catch((err) => setError(err.message));
  }, [id]);
  const verb = { create: 'Added', update: 'Edited', delete: 'Deleted' };
  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!events) return <p className="py-6 text-center text-sm text-[var(--muted)]">Loading history…</p>;
  if (!events.length) return <p className="py-6 text-center text-sm text-[var(--muted)]">No changes have been made to this voter yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const keys = e.action === 'update' ? Object.keys(e.after_data || {}) : [];
        return (
          <li key={e.id} className="rounded-xl border border-[var(--line)] p-3">
            <p className="text-sm font-semibold text-[var(--ink)]">
              {verb[e.action] || e.action} <span className="font-normal text-[var(--muted)]">by {ROLE_LABELS[e.actor_role] || (e.actor_role === 'system' ? 'System' : 'Unknown')}</span>
            </p>
            <p className="text-xs text-[var(--muted)]">{new Date(e.created_at).toLocaleString()}</p>
            {keys.map((k) => (
              <p key={k} className="mt-1 text-xs text-[var(--ink-soft)]">
                {FIELD_LABEL[k] || k}: <span className="line-through">{String(e.before_data?.[k] ?? '—')}</span> → <span className="font-semibold">{String(e.after_data?.[k] ?? '—')}</span>
              </p>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

export default function VoterModal({ id, onClose, onSelect, onChanged }) {
  const { role } = useAuth();
  const canEdit = role !== ROLES.VIEWER && role !== ROLES.VOLUNTEER;
  const [mode, setMode] = useState('view');
  const [reloadKey, setReloadKey] = useState(0);
  const [voter, setVoter] = useState(null);
  const [error, setError] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVoter(null);
    setError('');
    setImgBroken(false);
    setImgLoaded(false);
    setPhotoBroken(false);
    getVoter(id)
      .then((data) => !cancelled && setVoter(data))
      .catch((err) => !cancelled && setError(err.message || 'Could not load this voter'));
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    setMode('view');
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const missing = voter ? missingFields(voter) : [];
  const household = voter?.household || [];
  const roll = voter?.roll_info;
  const road = voter ? roadName(voter) || roadName({ road: voter.road }) : '';

  // Rendered on <body>, outside the page: the page's entrance animation leaves a transform on it,
  // which would otherwise make "fixed" mean "fixed to the (scrolling) page" instead of the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Voter details"
    >
      {/* Plain, light backdrop: no blur, no black */}
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-[var(--ink)]/10" onClick={onClose} />

      <div className="relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_12px_40px_-12px_rgba(15,27,45,0.35)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          {voter ? (
            voter.photo_url && !photoBroken ? (
              <img
                src={assetUrl(voter.photo_url)}
                alt={niceName(voter.name)}
                onError={() => setPhotoBroken(true)}
                className="h-14 w-12 shrink-0 rounded-xl border border-[var(--line)] bg-[var(--bg-muted)] object-cover"
              />
            ) : (
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: genderColor(voter.gender) }}
                aria-hidden
              >
                {initials(voter.name)}
              </span>
            )
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-[var(--ink)]">
              {voter ? niceName(voter.name) : 'Voter details'}
            </h2>
            {voter ? (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Booth {voter.part_no}
                {voter.booth?.polling_station_name ? ` · ${voter.booth.polling_station_name}` : ''}
              </p>
            ) : null}
          </div>
          {voter ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMode(mode === 'history' ? 'view' : 'history')} title="History" aria-label="History" className={`rounded-lg p-1.5 transition hover:bg-[var(--bg-muted)] ${mode === 'history' ? 'text-[var(--brand)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
                <History className="h-[18px] w-[18px]" />
              </button>
              {canEdit ? (
                <button type="button" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')} title="Edit" aria-label="Edit" className={`rounded-lg p-1.5 transition hover:bg-[var(--bg-muted)] ${mode === 'edit' ? 'text-[var(--brand)]' : 'text-[var(--muted)] hover:text-[var(--brand)]'}`}>
                  <Pencil className="h-[18px] w-[18px]" />
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
            aria-label="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!voter && !error ? <p className="py-8 text-center text-sm text-[var(--muted)]">Loading details…</p> : null}

          {voter && mode === 'edit' ? (
            <EditForm
              voter={voter}
              role={role}
              onCancel={() => setMode('view')}
              onSaved={() => {
                setMode('view');
                setReloadKey((k) => k + 1);
                onChanged?.();
              }}
            />
          ) : null}
          {voter && mode === 'history' ? <HistoryPanel id={voter.id} /> : null}

          {voter && mode === 'view' ? (
            <div className="space-y-3">
              {missing.length ? (
                <div className="flex items-start gap-2 rounded-lg bg-[var(--viz-warn)]/15 px-3 py-2 text-xs text-[var(--ink-soft)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-ink)]" />
                  <p>
                    Could not be read from the list: <span className="font-semibold">{missing.join(', ')}</span>.
                    {voter.card_image_url ? ' Check the original card.' : ''}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                {/* Left: every detail */}
                <section>
                  <SectionTitle>Details</SectionTitle>
                  <dl>
                    <Row label="Voter ID" mono>
                      {voter.epic}
                    </Row>
                    <Row label="Age">{voter.age != null ? `${voter.age} years` : null}</Row>
                    <Row label="Gender">{voter.gender && voter.gender !== 'U' ? genderLabel(voter.gender) : null}</Row>
                    <Row label={`${relationLabel(voter.relation_type)}’s name`}>{niceName(voter.relation_name)}</Row>
                    <Row label="House number">
                      {voter.house_number || (voter.address_note ? 'No number on the list' : voter.house_no)}
                    </Row>
                    {voter.address_note ? <Row label="Address note">{voter.address_note}</Row> : null}
                    <Row label="Road">{road}</Row>
                    {voter.phone ? <Row label="Phone">{voter.phone}</Row> : null}
                    {voter.status ? <Row label="Status">{label(voter.status)}</Row> : null}
                    {voter.support_lean ? <Row label="Support">{label(voter.support_lean)}</Row> : null}
                  </dl>

                  <div className="mt-3">
                    <SectionTitle icon={MapPin}>Booth</SectionTitle>
                    <dl>
                      <Row label="Booth">{`Booth ${voter.part_no}`}</Row>
                      <Row label="Polling station">{voter.booth?.polling_station_name}</Row>
                      <Row label="Address">{voter.booth?.polling_station_address}</Row>
                      <Row label="Area">{voter.booth?.area_name}</Row>
                      {voter.booth?.ward ? <Row label="Ward">{voter.booth.ward}</Row> : null}
                      {voter.booth?.agent_name ? <Row label="Booth agent">{voter.booth.agent_name}</Row> : null}
                      {voter.booth?.coordinator_name ? <Row label="Coordinator">{voter.booth.coordinator_name}</Row> : null}
                    </dl>
                    <p className="mt-1.5 text-xs text-[var(--muted)]">
                      Voter no. {voter.serial_no} on the list{voter.page_no ? ` · page ${voter.page_no}` : ''}
                    </p>
                  </div>
                </section>

                {/* Right: the printed card, and others in the same house */}
                <div className="min-w-0 space-y-3">
                  {voter.card_image_url ? (
                    <section>
                      <SectionTitle>Original printed card</SectionTitle>
                      {imgBroken ? (
                        <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--muted)]">
                          The original card image is not available right now.
                        </p>
                      ) : (
                        <div className="relative aspect-[578/247] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-muted)]">
                          {!imgLoaded ? (
                            <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
                              Loading card…
                            </span>
                          ) : null}
                          <img
                            src={assetUrl(voter.card_image_url)}
                            alt={`Printed card of ${niceName(voter.name)}`}
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgBroken(true)}
                            className={`absolute inset-0 h-full w-full bg-white object-contain transition-opacity ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                          />
                        </div>
                      )}
                    </section>
                  ) : null}

                  {household.length ? (
                    <section>
                      <SectionTitle icon={Home}>Same house ({household.length})</SectionTitle>
                      <ul className="max-h-40 divide-y divide-[var(--line)] overflow-y-auto rounded-lg border border-[var(--line)]">
                        {household.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => onSelect(m.id)}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition hover:bg-[var(--bg-muted)]"
                            >
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: genderColor(m.gender) }} />
                              <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">{niceName(m.name)}</span>
                              <span className="whitespace-nowrap text-xs text-[var(--muted)]">
                                {m.age != null ? `Age ${m.age}` : 'Age not read'}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </div>

              {roll ? (
                <p className="border-t border-[var(--line)] pt-2.5 text-xs text-[var(--muted)]">
                  <span className="font-semibold text-[var(--ink-soft)]">Polling area:</span> {roll.assembly}
                  {roll.main_town ? ` · ${roll.main_town}` : ''}
                  {roll.pin_code ? ` · ${roll.pin_code}` : ''}
                  {roll.publication_date ? ` · List published ${roll.publication_date}` : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
