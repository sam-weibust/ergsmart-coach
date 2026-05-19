import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, ChevronDown, ChevronUp, Sparkles, Users, Zap, Shield, Building2 } from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const INDIVIDUAL_PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    betaPrice: 0,
    badge: null,
    badgeColor: "",
    cta: "Get Started Free",
    ctaHref: "/auth",
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
    price: 8,
    betaPrice: 6.40,
    badge: "Most Popular",
    badgeColor: "bg-blue-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
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
    price: 14,
    betaPrice: 11.20,
    badge: "Best Value",
    badgeColor: "bg-purple-500",
    cta: "Coming Fall 2026",
    ctaHref: null,
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
      "Dedicated AI coaching assistant with full training history context",
      "White-glove onboarding",
      "API access for personal data export",
    ],
  },
];

type TeamSize = "30" | "75" | "150" | "unlimited";

const TEAM_SIZE_OPTIONS: { key: TeamSize; label: string }[] = [
  { key: "30", label: "Up to 30" },
  { key: "75", label: "Up to 75" },
  { key: "150", label: "Up to 150" },
  { key: "unlimited", label: "Unlimited" },
];

interface TeamTierPricing {
  price: number;
  betaPrice: number;
  perAthleteEquiv: string | null;
}

const TEAM_PRO_PRICING: Record<TeamSize, TeamTierPricing> = {
  "30":        { price: 199, betaPrice: 159, perAthleteEquiv: "$6.63" },
  "75":        { price: 299, betaPrice: 239, perAthleteEquiv: "$3.99" },
  "150":       { price: 399, betaPrice: 319, perAthleteEquiv: "$2.66" },
  "unlimited": { price: 499, betaPrice: 399, perAthleteEquiv: null },
};

const ELITE_TEAM_PRICING: Record<TeamSize, TeamTierPricing> = {
  "30":        { price: 329, betaPrice: 263, perAthleteEquiv: "$10.97" },
  "75":        { price: 449, betaPrice: 359, perAthleteEquiv: "$5.99" },
  "150":       { price: 599, betaPrice: 479, perAthleteEquiv: "$3.99" },
  "unlimited": { price: 749, betaPrice: 599, perAthleteEquiv: null },
};

const TEAM_PRO_FEATURES = [
  "Athletes inherit Pro individual benefits",
  "Full roster management",
  "Drag-and-drop lineup builder",
  "Seat racing analysis",
  "Attendance tracking",
  "SafeSport compliant messaging ✓",
  "Team message board with moderation",
  "Workout assignment",
  "Basic team AI (limited usage)",
  "Spreadsheet import",
  "Athlete invite system and join codes",
  "Progress reports",
];

const ELITE_TEAM_FEATURES = [
  "Athletes inherit Elite individual benefits",
  "Everything in Team Pro",
  "SafeSport compliant messaging ✓",
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
  "Custom team branding (logo and colors)",
  "Branded team portal",
  "Coach AI assistant across all team data",
  "Multi-season analytics",
  "White-label recruiting portal",
  "Dedicated onboarding and migration support",
  "Priority support channel",
  "API access",
];

const ORG_PLAN = {
  id: "organization",
  name: "Organization",
  price: 899,
  betaPrice: 719,
  badge: "Multi-Program",
  badgeColor: "bg-amber-600",
  cta: "Coming Fall 2026",
  ctaHref: null,
  maxAthletes: "Up to 5 teams · 500 athletes",
  features: [
    "Athletes inherit Elite individual benefits",
    "Up to 5 teams included (+ $100/mo per additional team)",
    "500 athletes included",
    "Everything in Elite Team for all programs",
    "SafeSport compliant messaging across all programs ✓",
    "Organization master dashboard",
    "Cross-program athlete leaderboard",
    "Org-wide announcements to all teams simultaneously",
    "Equipment inventory management (shells, oars, ergs, launches)",
    "Dues and membership collection via Stripe",
    "Automatic payment reminders via email",
    "One-click board reporting PDF",
    "Athlete pathway tracking across programs",
    "Volunteer hour tracking",
    "Organization branding (logo, website, contact)",
    "Org admin multi-team single login",
    "Athlete retention and season-over-season analytics",
    "Revenue reporting dashboard",
    "Dedicated onboarding specialist",
    "Priority support channel",
  ],
};

// ── Feature comparison matrix ─────────────────────────────────────────────────

