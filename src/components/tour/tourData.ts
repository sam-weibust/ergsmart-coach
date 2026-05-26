export type TourRole = "athlete" | "coach" | "coxswain";

export interface TourStep {
  id: string;
  targetId: string; // matches data-tour-id attribute
  title: string;
  description: string;
  navTo?: { section: string; sub?: string }; // navigate to this section to show element
}

export const ATHLETE_TOUR: TourStep[] = [
  {
    id: "dashboard",
    targetId: "tour-nav-dashboard",
    title: "Your Home Base",
    description: "Your dashboard shows your recent workouts, training streak, recovery score, and upcoming schedule. Everything you need at a glance.",
    navTo: { section: "dashboard" },
  },
  {
    id: "training",
    targetId: "tour-nav-training",
    title: "Log Your Workouts",
    description: "Log erg workouts manually or connect your PM5 via Bluetooth for automatic data capture. Your splits, watts, and force curves are saved automatically.",
    navTo: { section: "training" },
  },
  {
    id: "live-erg",
    targetId: "tour-nav-live",
    title: "Real-Time PM5 Tracking",
    description: "Connect to any Concept2 PM5 via Bluetooth. See your split, stroke rate, watts, and force curves in real time. Session saves automatically when you finish.",
    navTo: { section: "live" },
  },
  {
    id: "concept2",
    targetId: "tour-nav-settings",
    title: "Connect Your Logbook",
    description: "Connect your Concept2 account and your entire workout history syncs in 2 minutes. Every split you have ever rowed is right here.",
    navTo: { section: "settings", sub: "connected-apps" },
  },
  {
    id: "training-plan",
    targetId: "tour-nav-training-plan",
    title: "Your AI Training Plan",
    description: "Get a personalized training plan built on real competitive rowing methodology. Plans adapt to your fitness level and goal race date.",
    navTo: { section: "training", sub: "plan" },
  },
  {
    id: "performance",
    targetId: "tour-nav-performance",
    title: "Track Your Progress",
    description: "See your split trend, watts per kilo, training load, and 2K prediction. AI analysis explains what your data means and what to focus on next.",
    navTo: { section: "performance" },
  },
  {
    id: "teams",
    targetId: "tour-nav-teams",
    title: "Join Your Team",
    description: "Join your team with a code from your coach. See your lineup, today's workout, assigned erg workouts, and the team leaderboard.",
    navTo: { section: "teams" },
  },
  {
    id: "leaderboard",
    targetId: "tour-nav-competition",
    title: "Compete Globally",
    description: "See where you rank among rowers worldwide. Only verified scores from Concept2 sync or live PM5 appear — keeping it fair.",
    navTo: { section: "competition", sub: "leaderboard" },
  },
  {
    id: "calculators",
    targetId: "tour-nav-calculators",
    title: "Every Rowing Calculator",
    description: "Split calculator, training zones, 2K predictor, race splits planner, and more. All in one place.",
    navTo: { section: "calculators" },
  },
  {
    id: "favorites",
    targetId: "tour-nav-favorites",
    title: "Customize Your App",
    description: "Star any feature to add it to your Favorites tab for quick access. Set up your app exactly how you want it.",
    navTo: { section: "dashboard" },
  },
];

