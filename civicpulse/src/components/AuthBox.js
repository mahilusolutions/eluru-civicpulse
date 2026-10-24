import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, FileSearch, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import PasswordField from './auth/PasswordField';
import AlertBanner from './ui/AlertBanner';
import { inputClass } from './ui/Panel';

/** The sign-in card (landing page and /login). */
export default function AuthBox() {
  const { login, isAuthenticated, fullName, roleLabel } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const user = await login(username.trim(), password);
      const from = location.state?.from;
      navigate(user.must_change_password ? '/change-password' : from && from.startsWith('/app') ? from : '/app/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 text-[var(--ink)] shadow-soft sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2 text-[var(--brand)]">
        <ShieldCheck className="h-4 w-4" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">Secure workspace</p>
      </div>

      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Sign in to CivicPulse</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
        Use the username and password you received after your access was approved.
      </p>

      {isAuthenticated ? (
        <div className="mt-5 space-y-3">
          <AlertBanner tone="success">
            You are signed in as <span className="font-semibold">{fullName}</span> ({roleLabel}).
          </AlertBanner>
          <Link to="/app/dashboard" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110">
            Continue to workspace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          <AlertBanner tone="danger" className="mt-4">{error}</AlertBanner>

          <label htmlFor="signin-username" className="mb-1.5 mt-5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Username
          </label>
          <input
            id="signin-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="for example ravik.2345"
            className={`${inputClass} mb-4`}
          />

          <label htmlFor="signin-password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Password
          </label>
          <PasswordField id="signin-password" value={password} onChange={setPassword} />

          <button
            type="submit"
            disabled={busy}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
            {busy ? null : <ArrowRight className="h-4 w-4" />}
          </button>

          <div className="mt-5 grid gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
            <Link to="/request-access" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
              <UserPlus className="h-4 w-4" />
              Request access
            </Link>
            <Link to="/request-status" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
              <FileSearch className="h-4 w-4" />
              Check request status
            </Link>
          </div>
        </>
      )}

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        Powered by <span className="font-semibold text-[var(--brand)]">Mahilu Solutions</span>
      </p>
    </form>
  );
}
