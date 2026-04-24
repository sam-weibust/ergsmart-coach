import { create } from 'zustand';
import type { Workout, WorkoutSet, DayPlan, LogWorkoutInput, WorkoutType } from '../types';

interface ActiveWorkout {
  type: WorkoutType;
  title: string;
  startedAt: Date;
  sets: Partial<WorkoutSet>[];
  notes: string;
}

interface WorkoutState {
  currentWorkout: ActiveWorkout | null;
  isLogging: boolean;
  todaysPlan: DayPlan | null;
  recentWorkouts: Workout[];
  workoutDraft: Partial<LogWorkoutInput>;

  // Actions
  startWorkout: (type: WorkoutType, title: string) => void;
  logSet: (set: Partial<WorkoutSet>) => void;
  updateSetAt: (index: number, set: Partial<WorkoutSet>) => void;
  removeSetAt: (index: number) => void;
  updateNotes: (notes: string) => void;
  completeWorkout: () => LogWorkoutInput | null;
  clearWorkout: () => void;
  setTodaysPlan: (plan: DayPlan | null) => void;
  setRecentWorkouts: (workouts: Workout[]) => void;
  updateWorkoutDraft: (draft: Partial<LogWorkoutInput>) => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  currentWorkout: null,
  isLogging: false,
  todaysPlan: null,
  recentWorkouts: [],
  workoutDraft: {},

  startWorkout: (type, title) =>
    set({
      currentWorkout: {
        type,
        title,
        startedAt: new Date(),
        sets: [],
        notes: '',
      },
      isLogging: true,
    }),

  logSet: (newSet) =>
    set((state) => {
      if (!state.currentWorkout) return state;
      return {
        currentWorkout: {
          ...state.currentWorkout,
          sets: [...state.currentWorkout.sets, newSet],
        },
      };
    }),

  updateSetAt: (index, updatedSet) =>
    set((state) => {
      if (!state.currentWorkout) return state;
      const sets = [...state.currentWorkout.sets];
      sets[index] = { ...sets[index], ...updatedSet };
      return { currentWorkout: { ...state.currentWorkout, sets } };
    }),

  removeSetAt: (index) =>
    set((state) => {
      if (!state.currentWorkout) return state;
      const sets = state.currentWorkout.sets.filter((_, i) => i !== index);
      return { currentWorkout: { ...state.currentWorkout, sets } };
    }),

  updateNotes: (notes) =>
    set((state) => {
      if (!state.currentWorkout) return state;
      return { currentWorkout: { ...state.currentWorkout, notes } };
    }),

  completeWorkout: () => {
    const { currentWorkout } = get();
    if (!currentWorkout) return null;

    const durationSeconds = Math.round(
      (Date.now() - currentWorkout.startedAt.getTime()) / 1000
    );

    const sets = currentWorkout.sets as Omit<WorkoutSet, 'id' | 'workout_id'>[];
    const totalDistance = sets.reduce(
      (sum, s) => sum + (s.distance_meters ?? 0),
      0
    );
    const avgSplit =
      sets.length > 0
        ? sets.reduce((sum, s) => sum + (s.avg_split_seconds ?? 0), 0) / sets.length
        : undefined;

    const result: LogWorkoutInput = {
      user_id: '',
      date: new Date().toISOString().split('T')[0],
      type: currentWorkout.type,
      title: currentWorkout.title,
      notes: currentWorkout.notes || undefined,
      total_duration_seconds: durationSeconds,
      total_distance_meters: totalDistance > 0 ? totalDistance : undefined,
      avg_split_seconds: avgSplit,
      sets: sets.length > 0 ? sets : undefined,
    };

    return result;
  },

  clearWorkout: () =>
    set({
      currentWorkout: null,
      isLogging: false,
      workoutDraft: {},
    }),

  setTodaysPlan: (plan) => set({ todaysPlan: plan }),

  setRecentWorkouts: (workouts) => set({ recentWorkouts: workouts }),

  updateWorkoutDraft: (draft) =>
    set((state) => ({ workoutDraft: { ...state.workoutDraft, ...draft } })),
}));
