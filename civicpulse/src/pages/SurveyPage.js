import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Plus, RefreshCw } from 'lucide-react';
import { getBooths } from '../api/booths';
import { createSurvey, createSurveyResponse, deleteSurvey, getSurveys } from '../api/survey';
import { useAuth } from '../auth/AuthContext';
import { ROLES, ROLE_LABELS } from '../auth/roles';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmButton from '../components/ui/ConfirmButton';
import DataList, { CardShell } from '../components/ui/DataList';
import LoadingBlock from '../components/ui/LoadingBlock';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { Field, btnPrimary } from '../components/ui/Panel';
import { FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, btnToolPrimary, inputSm, useChartsOpen, useViewMode } from '../components/ui/kit';
import { BarList, ChartCard } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { stationName } from '../utils/boothFormat';
import { fmt, pct } from '../utils/voterFormat';

const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function SurveyModal({ survey, canEdit, onClose, onSaved }) {
  const isNew = !survey;
  const [form, setForm] = useState({ title: survey?.title || '', question: survey?.question || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createSurvey(form);
      onSaved(`Survey “${form.title}” created.`, created.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteSurvey(survey.id);
      onSaved('Survey deleted.', null);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'New survey' : 'Survey settings'}
      subtitle={isNew ? 'Ask one short question and collect answers from the field.' : `${fmt(survey.response_count)} answers collected`}
      size="md"
      onClose={onClose}
      footer={
        <>
          {!isNew && canEdit ? <ConfirmButton label="Delete survey" confirmLabel="Yes, delete it and its answers" onConfirm={remove} disabled={busy} /> : null}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            {isNew ? 'Cancel' : 'Close'}
          </button>
          {isNew ? (
            <button type="submit" form="survey-form" disabled={busy} className={`${btnPrimary} !py-2`}>
              {busy ? 'Creating…' : 'Create survey'}
            </button>
          ) : null}
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="survey-form" onSubmit={save} className="space-y-3">
        <Field label="Survey name">
          <input required autoFocus={isNew} disabled={!isNew} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Biggest local problem" className={inputSm} />
        </Field>
        <Field label="Question to ask people">
          <input required disabled={!isNew} maxLength={300} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="e.g. What is the one thing you want fixed in your area?" className={inputSm} />
        </Field>
      </form>
    </Modal>
  );
}

function ResponseModal({ survey, booths, role, onClose, onSaved }) {
  const [answer, setAnswer] = useState('');
  const [name, setName] = useState('');
  const [part, setPart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const common = survey.answers.slice(0, 6);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createSurveyResponse(survey.id, { answer, respondent_name: name || null, part_no: part || null, created_by_role: role });
      onSaved('Answer saved.');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add an answer"
      subtitle={survey.question}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Cancel
          </button>
          <button type="submit" form="answer-form" disabled={busy} className={`${btnPrimary} !py-2`}>
            {busy ? 'Saving…' : 'Save answer'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="answer-form" onSubmit={save} className="space-y-3">
        <Field label="What did they say?">
          <input required autoFocus maxLength={300} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type the answer" className={inputSm} />
        </Field>
        {common.length ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="w-full text-[11px] font-semibold text-[var(--muted)]">Or tap a common answer</span>
            {common.map((a) => (
              <button key={a.key} type="button" onClick={() => setAnswer(a.label)} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Their name (optional)">
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={inputSm} />
          </Field>
          <Field label="Booth (optional)">
            <select value={part} onChange={(e) => setPart(e.target.value)} className={inputSm}>
              <option value="">Not noted</option>
              {booths.map((b) => (
                <option key={b.part_no} value={b.part_no}>
                  Booth {b.part_no} · {stationName(b.polling_station_name, b.part_no)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function SurveyPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);
  const canAnswer = role !== ROLES.VIEWER;

  const surveysApi = useApi(getSurveys, []);
  const boothsApi = useApi(getBooths, []);
  const surveys = useMemo(() => surveysApi.data || [], [surveysApi.data]);
  const booths = useMemo(() => boothsApi.data || [], [boothsApi.data]);

  const [activeId, setActiveId] = useState(null);
  const [answerFilter, setAnswerFilter] = useState('');
  const [text, setText] = useState('');
  const [partFilter, setPartFilter] = useState('all');
  const [view, setView] = useViewMode('civicpulse_survey_view');
  const [chartsOpen, setChartsOpen] = useChartsOpen('civicpulse_survey_charts');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [modal, setModal] = useState(null); // 'new' | 'settings' | 'answer'
  const [notice, setNotice] = useState('');

  const active = surveys.find((s) => String(s.id) === String(activeId)) || surveys[0];
  useEffect(() => {
    setPage(1);
    setAnswerFilter('');
    setText('');
    setPartFilter('all');
  }, [active?.id, pageSize]);

  const responses = useMemo(() => {
    if (!active) return [];
    return active.responses.filter((r) => (!answerFilter || r.answer.trim().toLowerCase() === answerFilter) && (!text.trim() || r.answer.toLowerCase().includes(text.trim().toLowerCase())) && (partFilter === 'all' || String(r.part_no) === partFilter));
  }, [active, answerFilter, text, partFilter]);

  const pageCount = Math.max(1, Math.ceil(responses.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = responses.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: responses.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, responses.length), total: responses.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const refresh = () => surveysApi.reload({ silent: true });
  const top = active?.answers[0];
  const partsHeard = new Set((active?.responses || []).map((r) => r.part_no).filter(Boolean)).size;

  const columns = useMemo(
    () => [
      { key: 'answer', header: 'Answer', truncate: false, sticky: 'left', stickyOffset: 0, cell: (r) => <span className="inline-block min-w-[12rem] max-w-[28rem] font-semibold text-[var(--ink)]">{r.answer}</span> },
      { key: 'who', header: 'Who said it', accessor: (r) => r.respondent_name || 'Not noted' },
      { key: 'part', header: 'Booth', accessor: (r) => r.part_no ?? '—', align: 'center', className: 'tabular-nums font-semibold', width: '4.5rem' },
      { key: 'when', header: 'When', accessor: (r) => when(r.created_at), className: 'whitespace-nowrap tabular-nums text-[var(--ink-soft)]', width: '9rem' },
      { key: 'by', header: 'Collected by', accessor: (r) => ROLE_LABELS[r.created_by_role] || '—', width: '8rem' },
    ],
    []
  );

  const renderCard = (r) => (
    <CardShell>
      <p className="font-bold leading-snug text-[var(--ink)]">{r.answer}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Who said it">{r.respondent_name || 'Not noted'}</MiniFact>
        <MiniFact label="Booth">{r.part_no}</MiniFact>
        <MiniFact label="When">{when(r.created_at)}</MiniFact>
        <MiniFact label="Collected by">{ROLE_LABELS[r.created_by_role]}</MiniFact>
      </dl>
    </CardShell>
  );

  const chips = [
    answerFilter && { key: 'answer', label: `Answer: ${active?.answers.find((a) => a.key === answerFilter)?.label || answerFilter}`, onRemove: () => setAnswerFilter('') },
    partFilter !== 'all' && { key: 'part', label: `Booth ${partFilter}`, onRemove: () => setPartFilter('all') },
  ].filter(Boolean);

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Ask one short question in the field and see, at a glance, what people say."
        actions={
          <>
            {surveys.length > 1 ? (
              <select value={active?.id ?? ''} onChange={(e) => setActiveId(e.target.value)} aria-label="Choose a survey" className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] outline-none focus:border-[var(--brand)]">
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            ) : null}
            {active ? <ViewSwitch view={view} onChange={setView} /> : null}
            {active ? (
              <button type="button" onClick={() => setChartsOpen((o) => !o)} className={btnTool} aria-pressed={chartsOpen}>
                <BarChart3 className="h-3.5 w-3.5" />
                {chartsOpen ? 'Hide chart' : 'Show chart'}
              </button>
            ) : null}
            <button type="button" onClick={refresh} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {canEdit ? (
              <button type="button" onClick={() => setModal('new')} className={active ? btnTool : btnToolPrimary}>
                <Plus className="h-3.5 w-3.5" />
                New survey
              </button>
            ) : null}
            {active && canAnswer ? (
              <button type="button" onClick={() => setModal('answer')} className={btnToolPrimary}>
                <Plus className="h-3.5 w-3.5" />
                Add an answer
              </button>
            ) : null}
          </>
        }
      />

      <AlertBanner tone="danger">{surveysApi.error || boothsApi.error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>

      {surveysApi.loading && !surveysApi.data ? (
        <LoadingBlock label="Loading survey…" />
      ) : !active ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)]">
            <ClipboardList className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold text-[var(--ink)]">No survey yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
            {canEdit ? 'Create a survey with one question, then add the answers your team hears at the door.' : 'A coordinator can create a survey. Answers will appear here.'}
          </p>
          {canEdit ? (
            <button type="button" onClick={() => setModal('new')} className={`${btnToolPrimary} mt-4`}>
              <Plus className="h-3.5 w-3.5" />
              Create the first survey
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3.5 shadow-soft">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{active.title}</p>
              <p className="mt-0.5 text-base font-bold leading-snug text-[var(--ink)]">{active.question}</p>
            </div>
            <button type="button" onClick={() => setModal('settings')} className="shrink-0 text-xs font-semibold text-[var(--brand)] hover:underline">
              Settings
            </button>
          </div>

          <StatStrip
            items={[
              { label: 'Answers', value: fmt(active.response_count), hint: 'collected so far' },
              { label: 'Different answers', value: fmt(active.answers.length), hint: 'similar ones are counted together' },
              { label: 'Most common', value: top ? top.label : '—', hint: top ? `${top.count} people · ${pct(top.count, active.response_count)}%` : 'no answers yet' },
              { label: 'Booths heard from', value: fmt(partsHeard), hint: 'where answers came from' },
            ]}
          />

          {chartsOpen && active.answers.length ? (
            <ChartCard title="What people said" subtitle="Numbers show how many people · click a bar to see those answers">
              <BarList
                columns
                unit="people"
                items={active.answers.slice(0, 12).map((a) => ({ key: a.key, label: a.label, value: a.count }))}
                activeKey={answerFilter || null}
                onPick={(item) => setAnswerFilter(answerFilter === item.key ? '' : item.key)}
              />
            </ChartCard>
          ) : null}

          <FilterPanel
            search={text}
            onSearch={setText}
            placeholder="Search the answers…"
            chips={chips}
            onClearAll={() => {
              setAnswerFilter('');
              setText('');
              setPartFilter('all');
            }}
          />

          <DataList
            view={view}
            columns={columns}
            rows={rows}
            rowKey="id"
            renderCard={renderCard}
            pagination={paging}
            emptyTitle={chips.length ? 'No answers match' : 'No answers yet'}
            emptyDescription={chips.length ? 'Remove a filter to see more.' : canAnswer ? 'Choose “Add an answer” after your first conversation.' : 'Answers will appear here as the team collects them.'}
          />
        </>
      )}

      {modal === 'new' ? (
        <SurveyModal
          canEdit={canEdit}
          onClose={() => setModal(null)}
          onSaved={(msg, id) => {
            setNotice(msg);
            if (id) setActiveId(id);
            refresh();
          }}
        />
      ) : null}
      {modal === 'settings' && active ? (
        <SurveyModal
          survey={active}
          canEdit={canEdit}
          onClose={() => setModal(null)}
          onSaved={(msg) => {
            setNotice(msg);
            setActiveId(null);
            refresh();
          }}
        />
      ) : null}
      {modal === 'answer' && active ? (
        <ResponseModal
          survey={active}
          booths={booths}
          role={role}
          onClose={() => setModal(null)}
          onSaved={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
