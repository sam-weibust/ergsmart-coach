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

export const SIDEBAR_ITEMS = [
  { key: "overview", label: "Overview", icon: "LayoutDashboard" },
  { key: "calendar", label: "Calendar", icon: "CalendarDays" },
  { key: "lineups", label: "Boat Lineups", icon: "Ship" },
  { key: "lineup_history", label: "Lineup History", icon: "History" },
  { key: "practice_detail", label: "Practice Detail", icon: "Waves" },
  { key: "boat_perf", label: "Boat Performance", icon: "TrendingDown" },
  { key: "history", label: "Workout History", icon: "Waves" },
  { key: "erg_scores", label: "Erg Scores", icon: "BarChart3" },
  { key: "onwater", label: "On-Water Results", icon: "Activity" },
  { key: "seat_racing", label: "Seat Racing", icon: "ArrowLeftRight" },
  { key: "load", label: "Load Management", icon: "Activity" },
  { key: "race_optimizer", label: "Race Optimizer", icon: "Trophy" },
  { key: "recruiting", label: "Recruiting Gaps", icon: "GraduationCap" },
  { key: "depth", label: "Program Depth", icon: "Users" },
  { key: "training_plan", label: "Training Plan", icon: "Calendar" },
  { key: "leaderboard", label: "Leaderboard", icon: "Medal" },
  { key: "board", label: "Message Board", icon: "MessageSquare" },
  { key: "coaches", label: "Coaching Staff", icon: "Users" },
  { key: "settings", label: "Team Settings", icon: "Settings" },
] as const;
