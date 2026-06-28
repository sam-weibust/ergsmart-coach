export const BOAT_SEAT_COUNTS: Record<string, number> = {
  "8+": 9, // 8 rowers + 1 cox
  "4+": 5, // 4 rowers + 1 cox
  "4-": 4,
  "2x": 2,
  "2-": 3, // 2 rowers + 1 cox
  "1x": 1,
};

export const BOAT_CLASSES = ["8+", "4+", "4-", "2x", "2-", "1x"] as const;
export type BoatClass = typeof BOAT_CLASSES[number];

export const HAS_COX: Record<string, boolean> = {
  "8+": true, "4+": true, "2-": true, "4-": false, "2x": false, "1x": false,
};

// Canonical seat display order: Cox at top, then stroke (8) down to bow (1)
export const SEAT_ORDER = [0, 8, 7, 6, 5, 4, 3, 2, 1];

export function sortSeats<T extends { seat_number: number }>(seats: T[]): T[] {
  const rank = (n: number) => {
    const i = SEAT_ORDER.indexOf(n);
    return i === -1 ? 999 : i;
  };
  return [...seats].sort((a, b) => rank(a.seat_number) - rank(b.seat_number));
}

// Watts formula: watts = 2.80 / (split_seconds / 500)^3
export function splitToWatts(splitSeconds: number): number {
  return 2.80 / Math.pow(splitSeconds / 500, 3);
}

export function timeToSplit(timeSeconds: number, distance: number): number {
  return (timeSeconds / distance) * 500;
}

export function wattsPerKg(watts: number, weightKg: number): number {
  if (!weightKg) return 0;
  return watts / weightKg;
}

export function formatSplit(splitSeconds: number): string {
  if (!splitSeconds) return "--:--";
  const m = Math.floor(splitSeconds / 60);
  const s = (splitSeconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const FATIGUE_COLORS: Record<number, string> = {
  1: "bg-green-500", 2: "bg-green-400", 3: "bg-green-300",
  4: "bg-yellow-300", 5: "bg-yellow-400", 6: "bg-yellow-500",
  7: "bg-orange-400", 8: "bg-red-400", 9: "bg-red-500", 10: "bg-red-600",
};

export function getFatigueColor(score: number | null): string {
  if (!score) return "bg-muted";
  if (score <= 3) return "bg-green-500/70";
  if (score <= 6) return "bg-yellow-400/70";
  return "bg-red-500/70";
}

export function displayName(profile: any): string {
  if (!profile) return "Unknown";
  return profile.full_name || profile.username || profile.email || "Unknown";
}

export interface SidebarItem {
  key: string;
  label: string;
  icon: string;
  coachOnly?: boolean;
  coxVisible?: boolean; // visible to coxswains but not other athletes
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: "today", label: "Today", icon: "Sun" },
  { key: "overview", label: "Overview", icon: "LayoutDashboard" },
  { key: "erg_assignments", label: "Erg Workouts", icon: "Dumbbell" },
  { key: "calendar", label: "Calendar", icon: "CalendarDays" },
  { key: "history", label: "Workout History", icon: "Waves" },
  { key: "onwater", label: "On-Water Results", icon: "Activity" },
  { key: "leaderboard", label: "Leaderboard", icon: "Medal" },
  { key: "board", label: "Message Board", icon: "MessageSquare" },
  { key: "messages", label: "Messages", icon: "MessageCircle" },
  { key: "lineups", label: "Boat Lineups", icon: "Ship", coachOnly: true },
  { key: "lineup_history", label: "Lineup History", icon: "History", coachOnly: true },
  { key: "practice_detail", label: "Practice Detail", icon: "Waves", coachOnly: true },
  { key: "boat_perf", label: "Boat Performance", icon: "TrendingDown", coachOnly: true },
  { key: "erg_scores", label: "Erg Scores", icon: "BarChart3", coachOnly: true },
  { key: "workout_comparison", label: "Workout Compare", icon: "GitCompare", coachOnly: true },
  { key: "seat_racing", label: "Seat Racing", icon: "ArrowLeftRight", coachOnly: true },
  { key: "load", label: "Load Management", icon: "Activity", coachOnly: true },
  { key: "race_optimizer", label: "Race Optimizer", icon: "Trophy", coachOnly: true },
  { key: "recruiting", label: "Recruiting Gaps", icon: "GraduationCap", coachOnly: true },
  { key: "depth", label: "Program Depth", icon: "Users", coachOnly: true },
  { key: "training_plan", label: "Training Plan", icon: "Calendar", coachOnly: true },
  { key: "coaches", label: "Coaching Staff", icon: "Users", coachOnly: true },
  // ── Elite Team features ───────────────────────────────────────────────────
  { key: "coach_ai", label: "Coach AI", icon: "Bot", coachOnly: true },
  { key: "season_analytics", label: "Season Analytics", icon: "TrendingUp", coachOnly: true },
  { key: "recruiting_portal", label: "Recruiting Portal", icon: "Globe", coachOnly: true },
  { key: "parent_emails", label: "Parent Emails", icon: "Mail", coachOnly: true },
  { key: "branding", label: "Team Branding", icon: "Palette", coachOnly: true },
  { key: "training_philosophy", label: "Training Philosophy", icon: "Brain", coachOnly: true },
  { key: "settings", label: "Team Settings", icon: "Settings", coachOnly: true },
];
