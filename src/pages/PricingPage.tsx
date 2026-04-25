import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, ChevronDown, ChevronUp, Sparkles, Users, Zap, Shield } from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const INDIVIDUAL_PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    betaPrice: 0,
    perAthletePrice: null,
    betaPerAthletePrice: null,
    badge: null,
    badgeColor: "",
    cta: "Get Started Free",
    ctaHref: "/auth",
    isCurrent: true,
    features: [
      "Manual erg workout logging",
      "Concept2 logbook sync",
      "Whoop sync",
      "Global leaderboard",
      "Head-to-head racing",
      "Stroke Watch + all non-AI calculators",
      "Regatta search and results",
      "Public athlete profile",
      "Weekly challenges and badges",
      "Community forum",
      "Streaks and consistency tracking",
      "Weight, water & sleep logging",
      "Food search and calorie tracking",
      "Shareable workout cards",
      "Team access as athlete — full participation",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 10,
    betaPrice: 8,
    perAthletePrice: null,
    betaPerAthletePrice: null,
    badge: "Most Popular",
    badgeColor: "bg-blue-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
    isCurrent: false,
    features: [
      "Everything in Free",
      "AI workout feedback and pacing analysis",
      "Daily AI workout suggestions",
      "2K predictor and improvement timeline",
      "Recruiting profile with AI summary + shareable link",
      "College target list with AI fit scores",
      "Recruiting email generator",
      "Technique video AI feedback",
      "Weekly insight summary",
      "Recovery insight generator",
      "Meal plan generator",
      "Injury risk scoring",
      "AI coaching assistant chat",
      "Full recruiting tools (PDF export, combine score, national ranking)",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 15,
    betaPrice: 12,
    perAthletePrice: null,
    betaPerAthletePrice: null,
    badge: "Best Value",
    badgeColor: "bg-purple-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
    isCurrent: false,
    features: [
      "Everything in Pro",
      "Unlimited AI requests",
      "AI-generated multi-week training plans",
      "Advanced recovery modeling",
      "Personalized race strategy",
      "Long-term development projections",
      "Multi-season tracking",
      "Priority AI responses",
      "Early feature access",
    ],
  },
  {
    id: "elite-plus",
    name: "Elite+",
    price: 25,
    betaPrice: 20,
    perAthletePrice: null,
    betaPerAthletePrice: null,
    badge: "For Serious Athletes",
    badgeColor: "bg-amber-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
    isCurrent: false,
    features: [
      "Everything in Elite",
      "Dedicated AI coaching assistant with full training history context",
      "White-glove onboarding",
      "API access for personal data export",
    ],
  },
];

const TEAM_PLANS = [
  {
    id: "team",
    name: "Team",
    price: 199,
    betaPrice: 159,
    perAthletePrice: 8,
    betaPerAthletePrice: 6.40,
    badge: "For Developing Programs",
    badgeColor: "bg-blue-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
    athleteInherits: "Pro",
    maxAthletes: "Max 50 athletes",
    features: [
      "Athletes inherit Pro individual benefits",
      "Full roster management",
      "Drag-and-drop lineup builder",
      "Seat racing analysis",
      "Attendance tracking",
      "Team message board with moderation",
      "Workout assignment",
      "Basic team AI (limited usage)",
      "Spreadsheet import",
      "Athlete invite system and join codes",
      "Progress reports",
    ],
  },
  {
    id: "elite-team",
    name: "Elite Team",
    price: 300,
    betaPrice: 240,
    perAthletePrice: 10,
    betaPerAthletePrice: 8,
    badge: "Most Popular",
    badgeColor: "bg-purple-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
    athleteInherits: "Elite",
    maxAthletes: "Unlimited athletes",
    features: [
      "Athletes inherit Elite individual benefits",
      "Unlimited athletes",
      "Everything in Team",
      "Unlimited team AI",
      "Race lineup optimizer",
      "Training plan generator for whole team",
      "Load management and fatigue heatmap",
      "Athlete check-in system",
      "Recruiting profiles auto-generated for all athletes",
      "Recruiting gap analysis",
      "Season recap AI report",
      "Coaches Hub (recruit discovery and recruiting board)",
      "Parent weekly email reports",
      "Athletic director dashboard",
      "Head-to-head racing for whole team",
    ],
  },
  {
    id: "elite-plus-team",
    name: "Elite+ Team",
    price: 500,
    betaPrice: 400,
    perAthletePrice: 15,
    betaPerAthletePrice: 12,
    badge: "For Elite Programs",
    badgeColor: "bg-amber-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
    athleteInherits: "Elite+",
    maxAthletes: "Unlimited athletes",
    features: [
      "Athletes inherit Elite+ individual benefits",
      "Unlimited athletes",
      "Everything in Elite Team",
      "Custom team branding (logo and colors)",
      "Branded team portal",
      "Coach AI assistant across all team data",
      "Multi-season analytics",
      "White-label recruiting portal",
      "Dedicated onboarding and migration support",
      "Priority support channel",
      "API access",
    ],
  },
];

