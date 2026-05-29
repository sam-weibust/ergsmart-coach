import { useTeamBranding } from "@/context/TeamBrandingContext";
import {
  Ship, Dumbbell, ArrowLeftRight, CalendarDays, Activity, GitCompare,
  Sparkles, Bot, BarChart3, GraduationCap,
  Settings, UserPlus, Mail, Building2,
  Globe, Trophy, Package, Upload, Brain, ClipboardList,
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

const SECTIONS: MoreGridSection[] = [
  {
    title: "Coaching",
    items: [
      { key: "lineups", label: "Lineup Builder", icon: Ship },
      { key: "erg_assignments", label: "Erg Workouts", icon: Dumbbell },
      { key: "seat_racing", label: "Seat Racing", icon: ArrowLeftRight },
      { key: "calendar", label: "Practice Calendar", icon: CalendarDays },
      { key: "load", label: "Load Management", icon: Activity },
      { key: "workout_comparison", label: "Workout Compare", icon: GitCompare },
      { key: "import_team_plan", label: "Import Team Plan", icon: Upload },
      { key: "generate_team_plan_default", label: "Generate Plan — Default", icon: Sparkles },
      { key: "generate_team_plan_custom", label: "Generate Plan — My Style", icon: Brain },
      { key: "team_plans", label: "Team Plans", icon: ClipboardList },
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
    title: "Team Management",
    items: [
      { key: "settings", label: "Team Settings", icon: Settings },
      { key: "coaches", label: "Add Coach", icon: UserPlus },
      { key: "parent_emails", label: "Parent Emails", icon: Mail },
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
    <div className="space-y-6 pb-6">
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
