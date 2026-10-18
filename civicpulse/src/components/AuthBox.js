import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ROLE_OPTIONS } from '../auth/roles';

export default function AuthBox() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState(ROLE_OPTIONS[1].value);

  function handleSubmit(event) {
    event.preventDefault();
    if (!role) return;
    login(role);
    navigate('/app/dashboard');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 text-[var(--ink)] shadow-soft sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2 text-[var(--brand)]">
        <ShieldCheck className="h-4 w-4" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
          Secure workspace
        </p>
      </div>

      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
        Sign in to CivicPulse
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
        Choose your role for the Eluru desk. Menu access updates automatically.
      </p>

      <label
        htmlFor="role-select"
        className="mb-1.5 mt-5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
      >
        Role
      </label>
      <select
        id="role-select"
        className="mb-4 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-medium outline-none focus:border-[var(--brand)]"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
      >
        Continue to workspace
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        Demo access · Powered by{' '}
        <span className="font-semibold text-[var(--brand)]">Mahilu Solutions</span>
      </p>
    </form>
  );
}
