import { Navigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileInput,
  Flag,
  Handshake,
  HeartHandshake,
  Landmark,
  LayoutGrid,
  MapPinned,
  MessageSquareWarning,
  Network,
  Search,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import AuthBox from '../components/AuthBox';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import { CAPABILITIES, HOW_IT_WORKS, LANDING } from '../data/landing';

const ICONS = {
  FileInput,
  MapPinned,
  Handshake,
  Flag,
  LayoutGrid,
  Search,
  MessageSquareWarning,
  Users,
  ClipboardList,
  CalendarCheck,
  Building2,
  Network,
  UserCheck,
  HeartHandshake,
  Shield,
  Landmark,
};

function Icon({ name }) {
  const Cmp = ICONS[name] || LayoutGrid;
  return <Cmp className="h-4 w-4" strokeWidth={2} />;
}

const pad = 'px-5 sm:px-8 lg:px-12 xl:px-16';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--ink)]">
      {/* Full-viewport hero */}
      <section
        id="product"
        className="relative flex min-h-[100svh] w-full flex-col overflow-hidden"
      >
        <img
          src="/images/landing-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0F1B2D]/82" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F1B2D] via-[#0F1B2D]/75 to-[#1D4E89]/35" />

        <header className={`relative z-20 w-full ${pad}`}>
          <div className="flex h-16 w-full items-center gap-4">
            <a href="#product" className="shrink-0">
              <Logo size="nav" variant="light" />
            </a>

            <nav className="ml-2 hidden items-center gap-1 md:flex">
              {[
                { href: '#product', label: 'Overview' },
                { href: '#workflow', label: 'How it works' },
                { href: '#modules', label: 'Modules' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs font-medium text-white/60 lg:inline">
                Eluru · S01-65
              </span>
              <ThemeToggle
                compact
                className="h-9 w-9 justify-center border-white/25 bg-transparent px-0 text-white hover:border-white/50 hover:bg-white/10"
              />
              <a
                href="#login"
                className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-sm font-semibold text-[#0F1B2D] transition hover:bg-white/90"
              >
                Sign in
              </a>
            </div>
          </div>
        </header>

        <div
          className={`relative z-10 grid w-full flex-1 content-center gap-8 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 ${pad}`}
        >
          <div className="text-white">
            <p className="mb-3 inline-flex rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-eluru-gold">
              Eluru · AC S01-65
            </p>
            <h1 className="max-w-4xl text-[clamp(2.4rem,5vw,4rem)] font-bold leading-[1.06] tracking-tight">
              CivicPulse for Eluru campaigns
            </h1>
            <p className="mt-3 max-w-2xl text-base font-medium text-white/85 sm:text-xl">
              {LANDING.tagline}
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              Production workspace for Mayor campaigns — manage{' '}
              <span className="font-semibold text-white">247 booth parts</span>,
              search voters, assign field teams, and run election-day ops. Built
              by Mahilu Solutions.
            </p>

            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              {[
                { value: '247', label: 'Booths' },
                { value: '6', label: 'Roles' },
                { value: '14', label: 'Modules' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <p className="text-2xl font-bold text-white">{item.value}</p>
                  <p className="text-xs text-white/60">{item.label}</p>
                </div>
              ))}
            </div>

            <ul className="mt-7 grid max-w-2xl gap-2.5 text-sm text-white/80 sm:grid-cols-1">
              {[
                'Role-based access for HQ, agents, and volunteers',
                'Booth coverage, issues, and outreach in one desk',
                'Light and dark modes for long field days',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-eluru-gold" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div id="login" className="w-full max-w-lg lg:ml-auto lg:max-w-md xl:max-w-lg">
            <AuthBox />
          </div>
        </div>
      </section>

      <section className="w-full border-b border-[var(--line)] bg-[var(--bg-elevated)]">
        <div
          className={`grid w-full divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 ${pad}`}
        >
          {[
            {
              icon: MapPinned,
              title: '247 Eluru booths',
              text: 'Draft roll parts ready for planning',
            },
            {
              icon: Users,
              title: 'Role-based menus',
              text: 'Each user sees only allowed screens',
            },
            {
              icon: Shield,
              title: 'Mahilu Solutions',
              text: 'Built for real campaign operations',
            },
          ].map(({ icon: IconCmp, title, text }) => (
            <div key={title} className="flex items-start gap-3 py-6 sm:px-2 lg:px-4">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--brand)]">
                <IconCmp className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className={`w-full py-14 lg:py-16 ${pad}`}>
        <div className="w-full">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
              Workflow
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              How Eluru teams run CivicPulse
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              From voter-list load to election day — one clear operating path.
            </p>
          </div>

          <div className="mt-8 grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <article
                key={item.step}
                className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--brand)]">
                    <Icon name={item.icon} />
                  </span>
                  <span className="text-xs font-bold text-[var(--muted)]">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-sm font-bold">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="modules"
        className={`w-full border-y border-[var(--line)] bg-[var(--bg-muted)] py-14 lg:py-16 ${pad}`}
      >
        <div className="w-full">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
                Modules
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Built for Eluru ground work
              </h2>
            </div>
            <p className="max-w-md text-sm text-[var(--muted)] md:text-right">
              Sign in with a role. The sidebar shows only that role’s screens.
            </p>
          </div>

          <div className="mt-8 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4"
              >
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg)] text-[var(--brand)]">
                  <Icon name={item.icon} />
                </span>
                <h3 className="text-sm font-bold">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`w-full bg-[#0F1B2D] py-14 text-white lg:py-16 ${pad}`}>
        <div className="flex w-full flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-eluru-gold">
              Mahilu Solutions
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Ready for the Eluru workspace?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Open CivicPulse with your role and start from the operations
              dashboard.
            </p>
          </div>
          <a
            href="#login"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#0F1B2D] transition hover:bg-white/90"
          >
            Sign in now
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <footer className={`w-full border-t border-[var(--line)] bg-[var(--bg-elevated)] py-5 ${pad}`}>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Logo size="footer" showByline />
          <p className="text-xs text-[var(--muted)]">
            © {new Date().getFullYear()} Mahilu Solutions · CivicPulse Eluru
          </p>
        </div>
      </footer>
    </div>
  );
}
