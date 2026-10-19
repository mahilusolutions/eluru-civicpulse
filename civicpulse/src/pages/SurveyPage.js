import { useMemo, useState } from 'react';
import { createSurveyResponse, getSurveys } from '../api/survey';
import { useAuth } from '../auth/AuthContext';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnPrimary, Field, inputClass } from '../components/ui/Panel';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function SurveyPage() {
  const { role } = useAuth();
  const { data: surveys, loading, error, reload } = useApi(getSurveys, []);
  const [answer, setAnswer] = useState('');
  const [partNo, setPartNo] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  const active = surveys?.[0];
  const responses = active?.responses || [];
  const pager = usePagination(responses, pageSize);

  async function onSubmit(e) {
    e.preventDefault();
    if (!active || !answer) return;
    setSaving(true);
    try {
      await createSurveyResponse(active.id, {
        answer,
        part_no: partNo ? Number(partNo) : null,
        respondent_name: name || null,
        created_by_role: role,
      });
      setAnswer('');
      setName('');
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'answer',
        header: 'Answer',
        accessor: 'answer',
        className: 'font-semibold',
      },
      {
        key: 'respondent_name',
        header: 'Respondent',
        accessor: (r) => r.respondent_name || 'Anon',
      },
      {
        key: 'part_no',
        header: 'Part',
        accessor: (r) => r.part_no ?? '—',
        align: 'center',
        width: '4rem',
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Field"
        title="Survey"
        description="Collect quick answers from the field and review responses."
      />
      <AlertBanner tone="danger">{error}</AlertBanner>

      {loading ? (
        <LoadingBlock label="Loading survey…" />
      ) : !active ? (
        <EmptyState
          title="No survey yet"
          description="When a survey is set up, you can collect answers here. Meanwhile keep logging outreach and issues."
          actionLabel="Log outreach"
          actionTo="/app/outreach"
        />
      ) : (
        <>
          <Panel className="p-4 sm:p-5">
            <p className="text-sm font-bold text-[var(--ink)]">{active.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{active.question}</p>
            <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Answer" className="sm:col-span-3">
                <input
                  required
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Drainage"
                />
              </Field>
              <Field label="Part">
                <input
                  type="number"
                  value={partNo}
                  onChange={(e) => setPartNo(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="flex items-end">
                <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
                  {saving ? 'Saving…' : 'Submit'}
                </button>
              </div>
            </form>
          </Panel>

          <DataTable
            columns={columns}
            rows={pager.rows}
            rowKey="id"
            emptyTitle="No responses yet"
            emptyDescription="Submit the first answer using the form above."
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
        </>
      )}
    </section>
  );
}
