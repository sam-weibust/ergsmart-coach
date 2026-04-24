/**
 * HealthKit service — iOS native only.
 * Wraps @perfood/capacitor-healthkit and exposes clean async functions.
 * All functions return null silently on web and Android.
 *
 * NOTE FOR DEVELOPER: HealthKit capability must be enabled manually in Xcode.
 * Open ios/App/App.xcworkspace → select the App target → Signing & Capabilities
 * → click "+" → add "HealthKit". Also enable "Background Delivery" checkbox.
 */

import { Capacitor } from "@capacitor/core";

// Lazy-import to avoid crashing on web/Android where the plugin is absent.
let _plugin: any = null;
async function getPlugin() {
  if (_plugin) return _plugin;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return null;
  try {
    const mod = await import("@perfood/capacitor-healthkit");
    _plugin = mod.CapacitorHealthkit;
    return _plugin;
  } catch {
    return null;
  }
}

// ── Sample name constants ────────────────────────────────────────────────────

const S = {
  STEPS:           "stepCount",
  ACTIVE_ENERGY:   "activeEnergyBurned",
  BASAL_ENERGY:    "basalEnergyBurned",
  SLEEP:           "sleepAnalysis",
  WORKOUT:         "workoutType",
  WEIGHT:          "weight",
  HEART_RATE:      "heartRate",
  RESTING_HR:      "restingHeartRate",
} as const;

// ── Read / write permission lists ─────────────────────────────────────────────

const READ_PERMS = [
  S.HEART_RATE, S.RESTING_HR, S.STEPS,
  S.ACTIVE_ENERGY, S.BASAL_ENERGY, S.SLEEP,
  S.WORKOUT, S.WEIGHT,
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function nowISO() {
  return new Date().toISOString();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true only on iOS native with HealthKit available. */
export async function isAvailable(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    await plugin.isAvailable();
    return true;
  } catch {
    return false;
  }
}

/**
 * Requests read permissions for all tracked data types.
 * On iOS the system shows the permission sheet — denials are silent (Apple design).
 */
export async function requestPermissions(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    await plugin.requestAuthorization({
      read: READ_PERMS,
      write: [S.ACTIVE_ENERGY, S.WORKOUT],
      all: [],
    });
    return true;
  } catch {
    return false;
  }
}

export interface HKWorkout {
  type: string;
  activityId: number;
  startDate: string;
  duration: number;         // seconds
  distanceMeters: number;
  calories: number;
  heartRateAvg: number | null;
  heartRateMax: number | null;
}

