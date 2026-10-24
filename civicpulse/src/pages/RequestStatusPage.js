import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, ClipboardCopy, Clock, Download, KeyRound, Loader2, Search, ShieldAlert, X } from 'lucide-react';
import { checkRequestStatus, collectCredentials, downloadAcknowledgement } from '../api/access';
import AuthLayout from '../components/auth/AuthLayout';
import AlertBanner from '../components/ui/AlertBanner';
import { inputClass } from '../components/ui/Panel';
import { saveBlob, savePdfBase64 } from '../utils/download';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function Copy({ text, label }) {
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
      aria-label={`Copy ${label}`}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Three steps: sent, being reviewed, decided. */
function Timeline({ status, submittedAt, decidedAt }) {
  const decided = status !== 'pending';
  const steps = [
    { title: 'Request sent', when: submittedAt, state: 'done' },
    { title: 'Under review', when: null, state: decided ? 'done' : 'current' },
    { title: status === 'approved' ? 'Approved' : status === 'rejected' ? 'Not approved' : 'Decision', when: decidedAt, state: !decided ? 'todo' : status === 'approved' ? 'ok' : 'no' },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <li key={s.title} className="flex items-start gap-3 rounded-xl bg-[var(--bg-muted)] p-3.5">
          <span
            className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
              s.state === 'done' || s.state === 'ok' ? 'bg-emerald-500' : s.state === 'no' ? 'bg-red-500' : s.state === 'current' ? 'bg-amber-500' : 'bg-[var(--line)] text-[var(--muted)]'
            }`}
          >
            {s.state === 'no' ? <X className="h-4 w-4" /> : s.state === 'current' ? <Clock className="h-4 w-4" /> : s.state === 'todo' ? <span className="text-xs font-bold">3</span> : <Check className="h-4 w-4" />}
          </span>
          <span>
            <span className="block text-sm font-bold">{s.title}</span>
            <span className="block text-xs text-[var(--muted)]">{s.when ? when(s.when) : s.state === 'current' ? 'Waiting for the administrator' : ' '}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium">{children || '—'}</p>
    </div>
  );
}

function LoginCard({ creds }) {
  return (
    <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
        <KeyRound className="h-5 w-5" />
        <p className="text-sm font-extrabold uppercase tracking-[0.1em]">Your login details</p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Username</dt>
          <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="select-all break-all font-mono text-xl font-bold">{creds.username}</span>
            <Copy text={creds.username} label="username" />
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Temporary password</dt>
          <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="select-all break-all font-mono text-xl font-bold">{creds.password}</span>
            <Copy text={creds.password} label="password" />
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-bold">Shown only once.</span> Save the PDF or copy these now. You will choose your own password the first time you sign in. Do not share them.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => savePdfBase64(creds.pdf_base64, creds.file_name)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white hover:brightness-110">
          <Download className="h-4 w-4" />
          Download login details (PDF)
        </button>
        <Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
          Go to sign in
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Result({ data, mobile, onChange }) {
  const [creds, setCreds] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const acc = data.account;

  async function ack() {
    setBusy('ack');
    setError('');
    try {
      saveBlob(await downloadAcknowledgement(data.reference, mobile), `CivicPulse-Acknowledgement-${data.reference}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function collect() {
    setBusy('collect');
    setError('');
    try {
      const c = await collectCredentials(data.reference, mobile);
      setCreds(c);
      setConfirming(false);
      savePdfBase64(c.pdf_base64, c.file_name); // saved straight away so it cannot be lost
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const pill = { pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', rejected: 'bg-red-500/15 text-red-700 dark:text-red-300' }[data.status];
  const pillText = { pending: 'Under review', approved: 'Approved', rejected: 'Not approved' }[data.status];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Reference</p>
          <p className="font-mono text-2xl font-extrabold tracking-wider text-[var(--brand)]">{data.reference}</p>
        </div>
        <span className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${pill}`}>{pillText}</span>
      </div>

      <Timeline status={data.status} submittedAt={data.submitted_at} decidedAt={data.decided_at} />

      <AlertBanner tone="danger">{error}</AlertBanner>

      {data.status === 'pending' ? (
        <AlertBanner tone="info">
          Your request is waiting for the Super Admin. Come back to this page later with the same reference number and mobile number.
        </AlertBanner>
      ) : null}

      {data.status === 'rejected' ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-300">
            <ShieldAlert className="h-4 w-4" />
            This request was not approved
          </p>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">{data.note || 'No reason was given.'}</p>
          <Link to="/request-access" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] hover:underline">
            Send a new request <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      {data.status === 'approved' && acc ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Your access was approved as {acc.role_label}</p>
            {data.note ? <p className="mt-1.5 text-sm text-[var(--ink-soft)]">Note from the administrator: {data.note}</p> : null}
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Your username is <span className="select-all font-mono font-bold">{acc.username}</span>
            </p>
          </div>

          {creds ? (
            <LoginCard creds={creds} />
          ) : acc.credentials_available ? (
            confirming ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
                <p className="text-sm font-bold">Show the password now?</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">It is displayed only once and a PDF is saved to your device. Make sure nobody is looking at your screen.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={collect} disabled={busy === 'collect'} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60">
                    {busy === 'collect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Yes, show my login details
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
                    Not now
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:brightness-110">
                <KeyRound className="h-4 w-4" />
                Show my login details
              </button>
            )
          ) : acc.credentials_collected ? (
            <AlertBanner tone="info">
              The login details were already collected. Sign in with your username and your own password. If you forgot it, ask the administrator to reset it.
            </AlertBanner>
          ) : (
            <AlertBanner tone="warning">The login details are no longer available. Ask the administrator to reset your password; you will then collect the new one here.</AlertBanner>
          )}

          {!creds ? (
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] hover:underline">
              Go to sign in <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--line)] p-4">
        <p className="mb-3 text-sm font-bold">Your request</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Name">{data.full_name}</Detail>
          <Detail label="Mobile">{data.mobile}</Detail>
          <Detail label="Email">{data.email}</Detail>
          <Detail label="Role or organisation">{data.designation}</Detail>
          <Detail label="Area">{data.area}</Detail>
          <Detail label="Access requested">{data.requested_role_label}</Detail>
          <Detail label="Voter ID">{data.voter_id}</Detail>
          <Detail label="Recommended by">{data.referred_by}</Detail>
          <Detail label="Sent on">{when(data.submitted_at)}</Detail>
        </div>
        <div className="mt-4">
          <Detail label="Reason">{data.reason}</Detail>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={ack} disabled={busy === 'ack'} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60">
          {busy === 'ack' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download acknowledgement (PDF)
        </button>
        <button type="button" onClick={onChange} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
          Check another request
        </button>
      </div>
    </div>
  );
}

export default function RequestStatusPage() {
  const [params] = useSearchParams();
  const [reference, setReference] = useState((params.get('ref') || '').toUpperCase());
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [verifiedMobile, setVerifiedMobile] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!reference.trim() || !mobile.trim()) {
      setError('Enter both the reference number and the mobile number.');
      return;
    }
    setBusy(true);
    try {
      const result = await checkRequestStatus(reference.trim(), mobile.trim());
      setData(result);
      setVerifiedMobile(mobile.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Check your request status" subtitle="Enter the reference number you received and the mobile number from your request." wide>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-soft sm:p-8">
        {data ? (
          <Result
            data={data}
            mobile={verifiedMobile}
            onChange={() => {
              setData(null);
              setMobile('');
            }}
          />
        ) : (
          <form onSubmit={submit} noValidate className="mx-auto max-w-xl">
            <AlertBanner tone="danger" className="mb-4">{error}</AlertBanner>
            <label htmlFor="ref" className="mb-1.5 block text-xs font-semibold text-[var(--ink-soft)]">
              Reference number
            </label>
            <input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="CPR-7K3M-9QX2"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
              className={`${inputClass} font-mono text-lg font-bold tracking-wider`}
            />
            <label htmlFor="mob" className="mb-1.5 mt-4 block text-xs font-semibold text-[var(--ink-soft)]">
              Mobile number used in the request
            </label>
            <input id="mob" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98480 12345" maxLength={16} className={inputClass} />
            <p className="mt-2 text-xs text-[var(--muted)]">Both are needed so only you can see your request and your login.</p>
            <button type="submit" disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {busy ? 'Checking…' : 'Check status'}
            </button>
            <p className="mt-5 text-sm text-[var(--muted)]">
              No request yet?{' '}
              <Link to="/request-access" className="font-semibold text-[var(--brand)] hover:underline">
                Request access
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
