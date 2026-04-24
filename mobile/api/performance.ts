import { supabase } from '../lib/supabase';
import type {
  PersonalRecord,
  PerformanceData,
  PerformanceDataPoint,
  LeaderboardEntry,
  LeaderboardFilters,
  DateRange,
  PRDistance,
  ApiResponse,
} from '../types';

// ─── Personal Records ─────────────────────────────────────────────────────────

export async function getPersonalRecords(
  userId: string
): Promise<ApiResponse<PersonalRecord[]>> {
  const { data, error } = await supabase
    .from('personal_records')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data as unknown as PersonalRecord[]) ?? [], error: null };
}

export async function getPersonalRecord(
  userId: string,
  distance: PRDistance
): Promise<ApiResponse<PersonalRecord>> {
  const { data, error } = await supabase
    .from('personal_records')
    .select('*')
    .eq('user_id', userId)
    .eq('distance', distance)
    .order('split_seconds', { ascending: true })
    .limit(1)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as PersonalRecord, error: null };
}

// ─── Performance Data ─────────────────────────────────────────────────────────

export async function getPerformanceData(
  userId: string,
  dateRange: DateRange,
  metric: string = 'avg_split_seconds'
): Promise<ApiResponse<PerformanceData>> {
  const { data, error } = await supabase
    .from('workouts')
    .select(`date, ${metric}, type, title`)
    .eq('user_id', userId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to)
    .not(metric, 'is', null)
    .order('date', { ascending: true });

  if (error) return { data: null, error: error.message };

  const points: PerformanceDataPoint[] = (data ?? []).map((row: Record<string, unknown>) => ({
    date: row.date as string,
    value: row[metric] as number,
    label: row.title as string | undefined,
  }));

  let trend: PerformanceData['trend'] = 'stable';
  let change_percent: number | null = null;

  if (points.length >= 2) {
    const first = points[0].value;
    const last = points[points.length - 1].value;
    change_percent = ((last - first) / first) * 100;

    // For split times: lower is better, so a decrease is "improving"
    const lowerIsBetter = metric.includes('split') || metric.includes('seconds');
    if (Math.abs(change_percent) < 1) {
      trend = 'stable';
    } else if (lowerIsBetter) {
      trend = change_percent < 0 ? 'improving' : 'declining';
    } else {
      trend = change_percent > 0 ? 'improving' : 'declining';
    }
  }

  const unitMap: Record<string, string> = {
    avg_split_seconds: 'sec/500m',
    avg_watts: 'watts',
    avg_stroke_rate: 'spm',
    total_distance_meters: 'meters',
    total_calories: 'cal',
  };

  return {
    data: {
      metric,
      unit: unitMap[metric] ?? '',
      data: points,
      trend,
      change_percent,
    },
    error: null,
  };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard(
  filters: LeaderboardFilters = {}
): Promise<ApiResponse<LeaderboardEntry[]>> {
  let query = supabase
    .from('personal_records')
    .select(
      `
      id,
      user_id,
      distance,
      split_seconds,
      total_time_seconds,
      date,
      profiles:user_id (
        display_name,
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .order('split_seconds', { ascending: true });

  if (filters.distance) {
    query = query.eq('distance', filters.distance);
  }

  if (filters.period === 'this_month') {
    const start = new Date();
    start.setDate(1);
    query = query.gte('date', start.toISOString().split('T')[0]);
  } else if (filters.period === 'this_year') {
    const start = new Date();
    start.setMonth(0, 1);
    query = query.gte('date', start.toISOString().split('T')[0]);
  }

  const { data, error } = await query.limit(50);

  if (error) return { data: null, error: error.message };

  const entries: LeaderboardEntry[] = (data ?? []).map((row: Record<string, unknown>, index: number) => {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as Record<string, unknown> | null;
    const displayName =
      (profile?.display_name as string) ??
      `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() ??
      'Unknown';

    return {
      rank: index + 1,
      user_id: row.user_id as string,
      display_name: displayName,
      avatar_url: (profile?.avatar_url as string) ?? null,
      value: row.split_seconds as number,
      unit: 'sec/500m',
      date: row.date as string,
    };
  });

  return { data: entries, error: null };
}

// ─── Workout Volume ───────────────────────────────────────────────────────────

export async function getWorkoutVolume(
  userId: string,
  dateRange: DateRange
): Promise<ApiResponse<{ date: string; meters: number; minutes: number }[]>> {
  const { data, error } = await supabase
    .from('workouts')
    .select('date, total_distance_meters, total_duration_seconds')
    .eq('user_id', userId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to)
    .order('date', { ascending: true });

  if (error) return { data: null, error: error.message };

  const volume = (data ?? []).map((row: Record<string, unknown>) => ({
    date: row.date as string,
    meters: (row.total_distance_meters as number) ?? 0,
    minutes: Math.round(((row.total_duration_seconds as number) ?? 0) / 60),
  }));

  return { data: volume, error: null };
}
