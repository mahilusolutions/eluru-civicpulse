import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Cpu,
  Database,
  DatabaseZap,
  DoorOpen,
  FileBarChart,
  FileInput,
  FileWarning,
  Flag,
  Handshake,
  HeartHandshake,
  Home,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Map,
  MapPinned,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  MessageSquareWarning,
  Minus,
  Network,
  NotebookPen,
  Phone,
  ScanLine,
  Search,
  Settings,
  Shield,
  Siren,
  Sparkles,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS, ROLE_OPTIONS } from '../auth/roles';
import AuthBox from '../components/AuthBox';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import {
  AUDIENCES,
  HERO_STATS,
  HERO_WORDS,
  HOW_IT_WORKS,
  LANDING,
  MODULE_INFO,
  OUTREACH_CHANNELS,
  PIPELINE,
  PROBLEMS,
  SAMPLE_ELECTOR,
  SOLUTION,
  HIGHLIGHTS,
  SUPPORT_SCALE,
  TICKER,
  VOTER_STATUSES,
} from '../data/landing';

const ICONS = {
  Building2,
  CalendarCheck,
  ClipboardList,
  Cpu,
  Database,
  DatabaseZap,
  DoorOpen,
  FileBarChart,
  FileInput,
  FileWarning,
  Flag,
  Handshake,
  HeartHandshake,
  Home,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Map,
  MapPinned,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  MessageSquareWarning,
  Network,
  NotebookPen,
  Phone,
  ScanLine,
  Search,
  Settings,
  Shield,
  Siren,
  Upload,
  UserCheck,
  Users,
};

function Icon({ name, className = 'h-4 w-4' }) {
  const Cmp = ICONS[name] || LayoutGrid;
  return <Cmp className={className} strokeWidth={2} />;
}

const pad = 'px-5 sm:px-8 lg:px-12 xl:px-16';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useInView({ threshold = 0.15 } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, visible];
}

