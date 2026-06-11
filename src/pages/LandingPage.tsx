import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import logoIcon from "@/assets/crewsync-logo-icon.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_METERS = 1_800_000;
const FALLBACK_ATHLETES = 53;

const PATH_1 =
  "M0,56 C14,56 22,52 34,42 C48,26 56,8 76,5 C90,3 100,11 112,26 C122,40 128,52 138,57 C146,60 152,57 164,56 C178,56 186,52 198,42 C212,26 220,8 240,5 C254,3 264,11 276,26 C286,40 292,52 302,57 C310,60 316,57 328,56 C342,56 350,52 362,42 C376,26 384,8 404,5 C418,3 428,11 440,26 C450,40 456,52 466,57 C474,60 480,57 492,56 C506,56 514,52 526,42 C540,26 548,8 568,5 C582,3 592,11 604,26 C614,40 620,52 630,57 C638,60 644,57 680,56";

const PATH_2 =
  "M0,56 C12,56 20,54 30,44 C44,28 52,7 72,4 C88,2 100,10 114,24 C124,38 130,50 142,57 C150,60 158,57 170,56 C186,56 194,54 206,44 C220,28 228,7 248,4 C264,2 276,10 290,24 C300,38 306,50 318,57 C326,60 334,57 346,56 C362,56 370,54 382,44 C396,28 404,7 424,4 C440,2 452,10 466,24 C476,38 482,50 494,57 C502,60 510,57 522,56 C538,56 546,54 558,44 C572,28 580,7 600,4 C616,2 628,10 642,24 C652,38 658,50 670,57 C678,60 680,57 680,56";

const PATH_3 =
  "M0,56 C10,56 18,55 28,46 C40,30 48,5 68,2 C84,0 96,9 110,22 C122,36 128,49 140,57 C148,60 156,57 168,56 C182,56 190,55 200,46 C212,30 220,5 240,2 C256,0 268,9 282,22 C294,36 300,49 312,57 C320,60 328,57 340,56 C354,56 362,55 372,46 C384,30 392,5 412,2 C428,0 440,9 454,22 C466,36 472,49 484,57 C492,60 500,57 512,56 C526,56 534,55 544,46 C556,30 564,5 584,2 C600,0 612,9 626,22 C638,36 644,49 656,57 C664,60 672,57 680,56";

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

