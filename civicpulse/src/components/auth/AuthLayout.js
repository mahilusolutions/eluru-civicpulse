import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck, UserCheck } from 'lucide-react';
import Logo from '../Logo';
import ThemeToggle from '../ThemeToggle';

const POINTS = [
  { icon: UserCheck, title: 'Approved access only', text: 'Every account is created by the Super Admin after reading your request.' },
  { icon: LockKeyhole, title: 'Your own password', text: 'You choose it on first sign-in. Nobody else, including the admin, can see it.' },
  { icon: ShieldCheck, title: 'Role-based menu', text: 'You see only the screens your role needs.' },
];

// Edge to edge with comfortable side padding; only very large monitors stop growing (at 1840px) so lines stay readable.
const FRAME = 'mx-auto w-full max-w-[1840px] px-4 sm:px-8 lg:px-12 2xl:px-14';

/**
 * The frame for every public screen. It always uses the full width of the window.
 *  - default: message on the left, one card on the right (sign in, change password).
 *  - layout="split": a left panel (icon, title, `aside` guidance) and a wide working area on the right
 *    (request access, check status).
 */
export default function AuthLayout({ title, subtitle, children, layout, icon: Icon, aside, back = true }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0F1B2D] text-white">
      <div className="lp-grid-bg absolute inset-0" />
      <div className="lp-orb left-[-8%] top-[8%] h-72 w-72 bg-[#2F6FED]" />
      <div className="lp-orb bottom-[-10%] right-[6%] h-80 w-80 bg-[#F0B429]/50" style={{ animationDelay: '-6s' }} />

      <header className={`relative z-10 flex h-16 items-center justify-between ${FRAME}`}>
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

      {layout === 'split' ? (
        <main className={`relative z-10 grid flex-1 content-start gap-8 pb-14 pt-4 lg:grid-cols-[minmax(18rem,25rem)_minmax(0,1fr)] lg:gap-10 xl:gap-14 ${FRAME}`}>
          <section className="lg:sticky lg:top-6 lg:self-start">
            {Icon ? (
              <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0B429]/15 text-[#F0B429] ring-1 ring-[#F0B429]/30">
                <Icon className="h-7 w-7" />
              </span>
            ) : null}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F0B429]">Eluru · AC S01-65</p>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h1>
            {subtitle ? <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">{subtitle}</p> : null}
            {aside ? <div className="mt-7 space-y-5">{aside}</div> : null}
          </section>
          <div className="min-w-0 text-[var(--ink)]">{children}</div>
        </main>
      ) : (
        <main className={`relative z-10 grid flex-1 content-start gap-10 pb-16 pt-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:content-center lg:items-center lg:gap-16 xl:gap-24 ${FRAME}`}>
          <section className="hidden lg:block">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F0B429]">
              Eluru · AC S01-65
            </p>
            <h1 className="max-w-xl text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">{title}</h1>
            {subtitle ? <p className="mt-4 max-w-lg text-base leading-relaxed text-white/70">{subtitle}</p> : null}
            <ul className="mt-9 max-w-md space-y-5">
              {POINTS.map(({ icon: PointIcon, title: t, text }) => (
                <li key={t} className="flex gap-3.5">
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#F0B429]">
                    <PointIcon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{t}</span>
                    <span className="block text-sm leading-relaxed text-white/65">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <div className="w-full text-[var(--ink)]">{children}</div>
        </main>
      )}

      <footer className="relative z-10 pb-6 text-center text-xs text-white/50">
        Powered by <span className="font-semibold text-white/75">Mahilu Solutions</span>
      </footer>
    </div>
  );
}
