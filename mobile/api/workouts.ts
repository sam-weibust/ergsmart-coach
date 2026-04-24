import { supabase } from '../lib/supabase';
import type { Workout, LogWorkoutInput, TrainingPlan, ApiResponse } from '../types';

const FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1';

async function callEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { data: null, error: text || `Request failed (${res.status})` };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ─── Generate Workout Plan ────────────────────────────────────────────────────

export async function generateWorkout(
  userId: string,
  profileData: Record<string, unknown>
): Promise<ApiResponse<TrainingPlan>> {
  return callEdgeFunction<TrainingPlan>('generate-workout', {
    user_id: userId,
    profile: profileData,
  });
}

// ─── Get Workout History ──────────────────────────────────────────────────────

export async function getWorkoutHistory(
  userId: string,
  limit = 50
): Promise<ApiResponse<Workout[]>> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      `
      *,
      sets:workout_sets(*)
    `
    )
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message };
  return { data: (data as unknown as Workout[]) ?? [], error: null };
}

// ─── Log Workout ──────────────────────────────────────────────────────────────

export async function logWorkout(
  input: LogWorkoutInput
): Promise<ApiResponse<Workout>> {
  const { sets, ...workoutData } = input;

  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert(workoutData)
    .select()
    .single();

  if (workoutError) return { data: null, error: workoutError.message };

  if (sets && sets.length > 0) {
    const setsWithWorkoutId = sets.map((s, i) => ({
      ...s,
      workout_id: workout.id,
      set_number: i + 1,
    }));

    const { error: setsError } = await supabase
      .from('workout_sets')
      .insert(setsWithWorkoutId);

    if (setsError) return { data: null, error: setsError.message };
  }

  return { data: workout as unknown as Workout, error: null };
}

// ─── Get Single Workout ───────────────────────────────────────────────────────

export async function getWorkout(workoutId: string): Promise<ApiResponse<Workout>> {
  const { data, error } = await supabase
    .from('workouts')
    .select(`*, sets:workout_sets(*)`)
    .eq('id', workoutId)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as Workout, error: null };
}

// ─── Delete Workout ───────────────────────────────────────────────────────────

export async function deleteWorkout(workoutId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ─── Analyze Workout ──────────────────────────────────────────────────────────

export async function analyzeWorkout(
  videoUri: string
): Promise<ApiResponse<{ feedback: string; score: number; tips: string[] }>> {
  return callEdgeFunction('analyze-workout', { video_uri: videoUri });
}

// ─── Get Current Training Plan ────────────────────────────────────────────────

export async function getCurrentTrainingPlan(
  userId: string
): Promise<ApiResponse<TrainingPlan>> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .lte('week_start_date', today)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as TrainingPlan, error: null };
}
