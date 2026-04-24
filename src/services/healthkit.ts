/**
 * HealthKit service — iOS native only.
 *
 * No compatible Capacitor 8 HealthKit npm package exists yet.
 * This module uses Capacitor's native bridge to call a custom Swift plugin
 * (HealthKitPlugin) registered in ios/App. On web/Android all calls return
 * null/empty gracefully.
 *
 * NOTE FOR DEVELOPER:
 * 1. Enable HealthKit capability in Xcode:
 *    App target → Signing & Capabilities → "+" → HealthKit → enable Background Delivery
 * 2. The Swift plugin at ios/App/App/HealthKitPlugin.swift must be added to the
 *    Xcode project (it is already on disk — just drag it into the App group).
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

// ── Native plugin interface ───────────────────────────────────────────────────

interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestPermissions(options: { read: string[]; write: string[] }): Promise<{ granted: boolean }>;
  queryWorkouts(options: { startDate: string; endDate: string; limit: number }): Promise<{ workouts: any[] }>;
  queryQuantity(options: { type: string; startDate: string; endDate: string; limit: number }): Promise<{ samples: any[] }>;
  querySleep(options: { startDate: string; endDate: string; limit: number }): Promise<{ samples: any[] }>;
}

// Register only on iOS — resolves to a no-op web implementation everywhere else
const HealthKit = registerPlugin<HealthKitPlugin>("HealthKit", {
  web: () => ({
    isAvailable: async () => ({ available: false }),
    requestPermissions: async () => ({ granted: false }),
    queryWorkouts: async () => ({ workouts: [] }),
    queryQuantity: async () => ({ samples: [] }),
    querySleep: async () => ({ samples: [] }),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const READ_PERMS = [
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierBasalEnergyBurned",
  "HKQuantityTypeIdentifierBodyMass",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKWorkoutTypeIdentifier",
];

// ── Public API ────────────────────────────────────────────────────────────────

export async function isAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return false;
  try {
    const { available } = await HealthKit.isAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function requestPermissions(): Promise<boolean> {
  if (!await isAvailable()) return false;
  try {
    const { granted } = await HealthKit.requestPermissions({
      read: READ_PERMS,
      write: ["HKQuantityTypeIdentifierActiveEnergyBurned", "HKWorkoutTypeIdentifier"],
    });
    return granted;
  } catch {
    return false;
  }
}

export interface HKWorkout {
  type: string;
  activityId: number;
  startDate: string;
  duration: number;
  distanceMeters: number;
  calories: number;
  heartRateAvg: number | null;
  heartRateMax: number | null;
}

export async function syncWorkouts(days: number): Promise<HKWorkout[]> {
  if (!await isAvailable()) return [];
  try {
    const { workouts } = await HealthKit.queryWorkouts({
      startDate: daysAgoISO(days),
      endDate: new Date().toISOString(),
      limit: 200,
    });
    return (workouts ?? []).map((w: any) => ({
      type: w.workoutActivityName ?? "Unknown",
      activityId: w.workoutActivityId ?? 0,
      startDate: w.startDate,
      duration: Math.round(w.duration ?? 0),
      distanceMeters: Math.round((w.totalDistance ?? 0)),
      calories: Math.round(w.totalEnergyBurned ?? 0),
      heartRateAvg: w.heartRateAvg ?? null,
      heartRateMax: w.heartRateMax ?? null,
    }));
  } catch {
    return [];
  }
}

export interface HKHeartRate {
  date: string;
  restingHeartRate: number | null;
  heartRateAvg: number | null;
}

export async function syncHeartRate(days: number): Promise<HKHeartRate[]> {
  if (!await isAvailable()) return [];
  try {
    const [rhrRes, hrRes] = await Promise.all([
      HealthKit.queryQuantity({ type: "HKQuantityTypeIdentifierRestingHeartRate", startDate: daysAgoISO(days), endDate: new Date().toISOString(), limit: 500 }),
      HealthKit.queryQuantity({ type: "HKQuantityTypeIdentifierHeartRate", startDate: daysAgoISO(days), endDate: new Date().toISOString(), limit: 2000 }),
    ]);

    const hrByDate: Record<string, number[]> = {};
    for (const h of (hrRes.samples ?? [])) {
      const d = h.startDate?.split("T")[0];
      if (d) { if (!hrByDate[d]) hrByDate[d] = []; hrByDate[d].push(h.value ?? 0); }
    }

    const byDate: Record<string, HKHeartRate> = {};
    for (const r of (rhrRes.samples ?? [])) {
      const d = r.startDate?.split("T")[0];
      if (!d) continue;
      byDate[d] = {
        date: d,
        restingHeartRate: r.value ?? null,
        heartRateAvg: hrByDate[d] ? Math.round(hrByDate[d].reduce((a, b) => a + b, 0) / hrByDate[d].length) : null,
      };
    }
    return Object.values(byDate);
  } catch {
    return [];
  }
}

export interface HKHRVEntry { date: string; hrv_ms: number | null; }
export async function syncHRV(_days: number): Promise<HKHRVEntry[]> { return []; }

export interface HKSleepEntry {
  date: string;
  durationHours: number;
  stages: { state: string; durationMinutes: number }[];
}

export async function syncSleep(days: number): Promise<HKSleepEntry[]> {
  if (!await isAvailable()) return [];
  try {
    const { samples } = await HealthKit.querySleep({
      startDate: daysAgoISO(days),
      endDate: new Date().toISOString(),
      limit: 500,
    });

    const byDate: Record<string, { totalMin: number; stages: any[] }> = {};
    for (const s of (samples ?? [])) {
      const d = s.startDate?.split("T")[0];
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { totalMin: 0, stages: [] };
      const min = Math.round((s.duration ?? 0) / 60);
      byDate[d].totalMin += min;
      byDate[d].stages.push({ state: s.value ?? "asleep", durationMinutes: min });
    }

    return Object.entries(byDate).map(([date, { totalMin, stages }]) => ({
      date,
      durationHours: Math.round((totalMin / 60) * 10) / 10,
      stages,
    }));
  } catch {
    return [];
  }
}

export interface HKWeightEntry { date: string; weightKg: number; }

export async function syncWeight(): Promise<HKWeightEntry | null> {
  if (!await isAvailable()) return null;
  try {
    const { samples } = await HealthKit.queryQuantity({
      type: "HKQuantityTypeIdentifierBodyMass",
      startDate: daysAgoISO(90),
      endDate: new Date().toISOString(),
      limit: 1,
    });
    const latest = samples?.[0];
    if (!latest) return null;
    return { date: latest.startDate?.split("T")[0] ?? new Date().toISOString().split("T")[0], weightKg: Math.round(latest.value * 10) / 10 };
  } catch {
    return null;
  }
}

export interface HKActivityDay { date: string; activeCalories: number; basalCalories: number; }

export async function syncActivity(days: number): Promise<HKActivityDay[]> {
  if (!await isAvailable()) return [];
  try {
    const [activeRes, basalRes] = await Promise.all([
      HealthKit.queryQuantity({ type: "HKQuantityTypeIdentifierActiveEnergyBurned", startDate: daysAgoISO(days), endDate: new Date().toISOString(), limit: 1000 }),
      HealthKit.queryQuantity({ type: "HKQuantityTypeIdentifierBasalEnergyBurned", startDate: daysAgoISO(days), endDate: new Date().toISOString(), limit: 1000 }),
    ]);

    const activeByDate: Record<string, number> = {};
    for (const r of (activeRes.samples ?? [])) { const d = r.startDate?.split("T")[0]; if (d) activeByDate[d] = (activeByDate[d] ?? 0) + (r.value ?? 0); }
    const basalByDate: Record<string, number> = {};
    for (const r of (basalRes.samples ?? [])) { const d = r.startDate?.split("T")[0]; if (d) basalByDate[d] = (basalByDate[d] ?? 0) + (r.value ?? 0); }

    const dates = new Set([...Object.keys(activeByDate), ...Object.keys(basalByDate)]);
    return Array.from(dates).map(date => ({
      date,
      activeCalories: Math.round(activeByDate[date] ?? 0),
      basalCalories: Math.round(basalByDate[date] ?? 0),
    }));
  } catch {
    return [];
  }
}

export interface RowingWorkoutToSave { startDate: string; durationSeconds: number; distanceMeters: number; calories: number; }

export async function saveWorkoutToHealth(_workout: RowingWorkoutToSave): Promise<boolean> {
  // Write support requires native Swift implementation — stub for now
  if (!await isAvailable()) return false;
  console.log("[HealthKit] saveWorkoutToHealth: write not yet implemented");
  return false;
}
