import { Link } from 'react-router-dom';
import { setThemePref } from '@/theme/manager';
import { useResolvedTheme } from '@/theme/useTheme';

/**
 * Public marketing / landing page shown to unauthenticated visitors at `/`.
 *
 * Pure presentational component — no data fetching. CTAs route to the existing
 * `/login` and `/signup` auth flows. Uses the app's semantic design tokens so
 * it inherits light/dark theming automatically.
 */
export function LandingPage(): JSX.Element {
  return (
    <div className="min-h-full bg-canvas text-primary">
      <Header />
      <main>
        <Hero />
        <LogosStrip />
        <Features />
        <BlockShowcase />
        <Collaboration />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header(): JSX.Element {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <nav className="hidden items-center gap-7 text-sm text-secondary md:flex">
          <a href="#features" className="transition hover:text-primary">Features</a>
          <a href="#blocks" className="transition hover:text-primary">Blocks</a>
          <a href="#collaborate" className="transition hover:text-primary">Collaborate</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-secondary transition hover:bg-surface hover:text-primary sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Brand(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold text-white shadow-sm">
        N
      </span>
      <span className="text-lg">Notes</span>
    </Link>
  );
}

function ThemeToggle(): JSX.Element {
  const resolved = useResolvedTheme();
  const isDark = resolved === 'dark';
  return (
    <button
      type="button"
      onClick={() => setThemePref(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition hover:bg-surface hover:text-primary"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero(): JSX.Element {
  return (
    <section className="relative overflow-hidden">
      {/* Soft accent glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-10rem] mx-auto h-[28rem] max-w-4xl rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Real-time collaborative workspace
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Write, plan, and organize —
          <span className="text-accent"> all in one place.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-secondary">
          A blazing-fast block editor with real-time collaboration, databases, AI
          assistance, and rich media. Turn scattered notes into a structured,
          shareable knowledge base.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex w-full items-center justify-center rounded-md bg-accent px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-accent-hover sm:w-auto"
          >
            Start for free
          </Link>
          <Link
            to="/login"
            className="inline-flex w-full items-center justify-center rounded-md border border-border bg-surface px-6 py-3 text-base font-medium text-primary transition hover:bg-canvas sm:w-auto"
          >
            Log in
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">No credit card required · Free to get started</p>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview(): JSX.Element {
  return (
    <div className="mx-auto mt-16 max-w-4xl">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Faux window chrome */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-danger/70" />
          <span className="h-3 w-3 rounded-full bg-warning/70" />
          <span className="h-3 w-3 rounded-full bg-success/70" />
          <span className="ml-3 text-xs text-muted">Product Roadmap · Q3</span>
        </div>
        {/* Faux document body */}
        <div className="space-y-3 px-6 py-7 text-left">
          <div className="flex items-center gap-2 text-2xl font-bold">📋 Product Roadmap</div>
          <p className="text-sm text-secondary">
            Our plan for the next quarter — goals, milestones, and the team
            shipping them.
          </p>
          <h3 className="pt-1 text-base font-semibold text-primary">Q3 Objectives</h3>
          <div className="flex items-start gap-2 text-sm text-secondary">
            <span className="mt-0.5 text-accent">▸</span>
            <span>Launch real-time collaboration</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-secondary">
            <input type="checkbox" defaultChecked readOnly className="mt-1 accent-accent" />
            <span className="line-through decoration-muted">Ship the new block editor</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-secondary">
            <input type="checkbox" readOnly className="mt-1 accent-accent" />
            <span>Add AI writing assistant</span>
          </div>
          <div className="rounded-md border-l-2 border-accent bg-accent-muted px-3 py-2 text-sm text-primary">
            💡 Tip: type “/” to insert any block instantly.
          </div>
          <div className="rounded-md bg-canvas p-3 font-mono text-xs text-secondary">
            const ship = () =&gt; launch();
          </div>
        </div>
      </div>
    </div>
  );
}

function FakeLine({ width, tone = 'muted' }: { width: string; tone?: 'muted' | 'accent' }): JSX.Element {
  return (
    <div
      className={`h-3 rounded ${width} ${tone === 'accent' ? 'bg-accent/40' : 'bg-border-strong'}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Logos / trust strip                                                 */
/* ------------------------------------------------------------------ */

function LogosStrip(): JSX.Element {
  const stats = [
    { value: '12+', label: 'Block types' },
    { value: 'Real-time', label: 'Multiplayer editing' },
    { value: 'AI', label: 'Built-in assistant' },
    { value: '∞', label: 'Pages & nesting' },
  ];
  return (
    <section className="border-y border-border bg-surface/50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-bold text-primary">{s.value}</div>
            <div className="mt-1 text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features grid                                                       */
/* ------------------------------------------------------------------ */

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: '🧱',
    title: 'Block-based editor',
    desc: 'Headings, lists, toggles, quotes, callouts, code, and more. Drag to reorder, nest infinitely, and type “/” for the command menu.',
  },
  {
    icon: '👥',
    title: 'Real-time collaboration',
    desc: 'Edit together with live cursors and instant sync powered by CRDTs. No conflicts, no refresh — just shared flow.',
  },
  {
    icon: '🤖',
    title: 'AI assistance',
    desc: 'Summarize, rewrite, brainstorm, and generate content inline with built-in AI blocks that understand your page.',
  },
  {
    icon: '🗃️',
    title: 'Databases & tables',
    desc: 'Structure work with tables, columns, and database blocks. Organize tasks, notes, and projects exactly how you think.',
  },
  {
    icon: '🔗',
    title: 'Share & permissions',
    desc: 'Publish pages with public links or invite teammates with view, comment, edit, or full-access roles.',
  },
  {
    icon: '🎨',
    title: 'Light & dark themes',
    desc: 'A polished interface that adapts to your system, synced across every tab and device you sign in from.',
  },
];

function Features(): JSX.Element {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Everything you need to think and build
        </h2>
        <p className="mt-4 text-lg text-secondary">
          One workspace for your notes, docs, tasks, and knowledge — flexible
          enough to fit any workflow.
        </p>
      </div>
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="group rounded-xl border border-border bg-surface p-6 transition hover:-translate-y-1 hover:border-accent/50 hover:shadow-lg"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-muted text-2xl">
              {f.icon}
            </div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-secondary">{f.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Block showcase                                                      */
/* ------------------------------------------------------------------ */

const BLOCK_TYPES = [
  '📝 Text',
  '🔠 Headings',
  '✅ To-do',
  '🔘 Toggle',
  '💬 Quote',
  '💡 Callout',
  '💻 Code',
  '🖼️ Image',
  '🎬 Video',
  '📎 File',
  '🔖 Bookmark',
  '📊 Table',
  '🗄️ Database',
  '🧮 Columns',
  '🧭 Table of contents',
  '🤖 AI',
];

function BlockShowcase(): JSX.Element {
  return (
    <section id="blocks" className="border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Compose with powerful blocks
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-secondary">
          Mix and match content types on a single page. Press “/” anywhere to
          drop in exactly the block you need.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {BLOCK_TYPES.map((b) => (
            <span
              key={b}
              className="rounded-lg border border-border bg-canvas px-4 py-2 text-sm font-medium text-secondary shadow-sm transition hover:border-accent/50 hover:text-primary"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Collaboration                                                       */
/* ------------------------------------------------------------------ */

function Collaboration(): JSX.Element {
  const points = [
    'Live multiplayer cursors so you always see who is editing',
    'Conflict-free sync — your changes and theirs merge instantly',
    'Organize people into workspaces with granular roles',
    'Share read-only links or invite collaborators in seconds',
  ];
  return (
    <section id="collaborate" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wide text-accent">
            Built for teams
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Collaborate in real time, from anywhere
          </h2>
          <p className="mt-4 text-lg text-secondary">
            Bring your team into a shared space where ideas turn into plans.
            Everyone stays in sync — no more emailing documents back and forth.
          </p>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-secondary">
                <CheckIcon />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex -space-x-2">
              {['A', 'M', 'K', 'J'].map((c, i) => (
                <span
                  key={c}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface text-sm font-semibold text-white"
                  style={{ backgroundColor: AVATAR_COLORS[i] }}
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-accent-muted px-1.5 py-0.5 text-xs text-accent">Maya</span>
                <FakeLine width="w-2/3" />
              </div>
              <FakeLine width="w-5/6" />
              <div className="flex items-center gap-2">
                <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">Alex</span>
                <FakeLine width="w-1/2" />
              </div>
              <FakeLine width="w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const AVATAR_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626'];

/* ------------------------------------------------------------------ */
/* Final CTA                                                           */
/* ------------------------------------------------------------------ */

function FinalCta(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-accent px-6 py-16 text-center shadow-xl">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to get organized?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-white/85">
          Join now and turn your ideas into a beautifully structured workspace.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex w-full items-center justify-center rounded-md bg-white px-6 py-3 text-base font-medium text-accent shadow-sm transition hover:bg-white/90 sm:w-auto"
          >
            Create your workspace
          </Link>
          <Link
            to="/login"
            className="inline-flex w-full items-center justify-center rounded-md border border-white/40 px-6 py-3 text-base font-medium text-white transition hover:bg-white/10 sm:w-auto"
          >
            Log in
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer(): JSX.Element {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <Brand />
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} Notes. Built with the MERN stack.
        </p>
        <div className="flex items-center gap-5 text-sm text-secondary">
          <Link to="/login" className="transition hover:text-primary">Log in</Link>
          <Link to="/signup" className="transition hover:text-primary">Sign up</Link>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (inline, no extra deps)                                       */
/* ------------------------------------------------------------------ */

function CheckIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="mt-0.5 h-5 w-5 shrink-0 text-accent"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SunIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}
