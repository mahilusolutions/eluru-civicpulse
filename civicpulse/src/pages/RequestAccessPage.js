import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, ClipboardCopy, Download, FileSearch, Loader2, Send, UserPlus } from 'lucide-react';
import { downloadAcknowledgement, submitAccessRequest } from '../api/access';
import { REQUESTABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../auth/roles';
import AuthLayout from '../components/auth/AuthLayout';
import AlertBanner from '../components/ui/AlertBanner';
import { inputClass } from '../components/ui/Panel';
import { saveBlob } from '../utils/download';
import { alnumUpper, mobileDigits, nameOnly } from '../utils/inputFilters';

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
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-semibold text-[var(--ink-soft)]">
        <span>
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
        {required ? null : <span className="text-[11px] font-medium text-[var(--muted)]">Optional</span>}
      </label>
      {children}
      <p className={`mt-1 min-h-[1.1rem] text-xs ${error ? 'font-medium text-red-600' : 'text-[var(--muted)]'}`} role={error ? 'alert' : undefined}>
        {error || hint}
      </p>
    </div>
  );
}

function Section({ number, title, children }) {
  return (
    <section>
      <h2 className="flex items-center gap-2.5 text-sm font-bold text-[var(--ink)]">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{number}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
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
    <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-elevated)] p-6 shadow-soft sm:p-9">
      <div className="text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">Your request has been sent</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--muted)]">The administrator will read it and decide. Keep the reference number below; you need it to check the result.</p>
      </div>

      <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--bg-muted)] p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Your reference number</p>
        <p className="mt-2 select-all font-mono text-3xl font-extrabold tracking-wider text-[var(--brand)] sm:text-4xl" data-testid="reference">
          {done.reference}
        </p>
        <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
          {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy number'}
        </button>
        <p className="mt-3 text-xs text-[var(--muted)]">
          To check your status you need this number <span className="font-semibold text-[var(--ink-soft)]">and the mobile number you entered</span>.
        </p>
      </div>

      <AlertBanner tone="danger" className="mx-auto mt-4 max-w-lg">{error}</AlertBanner>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download acknowledgement (PDF)
        </button>
        <Link to={`/request-status?ref=${encodeURIComponent(done.reference)}`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <FileSearch className="h-4 w-4" />
          Check status
        </Link>
      </div>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ['1', 'Review', 'The Super Admin reads your request and the reason you gave.'],
          ['2', 'Decision', 'You are approved with a role, or told why not.'],
          ['3', 'Collect your login', 'Come back, choose “Check request status” and enter your reference and mobile number.'],
        ].map(([n, t, d]) => (
          <li key={n} className="rounded-xl bg-[var(--bg-muted)] p-4">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{n}</span>
            <p className="mt-2 text-sm font-bold">{t}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const glass = 'rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur';

function RequestAside() {
  return (
    <>
      <div className={glass}>
        <p className="text-sm font-bold text-white">Keep these ready</p>
        <ul className="mt-3 space-y-2.5 text-sm text-white/75">
          {['Your mobile number (the status check uses it)', 'Your voter ID card, if you have it', 'The name of the person who recommended you', 'The ward or booth you will work in'].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F0B429]" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className={glass}>
        <p className="text-sm font-bold text-white">What happens next</p>
        <ol className="mt-3 space-y-3 text-sm text-white/75">
          {[
            ['1', 'You get a reference number and a PDF receipt.'],
            ['2', 'The Super Admin reads your request.'],
            ['3', 'Come back to “Check request status” to collect your login.'],
          ].map(([n, t]) => (
            <li key={n} className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0B429] text-xs font-bold text-[#0F1B2D]">{n}</span>
              {t}
            </li>
          ))}
        </ol>
      </div>
      <p className="text-sm text-white/70">
        Already sent a request?{' '}
        <Link to="/request-status" className="font-semibold text-[#F0B429] underline-offset-4 hover:underline">
          Check its status
        </Link>
      </p>
    </>
  );
}

export default function RequestAccessPage() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  // `clean` strips characters a box must not hold (letters in a phone number, and so on) as they are typed or pasted.
  const set = (key, clean) => (e) => {
    const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const value = clean ? clean(raw) : raw;
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
    if (form.voter_id.trim() && !/^[A-Za-z0-9/]{8,16}$/.test(form.voter_id.trim())) er.voter_id = 'Voter ID looks wrong. Check it against your voter card.';
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
    <AuthLayout
      layout="split"
      icon={UserPlus}
      title="Request access"
      subtitle="Tell us who you are and what you need. The Super Admin reads your request and creates your account if it is approved."
      aside={<RequestAside />}
    >
      {done ? (
        <SubmittedView done={done} />
      ) : (
        <form onSubmit={submit} noValidate className="rounded-3xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft">
          <div className="space-y-9 p-6 sm:p-9">
            <AlertBanner tone="danger">{message}</AlertBanner>

            <Section number="1" title="About you">
              <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2 2xl:grid-cols-4">
                <Field id="full_name" label="Full name" required error={errors.full_name} hint="As written on your voter card.">
                  <input id="full_name" value={form.full_name} onChange={set('full_name', nameOnly)} autoComplete="name" maxLength={80} placeholder="Your full name" className={inputClass} {...bad('full_name')} />
                </Field>
                <Field id="mobile" label="Mobile number" required error={errors.mobile} hint="Used to confirm it is you when you check the status.">
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-xl border border-r-0 border-[var(--line)] bg-[var(--bg-muted)] px-3 text-sm font-semibold text-[var(--ink-soft)]">+91</span>
                    <input id="mobile" value={form.mobile} onChange={set('mobile', mobileDigits)} type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="tel-national" maxLength={16} placeholder="10-digit mobile number" className={`${inputClass} !rounded-l-none`} {...bad('mobile')} />
                  </div>
                </Field>
                <Field id="email" label="Email" error={errors.email} hint="So the administrator can reach you if needed.">
                  <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={120} placeholder="Email address" className={inputClass} {...bad('email')} />
                </Field>
                <Field id="voter_id" label="Voter ID" error={errors.voter_id} hint="Helps the administrator match you to the voter list.">
                  <input id="voter_id" value={form.voter_id} onChange={set('voter_id', alnumUpper)} maxLength={16} placeholder="Voter ID number" className={`${inputClass} uppercase placeholder:normal-case`} {...bad('voter_id')} />
                </Field>
              </div>
            </Section>

            <Section number="2" title="Your work and the access you need">
              <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                <Field id="designation" label="Your role or organisation" required error={errors.designation} hint="Booth agent, party office, volunteer group, and so on.">
                  <input id="designation" value={form.designation} onChange={set('designation')} maxLength={80} placeholder="Your role or organisation" className={inputClass} {...bad('designation')} />
                </Field>
                <Field id="area" label="Ward, booth or locality" required error={errors.area} hint="Where you will be working.">
                  <input id="area" value={form.area} onChange={set('area')} maxLength={120} placeholder="Ward, booth or locality" className={inputClass} {...bad('area')} />
                </Field>
              </div>

              <fieldset className="mt-3">
                <legend className="mb-2 text-xs font-semibold text-[var(--ink-soft)]">
                  Access you need <span className="text-red-500">*</span>
                </legend>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                  {REQUESTABLE_ROLES.map((r) => {
                    const on = form.requested_role === r;
                    return (
                      <label
                        key={r}
                        className={`relative flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${on ? 'border-[var(--brand)] bg-[var(--brand)]/5 ring-1 ring-[var(--brand)]/40' : 'border-[var(--line)] hover:border-[var(--brand)]/50'}`}
                      >
                        <input type="radio" name="requested_role" value={r} checked={on} onChange={set('requested_role')} className="sr-only" />
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line)]'}`}>
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-[var(--ink)]">{ROLE_LABELS[r]}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">{ROLE_DESCRIPTIONS[r]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {errors.requested_role ? <p className="mt-1 text-xs font-medium text-red-600">{errors.requested_role}</p> : null}
              </fieldset>
            </Section>

            <Section number="3" title="Reason and declaration">
              <div className="space-y-4">
              <Field id="reason" label="Why do you need access?" required error={errors.reason} hint={`${form.reason.trim().length}/500 characters`}>
                <textarea id="reason" value={form.reason} onChange={set('reason')} rows={4} maxLength={500} placeholder="Tell the administrator what you will do with access" className={`${inputClass} resize-y`} {...bad('reason')} />
              </Field>
              <Field id="referred_by" label="Who recommended you?" error={errors.referred_by} hint="A coordinator or office-bearer who knows you. It speeds up the review.">
                <input id="referred_by" value={form.referred_by} onChange={set('referred_by')} maxLength={120} placeholder="Name and phone number" className={inputClass} />
              </Field>

              {/* Hidden from people; automated forms tend to fill it. */}
              <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </div>

              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--bg-muted)] p-4 text-sm text-[var(--ink-soft)]">
                <input type="checkbox" checked={form.consent} onChange={set('consent')} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" {...bad('consent')} />
                <span>
                  I confirm the details above are true. I will use CivicPulse only for the campaign work I was asked to do and I will keep voter information private.
                  {errors.consent ? <span className="mt-1 block text-xs font-medium text-red-600">{errors.consent}</span> : null}
                </span>
              </label>
              </div>
            </Section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-3xl border-t border-[var(--line)] bg-[var(--bg-muted)]/60 px-6 py-4 sm:px-9">
            <Link to="/request-status" className="text-sm font-semibold text-[var(--brand)] hover:underline">
              Already sent one? Check status
            </Link>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
