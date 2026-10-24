import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck, UserCheck } from 'lucide-react';
import Logo from '../Logo';
import ThemeToggle from '../ThemeToggle';

const POINTS = [
  { icon: UserCheck, title: 'Approved access only', text: 'Every account is created by the Super Admin after reading your request.' },
  { icon: LockKeyhole, title: 'Your own password', text: 'You choose it on first sign-in. Nobody else, including the admin, can see it.' },
  { icon: ShieldCheck, title: 'Role-based menu', text: 'You see only the screens your role needs.' },
];

/** The frame for every public screen: sign in, request access, check status, change password. */
export default function AuthLayout({ title, subtitle, children, wide = false, back = true }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0F1B2D] text-white">
      <div className="lp-grid-bg absolute inset-0" />
      <div className="lp-orb left-[-8%] top-[8%] h-72 w-72 bg-[#2F6FED]" />
      <div className="lp-orb bottom-[-10%] right-[6%] h-80 w-80 bg-[#F0B429]/50" style={{ animationDelay: '-6s' }} />

      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="CivicPulse home">
          <Logo size="nav" variant="light" />
        </Link>
        <div className="flex items-center gap-2">
          {back ? (
            <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-sm font-medium text-white/85 transition hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
          ) : null}
          <ThemeToggle compact className="h-9 w-9 justify-center border-white/25 bg-transparent px-0 text-white hover:border-white/50 hover:bg-white/10" />
        </div>
      </header>

      <main className={`relative z-10 mx-auto grid w-full gap-10 px-4 pb-16 pt-4 sm:px-6 ${wide ? 'max-w-5xl' : 'max-w-6xl lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-center lg:pt-10'}`}>
        {!wide ? (
          <section className="hidden lg:block">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F0B429]">
              Eluru · AC S01-65
            </p>
            <h1 className="max-w-lg text-4xl font-extrabold leading-tight tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-3 max-w-md text-base leading-relaxed text-white/70">{subtitle}</p> : null}
            <ul className="mt-8 max-w-md space-y-4">
              {POINTS.map(({ icon: Icon, title: t, text }) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#F0B429]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{t}</span>
                    <span className="block text-sm leading-relaxed text-white/65">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="w-full text-[var(--ink)]">
          {wide ? (
            <div className="mb-5 text-white">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
              {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">{subtitle}</p> : null}
            </div>
          ) : null}
          {children}
        </div>
      </main>

      <footer className="relative z-10 pb-6 text-center text-xs text-white/50">
        Powered by <span className="font-semibold text-white/75">Mahilu Solutions</span>
      </footer>
    </div>
  );
}
