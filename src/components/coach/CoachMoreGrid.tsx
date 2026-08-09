import { useTeamBranding } from "@/context/TeamBrandingContext";
import {
  Ship, Dumbbell, ArrowLeftRight, CalendarDays, Activity, GitCompare,
  Sparkles, Bot, BarChart3, GraduationCap,
  Settings, UserPlus, Mail, Building2,
  Globe, Trophy, Package, Upload, Brain, ClipboardList,
  LayoutDashboard, Medal, History, Waves, TrendingUp, ListChecks,
  MessageCircle, MessagesSquare, Palette, BookOpen, ClipboardCheck,
} from "lucide-react";

interface MoreGridItem {
  key: string;
  label: string;
  icon: React.ElementType;
}

interface MoreGridSection {
  title: string;
  items: MoreGridItem[];
}

/**
 * The coach "More" surface.
 *
 * Every section of TeamOptimizationDashboard now has a tile here — previously
 * Team Overview, Erg Scores, Leaderboard, Workout History, On-Water Results,
 * Boat Performance, Lineup History, Practice Detail, Messages, Message Board,
 * Team Plan, Branding and Training Philosophy were only reachable from the
 * desktop-only sidebar inside TeamOptimizationDashboard.
 *
 * The grid is unconditional: no coachOnly / hasTeam gating lives here. Items
 * that need a team are handled by CoachApp, which routes a team-less coach to
 * Team Settings (the Create Team form) instead of silently doing nothing.
 */
const SECTIONS: MoreGridSection[] = [
  {
    title: "Coaching",
    items: [
      { key: "overview", label: "Team Overview", icon: LayoutDashboard },
      { key: "lineups", label: "Lineup Builder", icon: Ship },
      { key: "lineup_history", label: "Lineup History", icon: History },
      { key: "erg_assignments", label: "Erg Workouts", icon: Dumbbell },
      { key: "seat_racing", label: "Seat Racing", icon: ArrowLeftRight },
      { key: "calendar", label: "Practice Calendar", icon: CalendarDays },
      { key: "practice_detail", label: "Practice Detail", icon: ClipboardCheck },
      { key: "load", label: "Load Management", icon: Activity },
      { key: "workout_comparison", label: "Workout Compare", icon: GitCompare },
    ],
  },
  {
    title: "Training Plans",
    items: [
      { key: "training_plan", label: "Team Training Plan", icon: ClipboardList },
      { key: "import_team_plan", label: "Import Team Plan", icon: Upload },
      { key: "generate_team_plan_default", label: "Generate Plan — Default", icon: Sparkles },
      { key: "generate_team_plan_custom", label: "Generate Plan — My Style", icon: Brain },
      { key: "team_plans", label: "Team Plans", icon: ListChecks },
      { key: "training_philosophy", label: "Training Philosophy", icon: BookOpen },
    ],
  },
  {
    title: "Results & Analysis",
    items: [
      { key: "erg_scores", label: "Erg Scores", icon: Medal },
      { key: "leaderboard", label: "Team Leaderboard", icon: Trophy },
      { key: "history", label: "Workout History", icon: History },
      { key: "onwater", label: "On-Water Results", icon: Waves },
      { key: "boat_perf", label: "Boat Performance", icon: TrendingUp },
    ],
  },
  {
    title: "AI Tools",
    items: [
      { key: "race_optimizer", label: "AI Lineup Optimizer", icon: Sparkles },
      { key: "coach_ai", label: "Coach AI Assistant", icon: Bot },
      { key: "season_analytics", label: "Analyze Performance", icon: BarChart3 },
      { key: "recruiting", label: "Recruiting Gaps", icon: GraduationCap },
    ],
  },
  {
    title: "Communication",
    items: [
      { key: "messages", label: "Direct Messages", icon: MessageCircle },
      { key: "board", label: "Message Board", icon: MessagesSquare },
      { key: "parent_emails", label: "Parent Emails", icon: Mail },
    ],
  },
  {
    title: "Team Management",
    items: [
      { key: "settings", label: "Team Settings", icon: Settings },
      { key: "coaches", label: "Add Coach", icon: UserPlus },
      { key: "branding", label: "Team Branding", icon: Palette },
      { key: "organization", label: "Athletic Director", icon: Building2 },
    ],
  },
  {
    title: "Program",
    items: [
      { key: "recruiting_portal", label: "Recruiting Hub", icon: Globe },
      { key: "regattas", label: "Regattas", icon: Trophy },
      { key: "depth", label: "Equipment Inventory", icon: Package },
    ],
  },
];

interface Props {
  onNavigate: (section: string) => void;
}

const CoachMoreGrid = ({ onNavigate }: Props) => {
  const { primaryColor } = useTeamBranding();

  return (
    // Scrollable and always rendered — pb-24 keeps the last row clear of the
    // fixed 64px bottom tab bar + iOS safe area.
    <div
      className="space-y-6 overflow-y-auto"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)", WebkitOverflowScrolling: "touch" }}
    >
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
            {section.title}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/60 transition-colors text-left"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${primaryColor}18` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: primaryColor }} />
                  </div>
                  <span className="text-sm font-medium text-foreground leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CoachMoreGrid;
