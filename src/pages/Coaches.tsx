import { useNavigate } from "react-router-dom";
import logoIcon from "@/assets/crewsync-logo-icon.jpg";

const Coaches = () => {
  const navigate = useNavigate();

  const problemCards = [
    {
      icon: "📋",
      title: "Lineups on Spreadsheets",
      desc: "Managing boat lineups in Excel means version conflicts, no history, and wasted time before every practice.",
    },
    {
      icon: "🖥️",
      title: "Erg Data in Concept2",
      desc: "Athlete scores live in a separate logbook you can't annotate, filter, or compare across your whole roster.",
    },
    {
      icon: "📄",
      title: "Splits Lost on Paper",
      desc: "Seat race and piece results scribbled on clipboards get lost — there's no cumulative record to build on.",
    },
  ];

  const featureCards = [
    {
      icon: "📅",
      title: "Today Tab",
      desc: "See every athlete's scheduled workout, check-in status, and wellness flag at a glance. One dashboard to start every coaching day.",
    },
    {
      icon: "🚣",
      title: "Lineup Builder",
      desc: "Drag-and-drop athletes into boat seats with AI-suggested configurations. Publish lineups to the whole team in one tap.",
    },
    {
      icon: "⚡",
      title: "Erg Workout Assignment",
      desc: "Assign specific erg pieces to individuals or groups. Athletes see them in-app and results flow back automatically.",
    },
    {
      icon: "🗓️",
      title: "Practice Calendar",
      desc: "Plan the full season with a visual calendar. Set on-water, erg, and rest days and push updates instantly to every athlete.",
    },
    {
      icon: "🏁",
      title: "Seat Racing",
      desc: "Log piece times and swaps as you race. The system calculates cumulative differentials and ranks automatically.",
    },
    {
      icon: "📊",
      title: "Load Management",
      desc: "Fatigue heatmap across your roster flags athletes at risk before breakdown. Balance training load across the week.",
    },
  ];

  const stats = [
    { value: "51+", label: "Athletes on Platform" },
    { value: "1.8M", label: "Meters Tracked" },
    { value: "Free", label: "During Beta" },
  ];

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", margin: 0, padding: 0, backgroundColor: "#ffffff" }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .nav-link { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s; }
        .nav-link:hover { color: #ffffff; }
        .feature-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; transition: box-shadow 0.2s, transform 0.2s; }
        .feature-card:hover { box-shadow: 0 8px 30px rgba(45,107,228,0.12); transform: translateY(-2px); }
        .pricing-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; transition: box-shadow 0.2s; }
        .pricing-card:hover { box-shadow: 0 8px 30px rgba(45,107,228,0.12); }
        .btn-primary { background: #2d6be4; color: #ffffff; border: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s, transform 0.1s; text-decoration: none; display: inline-block; }
        .btn-primary:hover { background: #2459c7; transform: translateY(-1px); }
        .btn-outline { background: transparent; color: rgba(255,255,255,0.9); border: 1.5px solid rgba(255,255,255,0.4); padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: border-color 0.2s, background 0.2s; text-decoration: none; display: inline-block; }
        .btn-outline:hover { border-color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); }
        @media (max-width: 768px) {
          .coaches-features-grid { grid-template-columns: 1fr !important; }
          .coaches-problems-grid { grid-template-columns: 1fr !important; }
          .coaches-pricing-grid { grid-template-columns: 1fr !important; }
          .coaches-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .hero-btns { flex-direction: column !important; align-items: center !important; }
          .nav-links-row { display: none !important; }
          .footer-links { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .hide-mobile { display: none !important; }
        }
        @media (max-width: 480px) {
          .coaches-stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── NAVBAR ─────────────────────────────────────────────── */}
      <nav style={{
        backgroundColor: "#0a1628", padding: "0 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: "64px", position: "sticky", top: 0, zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <img src={logoIcon} alt="CrewSync" style={{ height: "36px", width: "36px", objectFit: "contain", borderRadius: "8px" }} />
          <span style={{ color: "#ffffff", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.3px" }}>CrewSync</span>
        </div>
        <div className="nav-links-row" style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <a href="/" className="nav-link" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Home</a>
          <a href="/pricing" className="nav-link" onClick={(e) => { e.preventDefault(); navigate("/pricing"); }}>Pricing</a>
          <a href="/auth" className="nav-link" onClick={(e) => { e.preventDefault(); navigate("/auth"); }}>Login</a>
          <button className="btn-primary" style={{ padding: "8px 18px", fontSize: "14px" }} onClick={() => navigate("/auth/signup")}>
            Get Started Free
          </button>
        </div>
        <button className="btn-primary hide-mobile" style={{ padding: "8px 18px", fontSize: "14px" }} onClick={() => navigate("/auth/signup")}>
          Get Started Free
        </button>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: "#0a1628", padding: "90px 24px 80px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(45,107,228,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "800px", animation: "fadeInUp 0.7s ease both" }}>
          <span style={{ display: "inline-block", backgroundColor: "rgba(45,107,228,0.15)", border: "1px solid rgba(45,107,228,0.35)", color: "#7ba7f0", fontSize: "13px", fontWeight: 600, padding: "6px 16px", borderRadius: "100px", marginBottom: "28px", letterSpacing: "0.03em" }}>
            FOR COACHES
          </span>
          <h1 style={{ color: "#ffffff", fontSize: "clamp(2.4rem, 5vw, 3.8rem)", fontWeight: 900, lineHeight: 1.1, margin: "0 0 20px", letterSpacing: "-0.03em" }}>
            Run Your Program<br />Smarter.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "clamp(1rem, 2vw, 1.2rem)", lineHeight: 1.6, margin: "0 0 44px", maxWidth: "600px" }}>
            Everything your program needs in one place — lineups, erg data, seat racing, load management, and team communication.
          </p>
          <div className="hero-btns" style={{ display: "flex", gap: "14px", justifyContent: "center", marginBottom: "20px" }}>
            <button
              className="btn-primary"
              style={{ fontSize: "16px", padding: "15px 32px" }}
              onClick={() => navigate("/auth/signup")}
            >
              Get Started Free
            </button>
            <a
              href="/coach-quickstart.html"
              className="btn-outline"
              style={{ fontSize: "16px", padding: "15px 32px" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Quick Start Guide
            </a>
          </div>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", margin: 0 }}>
            Free during beta.
          </p>
        </div>
      </section>

      {/* ── PROBLEM SECTION ────────────────────────────────────── */}
      <section style={{ backgroundColor: "#f8f9fb", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, textAlign: "center", marginBottom: "12px", letterSpacing: "-0.02em" }}>
            Coaching is harder than it should be.
          </h2>
          <p style={{ color: "#4a5568", fontSize: "16px", textAlign: "center", marginBottom: "48px", maxWidth: "560px", margin: "0 auto 48px" }}>
            Most programs are held together by workarounds. CrewSync replaces them all.
          </p>
          <div className="coaches-problems-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px" }}>
            {problemCards.map((card) => (
              <div key={card.title} style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "28px 24px" }}>
                <span style={{ display: "inline-block", backgroundColor: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "6px", marginBottom: "16px", letterSpacing: "0.05em" }}>PROBLEM</span>
                <div style={{ fontSize: "28px", marginBottom: "12px" }}>{card.icon}</div>
                <h3 style={{ color: "#0a1628", fontWeight: 700, fontSize: "16px", margin: "0 0 10px" }}>{card.title}</h3>
                <p style={{ color: "#4a5568", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES SECTION ───────────────────────────────────── */}
      <section style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, textAlign: "center", marginBottom: "12px", letterSpacing: "-0.02em" }}>
            Built for how coaches actually work.
          </h2>
          <p style={{ color: "#4a5568", fontSize: "16px", textAlign: "center", maxWidth: "560px", margin: "0 auto 48px" }}>
            Six tools that replace the spreadsheets, notebooks, and disconnected apps.
          </p>
          <div className="coaches-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px" }}>
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

      {/* ── SOCIAL PROOF ───────────────────────────────────────── */}
      <section style={{ backgroundColor: "#0a1628", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div className="coaches-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "32px", textAlign: "center", marginBottom: "56px" }}>
            {stats.map(({ value, label }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#ffffff", fontSize: "2.5rem", fontWeight: 800, lineHeight: 1 }}>{value}</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Coach quote placeholder */}
          <div style={{ maxWidth: "640px", margin: "0 auto", backgroundColor: "#112240", borderRadius: "16px", padding: "32px 36px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "17px", lineHeight: 1.7, margin: "0 0 24px", fontStyle: "italic" }}>
              "CrewSync gave us one place for everything. Lineup changes take seconds instead of 20 minutes of group texts."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(45,107,228,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "#7ba7f0", fontWeight: 700, fontSize: "16px" }}>C</span>
              </div>
              <div>
                <p style={{ color: "#ffffff", fontWeight: 700, fontSize: "14px", margin: "0 0 2px" }}>Coach Placeholder</p>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px", margin: 0 }}>Head Coach, University Rowing Program</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────── */}
      <section style={{ backgroundColor: "#f8f9fb", padding: "80px 24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <h2 style={{ color: "#0a1628", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, textAlign: "center", marginBottom: "12px", letterSpacing: "-0.02em" }}>
            Simple pricing for your program.
          </h2>
          <p style={{ color: "#4a5568", fontSize: "16px", textAlign: "center", marginBottom: "48px" }}>
            Free during beta — paid plans launch Fall 2026.
          </p>

          <div className="coaches-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px", marginBottom: "32px" }}>
            {/* Team Pro */}
            <div className="pricing-card" style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#2d6be4", color: "#ffffff", fontSize: "11px", fontWeight: 700, padding: "4px 14px", borderRadius: "100px", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                FREE DURING BETA
              </div>
              <h3 style={{ color: "#0a1628", fontWeight: 800, fontSize: "20px", margin: "16px 0 6px" }}>Team Pro</h3>
              <p style={{ color: "#4a5568", fontSize: "14px", margin: "0 0 4px" }}>Up to 30 athletes</p>
              <p style={{ color: "#0a1628", fontSize: "2rem", fontWeight: 800, margin: "12px 0 20px", lineHeight: 1 }}>
                $49<span style={{ fontSize: "15px", fontWeight: 500, color: "#6b7280" }}>/mo</span>
              </p>
              <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                {["Lineup Builder + Seat Racing", "Erg Workout Assignment", "Practice Calendar + Load Management"].map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px", color: "#374151", fontSize: "14px" }}>
                    <span style={{ color: "#2d6be4", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="btn-primary" style={{ width: "100%", textAlign: "center" }} onClick={() => navigate("/auth/signup")}>
                Get Started Free
              </button>
            </div>

            {/* Elite Team */}
            <div className="pricing-card" style={{ border: "2px solid #2d6be4", position: "relative" }}>
              <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#0a1628", color: "#ffffff", fontSize: "11px", fontWeight: 700, padding: "4px 14px", borderRadius: "100px", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                MOST POPULAR
              </div>
              <h3 style={{ color: "#0a1628", fontWeight: 800, fontSize: "20px", margin: "16px 0 6px" }}>Elite Team</h3>
              <p style={{ color: "#4a5568", fontSize: "14px", margin: "0 0 4px" }}>Unlimited athletes</p>
              <p style={{ color: "#0a1628", fontSize: "2rem", fontWeight: 800, margin: "12px 0 20px", lineHeight: 1 }}>
                $99<span style={{ fontSize: "15px", fontWeight: 500, color: "#6b7280" }}>/mo</span>
              </p>
              <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                {["Everything in Team Pro", "Recruiting profiles + parent reports", "Athletic director dashboard"].map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px", color: "#374151", fontSize: "14px" }}>
                    <span style={{ color: "#2d6be4", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="btn-primary" style={{ width: "100%", textAlign: "center" }} onClick={() => navigate("/auth/signup")}>
                Get Started Free
              </button>
            </div>
          </div>

          <p style={{ textAlign: "center", margin: 0 }}>
            <a
              href="/pricing"
              onClick={(e) => { e.preventDefault(); navigate("/pricing"); }}
              style={{ color: "#2d6be4", fontWeight: 600, fontSize: "14px", textDecoration: "none" }}
            >
              See full pricing details →
            </a>
          </p>
        </div>
      </section>

      {/* ── CTA SECTION ────────────────────────────────────────── */}
      <section style={{ backgroundColor: "#0a1628", padding: "96px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
          <h2 style={{ color: "#ffffff", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, margin: "0 0 16px", letterSpacing: "-0.03em" }}>
            Ready to run a smarter program?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "17px", margin: "0 0 40px", lineHeight: 1.6 }}>
            Get your team set up in under 10 minutes. Free during beta.
          </p>
          <div className="hero-btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <button className="btn-primary" style={{ fontSize: "16px", padding: "15px 32px" }} onClick={() => navigate("/auth/signup")}>
              Get Started Free
            </button>
            <a
              href="/coach-quickstart.html"
              className="btn-outline"
              style={{ fontSize: "16px", padding: "15px 32px" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Quick Start Guide
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
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
                { label: "Home", href: "/" },
                { label: "Pricing", href: "/pricing" },
                { label: "For Coaches", href: "/coaches" },
                { label: "Login", href: "/auth" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  onClick={(e) => { e.preventDefault(); navigate(href); }}
                  style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: "14px", transition: "color 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
                >
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

export default Coaches;
