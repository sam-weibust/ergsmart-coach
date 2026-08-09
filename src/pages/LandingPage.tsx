import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import logoIcon from "@/assets/crewsync-logo-icon.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import {
  HeroForceCurve,
  FeaturesSphere,
  StatsGlobe,
  CtaParticles,
  ProblemAccents,
} from "@/components/landing/ThreeBackgrounds";

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_METERS = 1_800_000;
const FALLBACK_ATHLETES = 53;

type Navigate = ReturnType<typeof useNavigate>;

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

const NAV_ITEMS: { label: string; go: (navigate: Navigate) => void }[] = [
  { label: "Features", go: () => scrollTo("features") },
  { label: "Pricing", go: () => scrollTo("pricing") },
  { label: "For Coaches", go: (navigate) => navigate("/coaches") },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useLiveStats() {
  const [meters, setMeters] = useState(FALLBACK_METERS);
  const [athletes, setAthletes] = useState(FALLBACK_ATHLETES);

  const fetchStats = useCallback(async () => {
    try {
      const [metersRes, athletesRes] = await Promise.all([
        supabase.rpc("get_total_meters"),
        supabase.rpc("get_user_count"),
      ]);
      const m = metersRes.data as number | null;
      const a = athletesRes.data as number | null;
      if (m && m > 0) setMeters(m);
      if (a && a > 0) setAthletes(a);
    } catch {
      // keep fallback values
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return { meters, athletes };
}

function useAnimatedNumber(target: number): number {
  const [displayed, setDisplayed] = useState(0);
  const fromRef = useRef(0);
  const isFirstRef = useRef(true);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const duration = isFirstRef.current ? 2000 : 800;
    isFirstRef.current = false;
    fromRef.current = target;

    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(from + (target - from) * ease));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return displayed;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMeters(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
  className?: string;
}

function Reveal({ children, delay = 0, style, className }: RevealProps) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LandingPage = () => {
  const navigate = useNavigate();
  const { meters, athletes } = useLiveStats();
  const animatedMeters = useAnimatedNumber(meters);
  const animatedAthletes = useAnimatedNumber(athletes);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Below lg the hero text fills the width, so the ribbon would sit under it —
  // skip the WebGL scene entirely rather than hide it with CSS.
  const showHeroViz = useMediaQuery("(min-width: 63rem)");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard", { replace: true });
      else navigate("/auth", { replace: true });
    });
  }, [navigate]);

  // Nav gains a border + shadow once the hero starts scrolling past it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
        margin: 0,
        padding: 0,
        backgroundColor: "#FFFFFF",
        color: "var(--text)",
      }}
    >
      <style>{`
        /* Proxima Nova @font-face lives in src/index.css (app-wide). */
        :root {
          --navy: #08121F;
          --navy-mid: #0E1A2E;
          --navy-light: #152235;
          --blue: #2272FF;
          --lp-blue-accent: #3D8FD4;
          --off-white: #EBF0F8;
          --lp-muted-navy: #4E6580;
          --text: #A8BECD;

          /* ── Light theme (nav + hero) ───────────────────────────────── */
          --lp-bg: #FFFFFF;
          --lp-ink: #1A1A2E;
          --lp-ink-70: rgba(26,26,46,0.70);
          --lp-ink-56: rgba(26,26,46,0.56);
          --lp-ink-12: rgba(26,26,46,0.12);
          --lp-ink-08: rgba(26,26,46,0.08);
          --lp-display: 'Arial Black', 'Arial Bold', Gadget, Arial, sans-serif;
          --lp-body: 'Proxima Nova', -apple-system, BlinkMacSystemFont, sans-serif;
          --lp-ease: cubic-bezier(.4,0,.2,1);
        }
        * { box-sizing: border-box; }

        /* ── Motion (expressive: staggered reveals, enter from bottom) ── */
        @keyframes lpRise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lpDraw {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes lpPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes lpSlideUpFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Navigation ─────────────────────────────────────────────────── */
        .lp-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background: var(--lp-bg);
          border-bottom: 1px solid transparent;
          transition: border-color .2s var(--lp-ease), box-shadow .2s var(--lp-ease);
        }
        .lp-nav[data-scrolled='true'] {
          border-bottom-color: var(--lp-ink-08);
          box-shadow: 0 4px 20px 0 hsla(0,0%,87%,.2);
        }
        .lp-nav__inner {
          max-width: 80rem;
          margin: 0 auto;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 0 24px;
        }
        .lp-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
        }
        .lp-brand__mark {
          height: 32px;
          width: 32px;
          object-fit: contain;
          border-radius: .375rem;
        }
        .lp-brand__word {
          font-family: var(--lp-display);
          font-weight: 900;
          font-size: 20px;
          line-height: 1;
          letter-spacing: -.02em;
          color: var(--lp-ink);
        }
        .lp-nav__links {
          display: flex;
          align-items: center;
          gap: 40px;
          margin-left: auto;
        }
        .lp-navlink {
          font-family: var(--lp-body);
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: var(--lp-ink-56);
          background: none;
          border: none;
          padding: 8px 0;
          cursor: pointer;
          transition: color .15s var(--lp-ease);
        }
        .lp-navlink:hover { color: var(--lp-ink); }

        /* ── Buttons (light theme) ──────────────────────────────────────── */
        .lp-btn {
          font-family: var(--lp-body);
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
          border-radius: 100px;
          padding: 12px 24px;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
          transition: background .2s var(--lp-ease), color .2s var(--lp-ease),
                      border-color .2s var(--lp-ease), transform .15s var(--lp-ease);
        }
        .lp-btn:focus-visible {
          outline: 2px solid var(--lp-ink);
          outline-offset: 2px;
        }
        .lp-btn--solid {
          background: var(--lp-ink);
          color: var(--lp-bg);
          border: 1px solid var(--lp-ink);
        }
        .lp-btn--solid:hover { transform: translateY(-1px); }
        .lp-btn--outline {
          background: transparent;
          color: var(--lp-ink);
          border: 1px solid var(--lp-ink-12);
        }
        .lp-btn--outline:hover { border-color: var(--lp-ink); }
        .lp-btn--lg { padding: 16px 32px; font-size: 13px; }
        .lp-btn__arrow {
          display: inline-block;
          transition: transform .2s var(--lp-ease);
        }
        .lp-btn:hover .lp-btn__arrow { transform: translateX(4px); }

        /* ── Mobile menu ────────────────────────────────────────────────── */
        .lp-burger {
          display: none;
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          color: var(--lp-ink);
        }
        .lp-burger span {
          display: block;
          width: 20px;
          height: 2px;
          background: var(--lp-ink);
          transition: transform .2s var(--lp-ease), opacity .2s var(--lp-ease);
        }
        .lp-burger span + span { margin-top: 4px; }
        .lp-burger[data-open='true'] span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
        .lp-burger[data-open='true'] span:nth-child(2) { opacity: 0; }
        .lp-burger[data-open='true'] span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
        .lp-nav__mobile {
          display: none;
          flex-direction: column;
          gap: 4px;
          padding: 8px 24px 24px;
          border-top: 1px solid var(--lp-ink-08);
          background: var(--lp-bg);
          animation: lpSlideUpFadeIn .25s var(--lp-ease) both;
        }
        .lp-nav__mobile .lp-navlink {
          padding: 16px 0;
          text-align: left;
          border-bottom: 1px solid var(--lp-ink-08);
        }
        .lp-nav__mobile .lp-btn { margin-top: 16px; }

        /* ── Hero ───────────────────────────────────────────────────────── */
        .lp-hero {
          position: relative;
          overflow: hidden;
          background: var(--lp-bg);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 160px 24px 96px;
        }
        .lp-hero__inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 80rem;
          margin: 0 auto;
        }
        .lp-hero__col { max-width: 800px; }
        .lp-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          animation: lpRise .5s var(--lp-ease) both;
        }
        .lp-eyebrow__rule {
          width: 24px;
          height: 2px;
          background: var(--lp-ink);
          flex-shrink: 0;
        }
        .lp-eyebrow__text {
          font-family: var(--lp-body);
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .12em;
          color: var(--lp-ink-56);
        }
        .lp-hero__title {
          font-family: var(--lp-display);
          font-weight: 900;
          /* Arial Black is wide — cap the size so each line holds on one row. */
          font-size: clamp(36px, 5.6vw, 76px);
          line-height: 1;
          letter-spacing: -.03em;
          color: var(--lp-ink);
          margin: 0 0 32px;
        }
        .lp-hero__title .lp-line {
          display: block;
          animation: lpRise .6s var(--lp-ease) both;
        }
        .lp-hero__title .lp-line:nth-child(1) { animation-delay: .08s; }
        .lp-hero__title .lp-line:nth-child(2) { animation-delay: .16s; }
        .lp-mark { position: relative; white-space: nowrap; }
        .lp-mark::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: .11em;
          height: .055em;
          background: var(--lp-ink);
          transform-origin: left;
          animation: lpDraw .6s var(--lp-ease) .7s both;
        }
        .lp-hero__sub {
          font-family: var(--lp-body);
          font-size: 18px;
          font-weight: 400;
          line-height: 1.5;
          color: var(--lp-ink-70);
          max-width: 480px;
          margin: 0 0 40px;
          animation: lpRise .6s var(--lp-ease) .24s both;
        }
        .lp-hero__cta {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 48px;
          animation: lpRise .6s var(--lp-ease) .32s both;
        }
        .lp-hero__live {
          display: flex;
          align-items: center;
          gap: 8px;
          animation: lpRise .6s var(--lp-ease) .4s both;
        }
        .lp-hero__dot {
          width: 8px;
          height: 8px;
          border-radius: 100px;
          background: var(--lp-ink);
          flex-shrink: 0;
          animation: lpPulse 2s var(--lp-ease) infinite;
        }
        .lp-hero__live-text {
          font-family: var(--lp-body);
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .1em;
          color: var(--lp-ink-56);
        }

        @keyframes scrollCurve {
          from { transform: translateX(0); }
          to { transform: translateX(-680px); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,114,255,0.6); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(34,114,255,0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .lp-nav-link {
          color: rgba(235,240,248,0.65);
          text-decoration: none;
          font-size: 12px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          transition: color 0.2s;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
        }
        .lp-nav-link:hover { color: #EBF0F8; }
        .lp-btn-primary {
          background: var(--blue);
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 13px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          text-decoration: none;
          display: inline-block;
          line-height: 1;
        }
        .lp-btn-primary:hover { opacity: 0.85; transform: translateY(-1px); }
        .lp-btn-ghost {
          background: transparent;
          color: var(--off-white);
          border: 1px solid rgba(235,240,248,0.22);
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 13px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          text-decoration: none;
          line-height: 1;
        }
        .lp-btn-ghost:hover { border-color: rgba(235,240,248,0.5); background: rgba(235,240,248,0.04); }
        .lp-btn-ghost .lp-arrow { display: inline-block; transition: transform 0.2s; }
        .lp-btn-ghost:hover .lp-arrow { transform: translateX(4px); }
        .feature-card-new {
          position: relative;
          overflow: hidden;
          background: var(--navy-mid);
          padding: 28px 24px 24px;
          transition: background 0.2s;
          display: flex;
          flex-direction: column;
        }
        .feature-card-new::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: var(--blue);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s ease;
        }
        .feature-card-new:hover { background: var(--navy-light); }
        .feature-card-new:hover::after { transform: scaleX(1); }
        /* ── Responsive: nav collapses below lg (63rem) ─────────────────── */
        @media (max-width: 62.9375rem) {
          .lp-nav__links { display: none; }
          .lp-burger { display: block; }
          .lp-nav__mobile[data-open='true'] { display: flex; }
        }
        @media (max-width: 40rem) {
          .lp-hero { padding: 120px 24px 64px; }
          .lp-hero__cta { flex-direction: column; align-items: stretch; }
          .lp-hero__cta .lp-btn { width: 100%; }
        }

        /* ── Reduced motion ─────────────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .lp-hero__title .lp-line,
          .lp-eyebrow,
          .lp-hero__sub,
          .lp-hero__cta,
          .lp-hero__live,
          .lp-nav__mobile,
          .lp-mark::after,
          .lp-hero__dot {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .lp-stats-row { flex-direction: column !important; gap: 20px !important; }
          .lp-stats-row > div { border-right: none !important; border-bottom: 1px solid rgba(255,255,255,0.07) !important; padding-left: 0 !important; padding-right: 0 !important; padding-bottom: 20px !important; }
          .lp-stats-row > div:last-child { border-bottom: none !important; padding-bottom: 0 !important; }
          .lp-problem-grid { grid-template-columns: 1fr !important; }
          .lp-problem-col { border-right: none !important; padding-left: 0 !important; padding-right: 0 !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; }
          .lp-problem-col:last-child { border-bottom: none !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; max-width: 420px !important; }
          .lp-cta-btns { flex-direction: column !important; align-items: center !important; }
          .lp-footer-inner { flex-direction: column !important; gap: 24px !important; }
          .lp-footer-links { flex-direction: column !important; gap: 12px !important; }
          .lp-section-pad { padding: 72px 24px !important; }
        }
      `}</style>

      {/* ── NAV ────────────────────────────────────────────────────── */}
      <nav className="lp-nav" data-scrolled={scrolled}>
        <div className="lp-nav__inner">
          <button className="lp-brand" onClick={() => navigate("/")} aria-label="CrewSync home">
            <img src={logoIcon} alt="" className="lp-brand__mark" />
            <span className="lp-brand__word">CrewSync</span>
          </button>

          <div className="lp-nav__links">
            {NAV_ITEMS.map(({ label, go }) => (
              <button key={label} className="lp-navlink" onClick={() => go(navigate)}>
                {label}
              </button>
            ))}
            <button
              className="lp-btn lp-btn--solid"
              onClick={() => navigate("/auth/signup")}
            >
              Get Started
            </button>
          </div>

          <button
            className="lp-burger"
            data-open={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <div className="lp-nav__mobile" data-open={menuOpen}>
          {NAV_ITEMS.map(({ label, go }) => (
            <button
              key={label}
              className="lp-navlink"
              onClick={() => {
                setMenuOpen(false);
                go(navigate);
              }}
            >
              {label}
            </button>
          ))}
          <button
            className="lp-btn lp-btn--solid"
            onClick={() => {
              setMenuOpen(false);
              navigate("/auth/signup");
            }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="lp-hero">
        {/* 3D force-curve ribbon (right half, behind text) */}
        {showHeroViz && <HeroForceCurve color={0x1a1a2e} glowOpacity={0.06} />}

        <div className="lp-hero__inner">
          <div className="lp-hero__col">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow__rule" />
              <span className="lp-eyebrow__text">Crew Management Platform</span>
            </div>

            <h1 className="lp-hero__title">
              <span className="lp-line">The data behind</span>
              <span className="lp-line">
                every <span className="lp-mark">decision.</span>
              </span>
            </h1>

            <p className="lp-hero__sub">
              CrewSync connects every erg score, every on-water split, and every
              lineup decision in one place. Built for programs that take the sport
              seriously.
            </p>

            <div className="lp-hero__cta">
              <button
                className="lp-btn lp-btn--solid lp-btn--lg"
                onClick={() => navigate("/auth/signup")}
              >
                Get Started Free
              </button>
              <button
                className="lp-btn lp-btn--outline lp-btn--lg"
                onClick={() => navigate("/coaches")}
              >
                For Coaches <span className="lp-btn__arrow">→</span>
              </button>
            </div>

            <div className="lp-hero__live">
              <span className="lp-hero__dot" />
              <span className="lp-hero__live-text">
                Live Force Curve — PM5 Bluetooth
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE STATS ─────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "28px 52px",
          backgroundColor: "var(--navy)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <StatsGlobe />
        <div
          className="lp-stats-row"
          style={{ display: "flex", maxWidth: "680px", position: "relative", zIndex: 1 }}
        >
          {/* Meters */}
          <div
            id="stat-meters"
            style={{
              flex: 1,
              paddingRight: "32px",
              borderRight: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 700,
                color: "#ffffff",
                fontFamily: "'Space Grotesk', sans-serif",
                lineHeight: 1,
                marginBottom: "6px",
              }}
            >
              {formatMeters(animatedMeters)}
            </div>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--lp-muted-navy)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
              }}
            >
              Meters Logged
            </div>
          </div>

          {/* Athletes */}
          <div
            id="stat-athletes"
            style={{
              flex: 1,
              paddingLeft: "32px",
              paddingRight: "32px",
              borderRight: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 700,
                color: "#ffffff",
                fontFamily: "'Space Grotesk', sans-serif",
                lineHeight: 1,
                marginBottom: "6px",
              }}
            >
              {animatedAthletes}
            </div>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--lp-muted-navy)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
              }}
            >
              Active Athletes
            </div>
          </div>

          {/* Free */}
          <div style={{ flex: 1, paddingLeft: "32px" }}>
            <div
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 700,
                color: "var(--blue)",
                fontFamily: "'Space Grotesk', sans-serif",
                lineHeight: 1,
                marginBottom: "6px",
              }}
            >
              Free
            </div>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--lp-muted-navy)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
              }}
            >
              During Beta
            </div>
          </div>
        </div>
      </div>

      {/* ── PROBLEM SECTION ────────────────────────────────────────── */}
      <section
        className="lp-section-pad"
        style={{
          padding: "96px 52px",
          backgroundColor: "var(--navy)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <ProblemAccents />
        <div style={{ maxWidth: "1200px", margin: "0 auto", position: "relative", zIndex: 1 }}>
          <Reveal>
            <p
              style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontStyle: "italic",
                fontSize: "clamp(20px, 2.5vw, 28px)",
                color: "rgba(255,255,255,0.45)",
                marginBottom: "56px",
                fontWeight: 400,
                lineHeight: 1.4,
              }}
            >
              The data is there. It just does not talk to itself.
            </p>
          </Reveal>
          <div
            className="lp-problem-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            {[
              {
                num: "01",
                title: "Your best lineup is in a spreadsheet.",
                desc: "Built on memory and gut feel with no record of why a decision was made or whether it worked.",
              },
              {
                num: "02",
                title: "Your erg data is in Concept2.",
                desc: "Where you cannot see it alongside lineup decisions, on-water results, or anything that matters.",
              },
              {
                num: "03",
                title: "Your on-water splits are on paper.",
                desc: "Written after practice, then lost. Never connected to the lineup that rowed the piece.",
              },
            ].map((col, i) => (
              <Reveal
                key={col.num}
                delay={i * 0.1}
                className="lp-problem-col"
                style={{
                  padding: "40px 40px 40px 0",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  paddingLeft: i > 0 ? "40px" : "0",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: i < 2 ? "20px" : "0",
                    fontSize: "96px",
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    fontWeight: 400,
                    color: "rgba(255,255,255,0.025)",
                    lineHeight: 1,
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                >
                  {col.num}
                </div>
                <h3
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: "17px",
                    fontWeight: 600,
                    color: "var(--off-white)",
                    margin: "0 0 14px",
                    lineHeight: 1.4,
                  }}
                >
                  {col.title}
                </h3>
                <p
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: "15px",
                    fontWeight: 300,
                    color: "var(--lp-muted-navy)",
                    margin: 0,
                    lineHeight: 1.7,
                  }}
                >
                  {col.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES SECTION ───────────────────────────────────────── */}
      <section
        id="features"
        className="lp-section-pad"
        style={{
          backgroundColor: "var(--navy-mid)",
          borderTop: "1px solid rgba(34,114,255,0.15)",
          borderBottom: "1px solid rgba(34,114,255,0.15)",
          padding: "96px 52px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <FeaturesSphere />
        <div style={{ maxWidth: "1200px", margin: "0 auto", position: "relative", zIndex: 1 }}>
          <Reveal style={{ marginBottom: "56px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "'Space Grotesk', sans-serif",
                color: "var(--lp-blue-accent)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 500,
                display: "block",
                marginBottom: "12px",
              }}
            >
              Platform
            </span>
            <h2
              style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(32px, 4vw, 52px)",
                color: "#ffffff",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              One platform. Every tool.
            </h2>
          </Reveal>

          <div
            className="lp-features-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1px",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            {[
              {
                tag: "Coach Daily",
                title: "Today Tab",
                desc: "Every morning — lineups, attendance responses, workout, and weather in one screen. Know who is coming before you leave the house.",
                data: "Push notification on every absence",
              },
              {
                tag: "Coach Lineups",
                title: "Lineup Builder",
                desc: "Drag athletes into any boat configuration. Save templates. AI optimizer recommends the best lineup using erg, on-water, and seat race data together.",
                data: "Erg 40% · On-water 30% · Seat race 30%",
              },
              {
                tag: "Coach Assignments",
                title: "Erg Workout Assignment",
                desc: "Set target splits as 2K plus or minus seconds — they personalize automatically to each athlete's pace. See every result color coded the moment they log.",
                data: "One target. Every athlete sees their number.",
              },
              {
                tag: "Coach History",
                title: "Practice Calendar",
                desc: "Every session stored permanently — lineup, planned workout, logged splits, weather, attendance. Tap any day. See the full picture.",
                data: "Your program's institutional memory",
              },
              {
                tag: "Athlete Erg",
                title: "Live PM5 Tracking",
                desc: "Connect to any PM5 via Bluetooth. Split, watts, stroke rate, drive length, and force curves in real time. Full Concept2 logbook sync via OAuth.",
                data: "Verified scores only on the leaderboard",
              },
              {
                tag: "Athlete Training",
                title: "AI Training Plans",
                desc: "Personalized plans built on real competitive rowing methodology. Every pace target relative to your 2K. Choose your goal, intensity, and target date.",
                data: "UT2 to UT1 to AT to TR1 to TR2",
              },
            ].map((card, i) => (
              <Reveal
                key={card.title}
                delay={(i % 3) * 0.1}
                className="feature-card-new"
              >
                <div
                  style={{
                    fontSize: "9px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--lp-blue-accent)",
                    marginBottom: "14px",
                  }}
                >
                  {card.tag}
                </div>
                <h3
                  style={{
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    fontWeight: 400,
                    fontSize: "22px",
                    color: "#ffffff",
                    margin: "0 0 12px",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.2,
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 300,
                    fontSize: "14px",
                    color: "var(--text)",
                    lineHeight: 1.7,
                    margin: "0 0 20px",
                    flexGrow: 1,
                  }}
                >
                  {card.desc}
                </p>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--blue)",
                    marginTop: "auto",
                  }}
                >
                  {card.data}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING SECTION ────────────────────────────────────────── */}
      <section
        id="pricing"
        className="lp-section-pad"
        style={{
          padding: "96px 52px",
          backgroundColor: "var(--navy)",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <Reveal style={{ marginBottom: "56px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "'Space Grotesk', sans-serif",
                color: "var(--lp-blue-accent)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 500,
                display: "block",
                marginBottom: "12px",
              }}
            >
              Pricing
            </span>
            <h2
              style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(32px, 4vw, 52px)",
                color: "#ffffff",
                margin: "0 0 16px",
                letterSpacing: "-0.01em",
              }}
            >
              Simple pricing. Free during beta.
            </h2>
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "16px",
                fontWeight: 300,
                color: "var(--lp-muted-navy)",
                margin: 0,
              }}
            >
              Paid plans launch Fall 2026. Sign up now and lock in 20% off for life.
            </p>
          </Reveal>

          <div
            className="lp-pricing-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "1px",
              background: "rgba(255,255,255,0.07)",
              maxWidth: "700px",
            }}
          >
            {/* Team Pro */}
            <Reveal
              style={{
                background: "var(--navy-mid)",
                padding: "36px 32px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--lp-muted-navy)",
                  marginBottom: "12px",
                }}
              >
                Team Pro
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "4px",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    fontSize: "36px",
                    color: "#ffffff",
                    fontWeight: 400,
                    lineHeight: 1,
                  }}
                >
                  $199
                </span>
                <span
                  style={{
                    fontSize: "15px",
                    color: "var(--lp-muted-navy)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  /mo
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--lp-muted-navy)",
                  fontFamily: "'Space Grotesk', sans-serif",
                  marginBottom: "16px",
                  fontStyle: "italic",
                }}
              >
                from
              </div>
              <div
                style={{
                  display: "inline-block",
                  background: "rgba(34,114,255,0.1)",
                  color: "var(--blue)",
                  fontSize: "11px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "3px",
                  marginBottom: "28px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Up to 30 athletes — Free during beta
              </div>
              <ul
                style={{
                  listStyle: "none",
                  margin: "0 0 28px",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  "Full coaching tools",
                  "Lineup builder and seat racing",
                  "Erg workout assignments",
                  "Practice calendar",
                  "Athletes inherit Pro",
                ].map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      fontSize: "14px",
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: 300,
                      color: "var(--text)",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--lp-blue-accent)",
                        flexShrink: 0,
                        marginTop: "2px",
                        fontSize: "12px",
                      }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="lp-btn-ghost"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => navigate("/auth/signup")}
              >
                Get Started Free
              </button>
            </Reveal>

            {/* Elite Team */}
            <Reveal
              delay={0.1}
              style={{
                background: "var(--navy-mid)",
                padding: "36px 32px",
                position: "relative",
              }}
            >
              {/* Popular badge */}
              <div
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "var(--blue)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "3px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Popular
              </div>
              <div
                style={{
                  fontSize: "12px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--lp-muted-navy)",
                  marginBottom: "12px",
                }}
              >
                Elite Team
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "4px",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    fontSize: "36px",
                    color: "#ffffff",
                    fontWeight: 400,
                    lineHeight: 1,
                  }}
                >
                  $329
                </span>
                <span
                  style={{
                    fontSize: "15px",
                    color: "var(--lp-muted-navy)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  /mo
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--lp-muted-navy)",
                  fontFamily: "'Space Grotesk', sans-serif",
                  marginBottom: "16px",
                  fontStyle: "italic",
                }}
              >
                from
              </div>
              <div
                style={{
                  display: "inline-block",
                  background: "rgba(34,114,255,0.1)",
                  color: "var(--blue)",
                  fontSize: "11px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "3px",
                  marginBottom: "28px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Up to 30 athletes — Free during beta
              </div>
              <ul
                style={{
                  listStyle: "none",
                  margin: "0 0 28px",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  "Everything in Team Pro",
                  "Unlimited AI features",
                  "Race lineup optimizer",
                  "Coach AI assistant",
                  "Athletes inherit Elite",
                ].map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      fontSize: "14px",
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: 300,
                      color: "var(--text)",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--blue)",
                        flexShrink: 0,
                        marginTop: "2px",
                        fontSize: "12px",
                      }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="lp-btn-primary"
                style={{ width: "100%", padding: "13px 20px", fontSize: "13px" }}
                onClick={() => navigate("/auth/signup")}
              >
                Get Started Free
              </button>
            </Reveal>
          </div>

          <Reveal style={{ marginTop: "20px" }}>
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "13px",
                fontStyle: "italic",
                color: "var(--lp-muted-navy)",
                margin: 0,
              }}
            >
              Individual plans from free.{" "}
              <a
                href="/pricing"
                style={{ color: "var(--lp-blue-accent)", textDecoration: "none" }}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/pricing");
                }}
              >
                See full pricing →
              </a>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── CTA SECTION ────────────────────────────────────────────── */}
      <section
        className="lp-section-pad"
        style={{
          padding: "96px 52px",
          backgroundColor: "var(--navy-mid)",
          textAlign: "center",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <CtaParticles />
        <div style={{ maxWidth: "640px", margin: "0 auto", position: "relative", zIndex: 1 }}>
          <Reveal>
            <h2
              style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(36px, 5vw, 60px)",
                color: "#ffffff",
                margin: "0 0 20px",
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              }}
            >
              Every meter. Every decision. <em>Connected.</em>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "17px",
                fontWeight: 300,
                color: "var(--lp-muted-navy)",
                margin: "0 0 36px",
                lineHeight: 1.7,
              }}
            >
              Set up your program in five minutes. Free during beta.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div
              className="lp-cta-btns"
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <button
                className="lp-btn-primary"
                style={{ padding: "13px 30px", fontSize: "13px" }}
                onClick={() => navigate("/auth/signup")}
              >
                Get Started Free
              </button>
              <button className="lp-btn-ghost" onClick={() => navigate("/coaches")}>
                For Coaches <span className="lp-arrow">→</span>
              </button>
            </div>
            <p
              style={{
                fontSize: "11px",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--lp-muted-navy)",
                margin: 0,
              }}
            >
              iOS App Store · crewsync.app · No credit card required
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer
        style={{
          backgroundColor: "#0A1628",
          padding: "48px 52px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            className="lp-footer-inner"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "32px",
              marginBottom: "36px",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                  cursor: "pointer",
                }}
                onClick={() => navigate("/")}
              >
                <img
                  src={logoIcon}
                  alt="CrewSync"
                  style={{
                    height: "30px",
                    width: "30px",
                    objectFit: "contain",
                    borderRadius: "6px",
                  }}
                />
                <span
                  style={{
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "16px",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  CrewSync
                </span>
              </div>
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "14px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  margin: 0,
                  fontWeight: 300,
                }}
              >
                Built for rowers who take the sport seriously.
              </p>
            </div>
            <nav
              className="lp-footer-links"
              style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center" }}
            >
              {[
                {
                  label: "Features",
                  action: () =>
                    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }),
                },
                { label: "Pricing", action: () => navigate("/pricing") },
                { label: "Regattas", action: () => navigate("/regattas") },
                { label: "Calculators", action: () => navigate("/calculators") },
                { label: "For Coaches", action: () => navigate("/coaches") },
                { label: "Login", action: () => navigate("/auth") },
              ].map(({ label, action }) => (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    action();
                  }}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 400,
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "24px" }}>
            <p
              style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: "13px",
                fontFamily: "'Space Grotesk', sans-serif",
                margin: 0,
              }}
            >
              © {new Date().getFullYear()} CrewSync. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