function ForceCurveTile({ path, tileId }: { path: string; tileId: number }) {
  const closedPath = `${path} L680,60 L0,60 Z`;
  return (
    <svg
      width="680"
      height="72"
      viewBox="0 0 680 72"
      fill="none"
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient
          id={`fc-grad-${tileId}`}
          x1="0"
          y1="0"
          x2="0"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#2272FF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2272FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="60" x2="680" y2="60" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      <path d={closedPath} fill={`url(#fc-grad-${tileId})`} />
      <path d={path} fill="none" stroke="#2272FF" strokeWidth="7" opacity="0.1" />
      <path d={path} fill="none" stroke="#2272FF" strokeWidth="1.5" opacity="0.9" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LandingPage = () => {
  const navigate = useNavigate();
  const { meters, athletes } = useLiveStats();
  const animatedMeters = useAnimatedNumber(meters);
  const animatedAthletes = useAnimatedNumber(athletes);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard", { replace: true });
      else navigate("/auth", { replace: true });
    });
  }, [navigate]);

  return (
    <div
      style={{
        fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
        margin: 0,
        padding: 0,
        backgroundColor: "var(--navy)",
        color: "var(--text)",
      }}
    >
      <style>{`
        :root {
          --navy: #08121F;
          --navy-mid: #0E1A2E;
          --navy-light: #152235;
          --blue: #2272FF;
          --accent: #3D8FD4;
          --off-white: #EBF0F8;
          --muted: #4E6580;
          --text: #A8BECD;
        }
        * { box-sizing: border-box; }
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
        @media (max-width: 768px) {
          .lp-nav-desktop { display: none !important; }
          .lp-nav-mobile { display: flex !important; }
          .lp-hero-btns { flex-direction: column !important; align-items: flex-start !important; }
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
          .lp-hero-section { padding: 100px 24px 60px !important; }
          .lp-section-pad { padding: 72px 24px !important; }
        }
      `}</style>

      {/* ── NAV ────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "62px",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 40px",
          background: "rgba(8,18,31,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Logo */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <img
            src={logoIcon}
            alt="CrewSync"
            style={{ height: "30px", width: "30px", objectFit: "contain", borderRadius: "6px" }}
          />
          <span
            style={{
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "16px",
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "-0.3px",
            }}
          >
            CrewSync
          </span>
        </div>

        {/* Desktop links */}
        <div
          className="lp-nav-desktop"
          style={{ display: "flex", alignItems: "center", gap: "32px" }}
        >
          <button
            className="lp-nav-link"
            onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
          >
            Features
          </button>
          <button
            className="lp-nav-link"
            onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
          >
            Pricing
          </button>
          <button className="lp-nav-link" onClick={() => navigate("/coaches")}>
            For Coaches
          </button>
          <button
            className="lp-btn-primary"
            style={{ padding: "8px 16px", fontSize: "12px" }}
            onClick={() => navigate("/auth/signup")}
          >
            Get Started
          </button>
        </div>

        {/* Mobile CTA only */}
        <div className="lp-nav-mobile" style={{ display: "none" }}>
          <button
            className="lp-btn-primary"
            style={{ padding: "8px 16px", fontSize: "12px" }}
            onClick={() => navigate("/auth/signup")}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section
        className="lp-hero-section"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "120px 52px 80px",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "var(--navy)",
        }}
      >
        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "radial-gradient(ellipse at 80% 60%, rgba(34,114,255,0.06) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", maxWidth: "680px" }}>
          {/* Eyebrow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "28px",
              animation: "fadeInUp 0.5s ease both",
            }}
          >
            <div
              style={{
                width: "24px",
                height: "1px",
                background: "var(--accent)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "11px",
                fontFamily: "'Space Grotesk', sans-serif",
                color: "var(--accent)",
                textTransform: "uppercase",
                fontWeight: 500,
                letterSpacing: "0.12em",
              }}
            >
              Crew Management Platform
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(54px, 6.5vw, 92px)",
              color: "#ffffff",
              letterSpacing: "-0.01em",
              lineHeight: 1.05,
              margin: "0 0 24px",
              animation: "fadeInUp 0.5s ease 0.08s both",
            }}
          >
            The data behind
            <br />
            every <em>decision.</em>
          </h1>

          {/* Subheadline */}
          <p
            style={{
              fontSize: "17px",
              fontWeight: 300,
              fontFamily: "'Space Grotesk', sans-serif",
              color: "var(--muted)",
              maxWidth: "440px",
              lineHeight: 1.72,
              margin: "0 0 40px",
              animation: "fadeInUp 0.5s ease 0.16s both",
            }}
          >
            CrewSync connects every erg score, every on-water split, and every
            lineup decision in one place. Built for programs that take the sport
            seriously.
          </p>

          {/* Buttons */}
          <div
            className="lp-hero-btns"
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              marginBottom: "48px",
              animation: "fadeInUp 0.5s ease 0.24s both",
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

          {/* Force curve */}
          <div style={{ animation: "fadeInUp 0.5s ease 0.32s both" }}>
            {/* Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: "var(--blue)",
                  flexShrink: 0,
                  animation: "pulseDot 2s ease infinite",
                }}
              />
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 500,
                }}
              >
                Live Force Curve — PM5 Bluetooth
              </span>
            </div>
            {/* Viewport */}
            <div
              style={{
                height: "72px",
                overflow: "hidden",
                position: "relative",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
                maskImage:
                  "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "2720px",
                  animation: "scrollCurve 8s linear infinite",
                }}
              >
                <ForceCurveTile path={PATH_1} tileId={1} />
                <ForceCurveTile path={PATH_2} tileId={2} />
                <ForceCurveTile path={PATH_3} tileId={3} />
                <ForceCurveTile path={PATH_1} tileId={4} />
              </div>
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
        }}
      >
        <div
          className="lp-stats-row"
          style={{ display: "flex", maxWidth: "680px" }}
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
                color: "var(--muted)",
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
                color: "var(--muted)",
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
                color: "var(--muted)",
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
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
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
                    color: "var(--muted)",
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
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <Reveal style={{ marginBottom: "56px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "'Space Grotesk', sans-serif",
                color: "var(--accent)",
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
                    color: "var(--accent)",
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
                color: "var(--accent)",
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
                color: "var(--muted)",
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
                  color: "var(--muted)",
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
                    color: "var(--muted)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  /mo
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
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
                        color: "var(--accent)",
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
                  color: "var(--muted)",
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
                    color: "var(--muted)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  /mo
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
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
                color: "var(--muted)",
                margin: 0,
              }}
            >
              Individual plans from free.{" "}
              <a
                href="/pricing"
                style={{ color: "var(--accent)", textDecoration: "none" }}
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
        }}
      >
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
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
                color: "var(--muted)",
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
                color: "var(--muted)",
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
