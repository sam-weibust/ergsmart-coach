// ─── Auth & User ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  avatar_url: string | null;
  team_id: string | null;
  role: 'athlete' | 'coach' | 'admin';
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export type WorkoutType =
  | 'steady_state'
  | 'intervals'
  | 'race_pace'
  | 'power_10'
  | 'technique'
  | 'test'
  | 'strength'
  | 'cross_training';

export interface WorkoutSet {
  id: string;
  workout_id: string;
  set_number: number;
  distance_meters: number | null;
  duration_seconds: number | null;
  avg_split_seconds: number | null;
  avg_stroke_rate: number | null;
  avg_watts: number | null;
  total_calories: number | null;
  rest_seconds: number | null;
}

export interface Workout {
  id: string;
  user_id: string;
  date: string;
  type: WorkoutType;
  title: string;
  description: string | null;
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
  avg_split_seconds: number | null;
  avg_stroke_rate: number | null;
  avg_watts: number | null;
  total_calories: number | null;
  heart_rate_avg: number | null;
  heart_rate_max: number | null;
  rpe: number | null;
  notes: string | null;
  sets: WorkoutSet[];
  created_at: string;
}

export interface LogWorkoutInput {
  user_id: string;
  date: string;
  type: WorkoutType;
  title: string;
  description?: string;
  total_distance_meters?: number;
  total_duration_seconds?: number;
  avg_split_seconds?: number;
  avg_stroke_rate?: number;
  avg_watts?: number;
  total_calories?: number;
  heart_rate_avg?: number;
  heart_rate_max?: number;
  rpe?: number;
  notes?: string;
  sets?: Omit<WorkoutSet, 'id' | 'workout_id'>[];
}

// ─── Training Plans ──────────────────────────────────────────────────────────

export interface Exercise {
  name: string;
  description: string;
  duration_seconds?: number;
  distance_meters?: number;
  sets?: number;
  reps?: number;
  rest_seconds?: number;
  target_split?: string;
  target_rate?: number;
}

export interface DayPlan {
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  date: string;
  workout_type: WorkoutType;
  title: string;
  description: string;
  duration_minutes: number;
  exercises: Exercise[];
  is_rest_day: boolean;
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  week_number: number;
  phase: string;
  days: DayPlan[];
  created_at: string;
}

// ─── Performance ─────────────────────────────────────────────────────────────

export type PRDistance = '500m' | '1000m' | '2000m' | '5000m' | '6000m' | '10000m' | '30min' | '60min';

export interface PersonalRecord {
  id: string;
  user_id: string;
  distance: PRDistance;
  split_seconds: number;
  total_time_seconds: number | null;
  total_meters: number | null;
  date: string;
  workout_id: string | null;
  created_at: string;
}

export interface PerformanceDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface PerformanceData {
  metric: string;
  unit: string;
  data: PerformanceDataPoint[];
  trend: 'improving' | 'declining' | 'stable';
  change_percent: number | null;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  description: string | null;
  coach_id: string;
  avatar_url: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'athlete' | 'coach' | 'assistant_coach';
  joined_at: string;
  profile: Profile;
}

export interface Message {
  id: string;
  team_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile: Pick<Profile, 'first_name' | 'last_name' | 'avatar_url'>;
}

// ─── Live Erg ─────────────────────────────────────────────────────────────────

export interface ErgMetrics {
  split_seconds: number | null;      // seconds per 500m
  stroke_rate: number | null;        // strokes per minute
  distance_meters: number | null;
  calories: number | null;
  elapsed_seconds: number | null;
  watts: number | null;
  heart_rate: number | null;
  pace_category: 'rest' | 'easy' | 'moderate' | 'hard' | 'max' | null;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ─── Date Range ───────────────────────────────────────────────────────────────

export interface DateRange {
  from: string;
  to: string;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  value: number;
  unit: string;
  date: string;
}

export interface LeaderboardFilters {
  team_id?: string;
  distance?: PRDistance;
  period?: 'all_time' | 'this_month' | 'this_year';
}