function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, visible] = useInView();
  return (
    <Tag
      ref={ref}
      style={{ '--d': `${delay}ms` }}
      className={`lp-reveal ${visible ? 'is-visible' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function CountUp({ value, duration = 1400 }) {
  const [ref, visible] = useInView({ threshold: 0.4 });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!visible) return undefined;
    if (prefersReducedMotion()) {
      setN(value);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setN(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, duration]);

  return <span ref={ref}>{n}</span>;
}

function RotatingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % HERO_WORDS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <span key={index} className="lp-word lp-gold-text">
      {HERO_WORDS[index]}
    </span>
  );
}

function SectionHead({ eyebrow, title, lead, align = 'left', dark = false }) {
  return (
    <Reveal className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
          dark ? 'text-eluru-gold' : 'text-[var(--brand)]'
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[2.1rem] sm:leading-tight">
        {title}
      </h2>
      {lead ? (
        <p
          className={`mt-3 text-sm leading-relaxed sm:text-base ${
            dark ? 'text-white/70' : 'text-[var(--muted)]'
          }`}
        >
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}

/** Animated mock of a roll page being read into a voter record */
function OcrDemo() {
  const [tick, setTick] = useState(0);
  const total = SAMPLE_ELECTOR.length;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTick(total);
      return undefined;
    }
    const id = setInterval(() => setTick((t) => (t + 1) % (total + 4)), 750);
    return () => clearInterval(id);
  }, [total]);

  const shown = Math.min(tick, total);
  const done = shown === total;

  return (
    <div className="grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
        <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          <span>Voter list page</span>
          <span>Page 1 of 1</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-md border p-1.5 transition-colors duration-500 ${
                i === 4
                  ? 'border-eluru-gold bg-eluru-gold/10'
                  : 'border-[var(--line)] bg-[var(--bg-muted)]'
              }`}
            >
              <div className="mb-1 h-1.5 w-1/3 rounded bg-[var(--line)]" />
              <div className="mb-1 h-1.5 w-full rounded bg-[var(--line)]" />
              <div className="mb-1 h-1.5 w-4/5 rounded bg-[var(--line)]" />
              <div className="h-1.5 w-2/3 rounded bg-[var(--line)]" />
            </div>
          ))}
        </div>
        <div className="lp-scan" />
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Voter record
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
              done
                ? 'bg-[var(--ok)]/15 text-[var(--ok)]'
                : 'bg-eluru-gold/15 text-[var(--accent-ink)]'
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              {!done ? (
                <span className="lp-ping absolute inline-flex h-full w-full rounded-full bg-current" />
              ) : null}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            {done ? 'ready' : 'reading…'}
          </span>
        </div>
        <dl className="space-y-1.5">
          {SAMPLE_ELECTOR.map((field, i) => (
            <div
              key={field.label}
              className="flex items-center justify-between gap-3 rounded-lg bg-[var(--bg-muted)] px-2.5 py-1.5 text-xs"
            >
              <dt className="text-[var(--muted)]">{field.label}</dt>
              <dd className="font-semibold">
                {i < shown ? (
                  <span key={`${tick}-${i}`} className="lp-pop inline-block">
                    {field.value}
                  </span>
                ) : (
                  <span className="inline-block h-2 w-14 rounded bg-[var(--line)]" />
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[10px] text-[var(--muted)]">Illustrative sample, not a real voter.</p>
      </div>
    </div>
  );
}

function PipelineSteps() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const step = 2600;

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const id = setTimeout(() => {
      setActive((a) => (a + 1) % PIPELINE.length);
      setCycle((c) => c + 1);
    }, step);
    return () => clearTimeout(id);
  }, [active, cycle]);

  return (
    <ol className="space-y-2">
      {PIPELINE.map((item, i) => {
        const on = i === active;
        return (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setCycle((c) => c + 1);
              }}
              className={`relative w-full overflow-hidden rounded-xl border p-3 text-left transition-all duration-300 ${
                on
                  ? 'border-[var(--brand)] bg-[var(--bg-elevated)] shadow-soft'
                  : 'border-transparent hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ${
                    on
                      ? 'bg-[var(--brand)] text-white'
                      : i < active
                        ? 'bg-[var(--ok)]/15 text-[var(--ok)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--muted)]'
                  }`}
                >
                  {i < active ? <Check className="h-4 w-4" /> : <Icon name={item.icon} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <p className="text-sm font-bold">{item.title}</p>
                    <code className="text-[10px] text-[var(--muted)]">{item.meta}</code>
                  </div>
                  <p
                    className={`grid text-xs leading-relaxed text-[var(--muted)] transition-all duration-300 ${
                      on ? 'mt-1 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <span className="overflow-hidden">{item.text}</span>
                  </p>
                </div>
              </div>
              {on ? (
                <span
                  key={cycle}
                  className="lp-progress absolute bottom-0 left-0 h-0.5 w-full bg-[var(--brand)]"
                  style={{ '--dur': `${step}ms` }}
                />
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const BOOTH_TONES = {
  complete: 'bg-[var(--ok)]',
  active: 'bg-[var(--brand)]',
  pending: 'bg-[var(--line)]',
};

function BoothGrid() {
  const [ref, visible] = useInView({ threshold: 0.2 });
  const cells = Array.from({ length: LANDING.parts }, (_, i) => {
    const h = (i * 37 + 11) % 10;
    return h < 4 ? 'complete' : h < 7 ? 'active' : 'pending';
  });

  return (
    <div ref={ref} className={visible ? 'is-visible' : ''}>
      <div className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-1 sm:gap-1.5">
        {cells.map((tone, i) => (
          <span
            key={i}
            title={`Part ${i + 1}`}
            style={{ '--d': `${i * 5}ms` }}
            className={`lp-cell aspect-square rounded-[3px] ${BOOTH_TONES[tone]}`}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted)]">
        {[
          ['complete', 'Coverage complete'],
          ['active', 'Field work active'],
          ['pending', 'Pending'],
        ].map(([tone, label]) => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-[3px] ${BOOTH_TONES[tone]}`} />
            {label}
          </span>
        ))}
        <span className="ml-auto italic">Illustration only. Real coverage is shown in the app.</span>
      </div>
    </div>
  );
}

