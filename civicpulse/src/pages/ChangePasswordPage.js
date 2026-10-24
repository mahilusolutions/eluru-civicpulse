import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Check, Circle, Loader2, ShieldCheck } from 'lucide-react';
import { changePassword } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import PasswordField from '../components/auth/PasswordField';
import AlertBanner from '../components/ui/AlertBanner';

function strength(p) {
  let score = 0;
  if (p.length >= 10) score += 1;
  if (p.length >= 14) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
  if (/\d/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  return Math.min(score, 4);
}
const LEVELS = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'];
const COLORS = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'];

export default function ChangePasswordPage() {
  const { user, setUser, mustChangePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rules = useMemo(
    () => [
      { ok: next.length >= 10, text: 'At least 10 characters' },
      { ok: /[a-z]/i.test(next) && /\d/.test(next), text: 'Letters and at least one number' },
      { ok: next.length > 0 && next === again, text: 'Both new passwords match' },
      { ok: next.length > 0 && next !== current, text: 'Different from the current password' },
    ],
    [next, again, current]
  );
  const score = strength(next);

  if (!user) return <Navigate to="/login" replace />;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!current) return setError('Enter your current password. For a new account that is the temporary password.');
    if (rules.some((r) => !r.ok)) return setError('Please meet every point in the checklist.');
    setBusy(true);
    try {
      const data = await changePassword(current, next);
      setUser(data.user);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return null;
  }

  return (
    <AuthLayout
      title={mustChangePassword ? 'Choose your own password' : 'Change your password'}
      subtitle={mustChangePassword ? 'The password you were given is temporary. Set one that only you know, then you are in.' : 'Pick a new password. You stay signed in here and are signed out everywhere else.'}
      back={!mustChangePassword}
    >
      <form onSubmit={submit} noValidate className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-[var(--brand)]">
          <ShieldCheck className="h-4 w-4" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{user.username}</p>
        </div>
        <h2 className="text-xl font-bold tracking-tight">{mustChangePassword ? 'Set your password' : 'New password'}</h2>

        <AlertBanner tone="danger" className="mt-4">{error}</AlertBanner>

        <label htmlFor="cur" className="mb-1.5 mt-5 block text-xs font-semibold text-[var(--ink-soft)]">
          {mustChangePassword ? 'Temporary password you were given' : 'Current password'}
        </label>
        <PasswordField id="cur" value={current} onChange={setCurrent} autoFocus />

        <label htmlFor="new" className="mb-1.5 mt-4 block text-xs font-semibold text-[var(--ink-soft)]">
          New password
        </label>
        <PasswordField id="new" value={next} onChange={setNext} autoComplete="new-password" />
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex h-1.5 flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-full flex-1 rounded-full ${next && i < score ? COLORS[score] : 'bg-[var(--viz-track)]'}`} />
            ))}
          </div>
          <span className="w-16 text-right text-xs font-semibold text-[var(--muted)]">{next ? LEVELS[score] : ''}</span>
        </div>

        <label htmlFor="again" className="mb-1.5 mt-4 block text-xs font-semibold text-[var(--ink-soft)]">
          Type the new password again
        </label>
        <PasswordField id="again" value={again} onChange={setAgain} autoComplete="new-password" />

        <ul className="mt-4 space-y-1.5">
          {rules.map((r) => (
            <li key={r.text} className={`flex items-center gap-2 text-sm ${r.ok ? 'text-emerald-600' : 'text-[var(--muted)]'}`}>
              {r.ok ? <Check className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
              {r.text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--muted)]">Do not use your name, username, phone number or an easy word such as “password”.</p>

        <button type="submit" disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? 'Saving…' : mustChangePassword ? 'Save and continue' : 'Change password'}
        </button>

        {mustChangePassword ? (
          <button type="button" onClick={() => logout().then(() => navigate('/login', { replace: true }))} className="mt-3 w-full text-center text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Sign out instead
          </button>
        ) : (
          <Link to="/app/dashboard" className="mt-3 block text-center text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Cancel
          </Link>
        )}
      </form>
    </AuthLayout>
  );
}