// ── Feature comparison matrix ─────────────────────────────────────────────────

const COMPARISON_GROUPS = [
  {
    label: "AI Features",
    rows: [
      { feature: "AI workout feedback", free: false, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Daily AI suggestions", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "AI training plan generator", free: false, pro: false, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Unlimited AI requests", free: false, pro: false, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Dedicated AI coaching assistant", free: false, pro: false, elite: false, elitePlus: true, team: false, eliteTeam: false, elitePlusTeam: true },
      { feature: "AI coaching assistant chat", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Team-wide AI coach", free: false, pro: false, elite: false, elitePlus: false, team: "Limited", eliteTeam: true, elitePlusTeam: true },
    ],
  },
  {
    label: "Analytics",
    rows: [
      { feature: "Erg logging and history", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "2K predictor and timeline", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Advanced recovery modeling", free: false, pro: false, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Long-term development projections", free: false, pro: false, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Multi-season tracking", free: false, pro: false, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Load management and fatigue heatmap", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: true, elitePlusTeam: true },
    ],
  },
  {
    label: "Recruiting",
    rows: [
      { feature: "Public athlete profile", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "AI recruiting profile + shareable link", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "College target list with fit scores", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Recruiting email generator", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "PDF export + national ranking", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Recruiting gap analysis", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "White-label recruiting portal", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: false, elitePlusTeam: true },
    ],
  },
  {
    label: "Team Tools",
    rows: [
      { feature: "Team access as athlete", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Roster management", free: false, pro: false, elite: false, elitePlus: false, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Lineup builder and seat racing", free: false, pro: false, elite: false, elitePlus: false, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Workout assignment", free: false, pro: false, elite: false, elitePlus: false, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Race lineup optimizer", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Season recap AI report", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Custom team branding", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: false, elitePlusTeam: true },
    ],
  },
  {
    label: "Live Tracking",
    rows: [
      { feature: "Head-to-head racing", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Stroke Watch", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Live erg view (PM5 BLE)", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Team H2H racing", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: true, elitePlusTeam: true },
    ],
  },
  {
    label: "Recovery & Health",
    rows: [
      { feature: "Manual sleep / water / weight logging", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Whoop sync", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "Recovery insight generator", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Injury risk scoring", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Advanced recovery modeling", free: false, pro: false, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Athlete check-in system", free: false, pro: false, elite: false, elitePlus: false, team: false, eliteTeam: true, elitePlusTeam: true },
    ],
  },
  {
    label: "Exports & API",
    rows: [
      { feature: "Shareable workout cards", free: true, pro: true, elite: true, elitePlus: true, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "PDF recruiting export", free: false, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: true, elitePlusTeam: true },
      { feature: "Spreadsheet import", free: false, pro: false, elite: false, elitePlus: false, team: true, eliteTeam: true, elitePlusTeam: true },
      { feature: "API access", free: false, pro: false, elite: false, elitePlus: true, team: false, eliteTeam: false, elitePlusTeam: true },
    ],
  },
  {
    label: "Athlete Limits",
    rows: [
      { feature: "Individual use", free: true, pro: true, elite: true, elitePlus: true, team: false, eliteTeam: false, elitePlusTeam: false },
      { feature: "Max athletes on team", free: "—", pro: "—", elite: "—", elitePlus: "—", team: "50", eliteTeam: "Unlimited", elitePlusTeam: "Unlimited" },
    ],
  },
];

const FAQ_ITEMS = [
  { q: "When do paid plans launch?", a: "Fall 2026. Everything is completely free until then." },
  { q: "Will my data be saved when paid plans launch?", a: "Yes — all your workouts, history, profile, and settings carry over automatically. Nothing changes except billing." },
  { q: "How does the 20% beta discount work?", a: "It applies automatically to your account forever when billing launches. No coupon needed — your account is already flagged as a beta user." },
  { q: "Can I switch plans after launch?", a: "Yes, anytime. You can upgrade or downgrade and billing adjusts pro-rata." },
  { q: "Do athletes on a team need their own paid plan?", a: "No. Free users get full team participation as athletes. Team plans cover the coach — athletes on Elite Team and Elite+ Team plans inherit those individual benefits automatically." },
  { q: "How does per-athlete pricing work?", a: "You pay the base team price plus a per-athlete fee for each active athlete on your roster. Athletes you remove are no longer billed." },
];

// ── Cell renderer ─────────────────────────────────────────────────────────────

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-green-500 mx-auto" />;
  if (value === false) return <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-xs text-muted-foreground text-center block">{value}</span>;
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, isTeam = false }: { plan: typeof INDIVIDUAL_PLANS[0] | typeof TEAM_PLANS[0]; isTeam?: boolean }) {
  const tp = plan as typeof TEAM_PLANS[0];
  const hasBeta = plan.price > 0;

  return (
    <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Badge */}
      {plan.badge && (
        <span className={`absolute -top-3 left-6 text-xs font-semibold text-white px-3 py-1 rounded-full ${plan.badgeColor}`}>
          {plan.badge}
        </span>
      )}

      {/* Plan name */}
      <div className="mb-1">
        <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
        {isTeam && tp.maxAthletes && (
          <p className="text-xs text-muted-foreground mt-0.5">{tp.maxAthletes}</p>
        )}
      </div>

      {/* Pricing */}
      <div className="mb-4">
        {plan.price === 0 ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-foreground">$0</span>
            <span className="text-muted-foreground text-sm">/month forever</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl line-through text-muted-foreground/60 font-semibold">
                ${plan.price}/mo{isTeam && tp.perAthletePrice ? ` + $${tp.perAthletePrice}/athlete` : ""}
              </span>
            </div>
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-3xl font-black text-green-600">${plan.betaPrice}</span>
              <span className="text-muted-foreground text-sm">/mo</span>
              {isTeam && tp.betaPerAthletePrice && (
                <span className="text-green-600 text-sm font-semibold">+ ${tp.betaPerAthletePrice}/athlete</span>
              )}
              <span className="text-xs text-muted-foreground">for beta users</span>
            </div>
          </>
        )}
      </div>

      {/* Early backer badge */}
      {hasBeta && (
        <div className="mb-4 flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          <span className="text-green-600 text-xs font-semibold">🎉 Early Backer — 20% off for life</span>
        </div>
      )}

      {/* CTA */}
      {plan.ctaHref ? (
        <Link
          to={plan.ctaHref}
          className="block text-center py-2.5 rounded-xl font-semibold text-sm bg-[#0a1628] text-white hover:bg-[#152238] transition-colors mb-5"
        >
          {plan.cta}
        </Link>
      ) : (
        <button
          disabled
          className="block w-full text-center py-2.5 rounded-xl font-semibold text-sm bg-muted text-muted-foreground cursor-not-allowed mb-5"
        >
          {plan.cta}
        </button>
      )}

      {/* Features */}
      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [planType, setPlanType] = useState<"individual" | "team">("individual");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-black text-xl text-[#0a1628] dark:text-white">CrewSync</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link to="/auth" className="text-sm font-semibold bg-[#0a1628] text-white px-4 py-2 rounded-xl hover:bg-[#152238] transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Beta banner */}
      <div className="bg-[#0a1628] text-white text-center py-3 px-4">
        <p className="text-sm font-medium">
          🎉 <strong>All features are free during beta.</strong> Paid plans launch Fall 2026 — sign up now to lock in <strong>20% off for life.</strong>
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-24">

        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-black text-foreground">Simple, transparent pricing</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Free forever for individual athletes. Powerful AI tools for those who want an edge. Team plans for coaches who want to run a world-class program.
          </p>
          {/* Toggle */}
          <div className="inline-flex items-center bg-muted rounded-xl p-1 mt-6">
            <button
              onClick={() => setPlanType("individual")}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${planType === "individual" ? "bg-[#0a1628] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Individual
            </button>
            <button
              onClick={() => setPlanType("team")}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${planType === "team" ? "bg-[#0a1628] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Team / Coach
            </button>
          </div>
        </div>

        {/* Plan cards */}
        {planType === "individual" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-2">
            {INDIVIDUAL_PLANS.map(p => <PlanCard key={p.id} plan={p} />)}
          </div>
        ) : (
          <>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-sm text-blue-800 dark:text-blue-300 text-center">
              <strong>Athletes don't need a paid plan.</strong> Free users get full team participation. Team plans cover the coach — and athletes automatically inherit individual benefits based on your plan tier.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TEAM_PLANS.map(p => <PlanCard key={p.id} plan={p} isTeam />)}
            </div>
          </>
        )}

        {/* Beta discount note */}
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-2xl p-5 text-center">
          <p className="text-green-800 dark:text-green-300 font-semibold text-sm">
            🎉 The 20% early backer discount applies automatically to all beta users when billing launches — no coupon needed.
          </p>
        </div>

        {/* Why sign up now */}
        <div className="space-y-8">
          <h2 className="text-3xl font-black text-center text-foreground">Why sign up now?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Zap, title: "Everything is free until Fall 2026", desc: "Use every feature — AI coaching, recruiting tools, team management — completely free while we're in beta.", color: "text-blue-500" },
              { icon: Shield, title: "Lock in 20% off, forever", desc: "Beta users are flagged in our system. When billing launches you automatically receive 20% off your chosen plan for life.", color: "text-green-500" },
              { icon: Sparkles, title: "Help shape the product", desc: "Your feedback directly influences what gets built. Beta users get early access to new features before anyone else.", color: "text-purple-500" },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-card border border-border rounded-2xl p-6 space-y-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <h3 className="font-bold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison table */}
        <div className="space-y-6">
          <h2 className="text-3xl font-black text-center text-foreground">Full feature comparison</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-[#0a1628] text-white">
                  <th className="text-left py-4 px-4 font-semibold w-52">Feature</th>
                  <th className="text-center py-4 px-3 font-semibold">Free</th>
                  <th className="text-center py-4 px-3 font-semibold">Pro</th>
                  <th className="text-center py-4 px-3 font-semibold">Elite</th>
                  <th className="text-center py-4 px-3 font-semibold">Elite+</th>
                  <th className="text-center py-4 px-3 font-semibold border-l border-white/20">Team</th>
                  <th className="text-center py-4 px-3 font-semibold">Elite Team</th>
                  <th className="text-center py-4 px-3 font-semibold">Elite+ Team</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_GROUPS.map((group) => (
                  <>
                    <tr key={group.label} className="bg-muted/60">
                      <td colSpan={8} className="py-2 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.feature} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4 text-foreground">{row.feature}</td>
                        <td className="py-2.5 px-3"><Cell value={row.free} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.pro} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.elite} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.elitePlus} /></td>
                        <td className="py-2.5 px-3 border-l border-border"><Cell value={row.team} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.eliteTeam} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.elitePlusTeam} /></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl font-black text-center text-foreground">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-foreground hover:bg-muted/50 transition-colors"
                >
                  <span>{item.q}</span>
                  {openFaq === i ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground border-t border-border pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#0a1628] rounded-3xl p-10 text-center space-y-5">
          <h2 className="text-3xl font-black text-white">Start free. Lock in your discount.</h2>
          <p className="text-white/70 text-lg max-w-xl mx-auto">
            Sign up today while everything is free and secure your 20% beta user discount — applied automatically when billing launches Fall 2026.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/auth"
              className="inline-block bg-white text-[#0a1628] font-bold px-8 py-3.5 rounded-xl text-sm hover:bg-white/90 transition-colors"
            >
              Get started free →
            </Link>
            <Link
              to="/dashboard"
              className="inline-block border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-sm hover:bg-white/10 transition-colors"
            >
              Go to dashboard
            </Link>
          </div>
          <p className="text-white/40 text-xs">No credit card required. All features free until Fall 2026.</p>
        </div>

      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 CrewSync · <Link to="/privacy" className="hover:underline">Privacy Policy</Link></p>
      </footer>
    </div>
  );
}
