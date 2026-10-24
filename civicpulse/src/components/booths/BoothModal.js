import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { apiAssetUrl } from '../../api/baseUrl';
import { getBooth, updateBooth } from '../../api/booths';
import { btnPrimary, inputClass } from '../ui/Panel';
import { AgePyramid, BarList } from '../voters/VoterCharts';
import { BOOTH_STATUS, boothStatus, reachedPct, stationName } from '../../utils/boothFormat';
import { fmt, niceName, pct } from '../../utils/voterFormat';

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2 last:border-b-0">
      <dt className="shrink-0 text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-semibold text-[var(--ink)]">
        {children || <span className="font-normal text-[var(--muted)]">—</span>}
      </dd>
    </div>
  );
}

function Title({ children }) {
  return <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{children}</h3>;
}

export default function BoothModal({ part, canEdit, onClose, onSaved }) {
  const navigate = useNavigate();
  const [booth, setBooth] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ agent_name: '', coordinator_name: '', status: 'pending', lat: '', lng: '' });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [shot, setShot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setBooth(null);
    setError('');
    setNote('');
    getBooth(part)
      .then((data) => {
        if (cancelled) return;
        setBooth(data);
        setForm({
          agent_name: data.agent_name || '',
          coordinator_name: data.coordinator_name || '',
          status: data.status || 'pending',
          lat: data.lat ?? '',
          lng: data.lng ?? '',
        });
      })
      .catch((err) => !cancelled && setError(err.message || 'Could not load this booth'));
    return () => {
      cancelled = true;
    };
  }, [part]);

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

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setNote('');
    try {
      await updateBooth(part, { ...form, lat: form.lat === '' ? null : Number(form.lat), lng: form.lng === '' ? null : Number(form.lng) });
      const fresh = await getBooth(part);
      setBooth(fresh);
      setNote('Saved');
      onSaved?.();
    } catch (err) {
      setNote(err.message);
    } finally {
      setSaving(false);
    }
  }

  const status = boothStatus(booth?.status);
  const roll = booth?.roll_info;
  const cover = booth?.cover || {};
  const roads = (booth?.roads_list || []).map((r) => ({
    key: String(r.section_no),
    label: niceName(r.section_name),
    value: r.count,
  }));
  const reached = reachedPct(booth);
  const dirty =
    booth &&
    (form.agent_name !== (booth.agent_name || '') ||
      form.coordinator_name !== (booth.coordinator_name || '') ||
      form.status !== (booth.status || 'pending') ||
      String(form.lat) !== String(booth.lat ?? '') ||
      String(form.lng) !== String(booth.lng ?? ''));

  // On <body>, outside the page, so "fixed" means the screen (the page has a transform animation).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Booth details">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-[var(--ink)]/10" onClick={onClose} />

      <div className="relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_12px_40px_-12px_rgba(15,27,45,0.35)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">
            {part}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-[var(--ink)]">
              {booth ? stationName(booth.polling_station_name, part) : `Booth ${part}`}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              Booth {part}
              {booth ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: status.color }} />
                    {status.label}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]" aria-label="Close details">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!booth && !error ? <p className="py-8 text-center text-sm text-[var(--muted)]">Loading details…</p> : null}

          {booth ? (
            <div className="space-y-4">
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                <section>
                  <Title>Details</Title>
                  <dl>
                    <Row label="Polling station">{stationName(booth.polling_station_name, part)}</Row>
                    <Row label="Address">{booth.polling_station_address}</Row>
                    <Row label="Constituency">{roll?.assembly || `${booth.ac_name} (${booth.ac_code})`}</Row>
                    <Row label="Place">{[cover.main_town || roll?.main_town, cover.pin_code || roll?.pin_code].filter(Boolean).join(' · ')}</Row>
                    <Row label="Post office">{cover.post_office}</Row>
                    <Row label="Police station">{cover.police_station}</Row>
                    <Row label="Mandal · District">{[cover.mandal, cover.district].filter(Boolean).join(' · ')}</Row>
                    <Row label="Station type">{[cover.station_type, cover.auxiliary_stations != null ? `${cover.auxiliary_stations} auxiliary` : null].filter(Boolean).join(' · ')}</Row>
                    <Row label="Ward">{booth.ward_name ? `${booth.ward_no ? `Ward ${booth.ward_no} · ` : ''}${booth.ward_name}` : null}</Row>
                    <Row label="Booth agent">{booth.agent_name || 'Not assigned'}</Row>
                    <Row label="Coordinator">{booth.coordinator_name || 'Not assigned'}</Row>
                    <Row label="Location">{booth.lat != null && booth.lng != null ? `${booth.lat}, ${booth.lng}` : 'Not set'}</Row>
                    <Row label="Voters">{fmt(booth.voters)}</Row>
                    <Row label="Men · Women">
                      {fmt(booth.male)} · {fmt(booth.female)}
                      {booth.unknown ? ` (+${booth.unknown} not read)` : ''}
                    </Row>
                    <Row label="Households">{fmt(booth.households)}</Row>
                    <Row label="Roads">{fmt(booth.roads)}</Row>
                    <Row label="Average age">{booth.avg_age ? `${Math.round(booth.avg_age)} years` : null}</Row>
                    <Row label="Voter IDs read">
                      {fmt(booth.with_epic)} of {fmt(booth.voters)} ({pct(booth.with_epic, booth.voters)}%)
                    </Row>
                    <Row label="Reached so far">
                      {fmt(booth.reached)} of {fmt(booth.voters)} ({reached}%)
                    </Row>
                    <Row label="List published">{cover.publication_date || roll?.publication_date}</Row>
                    <Row label="Roll">{[cover.roll_year, cover.roll_type].filter(Boolean).join(' · ')}</Row>
                    <Row label="Printed on the roll">
                      {cover.roll_total != null ? `${fmt(cover.roll_total)} voters (${fmt(cover.roll_male)} men · ${fmt(cover.roll_female)} women${cover.roll_third ? ` · ${fmt(cover.roll_third)} third gender` : ''})` : null}
                    </Row>
                  </dl>
                </section>

                <div className="min-w-0 space-y-4">
                  <section>
                    <Title>Roads in this booth · click one to see its voters</Title>
                    <BarList items={roads} onPick={(item) => navigate(`/app/voters?part=${part}&section=${item.key}`)} empty="No roads read from the list." />
                  </section>
                  <section>
                    <Title>Age groups · click one to see those voters</Title>
                    <AgePyramid bands={booth.age_bands || []} active={null} onPick={(band) => band !== 'all' && navigate(`/app/voters?part=${part}&age=${encodeURIComponent(band)}`)} />
                  </section>
                </div>
              </div>

              {booth.pictures?.length ? (
                <section>
                  <Title>Booth pictures · click to enlarge</Title>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {booth.pictures.map((m) => (
                      <button key={m.kind} type="button" onClick={() => setShot(m)} className="group overflow-hidden rounded-xl border border-[var(--line)] bg-white text-left transition hover:border-[var(--brand)]">
                        <div className="flex aspect-[4/3] items-center justify-center bg-[var(--bg-muted)]">
                          <img src={apiAssetUrl(m.url)} alt={m.label} loading="lazy" className="h-full w-full object-contain" />
                        </div>
                        <span className="block border-t border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] group-hover:text-[var(--brand)]">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-muted)]/50 p-3">
                <Title>Who looks after this booth</Title>
                {canEdit ? (
                  <form onSubmit={save} className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem] sm:items-end">
                    <label className="block text-[11px] font-semibold text-[var(--muted)]">
                      Booth agent
                      <input
                        value={form.agent_name}
                        onChange={(e) => setForm({ ...form, agent_name: e.target.value })}
                        placeholder="Name"
                        className={`${inputClass} mt-1 !py-2`}
                      />
                    </label>
                    <label className="block text-[11px] font-semibold text-[var(--muted)]">
                      Coordinator
                      <input
                        value={form.coordinator_name}
                        onChange={(e) => setForm({ ...form, coordinator_name: e.target.value })}
                        placeholder="Name"
                        className={`${inputClass} mt-1 !py-2`}
                      />
                    </label>
                    <label className="block text-[11px] font-semibold text-[var(--muted)]">
                      Status
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className={`${inputClass} mt-1 !py-2`}
                      >
                        {BOOTH_STATUS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="sm:col-span-3">
                      <p className="mb-1 text-[11px] font-semibold text-[var(--muted)]">Where is the polling station? (for the Map page)</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={form.lat}
                          onChange={(e) => setForm({ ...form, lat: e.target.value })}
                          inputMode="decimal"
                          placeholder="Latitude, e.g. 16.7107"
                          aria-label="Latitude"
                          className={`${inputClass} !py-2`}
                        />
                        <input
                          value={form.lng}
                          onChange={(e) => setForm({ ...form, lng: e.target.value })}
                          inputMode="decimal"
                          placeholder="Longitude, e.g. 81.0952"
                          aria-label="Longitude"
                          className={`${inputClass} !py-2`}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">In Google Maps, right-click the school and click the two numbers to copy them.</p>
                    </div>
                    <button type="submit" disabled={saving || !dirty} className={`${btnPrimary} !py-2 sm:col-span-3 sm:justify-self-end`}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </form>
                ) : (
                  <dl>
                    <Row label="Booth agent">{booth.agent_name || 'Not assigned'}</Row>
                    <Row label="Coordinator">{booth.coordinator_name || 'Not assigned'}</Row>
                    <Row label="Location">{booth.lat != null && booth.lng != null ? `${booth.lat}, ${booth.lng}` : 'Not set'}</Row>
                  </dl>
                )}
                {note ? (
                  <p className="mt-2 text-xs font-medium text-[var(--ink-soft)]" role="status">
                    {note}
                  </p>
                ) : null}
              </section>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {booth.lat != null && booth.lng != null ? (
                  <a
                    href={`https://www.google.com/maps?q=${booth.lat},${booth.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
                <Link
                  to={`/app/voters?part=${part}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  See the {fmt(booth.voters)} voters
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {shot ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--ink)]/60 p-3" role="dialog" aria-label={shot.label}>
          <button type="button" aria-label="Close image" className="absolute inset-0 cursor-default" onClick={() => setShot(null)} />
          <div className="relative flex max-h-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
              <p className="text-sm font-bold text-[var(--ink)]">
                {shot.label}
              </p>
              <div className="flex items-center gap-2">
                <a href={apiAssetUrl(shot.url)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--brand)] hover:underline">
                  Open full size
                </a>
                <button type="button" onClick={() => setShot(null)} className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--bg-muted)]" aria-label="Close image">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto">
              <img src={apiAssetUrl(shot.url)} alt={shot.label} className="mx-auto h-auto w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
