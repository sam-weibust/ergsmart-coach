import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import logoIcon from "@/assets/crewsync-logo-icon.jpg";
import logoFull from "@/assets/crewsync-logo-full.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  total_users: number;
  average_2k: string;
  total_workouts: number;
  total_meters: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const CACHE_KEY = "crewsync_stats_cache_v5";
const CACHE_TTL = 5 * 60 * 1000;

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setStats(data);
          setLoading(false);
          return;
        }
      } catch {}
    }

    async function fetchStats() {
      try {
        const [usersRes, workoutsRes, metersRes, twoKRes] = await Promise.all([
          supabase.rpc("get_user_count"),
          supabase.from("erg_scores").select("id", { count: "exact", head: true }),
          supabase.rpc("get_total_meters"),
          supabase.rpc("get_avg_verified_2k"),
        ]);

        const total_users = (usersRes.data as number) ?? 0;
        const total_workouts = workoutsRes.count ?? 0;

        const rawMeters = (metersRes.data as number) ?? 0;
        const total_meters =
          rawMeters >= 1_000_000
            ? `${(rawMeters / 1_000_000).toFixed(1)}M`
            : rawMeters >= 1_000
            ? `${(rawMeters / 1_000).toFixed(0)}K`
            : String(rawMeters);

        const avgSec = twoKRes.data as number | null;
        let average_2k = "---";
        if (avgSec && avgSec > 0) {
          const m = Math.floor(avgSec / 60);
          const s = Math.round(avgSec % 60);
          average_2k = `${m}:${s.toString().padStart(2, "0")}`;
        }

        const result: Stats = { total_users, average_2k, total_workouts, total_meters };
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
        setStats(result);
      } catch {
        setStats({ total_users: 0, average_2k: "---", total_workouts: 0, total_meters: "0" });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return { stats, loading };
}

function useCountUp(target: number, active: boolean, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active || target === 0) return;
    const start = Date.now();
    const raf = (cb: FrameRequestCallback) => requestAnimationFrame(cb);
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * ease));
      if (progress < 1) raf(step);
    };
    raf(step);
  }, [target, active, duration]);
  return value;
}