const MODULE_GROUPS = ['All', ...new Set(NAV_ITEMS.map((item) => item.group))];

function ModuleTabs() {
  const [group, setGroup] = useState('All');
  const items = group === 'All' ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.group === group);

  return (
    <>
      <Reveal className="mt-8 flex flex-wrap gap-2">
        {MODULE_GROUPS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setGroup(name)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              group === name
                ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                : 'border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {name}
            <span className="ml-1.5 opacity-70">
              {name === 'All'
                ? NAV_ITEMS.length
                : NAV_ITEMS.filter((item) => item.group === name).length}
            </span>
          </button>
        ))}
      </Reveal>

      <div className="mt-5 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <article
            key={`${group}-${item.path}`}
            style={{ animationDelay: `${i * 45}ms` }}
            className="lp-pop lp-card rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--brand)]">
                <Icon name={item.icon} />
              </span>
              <span className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                {item.group} · {item.roles.length}/{ROLE_OPTIONS.length} roles
              </span>
            </div>
            <h3 className="text-sm font-bold">{item.label}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
              {MODULE_INFO[item.path]}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}

function RoleMatrix() {
  return (
    <Reveal className="mt-8 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)]">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--bg-muted)]">
            <th className="sticky left-0 bg-[var(--bg-muted)] px-4 py-3 text-left font-semibold text-[var(--muted)]">
              Module
            </th>
            {ROLE_OPTIONS.map((role) => (
              <th key={role.value} className="px-2 py-3 text-center font-semibold">
                {role.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NAV_ITEMS.map((item) => (
            <tr
              key={item.path}
              className="border-b border-[var(--line)] transition-colors last:border-0 hover:bg-[var(--bg-muted)]"
            >
              <td className="sticky left-0 bg-[var(--bg-elevated)] px-4 py-2.5 font-semibold">
                <span className="inline-flex items-center gap-2">
                  <span className="text-[var(--brand)]">
                    <Icon name={item.icon} className="h-3.5 w-3.5" />
                  </span>
                  {item.label}
                </span>
              </td>
              {ROLE_OPTIONS.map((role) => (
                <td key={role.value} className="px-2 py-2.5 text-center">
                  {item.roles.includes(role.value) ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ok)]/15 text-[var(--ok)]">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      <span className="sr-only">Yes</span>
                    </span>
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center text-[var(--line)]">
                      <Minus className="h-3 w-3" />
                      <span className="sr-only">No</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Reveal>
  );
}

const STATUS_TONES = {
  brand: 'bg-[var(--brand)]/12 text-[var(--brand)]',
  ok: 'bg-[var(--ok)]/15 text-[var(--ok)]',
  warn: 'bg-[var(--warn)]/15 text-[var(--warn)]',
  danger: 'bg-[var(--danger)]/12 text-[var(--danger)]',
  muted: 'bg-[var(--bg-muted)] text-[var(--muted)]',
};

const NAV_LINKS = [
  { href: '#about', label: 'What it is' },
  { href: '#pipeline', label: 'Roll to records' },
  { href: '#workflow', label: 'How it works' },
  { href: '#modules', label: 'Modules' },
  { href: '#roles', label: 'Roles' },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Fixed header */}
      <header
        className={`fixed inset-x-0 top-0 z-40 w-full transition-all duration-300 ${pad} ${
          scrolled
            ? 'border-b border-white/10 bg-[#0F1B2D]/85 shadow-lg backdrop-blur-md'
            : 'bg-transparent'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex h-16 w-full items-center gap-4">
          <a href="#product" className="shrink-0">
            <Logo size="nav" variant="light" />
          </a>

          <nav className="ml-2 hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
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
            <span className="hidden text-xs font-medium text-white/60 xl:inline">
              Eluru · S01-65
            </span>
            <ThemeToggle
              compact
              className="h-9 w-9 justify-center border-white/25 bg-transparent px-0 text-white hover:border-white/50 hover:bg-white/10"
            />
            <a
              href="#login"
              className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-sm font-semibold text-[#0F1B2D] transition hover:-translate-y-px hover:bg-eluru-gold"
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        id="product"
        className="relative flex min-h-[100svh] w-full flex-col overflow-hidden bg-[#0F1B2D]"
      >
        <img
          src="/images/landing-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full animate-drift object-cover"
        />
        <div className="absolute inset-0 bg-[#0F1B2D]/82" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F1B2D] via-[#0F1B2D]/75 to-[#1D4E89]/35" />
        <div className="lp-grid-bg absolute inset-0" />
        <div className="lp-orb left-[-8%] top-[10%] h-72 w-72 bg-[#2F6FED]" />
        <div
          className="lp-orb bottom-[-10%] right-[10%] h-80 w-80 bg-[#F0B429]/60"
          style={{ animationDelay: '-6s' }}
        />

        <div
          className={`relative z-10 grid w-full flex-1 content-center gap-10 pb-16 pt-28 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 ${pad}`}
        >
          <div className="text-white">
            <p
              className="lp-hero-in mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-eluru-gold backdrop-blur"
              style={{ '--d': '0ms' }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Eluru · AC S01-65 · {LANDING.roll.split(' · ')[0]}
            </p>
            <h1
              className="lp-hero-in max-w-4xl text-[clamp(2.4rem,5.4vw,4.4rem)] font-extrabold leading-[1.04] tracking-tight"
              style={{ '--d': '120ms' }}
            >
              One campaign desk for
              <span className="block min-h-[1.1em] [perspective:600px]">
                <RotatingWord />
              </span>
            </h1>
            <p
              className="lp-hero-in mt-4 max-w-2xl text-base font-medium text-white/85 sm:text-xl"
              style={{ '--d': '240ms' }}
            >
              {LANDING.tagline}
            </p>
            <p
              className="lp-hero-in mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base"
              style={{ '--d': '320ms' }}
            >
              CivicPulse turns Eluru’s{' '}
              <span className="font-semibold text-white">247 voter-list PDFs</span> into
              searchable voter records. The campaign office, coordinators, booth agents and
              volunteers then work from that same live data, right up to polling day.
            </p>

            <div
              className="lp-hero-in mt-7 flex flex-wrap gap-3"
              style={{ '--d': '420ms' }}
            >
              <a
                href="#login"
                className="group inline-flex items-center gap-2 rounded-xl bg-eluru-gold px-5 py-3 text-sm font-bold text-[#0F1B2D] shadow-glow transition hover:-translate-y-0.5 hover:bg-[#ffc94a]"
              >
                Open the workspace
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <a
                href="#pipeline"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                See how it works
              </a>
            </div>

            <div
              className="lp-hero-in mt-9 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4"
              style={{ '--d': '520ms' }}
            >
              {HERO_STATS.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur transition hover:border-white/25 hover:bg-white/10"
                >
                  <p className="text-2xl font-bold tabular-nums text-white">
                    {item.plain ? item.value : <CountUp value={item.value} />}
                  </p>
                  <p className="text-xs text-white/60">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            id="login"
            className="lp-hero-in relative w-full max-w-lg scroll-mt-24 lg:ml-auto lg:max-w-md xl:max-w-lg"
            style={{ '--d': '300ms' }}
          >
            <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-eluru-gold/30 via-transparent to-[#2F6FED]/30 blur-2xl" />
            <div className="relative">
              <AuthBox />
            </div>
            <div className="lp-float absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-white/15 bg-[#0F1B2D]/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur sm:flex">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-eluru-gold/20 text-eluru-gold">
                <ScanLine className="h-3.5 w-3.5" />
              </span>
              Voter-list files → voter records
            </div>
          </div>
        </div>

        <a
          href="#about"
          aria-label="Scroll to learn more"
          className="lp-bounce relative z-10 mx-auto mb-6 hidden h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:text-white sm:flex"
        >
          <ChevronDown className="h-5 w-5" />
        </a>
      </section>

      {/* Ticker */}
      <section className="w-full overflow-hidden border-b border-[var(--line)] bg-[var(--bg-elevated)] py-3.5">
        <div className="lp-marquee">
          {[...TICKER, ...TICKER].map((fact, i) => (
            <span
              key={i}
              className="mx-6 inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-[var(--muted)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-eluru-gold" />
              {fact}
            </span>
          ))}
        </div>
      </section>

      {/* What it is */}
      <section id="about" className={`w-full scroll-mt-16 py-16 lg:py-20 ${pad}`}>
        <SectionHead
          eyebrow="What is CivicPulse"
          title="Built for the real problems of a city campaign"
          lead={SOLUTION}
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((item, i) => (
            <Reveal
              as="article"
              key={item.title}
              delay={i * 120}
              className="lp-card rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--danger)]/10 text-[var(--danger)]">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="text-base font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal
          delay={200}
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-[var(--ok)]/30 bg-[var(--ok)]/5 p-5 sm:flex-row sm:items-center"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ok)]/15 text-[var(--ok)]">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed">
            <span className="font-bold">CivicPulse gives every team one source of truth:</span>{' '}
            the same voter list, the same booth status and the same issue log, each filtered
            to what that person’s role needs.
          </p>
        </Reveal>
      </section>

      {/* Pipeline */}
      <section
        id="pipeline"
        className={`w-full scroll-mt-16 border-y border-[var(--line)] bg-[var(--bg-muted)] py-16 lg:py-20 ${pad}`}
      >
        <SectionHead
          eyebrow="From voter list to voter record"
          title="How a voter-list file becomes searchable voters"
          lead="Each booth’s voter list arrives as a scanned PDF. CivicPulse reads it page by page and saves every voter it finds, with progress you can watch on the Data screen."
        />
        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_1fr]">
          <Reveal>
            <PipelineSteps />
          </Reveal>
          <Reveal delay={150} className="lg:sticky lg:top-24">
            <OcrDemo />
          </Reveal>
        </div>
      </section>

      {/* Booth grid */}
      <section className={`w-full py-16 lg:py-20 ${pad}`}>
        <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHead
              eyebrow="247 parts, one picture"
              title="See every Eluru booth at a glance"
              lead="Each part is a polling station with its own voter list, booth agent and coordinator. CivicPulse tracks coverage % per booth, so HQ can see which areas need more people today."
            />
            <Reveal delay={150} className="mt-6 grid grid-cols-3 gap-3">
              {[
                { value: 247, label: 'Booth parts' },
                { value: 6, label: 'Roles' },
                { value: 14, label: 'Modules' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-3"
                >
                  <p className="text-2xl font-bold tabular-nums text-[var(--brand)]">
                    <CountUp value={s.value} />
                  </p>
                  <p className="text-xs text-[var(--muted)]">{s.label}</p>
                </div>
              ))}
            </Reveal>
          </div>
          <Reveal
            delay={100}
            className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 sm:p-6"
          >
            <BoothGrid />
          </Reveal>
        </div>
      </section>

      {/* Workflow */}
      <section
        id="workflow"
        className={`w-full scroll-mt-16 border-y border-[var(--line)] bg-[var(--bg-muted)] py-16 lg:py-20 ${pad}`}
      >
        <SectionHead
          eyebrow="Workflow"
          title="How Eluru teams run CivicPulse"
          lead="From loading the voter list to election day, in four clear steps."
        />
        <div className="relative mt-10 grid w-full gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="absolute left-0 right-0 top-[38px] hidden h-px bg-gradient-to-r from-transparent via-[var(--brand)]/40 to-transparent xl:block" />
          {HOW_IT_WORKS.map((item, i) => (
            <Reveal
              as="article"
              key={item.step}
              delay={i * 130}
              className="lp-card relative rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand)] text-white shadow-glow">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="text-3xl font-extrabold text-[var(--line)]">{item.step}</span>
              </div>
              <h3 className="text-base font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className={`w-full scroll-mt-16 py-16 lg:py-20 ${pad}`}>
        <SectionHead
          eyebrow="14 modules"
          title="Everything the ground team needs"
          lead="Grouped the same way as the app’s sidebar. Pick a group to see what each screen does."
        />
        <ModuleTabs />
      </section>

      {/* Voter record */}
      <section
        className={`w-full border-y border-[var(--line)] bg-[var(--bg-muted)] py-16 lg:py-20 ${pad}`}
      >
        <SectionHead
          eyebrow="Inside a voter record"
          title="More than a name on a list"
          lead="Every voter from the roll can be updated by the field team: status after a visit, how they lean, and every contact made."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <Reveal className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm font-bold">Voter status</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Keeps the list clean after field visits.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {VOTER_STATUSES.map((s) => (
                <span
                  key={s.label}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONES[s.tone]}`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120} className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm font-bold">Support lean</p>
            <p className="mt-1 text-xs text-[var(--muted)]">A five-point scale, plus Unknown.</p>
            <div className="mt-5 flex h-3 overflow-hidden rounded-full">
              {SUPPORT_SCALE.map((s) => (
                <span key={s.label} className="flex-1" style={{ background: s.color }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px] text-[var(--muted)]">
              {SUPPORT_SCALE.map((s) => (
                <span key={s.label}>{s.label}</span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={240} className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm font-bold">Outreach channels</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Every contact is logged with its outcome.</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {OUTREACH_CHANNELS.map((c) => (
                <div key={c.label} className="flex flex-col items-center gap-1.5 text-center">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)] transition hover:scale-110 hover:bg-[var(--brand)] hover:text-white">
                    <Icon name={c.icon} />
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--muted)]">{c.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className={`w-full scroll-mt-16 py-16 lg:py-20 ${pad}`}>
        <SectionHead
          eyebrow="Who uses it"
          title="Six roles, each with its own view"
          lead="Signing in with a role sets the sidebar. Below is the exact access each role has in the app today."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {AUDIENCES.map((item, i) => (
            <Reveal
              as="article"
              key={item.role}
              delay={i * 100}
              className="lp-card rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5"
            >
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-eluru-gold/15 text-[var(--accent-ink)]">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-bold">{item.role}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{item.text}</p>
            </Reveal>
          ))}
        </div>
        <RoleMatrix />
      </section>

      {/* CTA */}
      <section className={`relative w-full overflow-hidden bg-[#0F1B2D] py-16 text-white lg:py-20 ${pad}`}>
        <div className="lp-grid-bg absolute inset-0" />
        <div className="lp-orb right-[5%] top-[-30%] h-72 w-72 bg-[#2F6FED]" />
        <div className="relative flex w-full flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <SectionHead
              dark
              eyebrow="Mahilu Solutions"
              title="Ready for the Eluru workspace?"
              lead="Pick your role and start from the operations dashboard."
            />
            <Reveal delay={150} className="mt-6 flex flex-wrap gap-2">
              {HIGHLIGHTS.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70"
                >
                  {tech}
                </span>
              ))}
            </Reveal>
          </div>
          <Reveal delay={200}>
            <a
              href="#login"
              className="group inline-flex items-center gap-2 rounded-xl bg-eluru-gold px-5 py-3.5 text-sm font-bold text-[#0F1B2D] shadow-glow transition hover:-translate-y-0.5 hover:bg-[#ffc94a]"
            >
              Sign in now
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </Reveal>
        </div>
      </section>

      <footer className={`w-full border-t border-[var(--line)] bg-[var(--bg-elevated)] py-6 ${pad}`}>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Logo size="footer" showByline />
          <p className="text-xs text-[var(--muted)]">
            {LANDING.assembly} · {LANDING.roll}
          </p>
          <p className="text-xs text-[var(--muted)]">
            © {new Date().getFullYear()} Mahilu Solutions · CivicPulse Eluru
          </p>
        </div>
      </footer>
    </div>
  );
}
