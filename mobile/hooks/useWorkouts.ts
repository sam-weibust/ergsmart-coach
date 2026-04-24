import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkoutHistory, logWorkout, getCurrentTrainingPlan } from '../api/workouts';
import { useAuthStore } from '../store/authStore';
import type { LogWorkoutInput } from '../types';

export function useWorkouts() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();

  const workoutsQuery = useQuery({
    queryKey: ['workouts', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await getWorkoutHistory(userId);
      if (error) throw new Error(error);
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const trainingPlanQuery = useQuery({
    queryKey: ['training-plan', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await getCurrentTrainingPlan(userId);
      return data ?? null;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const logWorkoutMutation = useMutation({
    mutationFn: async (input: LogWorkoutInput) => {
      const inputWithUser = { ...input, user_id: userId! };
      const { data, error } = await logWorkout(inputWithUser);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts', userId] });
      queryClient.invalidateQueries({ queryKey: ['personal-records', userId] });
    },
  });

  // Derived data
  const recentWorkouts = workoutsQuery.data?.slice(0, 10) ?? [];
  const lastWorkout = workoutsQuery.data?.[0] ?? null;
  const totalWorkoutsThisWeek = (() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    return workoutsQuery.data?.filter((w) => w.date >= weekAgoStr).length ?? 0;
  })();

  const currentStreak = (() => {
    if (!workoutsQuery.data?.length) return 0;
    let streak = 0;
    const today = new Date();
    const dates = new Set(workoutsQuery.data.map((w) => w.date));

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  })();

  return {
    workouts: workoutsQuery.data ?? [],
    recentWorkouts,
    lastWorkout,
    totalWorkoutsThisWeek,
    currentStreak,
    trainingPlan: trainingPlanQuery.data ?? null,
    isLoading: workoutsQuery.isLoading,
    isError: workoutsQuery.isError,
    error: workoutsQuery.error,
    refetch: workoutsQuery.refetch,
    logWorkout: logWorkoutMutation.mutateAsync,
    isLogging: logWorkoutMutation.isPending,
  };
}