/** Fetches workouts from HealthKit for the last N days. */
export async function syncWorkouts(days: number): Promise<HKWorkout[]> {
  const plugin = await getPlugin();
  if (!plugin) return [];
  try {
    const res = await plugin.queryHKitSampleType({
      sampleName: S.WORKOUT,
      startDate: daysAgoISO(days),
      endDate: nowISO(),
      limit: 200,
    });
    return (res.resultData ?? []).map((w: any) => ({
      type: w.workoutActivityName ?? "Unknown",
      activityId: w.workoutActivityId ?? 0,
      startDate: w.startDate,
      duration: Math.round(w.duration ?? 0),
      distanceMeters: Math.round((w.totalDistance ?? 0) * 1000), // km → m
      calories: Math.round(w.totalEnergyBurned ?? 0),
      heartRateAvg: null,
      heartRateMax: null,
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

/** Fetches resting heart rate readings for the last N days. */
export async function syncHeartRate(days: number): Promise<HKHeartRate[]> {
  const plugin = await getPlugin();
  if (!plugin) return [];
  try {
    const [rhrRes, hrRes] = await Promise.all([
      plugin.queryHKitSampleType({
        sampleName: S.RESTING_HR,
        startDate: daysAgoISO(days),
        endDate: nowISO(),
        limit: 500,
      }),
      plugin.queryHKitSampleType({
        sampleName: S.HEART_RATE,
        startDate: daysAgoISO(days),
        endDate: nowISO(),
        limit: 1000,
      }),
    ]);

    // Group average HR by date
    const hrByDate: Record<string, number[]> = {};
    for (const h of (hrRes.resultData ?? [])) {
      const d = h.startDate?.split("T")[0];
      if (!d) continue;
      if (!hrByDate[d]) hrByDate[d] = [];
      hrByDate[d].push(h.value ?? 0);
    }

    // Build per-day map from resting HR
    const byDate: Record<string, HKHeartRate> = {};
    for (const r of (rhrRes.resultData ?? [])) {
      const d = r.startDate?.split("T")[0];
      if (!d) continue;
      byDate[d] = {
        date: d,
        restingHeartRate: r.value ?? null,
        heartRateAvg: hrByDate[d]
          ? Math.round(hrByDate[d].reduce((a, b) => a + b, 0) / hrByDate[d].length)
          : null,
      };
    }
    return Object.values(byDate);
  } catch {
    return [];
  }
}

export interface HKHRVEntry {
  date: string;
  hrv_ms: number | null;
}

/**
 * HRV is not exposed in @perfood/capacitor-healthkit v1.
 * Returns empty array — schema is ready for future plugin versions.
 */
export async function syncHRV(_days: number): Promise<HKHRVEntry[]> {
  return [];
}

export interface HKSleepEntry {
  date: string;          // YYYY-MM-DD (night of)
  durationHours: number;
  stages: { state: string; durationMinutes: number }[];
}

/** Fetches sleep analysis for the last N days. */
export async function syncSleep(days: number): Promise<HKSleepEntry[]> {
  const plugin = await getPlugin();
  if (!plugin) return [];
  try {
    const res = await plugin.queryHKitSampleType({
      sampleName: S.SLEEP,
      startDate: daysAgoISO(days),
      endDate: nowISO(),
      limit: 500,
    });

    // Group by night (use startDate's date as the key)
    const byDate: Record<string, { totalMin: number; stages: any[] }> = {};
    for (const s of (res.resultData ?? [])) {
      const d = s.startDate?.split("T")[0];
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { totalMin: 0, stages: [] };
      byDate[d].totalMin += Math.round(s.duration / 60);
      byDate[d].stages.push({ state: s.sleepState ?? "asleep", durationMinutes: Math.round(s.duration / 60) });
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

export interface HKWeightEntry {
  date: string;
  weightKg: number;
}

/** Fetches the most recent weight entry. */
export async function syncWeight(): Promise<HKWeightEntry | null> {
  const plugin = await getPlugin();
  if (!plugin) return null;
  try {
    const res = await plugin.queryHKitSampleType({
      sampleName: S.WEIGHT,
      startDate: daysAgoISO(90),
      endDate: nowISO(),
      limit: 1,
    });
    const latest = res.resultData?.[0];
    if (!latest) return null;
    return {
      date: latest.startDate?.split("T")[0] ?? new Date().toISOString().split("T")[0],
      weightKg: Math.round(latest.value * 10) / 10,
    };
  } catch {
    return null;
  }
}

export interface HKActivityDay {
  date: string;
  activeCalories: number;
  basalCalories: number;
}

/** Fetches daily active and basal calorie data for the last N days. */
export async function syncActivity(days: number): Promise<HKActivityDay[]> {
  const plugin = await getPlugin();
  if (!plugin) return [];
  try {
    const [activeRes, basalRes] = await Promise.all([
      plugin.queryHKitSampleType({
        sampleName: S.ACTIVE_ENERGY,
        startDate: daysAgoISO(days),
        endDate: nowISO(),
        limit: 1000,
      }),
      plugin.queryHKitSampleType({
        sampleName: S.BASAL_ENERGY,
        startDate: daysAgoISO(days),
        endDate: nowISO(),
        limit: 1000,
      }),
    ]);

    const activeByDate: Record<string, number> = {};
    for (const r of (activeRes.resultData ?? [])) {
      const d = r.startDate?.split("T")[0];
      if (d) activeByDate[d] = (activeByDate[d] ?? 0) + (r.value ?? 0);
    }
    const basalByDate: Record<string, number> = {};
    for (const r of (basalRes.resultData ?? [])) {
      const d = r.startDate?.split("T")[0];
      if (d) basalByDate[d] = (basalByDate[d] ?? 0) + (r.value ?? 0);
    }

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

export interface RowingWorkoutToSave {
  startDate: string;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
}

/**
 * Saves a rowing workout to Apple Health.
 * NOTE: @perfood/capacitor-healthkit v1 does not expose a write workout API.
 * This is a no-op stub — upgrade the plugin or add a custom native plugin to enable.
 */
export async function saveWorkoutToHealth(_workout: RowingWorkoutToSave): Promise<boolean> {
  if (!await isAvailable()) return false;
  // Plugin write support requires native implementation.
  // Log for now; implement via custom Capacitor plugin if needed.
  console.log("[HealthKit] saveWorkoutToHealth: write not yet implemented in plugin");
  return false;
}
