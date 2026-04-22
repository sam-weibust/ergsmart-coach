import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHOOP_BASE = "https://api.prod.whoop.com/developer";

// Sport IDs that correspond to rowing activities
const ROWING_SPORT_IDS = new Set([16, 44, 45, 63, 127]);

const SPORT_NAMES: Record<number, string> = {
  0: "Running",
  1: "Cycling",
  16: "Rowing",
  44: "Rowing Machine",
  45: "Rowing (Water)",
  63: "Ergometer",
  127: "Rowing (General)",
};

async function refreshToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshTok: string
): Promise<string | null> {
  const CLIENT_ID = Deno.env.get("WHOOP_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("WHOOP_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) return null;

  const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTok,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    console.error("[sync-whoop] token refresh failed:", await res.text());
    return null;
  }

  const tokens = await res.json();
  const expires_at = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  await supabase.from("whoop_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? refreshTok,
    expires_at,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return tokens.access_token;
}

async function whoopGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${WHOOP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Whoop API ${path} failed: ${res.status}`);
  return res.json();
}

function toDate(isoStr: string): string {
  return isoStr.substring(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn } = await supabase
      .from("whoop_connections")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!conn) {
      return new Response(JSON.stringify({ error: "No Whoop connection found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token = conn.access_token;

    // Refresh token if expired or close to expiry (within 5 min)
    if (conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
      if (conn.refresh_token) {
        const newToken = await refreshToken(supabase, user_id, conn.refresh_token);
        if (newToken) token = newToken;
        else {
          return new Response(JSON.stringify({ error: "Token refresh failed, please reconnect Whoop" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Fetch last 14 days
    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    const [recoveryData, sleepData, cycleData, workoutData] = await Promise.allSettled([
      whoopGet(`/v1/recovery?start=${startStr}&end=${endStr}&limit=25`, token),
      whoopGet(`/v1/activity/sleep?start=${startStr}&end=${endStr}&limit=25`, token),
      whoopGet(`/v1/cycle?start=${startStr}&end=${endStr}&limit=25`, token),
      whoopGet(`/v1/activity/workout?start=${startStr}&end=${endStr}&limit=25`, token),
    ]);

    let synced = 0;

    // Store recovery data
    if (recoveryData.status === "fulfilled" && recoveryData.value?.records) {
      for (const rec of recoveryData.value.records) {
        if (rec.score_state !== "SCORED" || !rec.score) continue;
        const date = toDate(rec.created_at);
        await supabase.from("whoop_recovery").upsert({
          user_id,
          whoop_cycle_id: rec.cycle_id,
          date,
          recovery_score: rec.score.recovery_score ?? null,
          hrv_rmssd: rec.score.hrv_rmssd_milli ?? null,
          resting_heart_rate: rec.score.resting_heart_rate ?? null,
          sleep_performance_percentage: rec.score.sleep_performance_percentage ?? null,
          skin_temp_celsius: rec.score.skin_temp_celsius ?? null,
          blood_oxygen_percentage: rec.score.spo2_percentage ?? null,
        }, { onConflict: "user_id,date" });
        synced++;
      }
    }

    // Store sleep data + feed into sleep_entries
    if (sleepData.status === "fulfilled" && sleepData.value?.records) {
      for (const rec of sleepData.value.records) {
        if (rec.nap || rec.score_state !== "SCORED" || !rec.score) continue;
        const date = toDate(rec.end ?? rec.start);
        const stages = rec.score.stage_summary || {};
        const totalSleepMs = (stages.total_light_sleep_time_milli ?? 0) +
          (stages.total_slow_wave_sleep_time_milli ?? 0) +
          (stages.total_rem_sleep_time_milli ?? 0);
        const durationHours = totalSleepMs > 0 ? parseFloat((totalSleepMs / 3600000).toFixed(2)) : null;

        await supabase.from("whoop_sleep").upsert({
          user_id,
          whoop_sleep_id: rec.id,
          date,
          start_time: rec.start ?? null,
          end_time: rec.end ?? null,
          duration_hours: durationHours,
          sleep_efficiency_percentage: rec.score.sleep_efficiency_percentage ?? null,
          sleep_performance_percentage: rec.score.sleep_performance_percentage ?? null,
          disturbance_count: stages.disturbance_count ?? null,
          light_sleep_ms: stages.total_light_sleep_time_milli ?? null,
          slow_wave_sleep_ms: stages.total_slow_wave_sleep_time_milli ?? null,
          rem_sleep_ms: stages.total_rem_sleep_time_milli ?? null,
          awake_ms: stages.total_awake_time_milli ?? null,
          sleep_need_ms: rec.score.sleep_needed?.baseline_milli ?? null,
          sleep_debt_ms: null,
          respiratory_rate: rec.score.respiratory_rate ?? null,
        }, { onConflict: "user_id,date" });

        // Feed into sleep_entries for recovery score calculation
        if (durationHours) {
          const perfScore = rec.score.sleep_performance_percentage;
          // Map 0-100 performance to 1-10 quality scale
          const qualityScore = perfScore ? Math.round((perfScore / 100) * 9) + 1 : null;
          const bedtime = rec.start ? new Date(rec.start).toTimeString().substring(0, 5) : null;
          const wakeTime = rec.end ? new Date(rec.end).toTimeString().substring(0, 5) : null;

          await supabase.from("sleep_entries").upsert({
            user_id,
            date,
            duration_hours: durationHours,
            quality_score: qualityScore,
            bedtime,
            wake_time: wakeTime,
          }, { onConflict: "user_id,date" });
        }
        synced++;
      }
    }

    // Store cycle/strain data
    if (cycleData.status === "fulfilled" && cycleData.value?.records) {
      for (const rec of cycleData.value.records) {
        if (rec.score_state !== "SCORED" || !rec.score) continue;
        const date = toDate(rec.start);
        await supabase.from("whoop_strain").upsert({
          user_id,
          whoop_cycle_id: rec.id,
          date,
          strain: rec.score.strain ?? null,
          kilojoule: rec.score.kilojoule ?? null,
          average_heart_rate: rec.score.average_heart_rate ?? null,
          max_heart_rate: rec.score.max_heart_rate ?? null,
        }, { onConflict: "user_id,date" });
        synced++;
      }
    }

    // Store workout data + map rowing to erg_workouts
    if (workoutData.status === "fulfilled" && workoutData.value?.records) {
      for (const rec of workoutData.value.records) {
        if (rec.score_state !== "SCORED" || !rec.score) continue;
        const sportId = rec.sport_id ?? -1;
        const sportName = SPORT_NAMES[sportId] ?? `Sport ${sportId}`;
        const zones = rec.score.zone_duration ?? {};

        await supabase.from("whoop_workouts").upsert({
          user_id,
          whoop_workout_id: rec.id,
          start_time: rec.start,
          end_time: rec.end ?? null,
          sport_id: sportId,
          sport_name: sportName,
          strain: rec.score.strain ?? null,
          kilojoule: rec.score.kilojoule ?? null,
          average_heart_rate: rec.score.average_heart_rate ?? null,
          max_heart_rate: rec.score.max_heart_rate ?? null,
          zone_1_ms: zones.zone_one_milli ?? null,
          zone_2_ms: zones.zone_two_milli ?? null,
          zone_3_ms: zones.zone_three_milli ?? null,
          zone_4_ms: zones.zone_four_milli ?? null,
          zone_5_ms: zones.zone_five_milli ?? null,
        }, { onConflict: "whoop_workout_id" });

        // Map rowing workouts to erg_workouts if not already imported
        if (ROWING_SPORT_IDS.has(sportId) && rec.start && rec.end) {
          const durationMs = new Date(rec.end).getTime() - new Date(rec.start).getTime();
          const durationMin = Math.round(durationMs / 60000);
          const workoutDate = toDate(rec.start);
          const calories = rec.score.kilojoule ? Math.round(rec.score.kilojoule / 4.184) : null;

          // Only insert if no existing erg workout for this date from Whoop
          const { data: existing } = await supabase
            .from("erg_workouts")
            .select("id")
            .eq("user_id", user_id)
            .eq("workout_date", workoutDate)
            .eq("notes", `Whoop: ${sportName}`)
            .maybeSingle();

          if (!existing) {
            await supabase.from("erg_workouts").insert({
              user_id,
              workout_date: workoutDate,
              duration: `${Math.floor(durationMin / 60)}:${String(durationMin % 60).padStart(2, "0")}:00`,
              avg_heart_rate: rec.score.average_heart_rate ?? null,
              calories,
              notes: `Whoop: ${sportName}`,
            });
          }
        }
        synced++;
      }
    }

    // Update last sync time
    await supabase.from("whoop_connections").update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user_id);

    return new Response(JSON.stringify({ success: true, synced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-whoop] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