function useInView(ref: React.RefObject<Element>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return inView;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatNumber({ value, suffix = "" }: { value: string | number; suffix?: string }) {
  return (
    <span style={{ color: "#ffffff", fontSize: "2.5rem", fontWeight: 800, lineHeight: 1 }}>
      {value}{suffix}
    </span>
  );
}

function StatSkeleton() {
  return (
    <div style={{ height: "2.5rem", width: "120px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite" }} />
  );
}

function LiveStatBar({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null!);
  const inView = useInView(ref);

  const usersCount = useCountUp(stats?.total_users ?? 0, inView && !loading);
  const workoutsCount = useCountUp(stats?.total_workouts ?? 0, inView && !loading);

  const items = [
    { label: "Athletes Training", value: loading ? null : usersCount, raw: null },
    { label: "Avg 2k on CrewSync", value: null, raw: loading ? null : stats?.average_2k },
    { label: "Workouts Logged", value: loading ? null : workoutsCount, raw: null },
    { label: "Meters Tracked", value: null, raw: loading ? null : stats?.total_meters },
  ];

  return (
    <div ref={ref} style={{ backgroundColor: "#112240", padding: "28px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", textAlign: "center" }}>
        {items.map(({ label, value, raw }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {label === "Athletes Training" && (
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#22c55e", display: "inline-block", boxShadow: "0 0 6px #22c55e" }} />
              )}
              {loading ? <StatSkeleton /> : <StatNumber value={raw ?? value ?? 0} />}
            </div>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LandingPage = () => {
  const navigate = useNavigate();
  const { stats, loading } = useStats();

  // On native iOS/Android skip the landing page entirely
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/auth", { replace: true });
      }
    });
  }, [navigate]);

  const featureCards = [
    {
      icon: "🧠",
      title: "Personalized Training Engine",
      desc: "AI plans spanning 3–12 months, goal-specific for 2k, endurance, and recruiting. Auto-adjusts as you improve.",
    },
    {
      icon: "📊",
      title: "AI Performance Analytics",
      desc: "Split and pacing breakdown after every workout. Stroke efficiency, weakness detection, and trend tracking.",
    },
    {
      icon: "⚡",
      title: "Live PM5 Tracking",
      desc: "Real-time split, stroke rate, distance, watts, and calories. Force curves, target split pacer. Auto-saves on finish.",
    },
    {
      icon: "🔄",
      title: "Concept2 Logbook Sync",
      desc: "Full workout history imports automatically. Intervals, splits, heart rate, drag factor. Daily background sync.",
    },
    {
      icon: "🏆",
      title: "Head to Head Racing",
      desc: "Race anyone, anywhere in real time. 2–8 athletes per room, matchmaking by ability, full race replay.",
    },
    {
      icon: "💪",
      title: "Strength & Nutrition",
      desc: "Erg-specific lifting programs, meal plan generator, weight tracking, hydration, sleep, and recovery score.",
    },
    {
      icon: "🎓",
      title: "Recruiting Tools",
      desc: "Public athlete profile, exportable PDF, college target list with AI fit scores, virtual combine, national ranking.",
    },
    {
      icon: "🛌",
      title: "Recovery Intelligence",
      desc: "Sleep, hydration, and calorie correlation. AI weekly insight summary, fatigue modeling, injury risk scoring.",
    },
  ];

  const coachFeatures = [
    "Full roster management",
    "Drag-and-drop lineup builder with AI optimization",
    "Seat racing analysis and cumulative rankings",
    "Race lineup optimizer",
    "Team training plan generator",
    "Load management and fatigue heatmap",
    "Athlete check-in system",
    "Recruiting profiles auto-generated for all athletes",
    "Coaches Hub with recruit discovery and recruiting board",
    "Parent weekly email reports",
    "Season recap AI report",
    "Athletic director dashboard",
  ];

  const competitionCards = [
    { icon: "⚡", title: "Head-to-Head Erg Racing", desc: "Race live against anyone in the world. Real-time PM5 sync.", badge: "Beta" },
    { icon: "🌍", title: "Global Leaderboards", desc: "Filtered by age and weight class. See where you rank nationally." },
    { icon: "📅", title: "Weekly Challenges", desc: "Points, streaks, and a live leaderboard. New challenge every Monday." },
    { icon: "🏅", title: "Achievement Badges", desc: "Earn badges and build streaks that show up on your athlete profile." },
  ];

  const calculatorCards = [
    { icon: "🧮", title: "2k Predictor", tag: "AI Powered" },
    { icon: "⚡", title: "Split to Watts Converter", tag: null },
    { icon: "⚖️", title: "Weight Adjustment Calculator", tag: null },
    { icon: "❤️", title: "Training Zones Calculator", tag: null },
    { icon: "📐", title: "Race Splits Planner", tag: null },
    { icon: "📈", title: "2k Improvement Timeline", tag: null },
  ];

  const s: React.CSSProperties = {};
  void s;

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", margin: 0, padding: 0, backgroundColor: "#ffffff" }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .nav-link { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s; }
        .nav-link:hover { color: #ffffff; }
        .feature-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; transition: box-shadow 0.2s, transform 0.2s; }
        .feature-card:hover { box-shadow: 0 8px 30px rgba(45,107,228,0.12); transform: translateY(-2px); }
        .pricing-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; transition: box-shadow 0.2s; }
        .pricing-card:hover { box-shadow: 0 8px 30px rgba(45,107,228,0.12); }
        .btn-primary { background: #2d6be4; color: #ffffff; border: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s, transform 0.1s; }
        .btn-primary:hover { background: #2459c7; transform: translateY(-1px); }
        .btn-outline { background: transparent; color: rgba(255,255,255,0.9); border: 1.5px solid rgba(255,255,255,0.4); padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
        .btn-outline:hover { border-color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); }
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .coach-cols { flex-direction: column !important; }
          .comp-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .calc-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .hide-mobile { display: none !important; }
          .hero-btns { flex-direction: column !important; align-items: center !important; }
          .hero-pills { flex-wrap: wrap !important; justify-content: center !important; }
          .nav-links-row { display: none !important; }
          .footer-links { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr !important; }
          .comp-grid { grid-template-columns: 1fr !important; }
          .calc-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── NAVBAR ───────────────────────────────────────────── */}
      <nav style={{
        backgroundColor: "#0a1628", padding: "0 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: "64px", position: "sticky", top: 0, zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={logoIcon} alt="CrewSync" style={{ height: "36px", width: "36px", objectFit: "contain", borderRadius: "8px" }} />
          <span style={{ color: "#ffffff", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.3px" }}>CrewSync</span>
        </div>
        <div className="nav-links-row" style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {["Features", "For Coaches", "Competition"].map((link) => (
            <a key={link} href={`#${link.toLowerCase().replace(" ", "-")}`} className="nav-link">{link}</a>
          ))}
          <a href="/pricing" className="nav-link" onClick={(e) => { e.preventDefault(); navigate("/pricing"); }}>Pricing</a>
          <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); navigate("/auth"); }}>Login</a>
          <button className="btn-primary" style={{ padding: "8px 18px", fontSize: "14px" }} onClick={() => navigate("/auth")}>Get Started</button>
        </div>
        <button className="btn-primary hide-mobile" style={{ padding: "8px 18px", fontSize: "14px" }} onClick={() => navigate("/auth")}>Get Started</button>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: "#0a1628", padding: "90px 24px 70px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(45,107,228,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "800px", animation: "fadeInUp 0.7s ease both" }}>
          <img src={logoFull} alt="CrewSync" style={{ height: "120px", width: "auto", objectFit: "contain", marginBottom: "28px", borderRadius: "16px", display: "block", margin: "0 auto 28px" }} />
          <span style={{ display: "inline-block", backgroundColor: "rgba(45,107,228,0.15)", border: "1px solid rgba(45,107,228,0.35)", color: "#7ba7f0", fontSize: "13px", fontWeight: 600, padding: "6px 16px", borderRadius: "100px", marginBottom: "28px", letterSpacing: "0.03em" }}>
            Built for competitive rowers
          </span>
          <h1 style={{ color: "#ffffff", fontSize: "clamp(2.4rem, 5vw, 3.8rem)", fontWeight: 900, lineHeight: 1.1, margin: "0 0 20px", letterSpacing: "-0.03em" }}>
            Train smarter.<br />Row faster.<br />Compete better.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "clamp(1rem, 2vw, 1.2rem)", lineHeight: 1.6, margin: "0 0 14px", maxWidth: "640px" }}>
            AI-generated training plans, live PM5 tracking, head-to-head racing, and full team management — everything in one platform.
          </p>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "15px", margin: "0 0 40px" }}>
            From your first 2k to your college recruiting profile — CrewSync has every layer covered.
          </p>
          <div className="hero-btns" style={{ display: "flex", gap: "14px", justifyContent: "center", marginBottom: "44px" }}>
            <button className="btn-primary" style={{ fontSize: "16px", padding: "15px 32px" }} onClick={() => navigate("/auth")}>
              Get My Training Plan — Free
            </button>
            <button className="btn-outline" style={{ fontSize: "16px", padding: "15px 32px" }} onClick={() => navigate("/auth")}>
              For Coaches
            </button>
          </div>
          <div className="hero-pills" style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            {["PM5 Native Sync", "AI Training Plans", "H2H Live Racing", "C2 Logbook Sync"].map((pill) => (
              <span key={pill} style={{
                backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.85)", fontSize: "13px", fontWeight: 500, padding: "7px 16px", borderRadius: "100px",
              }}>{pill}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE STATS BAR ───────────────────────────────────── */}
      <LiveStatBar stats={stats} loading={loading} />

      {/* ── PROBLEM SECTION ──────────────────────────────────── */}
      <section id="features" style={{ backgroundColor: "#f8f9fb", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, textAlign: "center", marginBottom: "48px", letterSpacing: "-0.02em" }}>
            Most athletes are piecing it together.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }} className="comp-grid">
            {[
              { label: "Spreadsheets for training", bad: true },
              { label: "Separate apps for tracking", bad: true },
              { label: "No real feedback loop", bad: true },
              { label: null, good: true },
            ].map((item, i) =>
              item.good ? (
                <div key={i} style={{ backgroundColor: "#0a1628", border: "2px solid #2d6be4", borderRadius: "14px", padding: "28px 20px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px" }}>
                  <div style={{ width: "36px", height: "36px", backgroundColor: "#2d6be4", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "4px" }}>
                    <span style={{ color: "#fff", fontSize: "18px", fontWeight: 800 }}>C</span>
                  </div>
                  <span style={{ color: "#ffffff", fontWeight: 800, fontSize: "18px" }}>CrewSync</span>
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px" }}>One system. Every layer.</span>
                </div>
              ) : (
                <div key={i} style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "28px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <span style={{ display: "inline-block", backgroundColor: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "6px", width: "fit-content", letterSpacing: "0.05em" }}>PROBLEM</span>
                  <p style={{ color: "#0a1628", fontWeight: 600, fontSize: "16px", margin: 0 }}>{item.label}</p>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── CORE FEATURES ────────────────────────────────────── */}
      <section style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, textAlign: "center", marginBottom: "48px", letterSpacing: "-0.02em" }}>
            Everything you need to improve.
          </h2>
          <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px" }}>
            {featureCards.map((card) => (
              <div key={card.title} className="feature-card">
                <div style={{ fontSize: "28px", marginBottom: "12px" }}>{card.icon}</div>
                <h3 style={{ color: "#0a1628", fontWeight: 700, fontSize: "15px", margin: "0 0 8px" }}>{card.title}</h3>
                <p style={{ color: "#4a5568", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS SECTION ─────────────────────────────── */}
      <section style={{ backgroundColor: "#f8f9fb", padding: "80px 24px" }}>
        <div style={{ maxWidth: "700px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.4rem, 2.8vw, 2.2rem)", fontWeight: 800, marginBottom: "12px", letterSpacing: "-0.02em" }}>
            Works with the tools you already use.
          </h2>
          <p style={{ color: "#4a5568", fontSize: "15px", marginBottom: "40px" }}>
            Connect your devices and import your data automatically.
          </p>
          <div style={{ display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap", marginBottom: "28px" }}>
            {[
              { logo: "/c2logo.png", name: "Concept2", desc: "Full logbook sync and live PM5 tracking." },
              { logo: "/whooplogo.png", name: "Whoop", desc: "Recovery score, HRV, and sleep data." },
            ].map((item) => (
              <div key={item.name} style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "28px 32px",
                width: "240px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "14px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <img src={item.logo} alt={item.name} style={{ height: 32, width: "auto", objectFit: "contain" }} />
                <div>
                  <p style={{ color: "#0a1628", fontWeight: 700, fontSize: "15px", margin: "0 0 6px" }}>{item.name}</p>
                  <p style={{ color: "#6b7280", fontSize: "13px", lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: "#9ca3af", fontSize: "13px" }}>
            More integrations coming soon — Garmin, Apple Health, Strava.
          </p>
        </div>
      </section>

      {/* ── COACHING SECTION ─────────────────────────────────── */}
      <section id="for-coaches" style={{ backgroundColor: "#0a1628", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div className="coach-cols" style={{ display: "flex", gap: "64px", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "inline-block", backgroundColor: "rgba(45,107,228,0.15)", border: "1px solid rgba(45,107,228,0.35)", color: "#7ba7f0", fontSize: "12px", fontWeight: 700, padding: "5px 14px", borderRadius: "100px", marginBottom: "20px", letterSpacing: "0.05em" }}>
                FOR COACHES
              </span>
              <h2 style={{ color: "#ffffff", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, margin: "0 0 28px", letterSpacing: "-0.02em" }}>
                Built for real rowing programs.
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
                {coachFeatures.map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px", color: "rgba(255,255,255,0.85)", fontSize: "15px" }}>
                    <span style={{ color: "#2d6be4", fontWeight: 700, marginTop: "1px" }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="btn-primary" style={{ marginTop: "32px" }} onClick={() => navigate("/auth")}>
                Get Coach Access
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ backgroundColor: "#112240", borderRadius: "16px", padding: "28px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "16px" }}>Coaching Dashboard</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#22c55e", fontSize: "12px", fontWeight: 600 }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#22c55e", display: "inline-block" }} />
                    Live
                  </span>
                </div>
                {[
                  { label: "Roster Size", value: "24 Athletes" },
                  { label: "Avg Team 2k", value: "7:04.2" },
                  { label: "Next Regatta", value: "May 3 — Head of the Charles" },
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px" }}>{row.label}</span>
                    <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "14px" }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: "20px" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fatigue Heatmap</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "4px", marginTop: "10px" }}>
                    {Array.from({ length: 24 }, (_, i) => {
                      const level = [0.2, 0.4, 0.6, 0.8, 1.0, 0.7, 0.3, 0.5][i % 8];
                      return (
                        <div key={i} style={{ height: "24px", borderRadius: "4px", backgroundColor: `rgba(45,107,228,${level})` }} />
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px" }}>Low fatigue</span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px" }}>High fatigue</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPETITION SECTION ───────────────────────────────── */}
      <section id="competition" style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, textAlign: "center", marginBottom: "48px", letterSpacing: "-0.02em" }}>
            Make training competitive.
          </h2>
          <div className="comp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px" }}>
            {competitionCards.map((card) => (
              <div key={card.title} className="feature-card">
                <div style={{ fontSize: "28px", marginBottom: "12px" }}>{card.icon}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <h3 style={{ color: "#0a1628", fontWeight: 700, fontSize: "15px", margin: 0 }}>{card.title}</h3>
                  {card.badge && (
                    <span style={{ backgroundColor: "#eff6ff", color: "#2d6be4", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "100px", letterSpacing: "0.05em" }}>BETA</span>
                  )}
                </div>
                <p style={{ color: "#4a5568", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CALCULATORS ──────────────────────────────────────── */}
      <section style={{ backgroundColor: "#f8f9fb", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, marginBottom: "12px", letterSpacing: "-0.02em" }}>
            Every rowing calculator you need.
          </h2>
          <p style={{ color: "#4a5568", fontSize: "16px", marginBottom: "40px" }}>Free tools built specifically for erg athletes.</p>
          <div className="calc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "36px" }}>
            {calculatorCards.map((c) => (
              <div key={c.title} onClick={() => navigate("/calculators")} style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "22px 20px", cursor: "pointer", textAlign: "left", transition: "box-shadow 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(45,107,228,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}>
                <div style={{ fontSize: "24px", marginBottom: "10px" }}>{c.icon}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#0a1628", fontWeight: 600, fontSize: "15px" }}>{c.title}</span>
                  {c.tag && <span style={{ backgroundColor: "#eff6ff", color: "#2d6be4", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "100px" }}>{c.tag}</span>}
                </div>
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={() => navigate("/calculators")}>Try the Calculators</button>
        </div>
      </section>

      {/* ── REGATTAS ─────────────────────────────────────────── */}
      <section style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, marginBottom: "16px", letterSpacing: "-0.02em" }}>
            Find regattas and track your results.
          </h2>
          <p style={{ color: "#4a5568", fontSize: "16px", maxWidth: "560px", margin: "0 auto 32px" }}>
            Search upcoming regattas, browse results, and claim your finishes to build your racing history.
          </p>
          <button className="btn-primary" onClick={() => navigate("/regattas")}>Browse Regattas</button>
        </div>
      </section>

      {/* ── SOCIAL PROOF ─────────────────────────────────────── */}
      <section style={{ backgroundColor: "#0a1628", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "32px", textAlign: "center" }} className="stats-grid">
            {[
              { label: "Athletes Training", value: stats?.total_users ?? "—" },
              { label: "Avg 2k", value: stats?.average_2k ?? "—" },
              { label: "Workouts Logged", value: stats?.total_workouts ?? "—" },
              { label: "Meters Tracked", value: stats?.total_meters ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#ffffff", fontSize: "2.2rem", fontWeight: 800 }}>{value}</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section style={{ backgroundColor: "#0a1628", padding: "96px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
          <h2 style={{ color: "#ffffff", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, margin: "0 0 16px", letterSpacing: "-0.03em" }}>
            Start building your training system today.
          </h2>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "17px", margin: "0 0 40px", lineHeight: 1.6 }}>
            Get a structured plan built from your performance data in minutes.
          </p>
          <div className="hero-btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <button className="btn-primary" style={{ fontSize: "16px", padding: "15px 32px" }} onClick={() => navigate("/auth")}>
              Create My Training Plan
            </button>
            <button className="btn-outline" style={{ fontSize: "16px", padding: "15px 32px" }} onClick={() => navigate("/auth")}>
              I'm a Coach
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer style={{ backgroundColor: "#112240", padding: "48px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "32px", marginBottom: "36px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <img src={logoIcon} alt="CrewSync" style={{ height: "32px", width: "32px", objectFit: "contain", borderRadius: "6px" }} />
                <span style={{ color: "#ffffff", fontWeight: 800, fontSize: "18px" }}>CrewSync</span>
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", margin: 0 }}>Built for rowers who want more.</p>
            </div>
            <nav className="footer-links" style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center" }}>
              {[
                { label: "Features", href: "#features" },
                { label: "Pricing", href: "/pricing" },
                { label: "Regattas", href: "/regattas" },
                { label: "Calculators", href: "/calculators" },
                { label: "Community", href: "#" },
                { label: "Login", href: "/auth" },
              ].map(({ label, href }) => (
                <a key={label} href={href} onClick={(e) => { if (href.startsWith("/")) { e.preventDefault(); navigate(href); } }} style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: "14px", transition: "color 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}>
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "24px" }}>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", margin: 0 }}>
              © {new Date().getFullYear()} CrewSync. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
