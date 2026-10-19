import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Home, X } from 'lucide-react';
import { apiAssetUrl } from '../../api/baseUrl';
import { getVoter } from '../../api/voters';
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

export default function VoterModal({ id, onClose, onSelect }) {
  const [voter, setVoter] = useState(null);
  const [error, setError] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVoter(null);
    setError('');
    setImgBroken(false);
    setImgLoaded(false);
    getVoter(id)
      .then((data) => !cancelled && setVoter(data))
      .catch((err) => !cancelled && setError(err.message || 'Could not load this voter'));
    return () => {
      cancelled = true;
    };
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
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: genderColor(voter.gender) }}
              aria-hidden
            >
              {initials(voter.name)}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-[var(--ink)]">
              {voter ? niceName(voter.name) : 'Voter details'}
            </h2>
            {voter ? (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Booth {voter.part_no} · Voter no. {voter.serial_no}
                {voter.page_no ? ` · List page ${voter.page_no}` : ''}
              </p>
            ) : null}
          </div>
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

          {voter ? (
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
                    <Row label="Booth">{String(voter.part_no)}</Row>
                    <Row label="Voter no. in list">{String(voter.serial_no)}</Row>
                    <Row label="List page">{voter.page_no ? String(voter.page_no) : null}</Row>
                  </dl>
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
