import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCopy, Download, FileSearch, Loader2, Send } from 'lucide-react';
import { downloadAcknowledgement, submitAccessRequest } from '../api/access';
import { REQUESTABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../auth/roles';
import AuthLayout from '../components/auth/AuthLayout';
import AlertBanner from '../components/ui/AlertBanner';
import { inputClass } from '../components/ui/Panel';
import { saveBlob } from '../utils/download';

const EMPTY = {
  full_name: '',
  mobile: '',
  email: '',
  designation: '',
  area: '',
  requested_role: 'booth_agent',
  voter_id: '',
  reason: '',
  referred_by: '',
  consent: false,
  website: '', // hidden trap for automated forms
};

function Field({ id, label, required, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-[var(--ink-soft)]">
        {label}
        {required ? <span className="text-red-500"> *</span> : <span className="font-normal text-[var(--muted)]"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function SubmittedView({ done }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      const blob = await downloadAcknowledgement(done.reference, done.mobile);
      saveBlob(blob, `CivicPulse-Acknowledgement-${done.reference}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(done.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copying is optional */
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-soft sm:p-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Your request has been sent</h2>
          <p className="text-sm text-[var(--muted)]">The administrator will read it and decide. Keep the reference number below.</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-muted)] p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Your reference number</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="select-all font-mono text-3xl font-extrabold tracking-wider text-[var(--brand)] sm:text-4xl" data-testid="reference">
            {done.reference}
          </p>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          To check your status you need this number <span className="font-semibold text-[var(--ink-soft)]">and the mobile number you entered</span>.
        </p>
      </div>

      <AlertBanner tone="danger" className="mt-4">{error}</AlertBanner>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download acknowledgement (PDF)
        </button>
        <Link to={`/request-status?ref=${encodeURIComponent(done.reference)}`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <FileSearch className="h-4 w-4" />
          Check status
        </Link>
      </div>

      <ol className="mt-7 grid gap-3 sm:grid-cols-3">
        {[
          ['1', 'Review', 'The Super Admin reads your request and the reason you gave.'],
          ['2', 'Decision', 'You are approved with a role, or told why not.'],
          ['3', 'Collect your login', 'Come back, choose “Check request status” and enter your reference and mobile number.'],
        ].map(([n, t, d]) => (
          <li key={n} className="rounded-xl bg-[var(--bg-muted)] p-3.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{n}</span>
            <p className="mt-2 text-sm font-bold">{t}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function RequestAccessPage() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  function validate() {
    const er = {};
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]{2,79}$/u.test(form.full_name.trim())) er.full_name = 'Enter your full name (letters only).';
    const digits = form.mobile.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) er.mobile = 'Enter a valid 10-digit mobile number.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) er.email = 'Enter a valid email address or leave it empty.';
    if (form.designation.trim().length < 2) er.designation = 'Tell us your role or organisation.';
    if (form.area.trim().length < 2) er.area = 'Enter your ward, booth or locality.';
    if (form.voter_id.trim() && !/^[A-Za-z0-9/]{8,16}$/.test(form.voter_id.trim())) er.voter_id = 'Voter ID looks wrong (for example WIO2501872).';
    if (form.reason.trim().length < 10) er.reason = 'Please write at least a sentence.';
    if (!form.consent) er.consent = 'Please confirm the declaration.';
    return er;
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setMessage('');
    const er = validate();
    setErrors(er);
    if (Object.keys(er).length) {
      setMessage('Please correct the highlighted fields.');
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const result = await submitAccessRequest({ ...form });
      window.scrollTo({ top: 0 });
      setDone({ reference: result.reference, mobile: form.mobile });
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const bad = (k) => (errors[k] ? { 'aria-invalid': true } : {});

  return (
    <AuthLayout title="Request access to CivicPulse" subtitle="Tell us who you are and what you need. The Super Admin will read your request and create your account if approved." wide>
      {done ? (
        <SubmittedView done={done} />
      ) : (
        <form onSubmit={submit} noValidate className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-soft sm:p-8">
          <AlertBanner tone="danger" className="mb-5">{message}</AlertBanner>

          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--brand)]">About you</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field id="full_name" label="Full name" required error={errors.full_name}>
              <input id="full_name" value={form.full_name} onChange={set('full_name')} autoComplete="name" maxLength={80} className={inputClass} {...bad('full_name')} />
            </Field>
            <Field id="mobile" label="Mobile number" required error={errors.mobile} hint="We use it to confirm it is you when you check the status.">
              <input id="mobile" value={form.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="tel" maxLength={16} placeholder="98480 12345" className={inputClass} {...bad('mobile')} />
            </Field>
            <Field id="email" label="Email" error={errors.email}>
              <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={120} className={inputClass} {...bad('email')} />
            </Field>
            <Field id="voter_id" label="Voter ID (EPIC)" error={errors.voter_id} hint="Helps the admin match you to the voter list.">
              <input id="voter_id" value={form.voter_id} onChange={set('voter_id')} maxLength={16} placeholder="WIO2501872" className={`${inputClass} uppercase`} {...bad('voter_id')} />
            </Field>
          </div>

          <h2 className="mt-8 text-sm font-bold uppercase tracking-[0.1em] text-[var(--brand)]">Your work</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field id="designation" label="Your role or organisation" required error={errors.designation} hint="For example: Booth agent, Ward 12 · Party office · Volunteer group">
              <input id="designation" value={form.designation} onChange={set('designation')} maxLength={80} className={inputClass} {...bad('designation')} />
            </Field>
            <Field id="area" label="Ward, booth or locality" required error={errors.area} hint="Where you will work.">
              <input id="area" value={form.area} onChange={set('area')} maxLength={120} placeholder="Booth 14, Sanivarapu Peta" className={inputClass} {...bad('area')} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="requested_role" label="Access you need" required error={errors.requested_role} hint={ROLE_DESCRIPTIONS[form.requested_role]}>
                <select id="requested_role" value={form.requested_role} onChange={set('requested_role')} className={inputClass} {...bad('requested_role')}>
                  {REQUESTABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="reason" label="Why do you need access?" required error={errors.reason} hint={`${form.reason.trim().length}/500`}>
                <textarea id="reason" value={form.reason} onChange={set('reason')} rows={4} maxLength={500} className={`${inputClass} resize-y`} {...bad('reason')} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="referred_by" label="Who recommended you? (name and phone)" error={errors.referred_by} hint="A coordinator or office-bearer who knows you. It speeds up the review.">
                <input id="referred_by" value={form.referred_by} onChange={set('referred_by')} maxLength={120} className={inputClass} />
              </Field>
            </div>
          </div>

          {/* Hidden from people; automated forms tend to fill it. */}
          <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--bg-muted)] p-3.5 text-sm text-[var(--ink-soft)]">
            <input type="checkbox" checked={form.consent} onChange={set('consent')} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" {...bad('consent')} />
            <span>
              I confirm the details above are true. I will use CivicPulse only for the campaign work I was asked to do and I will keep voter information private.
              {errors.consent ? <span className="mt-1 block text-xs font-medium text-red-600">{errors.consent}</span> : null}
            </span>
          </label>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <Link to="/request-status" className="text-sm font-semibold text-[var(--brand)] hover:underline">
              Already sent one? Check status
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
