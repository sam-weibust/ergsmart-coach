import { useNavigate } from "react-router-dom";

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", margin: 0, padding: 0 }}>
      {/* NAVBAR */}
      <nav style={{
        backgroundColor: "#0a1628",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px", backgroundColor: "#2d6be4",
            borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "16px" }}>C</span>
          </div>
          <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "18px" }}>CrewSync</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }} className="nav-links">
          {["Training", "Coaching", "Competition", "Pricing"].map(link => (
            <a key={link} href="#" style={{
              color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "14px", fontWeight: 500
            }}>{link}</a>
          ))}
          <a href="#" onClick={e => { e.preventDefault(); navigate("/auth"); }} style={{
            color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "14px", fontWeight: 500
          }}>Login</a>
          <button onClick={() => navigate("/auth")} style={{
            backgroundColor: "#2d6be4", color: "#ffffff", border: "none",
            padding: "8px 18px", borderRadius: "6px", fontSize: "14px", fontWeight: 600, cursor: "pointer"
          }}>Get Started</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        backgroundColor: "#0a1628", padding: "96px 24px 80px",
        textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          backgroundColor: "rgba(45,107,228,0.2)", border: "1px solid rgba(45,107,228,0.4)",
          borderRadius: "20px", padding: "6px 14px", marginBottom: "28px"
        }}>
          <div style={{ width: "6px", height: "6px", backgroundColor: "#2d6be4", borderRadius: "50%" }} />
          <span style={{ color: "#ffffff", fontSize: "13px", fontWeight: 500 }}>Designed around the Concept2 PM5</span>
        </div>

        <h1 style={{
          color: "#ffffff", fontSize: "clamp(36px, 6vw, 56px)",
          fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px", maxWidth: "700px"
        }}>
          Train smarter. Row faster.<br />Compete better.
        </h1>

        <p style={{
          color: "rgba(255,255,255,0.85)", fontSize: "18px", lineHeight: 1.6,
          maxWidth: "600px", margin: "0 0 12px"
        }}>
          AI-generated training plans, performance analytics, coaching tools, and racing systems built for competitive rowers.
        </p>

        <p style={{
          color: "rgba(255,255,255,0.7)", fontSize: "15px", lineHeight: 1.6,
          maxWidth: "560px", margin: "0 0 36px"
        }}>
          From structured training to live racing — everything your performance needs in one system.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginBottom: "56px" }}>
          <button onClick={() => navigate("/auth")} style={{
            backgroundColor: "#2d6be4", color: "#ffffff", border: "none",
            padding: "14px 28px", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer"
          }}>Get my training plan — free</button>
          <button onClick={() => navigate("/auth")} style={{
            backgroundColor: "transparent", color: "#ffffff",
            border: "2px solid rgba(255,255,255,0.6)",
            padding: "14px 28px", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer"
          }}>For coaches</button>
        </div>

        <div style={{
          display: "flex", gap: "0", flexWrap: "wrap", justifyContent: "center",
          border: "1px solid rgba(255,255,255,0.15)", borderRadius: "12px",
          overflow: "hidden", maxWidth: "640px", width: "100%"
        }}>
          {[
            { value: "PM5", label: "Native sync" },
            { value: "AI", label: "Training plans" },
            { value: "H2H", label: "Live racing" },
            { value: "C2", label: "Logbook sync" },
          ].map((stat, i) => (
            <div key={stat.value} style={{
              flex: "1 1 120px", padding: "20px 16px", textAlign: "center",
              borderRight: i < 3 ? "1px solid rgba(255,255,255,0.15)" : "none",
              backgroundColor: "rgba(255,255,255,0.04)"
            }}>
              <div style={{ color: "#ffffff", fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>{stat.value}</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PROBLEM SECTION */}
      <section style={{ backgroundColor: "#f8f9fb", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span style={{
              display: "inline-block", backgroundColor: "rgba(45,107,228,0.1)",
              color: "#2d6be4", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "4px 12px", borderRadius: "4px", marginBottom: "16px"
            }}>The Problem</span>
            <h2 style={{ color: "#0a1628", fontSize: "30px", fontWeight: 700, margin: "0 0 10px" }}>
              Most athletes are piecing it together.
            </h2>
            <p style={{ color: "#4a5568", fontSize: "16px", margin: 0 }}>CrewSync replaces all of it.</p>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "20px"
          }}>
            {[
              {
                tag: "BEFORE", tagColor: "#e24b4a", tagBg: "rgba(226,75,74,0.1)",
                bg: "#ffffff", border: "1px solid #e2e8f0", textColor: "#4a5568",
                body: "Spreadsheets for training plans, separate apps for logging, no connection between your data and your goals."
              },
              {
                tag: "BEFORE", tagColor: "#e24b4a", tagBg: "rgba(226,75,74,0.1)",
                bg: "#ffffff", border: "1px solid #e2e8f0", textColor: "#4a5568",
                body: "No real analytics — just raw splits with no context, no trend tracking, no idea what's actually working."
              },
              {
                tag: "BEFORE", tagColor: "#e24b4a", tagBg: "rgba(226,75,74,0.1)",
                bg: "#ffffff", border: "1px solid #e2e8f0", textColor: "#4a5568",
                body: "Coaches managing athletes across email, DMs, and guesswork — no central view of team performance."
              },
              {
                tag: "CREWSYNC", tagColor: "#2d6be4", tagBg: "rgba(45,107,228,0.15)",
                bg: "#0a1628", border: "2px solid #2d6be4", textColor: "#ffffff",
                body: "One integrated system: AI plans, PM5 sync, live analytics, coaching dashboards, and H2H racing — all connected."
              },
            ].map((card, i) => (
              <div key={i} style={{
                backgroundColor: card.bg, border: card.border,
                borderRadius: "12px", padding: "24px"
              }}>
                <span style={{
                  display: "inline-block", backgroundColor: card.tagBg,
                  color: card.tagColor, fontSize: "11px", fontWeight: 700,
                  letterSpacing: "0.08em", padding: "3px 8px", borderRadius: "4px", marginBottom: "14px"
                }}>{card.tag}</span>
                <p style={{ color: card.textColor, fontSize: "14px", lineHeight: 1.6, margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CORE SYSTEM */}
      <section style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h2 style={{ color: "#0a1628", fontSize: "30px", fontWeight: 700, margin: "0 0 10px" }}>
              Everything you need to improve.
            </h2>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "24px"
          }}>
            {[
              {
                num: "1", title: "Personalized training engine",
                desc: "AI-generated plans tailored to your timeline and goals.",
                bullets: ["AI-generated 3, 6, 9, and 12 month plans", "Goal-specific plans for 2k, endurance, and recruiting", "Auto-adjusts as you improve"]
              },
              {
                num: "2", title: "AI performance analytics",
                desc: "Deep insight into every workout.",
                bullets: ["Split and pace breakdown after every session", "Works with PM5 data via C2 sync", "Trend tracking and weakness detection over time"]
              },
              {
                num: "3", title: "Strength and nutrition system",
                desc: "Built around the demands of rowing performance.",
                bullets: ["Erg-specific lifting programs", "Weight class optimization and endurance fueling", "Meal plan generator"]
              },
              {
                num: "4", title: "Data integration",
                desc: "Your full training history in one place.",
                bullets: ["Concept2 logbook sync", "CSV and Excel import", "Manual and automated logging"]
              },
              {
                num: "5", title: "Recovery and readiness",
                desc: "Train hard, recover smarter.",
                bullets: ["Recovery scoring and training load monitoring", "Performance readiness score", "Daily check-in system"]
              },
              {
                num: "6", title: "Live systems",
                desc: "Real-time visibility during every session.",
                bullets: ["Real-time erg tracking and heart rate integration", "Live split visualization", "Race mode H2H (beta)"]
              },
            ].map(card => (
              <div key={card.num} style={{
                backgroundColor: "#ffffff", border: "1px solid #e2e8f0",
                borderRadius: "12px", padding: "24px"
              }}>
                <div style={{
                  width: "36px", height: "36px", backgroundColor: "#0a1628",
                  borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "16px"
                }}>
                  <span style={{ color: "#2d6be4", fontWeight: 700, fontSize: "15px" }}>{card.num}</span>
                </div>
                <h3 style={{ color: "#0a1628", fontSize: "16px", fontWeight: 600, margin: "0 0 8px" }}>{card.title}</h3>
                <p style={{ color: "#4a5568", fontSize: "14px", margin: "0 0 16px", lineHeight: 1.5 }}>{card.desc}</p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {card.bullets.map(b => (
                    <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <span style={{ color: "#2d6be4", fontWeight: 700, fontSize: "16px", lineHeight: 1, marginTop: "1px" }}>+</span>
                      <span style={{ color: "#4a5568", fontSize: "13px", lineHeight: 1.5 }}>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COACHING PLATFORM */}
      <section style={{ backgroundColor: "#0a1628", padding: "80px 24px" }}>
        <div style={{
          maxWidth: "1100px", margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "48px", alignItems: "center"
        }}>
          <div>
            <span style={{
              display: "inline-block", backgroundColor: "rgba(45,107,228,0.2)",
              color: "#2d6be4", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "4px 12px", borderRadius: "4px", marginBottom: "20px"
            }}>Coaching Platform</span>
            <h2 style={{ color: "#ffffff", fontSize: "30px", fontWeight: 700, margin: "0 0 16px" }}>
              Built for real rowing programs.
            </h2>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "15px", lineHeight: 1.6, margin: "0 0 28px" }}>
              Give coaches the visibility and tools to run their program at every level — from individual athletes to full team management.
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                "Team dashboards with live athlete status",
                "Athlete performance tracking and trends",
                "Training plan generation per athlete or boat",
                "Recruiting analytics and prospect tools",
                "Progress comparison tools",
                "Season planning tools"
              ].map(item => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ color: "#2d6be4", fontWeight: 700, fontSize: "18px", lineHeight: 1 }}>+</span>
                  <span style={{ color: "#ffffff", fontSize: "14px", lineHeight: 1.5 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{
            backgroundColor: "#112240", border: "1px solid rgba(45,107,228,0.4)",
            borderRadius: "16px", padding: "28px"
          }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", marginBottom: "6px" }}>Total Athletes</div>
              <div style={{ color: "#ffffff", fontSize: "36px", fontWeight: 800 }}>24</div>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", marginBottom: "6px" }}>Team Average 2k</div>
              <div style={{ color: "#ffffff", fontSize: "36px", fontWeight: 800 }}>6:42.3</div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", marginBottom: "12px" }}>Top Performers</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { name: "Alex K.", score: "6:24.1", delta: "▲ 3.2s" },
                  { name: "Jordan M.", score: "6:31.8", delta: "▲ 1.9s" },
                  { name: "Sam R.", score: "6:38.5", delta: "▲ 2.7s" },
                ].map((row, i) => (
                  <div key={row.name} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: "8px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{
                        width: "24px", height: "24px", backgroundColor: "#2d6be4",
                        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#ffffff", fontSize: "11px", fontWeight: 700
                      }}>{i + 1}</span>
                      <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: 500 }}>{row.name}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#ffffff", fontSize: "14px", fontWeight: 600 }}>{row.score}</div>
                      <div style={{ color: "#4ade80", fontSize: "11px" }}>{row.delta}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPETITION SECTION */}
      <section style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h2 style={{ color: "#0a1628", fontSize: "30px", fontWeight: 700, margin: 0 }}>
              Make training competitive.
            </h2>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "20px"
          }}>
            {[
              {
                title: "Head-to-head erg racing",
                desc: "Race any athlete in real time on the erg. Live split tracking, instant results.",
                badge: "beta"
              },
              {
                title: "Global leaderboards",
                desc: "See where you rank by age, weight class, and distance across the CrewSync community.",
                badge: null
              },
              {
                title: "Team challenges",
                desc: "Set team-wide goals and weekly challenges to build culture and accountability.",
                badge: null
              },
              {
                title: "Achievement badges",
                desc: "Unlock milestones for PRs, consistency, race wins, and more.",
                badge: null
              },
            ].map(card => (
              <div key={card.title} style={{
                backgroundColor: "#ffffff", border: "1px solid #e2e8f0",
                borderRadius: "12px", padding: "24px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <h3 style={{ color: "#0a1628", fontSize: "15px", fontWeight: 600, margin: 0 }}>{card.title}</h3>
                  {card.badge && (
                    <span style={{
                      backgroundColor: "#2d6be4", color: "#ffffff",
                      fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px"
                    }}>beta</span>
                  )}
                </div>
                <p style={{ color: "#4a5568", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM SUMMARY */}
      <section style={{ backgroundColor: "#0a1628", padding: "80px 24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "#ffffff", fontSize: "32px", fontWeight: 700, margin: "0 0 48px" }}>
            One system. Every layer of rowing performance.
          </h2>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px"
          }}>
            {[
              "Training plans", "Strength programming", "Nutrition support",
              "AI analysis", "Coaching tools", "Recruiting insights",
              "Live competition", "Recovery tracking", "Data integration"
            ].map(item => (
              <div key={item} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "14px 16px", backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)"
              }}>
                <span style={{ color: "#2d6be4", fontWeight: 700, fontSize: "16px" }}>✓</span>
                <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: 500 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ backgroundColor: "#0a1628", padding: "80px 24px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ color: "#ffffff", fontSize: "36px", fontWeight: 700, margin: "0 0 16px" }}>
            Start building your training system today.
          </h2>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "16px", lineHeight: 1.6, margin: "0 0 36px" }}>
            Get a structured plan built from your performance data in minutes.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => navigate("/auth")} style={{
              backgroundColor: "#2d6be4", color: "#ffffff", border: "none",
              padding: "14px 28px", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer"
            }}>Create my training plan</button>
            <button onClick={() => navigate("/auth")} style={{
              backgroundColor: "transparent", color: "#ffffff",
              border: "2px solid rgba(255,255,255,0.6)",
              padding: "14px 28px", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer"
            }}>I am a coach</button>
          </div>
        </div>
      </section>

      {/* FOOTER CTA BAR */}
      <div style={{
        backgroundColor: "#112240", padding: "24px",
        display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap"
      }}>
        {["Get started free", "Build my plan", "Join a team"].map(label => (
          <button key={label} onClick={() => navigate("/auth")} style={{
            backgroundColor: "transparent", color: "#ffffff",
            border: "1px solid rgba(255,255,255,0.5)",
            padding: "10px 20px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer"
          }}>{label}</button>
        ))}
      </div>

      {/* FOOTER */}
      <footer style={{
        backgroundColor: "#112240", padding: "20px 24px",
        borderTop: "1px solid rgba(255,255,255,0.1)"
      }}>
        <div style={{
          maxWidth: "1100px", margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "28px", height: "28px", backgroundColor: "#2d6be4",
              borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "14px" }}>C</span>
            </div>
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "15px" }}>CrewSync</span>
          </div>

          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            {["Training", "Coaching", "Competition", "Pricing"].map(link => (
              <a key={link} href="#" style={{
                color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "13px"
              }}>{link}</a>
            ))}
          </div>

          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
            © 2026 CrewSync. All rights reserved.
          </span>
        </div>
      </footer>

      <style>{`
        @media (max-width: 640px) {
          .nav-links { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
