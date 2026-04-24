import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rowing workout activity IDs from Apple Health
const ROWING_ACTIVITY_IDS = new Set([75, 79]); // HKWorkoutActivityTypeRowing, HKWorkoutActivityTypeRowingMachine

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { user_id, workouts = [], heartRates = [], sleepEntries = [], weightEntry, activityDays = [] } = body;

    if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    let stats = { workouts: 0, sleep: 0, heartRate: 0, weight: 0, crossTraining: 0 };

    // ── Heart rate / HRV ──────────────────────────────────────────────────────
    if (heartRates.length > 0) {
      const rows = heartRates.map((h: any) => ({
        user_id,
        date: h.date,
        resting_heart_rate: h.restingHeartRate ?? null,
        hrv_ms: h.hrv_ms ?? null,
        heart_rate_average: h.heartRateAvg ?? null,
        source: "apple_health",
      }));
      const { error } = await supabase.from("healthkit_heart_rate").upsert(rows, { onConflict: "user_id,date" });
      if (!error) stats.heartRate = rows.length;
      else console.error("heartRate upsert:", error.message);
    }

    // ── Sleep ─────────────────────────────────────────────────────────────────
    if (sleepEntries.length > 0) {
      for (const s of sleepEntries) {
        const { error } = await supabase.from("sleep_entries").upsert({
          user_id,
          date: s.date,
          duration_hours: s.durationHours,
          quality: null,
          notes: "Synced from Apple Health",
        } as any, { onConflict: "user_id,date" });
        if (!error) stats.sleep++;
        else console.error("sleep upsert:", error.message);
      }
    }

    // ── Workouts ──────────────────────────────────────────────────────────────
    for (const w of workouts) {
      const isRowing = ROWING_ACTIVITY_IDS.has(w.activityId) ||
        (w.type ?? "").toLowerCase().includes("row");

      if (isRowing) {
        // Save to erg_workouts
        const durationMin = Math.round(w.duration / 60);
        const avgSplit = w.distanceMeters > 0 && w.duration > 0
          ? formatSplit(Math.round((w.duration / w.distanceMeters) * 500))
          : null;
        const { error } = await supabase.from("erg_workouts").insert({
          user_id,
          workout_type: "steady_state",
          workout_date: w.startDate.split("T")[0],
          distance: w.distanceMeters,
          duration: secondsToInterval(w.duration),
          avg_split: avgSplit,
          calories: w.calories || null,
          avg_heart_rate: w.heartRateAvg || null,
          source: "apple_health",
        } as any);
        if (!error) stats.workouts++;
        else console.error("erg_workout insert:", error.message);
      } else {
        // Save to cross_training
        const { error } = await supabase.from("cross_training").insert({
          user_id,
          date: w.startDate.split("T")[0],
          activity_type: w.type ?? "Unknown",
          duration_minutes: Math.round(w.duration / 60),
          calories: w.calories || null,
          distance_meters: w.distanceMeters || null,
          heart_rate_average: w.heartRateAvg || null,
          heart_rate_max: w.heartRateMax || null,
          source: "apple_health",
        } as any);
        if (!error) stats.crossTraining++;
        else console.error("cross_training insert:", error.message);
      }
    }

    // ── Weight ────────────────────────────────────────────────────────────────
    if (weightEntry) {
      const { error } = await supabase.from("weight_entries").upsert({
        user_id,
        date: weightEntry.date,
        weight_kg: weightEntry.weightKg,
        source: "apple_health",
      } as any, { onConflict: "user_id,date" });
      if (!error) stats.weight = 1;
      else console.error("weight upsert:", error.message);
    }

    // ── Activity ──────────────────────────────────────────────────────────────
    // Store as cross_training "Active Day" entries for calories tracking
    if (activityDays.length > 0) {
      for (const a of activityDays) {
        if (!a.activeCalories && !a.basalCalories) continue;
        await supabase.from("cross_training").upsert({
          user_id,
          date: a.date,
          activity_type: "Daily Activity",
          duration_minutes: null,
          calories: a.activeCalories,
          source: "apple_health_activity",
        } as any, { onConflict: "user_id,date,activity_type" }).catch(() => {});
      }
    }

    // Mark healthkit as connected and update sync time
    await supabase.from("profiles").update({
      healthkit_connected: true,
      healthkit_last_synced: new Date().toISOString(),
    } as any).eq("id", user_id);

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-healthkit]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function secondsToInterval(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSplit(cs: number): string {
  const s = Math.floor(cs / 100);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}