export const COACH_TOUR: TourStep[] = [
  {
    id: "today",
    targetId: "tour-nav-teams",
    title: "Your Daily Command Center",
    description: "Every morning see your published lineups, attendance responses, today's workout, weather at your lake, and upcoming regattas. All in one screen.",
    navTo: { section: "teams" },
  },
  {
    id: "lineup",
    targetId: "tour-nav-teams",
    title: "Build Lineups in Seconds",
    description: "Drag athletes into seats. Save templates. Use the AI optimizer to get a data-backed recommendation using erg scores, on-water results, and seat race data.",
    navTo: { section: "teams" },
  },
  {
    id: "assignments",
    targetId: "tour-nav-teams",
    title: "Assign Workouts to Your Team",
    description: "Write a workout, assign it to your team or specific athletes, and set personalized target splits relative to each athlete's 2K pace. See results as they come in.",
    navTo: { section: "teams" },
  },
  {
    id: "calendar",
    targetId: "tour-nav-organization",
    title: "Your Program's Full History",
    description: "Every practice stored forever. Lineup, planned workout, logged splits, weather, and attendance — all linked together. Tap any day to see the full picture.",
    navTo: { section: "organization" },
  },
  {
    id: "onwater",
    targetId: "tour-nav-teams",
    title: "Track On-Water Performance",
    description: "Log pieces manually or import NK SpeedCoach CSV files. Splits automatically link to the lineup that rowed them. Split comparison shows green if faster, red if slower.",
    navTo: { section: "teams" },
  },
  {
    id: "seat-racing",
    targetId: "tour-nav-teams",
    title: "Track Every Seat Race",
    description: "Log seat race results and get cumulative rankings automatically. AI detects patterns across all your racing to surface consistent performers.",
    navTo: { section: "teams" },
  },
  {
    id: "load",
    targetId: "tour-nav-teams",
    title: "Know Who Is Fresh",
    description: "Fatigue heatmap shows green, yellow, and red for every athlete. Wellness check-ins from athletes appear on the lineup view before you publish.",
    navTo: { section: "teams" },
  },
  {
    id: "ai-coach",
    targetId: "tour-nav-coaches-hub",
    title: "Ask Anything About Your Team",
    description: "Ask who should be in the top boat, who is improving fastest, who might be overtrained. The AI answers with specific data from your team.",
    navTo: { section: "coaches-hub" },
  },
  {
    id: "recruiting",
    targetId: "tour-nav-coaches-hub",
    title: "Find Your Next Recruit",
    description: "Browse recruitable athletes by 2K time, grad year, and location. AI scoring shows best fits for your program. Kanban board tracks your whole pipeline.",
    navTo: { section: "coaches-hub" },
  },
  {
    id: "branding",
    targetId: "tour-nav-organization",
    title: "Make It Yours",
    description: "Upload your team logo and set your program colors. Branding applies across the entire app for every team member.",
    navTo: { section: "organization" },
  },
];

export const COXSWAIN_TOUR: TourStep[] = [
  {
    id: "attendance",
    targetId: "tour-nav-teams",
    title: "Track Attendance",
    description: "See who's confirmed for today's practice. Respond to lineups and let your coach know you're on the water.",
    navTo: { section: "teams" },
  },
  {
    id: "assignments",
    targetId: "tour-nav-teams",
    title: "Erg Assignments",
    description: "Log your erg results as the cox. Use 'Log for Boat' to record the whole lineup's data at once.",
    navTo: { section: "teams" },
  },
  {
    id: "practice-log",
    targetId: "tour-nav-teams",
    title: "Log Practice Results",
    description: "Record split times and conditions immediately after practice. Your data links directly to the lineup so coaches see everything.",
    navTo: { section: "teams" },
  },
  {
    id: "technique",
    targetId: "tour-nav-performance",
    title: "Cox Technical Ratings",
    description: "Track technical ratings for your calls, steering, and race execution. Use the AI technique analysis on video clips from practice.",
    navTo: { section: "performance", sub: "technique" },
  },
  {
    id: "calculators",
    targetId: "tour-nav-calculators",
    title: "Stroke Watch & Splits",
    description: "Use the Stroke Watch calculator to plan race pacing. Calculate target splits for any distance and race plan.",
    navTo: { section: "calculators" },
  },
  {
    id: "calendar",
    targetId: "tour-nav-teams",
    title: "Team Calendar",
    description: "See upcoming practices, regattas, and team events. Check what's planned before each session.",
    navTo: { section: "teams" },
  },
  {
    id: "community",
    targetId: "tour-nav-community",
    title: "Team Messaging",
    description: "Connect with teammates and coaches. Post in the forum and stay up to date with program announcements.",
    navTo: { section: "community" },
  },
  {
    id: "leaderboard",
    targetId: "tour-nav-competition",
    title: "Team Leaderboard",
    description: "See where your athletes rank against each other and globally. Celebrate improvements with your crew.",
    navTo: { section: "competition", sub: "leaderboard" },
  },
];

export function getTourForRole(role: string | null): { tourId: TourRole; steps: TourStep[] } {
  if (role === "coach") return { tourId: "coach", steps: COACH_TOUR };
  if (role === "coxswain") return { tourId: "coxswain", steps: COXSWAIN_TOUR };
  return { tourId: "athlete", steps: ATHLETE_TOUR };
}
