import { ChevronRight } from "lucide-react";

interface MoreGridItem {
  key: string;
  label: string;
}

interface MoreGridSection {
  title: string;
  items: MoreGridItem[];
}

/**
 * The coach "More" surface.
 *
 * A grouped list of destinations (not a card grid) — every section of
 * TeamOptimizationDashboard has a row here. Previously Team Overview, Erg
 * Scores, Leaderboard, Workout History, On-Water Results, Boat Performance,
 * Lineup History, Practice Detail, Messages, Message Board, Team Plan,
 * Branding and Training Philosophy were only reachable from the
 * desktop-only sidebar inside TeamOptimizationDashboard.
 *
 * Groups mirror the product-brief IA (Coaching / AI Tools / Team Management /
 * Program), with the remaining destinations that aren't named in that brief
 * kept in their own follow-on groups (Training Plans / Results & Analysis /
 * Communication) rather than dropped.
 *
 * The grid is unconditional: no coachOnly / hasTeam gating lives here. Items
 * that need a team are handled by CoachApp, which routes a team-less coach to
 * Team Settings (the Create Team form) instead of silently doing nothing.
 */
const SECTIONS: MoreGridSection[] = [
  {
    title: "Coaching",
    items: [
      { key: "lineups", label: "Lineup Builder" },
      { key: "erg_assignments", label: "Erg Assignments" },
      { key: "seat_racing", label: "Seat Racing" },
      { key: "calendar", label: "Practice Calendar" },
      { key: "load", label: "Load Management" },
      { key: "workout_comparison", label: "Workout Comparison" },
      { key: "overview", label: "Team Overview" },
      { key: "lineup_history", label: "Lineup History" },
      { key: "practice_detail", label: "Practice Detail" },
    ],
  },
  {
    title: "AI Tools",
    items: [
      { key: "race_optimizer", label: "AI Lineup Optimizer" },
      { key: "coach_ai", label: "Coach AI Assistant" },
      { key: "season_analytics", label: "Analyze Performance" },
      { key: "training_plan", label: "Team Training Plan" },
      { key: "recruiting", label: "Recruiting Gaps" },
    ],
  },
  {
    title: "Team Management",
    items: [
      // "settings" renders SeasonManager + BoatManager inside
      // TeamOptimizationDashboard (see its "settings" case) — Season
      // Management describes that destination more accurately than the old
      // "Team Settings" label.
      { key: "settings", label: "Season Management" },
      { key: "parent_emails", label: "Parent Emails" },
      { key: "organization", label: "Athletic Director" },
      { key: "coaches", label: "Add Coach" },
      { key: "branding", label: "Team Branding" },
    ],
  },
  {
    title: "Program",
    items: [
      { key: "recruiting_portal", label: "Recruiting Hub" },
      { key: "regattas", label: "Regattas" },
      { key: "depth", label: "Equipment Inventory" },
    ],
  },
  {
    title: "Training Plans",
    items: [
      { key: "import_team_plan", label: "Import Team Plan" },
      { key: "generate_team_plan_default", label: "Generate Plan — Default" },
      { key: "generate_team_plan_custom", label: "Generate Plan — My Style" },
      { key: "team_plans", label: "Team Plans" },
      { key: "training_philosophy", label: "Training Philosophy" },
    ],
  },
  {
    title: "Results & Analysis",
    items: [
      { key: "erg_scores", label: "Erg Scores" },
      { key: "leaderboard", label: "Team Leaderboard" },
      { key: "history", label: "Workout History" },
      { key: "onwater", label: "On-Water Results" },
      { key: "boat_perf", label: "Boat Performance" },
    ],
  },
  {
    title: "Communication",
    items: [
      { key: "messages", label: "Direct Messages" },
      { key: "board", label: "Message Board" },
    ],
  },
];

interface Props {
  onNavigate: (section: string) => void;
}

const CoachMoreGrid = ({ onNavigate }: Props) => {
  return (
    // Scrollable and always rendered — pb-24 keeps the last row clear of the
    // fixed 64px bottom tab bar + iOS safe area.
    <div
      className="space-y-6 overflow-y-auto"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)", WebkitOverflowScrolling: "touch" }}
    >
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="text-xs uppercase text-subtle px-1 pb-2">
            {section.title}
          </h2>
          <div className="rounded-lg bg-surface-2 overflow-hidden">
            {section.items.map((item, index) => (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`flex h-12 w-full items-center justify-between px-4 text-left transition-colors hover:bg-surface-3 ${
                  index !== section.items.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="text-base text-foreground">{item.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-subtle" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CoachMoreGrid;
