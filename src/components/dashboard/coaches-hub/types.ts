export interface AthleteProfile {
  user_id: string;
  bio: string | null;
  grad_year: number | null;
  school: string | null;
  club_team: string | null;
  location: string | null;
  personal_statement: string | null;
  avatar_url: string | null;
  is_public: boolean;
  is_recruiting: boolean;
  intended_major: string | null;
  division_interest: string | null;
  gpa: number | null;
  highlight_video_url: string | null;
  coach_view_count: number | null;
  contact_email: string | null;
  profiles: {
    full_name: string | null;
    height: number | null;
    weight: number | null;
    experience_level: string | null;
    username: string | null;
  } | null;
  best_2k?: ErgScore | null;
  combine_score?: number | null;
  relevance_score?: number | null;
  relevance_reasoning?: string | null;
}

export interface ErgScore {
  time_seconds: number;
  watts: number | null;
  watts_per_kg: number | null;
  recorded_at: string;
}

export type BoardStatus = "watching" | "contacted" | "interested" | "offered" | "committed" | "not_a_fit";

export interface BoardEntry {
  id: string;
  coach_id: string;
  athlete_user_id: string;
  status: BoardStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachProfile {
  id: string;
  coach_id: string;
  school_name: string | null;
  division: string | null;
  location: string | null;
  team_type: string | null;
  program_description: string | null;
  target_2k_min_seconds: number | null;
  target_2k_max_seconds: number | null;
  target_height_min_cm: number | null;
  target_height_max_cm: number | null;
  target_weight_min_kg: number | null;
  target_weight_max_kg: number | null;
  port_starboard_preference: string | null;
}

export interface RecruitFilters {
  gradYears: number[];
  divisionInterest: string;
  location: string;
  twoKMin: string;
  twoKMax: string;
  heightMinCm: string;
  heightMaxCm: string;
  weightMinKg: string;
  weightMaxKg: string;
  hasCombineScore: boolean;
  searchQuery: string;
}