const COMPARISON_GROUPS = [
  {
    label: "AI Features",
    rows: [
      { feature: "AI workout feedback", free: false, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Daily AI suggestions", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "AI training plan generator", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "Unlimited AI requests", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "Dedicated AI coaching assistant", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "AI coaching assistant chat", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Team-wide AI coach", free: false, pro: false, elite: false, team: "Limited", eliteTeam: true },
    ],
  },
  {
    label: "Analytics",
    rows: [
      { feature: "Erg logging and history", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "2K predictor and timeline", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Advanced recovery modeling", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "Long-term development projections", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "Multi-season tracking", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "Load management and fatigue heatmap", free: false, pro: false, elite: false, team: false, eliteTeam: true },
    ],
  },
  {
    label: "Recruiting",
    rows: [
      { feature: "Public athlete profile", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "AI recruiting profile + shareable link", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "College target list with fit scores", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Recruiting email generator", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "PDF export + national ranking", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Recruiting gap analysis", free: false, pro: false, elite: false, team: false, eliteTeam: true },
      { feature: "White-label recruiting portal", free: false, pro: false, elite: false, team: false, eliteTeam: true },
    ],
  },
  {
    label: "Team Tools",
    rows: [
      { feature: "Team access as athlete", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Roster management", free: false, pro: false, elite: false, team: true, eliteTeam: true },
      { feature: "Lineup builder and seat racing", free: false, pro: false, elite: false, team: true, eliteTeam: true },
      { feature: "Workout assignment", free: false, pro: false, elite: false, team: true, eliteTeam: true },
      { feature: "Race lineup optimizer", free: false, pro: false, elite: false, team: false, eliteTeam: true },
      { feature: "Season recap AI report", free: false, pro: false, elite: false, team: false, eliteTeam: true },
      { feature: "Custom team branding", free: false, pro: false, elite: false, team: false, eliteTeam: true },
    ],
  },
  {
    label: "Live Tracking",
    rows: [
      { feature: "Head-to-head racing", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Stroke Watch", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Live erg view (PM5 BLE)", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Team H2H racing", free: false, pro: false, elite: false, team: false, eliteTeam: true },
    ],
  },
  {
    label: "Recovery & Health",
    rows: [
      { feature: "Manual sleep / water / weight logging", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Whoop sync", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "Recovery insight generator", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Injury risk scoring", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Advanced recovery modeling", free: false, pro: false, elite: true, team: false, eliteTeam: true },
      { feature: "Athlete check-in system", free: false, pro: false, elite: false, team: false, eliteTeam: true },
    ],
  },
  {
    label: "Exports & API",
    rows: [
      { feature: "Shareable workout cards", free: true, pro: true, elite: true, team: true, eliteTeam: true },
      { feature: "PDF recruiting export", free: false, pro: true, elite: true, team: false, eliteTeam: true },
      { feature: "Spreadsheet import", free: false, pro: false, elite: false, team: true, eliteTeam: true },
      { feature: "API access", free: false, pro: false, elite: true, team: false, eliteTeam: true },
    ],
  },
];

const FAQ_ITEMS = [
  { q: "When do paid plans launch?", a: "Fall 2026. Everything is completely free until then." },
  { q: "Will my data be saved when paid plans launch?", a: "Yes — all your workouts, history, profile, and settings carry over automatically. Nothing changes except billing." },
  { q: "How does the 20% beta discount work?", a: "It applies automatically to your account forever when billing launches. No coupon needed — your account is already flagged as a beta user." },
  { q: "Can I switch plans after launch?", a: "Yes, anytime. You can upgrade or downgrade and billing adjusts pro-rata." },
  { q: "Do athletes on a team need their own paid plan?", a: "No. Free users get full team participation as athletes. Team plans cover the coach — athletes on Team Pro inherit Pro benefits, and athletes on Elite Team inherit Elite benefits automatically." },
  { q: "Can I change my team size tier after launch?", a: "Yes, anytime. You can move up or down between size tiers and billing adjusts at the next cycle." },
];

// ── Cell renderer ─────────────────────────────────────────────────────────────

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-green-500 mx-auto" />;
  if (value === false) return <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-xs text-muted-foreground text-center block">{value}</span>;
}

// ── Individual plan card ──────────────────────────────────────────────────────

function IndividualPlanCard({ plan }: { plan: typeof INDIVIDUAL_PLANS[0] }) {
  const hasBeta = plan.price > 0;

  return (
    <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      {plan.badge && (
        <span className={`absolute -top-3 left-6 text-xs font-semibold text-white px-3 py-1 rounded-full ${plan.badgeColor}`}>
          {plan.badge}
        </span>
      )}

      <div className="mb-1">
        <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
      </div>

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
                ${plan.price}/mo
              </span>
            </div>
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-3xl font-black text-green-600">${plan.betaPrice.toFixed(2).replace(/\.00$/, "")}</span>
              <span className="text-muted-foreground text-sm">/mo</span>
              <span className="text-xs text-muted-foreground">for beta users</span>
            </div>
          </>
        )}
      </div>

      {hasBeta && (
        <div className="mb-4 flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          <span className="text-green-600 text-xs font-semibold">🎉 Early Backer — 20% off for life</span>
        </div>
      )}

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

// ── Team plan card ────────────────────────────────────────────────────────────

interface TeamPlanCardProps {
  name: string;
  badge: string;
  badgeColor: string;
  pricing: TeamTierPricing;
  teamSize: TeamSize;
  features: string[];
  inheritLabel: string;
}

function TeamPlanCard({ name, badge, badgeColor, pricing, teamSize, features, inheritLabel }: TeamPlanCardProps) {
  const sizeLabel = teamSize === "unlimited" ? "150+ athletes" : `up to ${teamSize} athletes`;

  return (
    <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <span className={`absolute -top-3 left-6 text-xs font-semibold text-white px-3 py-1 rounded-full ${badgeColor}`}>
        {badge}
      </span>

      <div className="mb-1">
        <h3 className="text-lg font-bold text-foreground">{name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{sizeLabel}</p>
      </div>

      <div className="mb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl line-through text-muted-foreground/60 font-semibold">
            ${pricing.price}/mo
          </span>
        </div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-3xl font-black text-green-600">${pricing.betaPrice}</span>
          <span className="text-muted-foreground text-sm">/mo</span>
          <span className="text-xs text-muted-foreground">for beta users</span>
        </div>
        {pricing.perAthleteEquiv && (
          <p className="text-xs text-muted-foreground mt-1">
            as low as <span className="font-semibold">{pricing.perAthleteEquiv} per athlete/month</span>
          </p>
        )}
      </div>

      <div className="mb-4 mt-3 flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
        <span className="text-green-600 text-xs font-semibold">🎉 Early Backer — 20% off for life</span>
      </div>

      <button
        disabled
        className="block w-full text-center py-2.5 rounded-xl font-semibold text-sm bg-muted text-muted-foreground cursor-not-allowed mb-5"
      >
        Coming Fall 2026
      </button>

      <ul className="space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Org plan card ─────────────────────────────────────────────────────────────

function OrgPlanCard() {
  return (
    <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow max-w-xl mx-auto">
      <span className={`absolute -top-3 left-6 text-xs font-semibold text-white px-3 py-1 rounded-full ${ORG_PLAN.badgeColor}`}>
        {ORG_PLAN.badge}
      </span>

      <div className="mb-1">
        <h3 className="text-lg font-bold text-foreground">{ORG_PLAN.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{ORG_PLAN.maxAthletes}</p>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl line-through text-muted-foreground/60 font-semibold">
            ${ORG_PLAN.price}/mo
          </span>
        </div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-3xl font-black text-green-600">${ORG_PLAN.betaPrice}</span>
          <span className="text-muted-foreground text-sm">/mo</span>
          <span className="text-xs text-muted-foreground">for beta users</span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
        <span className="text-green-600 text-xs font-semibold">🎉 Early Backer — 20% off for life</span>
      </div>

      <button
        disabled
        className="block w-full text-center py-2.5 rounded-xl font-semibold text-sm bg-muted text-muted-foreground cursor-not-allowed mb-5"
      >
        Coming Fall 2026
      </button>

      <ul className="space-y-2 flex-1">
        {ORG_PLAN.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Team size selector ────────────────────────────────────────────────────────

function TeamSizeSelector({ selected, onChange }: { selected: TeamSize; onChange: (s: TeamSize) => void }) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center bg-muted rounded-xl p-1 gap-1">
        {TEAM_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              selected === opt.key
                ? "bg-[#0a1628] text-white shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [planType, setPlanType] = useState<"individual" | "team">("individual");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showOrg, setShowOrg] = useState(false);
  const [teamSize, setTeamSize] = useState<TeamSize>("75");

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
          🎉 <strong>All features are free during beta.</strong> Paid plans launch Fall 2026 — sign up now to lock in <strong>20% off all plans for life.</strong>
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-24">

        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 text-xs font-semibold px-3 py-1 rounded-full border border-green-200 dark:border-green-800">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Nonprofits always free
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-foreground">Simple, transparent pricing</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Free forever for individual athletes. Powerful AI tools for those who want an edge. Team plans for coaches who want to run a world-class program.
          </p>
          {/* SafeSport Badge */}
          <div className="flex justify-center mt-4">
            <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-full px-4 py-2 text-sm">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-blue-700 dark:text-blue-300">SafeSport Compliant Messaging</span>
              <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <div className="inline-flex items-center bg-muted rounded-xl p-1 mt-6">
            <button
              onClick={() => { setPlanType("individual"); setShowOrg(false); }}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${planType === "individual" && !showOrg ? "bg-[#0a1628] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Individual
            </button>
            <button
              onClick={() => { setPlanType("team"); setShowOrg(false); }}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${planType === "team" && !showOrg ? "bg-[#0a1628] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Team / Coach
            </button>
            <button
              onClick={() => { setPlanType("team"); setShowOrg(true); }}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${showOrg ? "bg-amber-600 text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Building2 className="h-4 w-4" />
              Organization
            </button>
          </div>
        </div>

        {/* Plan cards */}
        {planType === "individual" && !showOrg ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-2">
            {INDIVIDUAL_PLANS.map(p => <IndividualPlanCard key={p.id} plan={p} />)}
          </div>
        ) : showOrg ? (
          <>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-300 text-center">
              <strong>Organization Plan</strong> — manage up to 5 teams and 500 athletes under one roof. Includes SafeSport compliant messaging, equipment inventory, dues collection, and board reporting. Additional teams $100/month each.
            </div>
            <OrgPlanCard />
          </>
        ) : (
          <>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-sm text-blue-800 dark:text-blue-300 text-center">
              <strong>Athletes don't need a paid plan.</strong> Free users get full team participation. Team plans cover the coach — athletes automatically inherit individual benefits based on your plan tier.
            </div>

            {/* Team size selector */}
            <div className="space-y-3">
              <p className="text-center text-sm font-semibold text-muted-foreground">Select your program size</p>
              <TeamSizeSelector selected={teamSize} onChange={setTeamSize} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TeamPlanCard
                name="Team Pro"
                badge="For Developing Programs"
                badgeColor="bg-blue-500"
                pricing={TEAM_PRO_PRICING[teamSize]}
                teamSize={teamSize}
                features={TEAM_PRO_FEATURES}
                inheritLabel="Pro"
              />
              <TeamPlanCard
                name="Elite Team"
                badge="Most Popular"
                badgeColor="bg-purple-500"
                pricing={ELITE_TEAM_PRICING[teamSize]}
                teamSize={teamSize}
                features={ELITE_TEAM_FEATURES}
                inheritLabel="Elite"
              />
            </div>

            {/* CrewLAB comparison callout */}
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="font-bold text-slate-900 dark:text-white">CrewLAB charges $167/month</span> for communication tools only.{" "}
                <span className="font-bold text-slate-900 dark:text-white">CrewSync at ${TEAM_PRO_PRICING[teamSize].price}/month</span> includes everything CrewLAB does{" "}
                <span className="italic">plus</span> Concept2 sync, live PM5 tracking, AI lineup optimizer, on-water tracking, recruiting tools, and more.
              </p>
            </div>

            <div className="text-center">
              <button
                onClick={() => setShowOrg(true)}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-xl px-5 py-2.5"
              >
                <Building2 className="h-4 w-4" />
                View Organization Plan ($899/mo) →
              </button>
            </div>
          </>
        )}

        {/* Beta discount note */}
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-2xl p-5 text-center">
          <p className="text-green-800 dark:text-green-300 font-semibold text-sm">
            🎉 Beta users lock in 20% off all plans for life — applied automatically when billing launches. No coupon needed.
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
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-[#0a1628] text-white">
                  <th className="text-left py-4 px-4 font-semibold w-52">Feature</th>
                  <th className="text-center py-4 px-3 font-semibold">Free</th>
                  <th className="text-center py-4 px-3 font-semibold">Pro</th>
                  <th className="text-center py-4 px-3 font-semibold">Elite</th>
                  <th className="text-center py-4 px-3 font-semibold border-l border-white/20">Team Pro</th>
                  <th className="text-center py-4 px-3 font-semibold">Elite Team</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_GROUPS.map((group) => (
                  <>
                    <tr key={group.label} className="bg-muted/60">
                      <td colSpan={6} className="py-2 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.feature} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4 text-foreground">{row.feature}</td>
                        <td className="py-2.5 px-3"><Cell value={row.free} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.pro} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.elite} /></td>
                        <td className="py-2.5 px-3 border-l border-border"><Cell value={row.team} /></td>
                        <td className="py-2.5 px-3"><Cell value={row.eliteTeam} /></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nonprofit callout */}
        <div className="bg-[#0a1628] rounded-2xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-white/70 shrink-0" />
              <h2 className="text-xl font-bold text-white">Nonprofit and Community Rowing Programs</h2>
            </div>
            <p className="text-white/75 text-sm leading-relaxed max-w-2xl">
              CrewSync is completely free for nonprofit rowing clubs and community programs — forever. We believe every program deserves access to professional coaching tools regardless of budget.
            </p>
          </div>
          <a
            href="mailto:sam.weibust@gmail.com"
            className="shrink-0 inline-block bg-white text-[#0a1628] font-bold px-6 py-3 rounded-xl text-sm hover:bg-white/90 transition-colors whitespace-nowrap"
          >
            Contact Us for Free Access
          </a>
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
