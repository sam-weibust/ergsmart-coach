import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WHOOP_BASE = "https://api.prod.whoop.com/developer";

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
  console.log("[sync-whoop] refreshToken: CLIENT_ID present=", !!CLIENT_ID, "CLIENT_SECRET present=", !!CLIENT_SECRET);
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

  console.log("[sync-whoop] token refresh HTTP status:", res.status);
  if (!res.ok) {
    const errText = await res.text();
    console.error("[sync-whoop] token refresh failed:", errText);
    return null;
  }

  const tokens = await res.json();
  const expires_at = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  console.log("[sync-whoop] token refreshed, new expires_at:", expires_at);

  const { error: updateErr } = await supabase.from("whoop_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? refreshTok,
    expires_at,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (updateErr) console.error("[sync-whoop] failed to save refreshed token:", updateErr.message);

  return tokens.access_token;
}

async function whoopGet(path: string, token: string): Promise<any> {
  const url = `${WHOOP_BASE}${path}`;
  console.log("[sync-whoop] whoopGet:", url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  console.log("[sync-whoop] whoopGet status:", res.status, "for", path);
  if (!res.ok) {
    const body = await res.text();
    console.error("[sync-whoop] whoopGet error body:", body);
    throw new Error(`Whoop API ${path} failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  console.log("[sync-whoop] whoopGet records count:", json?.records?.length ?? "no records field", "for", path);
  return json;
}

function toDate(isoStr: string): string {
  return isoStr.substring(0, 10);
}

serve(async (req) => {
  console.log("sync-whoop received request", req.method, new Date().toISOString());
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  console.log("[sync-whoop] SUPABASE_URL present=", !!SUPABASE_URL, "SERVICE_ROLE_KEY present=", !!SERVICE_ROLE_KEY);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[sync-whoop] failed to parse request body:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = body;
    console.log("[sync-whoop] user_id:", user_id);
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[sync-whoop] fetching whoop_connections for user_id:", user_id);
    const { data: conn, error: connErr } = await supabase
      .from("whoop_connections")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (connErr) console.error("[sync-whoop] whoop_connections query error:", connErr.message);
    console.log("[sync-whoop] connection found:", !!conn, "expires_at:", conn?.expires_at ?? "n/a", "has_access_token:", !!conn?.access_token, "has_refresh_token:", !!conn?.refresh_token);

    if (!conn) {
      return new Response(JSON.stringify({ error: "No Whoop connection found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token = conn.access_token;

    if (conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
      console.log("[sync-whoop] token expired or expiring soon, refreshing...");
      if (conn.refresh_token) {
        const newToken = await refreshToken(supabase, user_id, conn.refresh_token);
        if (newToken) {
          token = newToken;
          console.log("[sync-whoop] token refreshed successfully");
        } else {
          console.error("[sync-whoop] token refresh returned null");
          return new Response(JSON.stringify({ error: "Token refresh failed, please reconnect Whoop" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.error("[sync-whoop] token expired and no refresh_token available");
        return new Response(JSON.stringify({ error: "Token expired and no refresh token available" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.log("[sync-whoop] token is valid, using existing access token");
    }

    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    console.log("[sync-whoop] fetching data for range:", startStr, "to", endStr);

    console.log("[sync-whoop] calling Whoop API endpoints in parallel...");
    const [recoveryData, sleepData, cycleData, workoutData] = await Promise.allSettled([
      whoopGet(`/v1/recovery?start=${startStr}&end=${endStr}&limit=25`, token),
      whoopGet(`/v1/activity/sleep?start=${startStr}&end=${endStr}&limit=25`, token),
      whoopGet(`/v1/cycle?start=${startStr}&end=${endStr}&limit=25`, token),
      whoopGet(`/v1/activity/workout?start=${startStr}&end=${endStr}&limit=25`, token),
    ]);

    console.log("[sync-whoop] recovery:", recoveryData.status, recoveryData.status === "rejected" ? recoveryData.reason : `${recoveryData.value?.records?.length ?? 0} records`);
    console.log("[sync-whoop] sleep:", sleepData.status, sleepData.status === "rejected" ? sleepData.reason : `${sleepData.value?.records?.length ?? 0} records`);
    console.log("[sync-whoop] cycles:", cycleData.status, cycleData.status === "rejected" ? cycleData.reason : `${cycleData.value?.records?.length ?? 0} records`);
    console.log("[sync-whoop] workouts:", workoutData.status, workoutData.status === "rejected" ? workoutData.reason : `${workoutData.value?.records?.length ?? 0} records`);

    let synced = 0;

    // Store recovery data
    if (recoveryData.status === "fulfilled" && recoveryData.value?.records) {
      const records = recoveryData.value.records;
      console.log("[sync-whoop] processing", records.length, "recovery records");
      for (const rec of records) {
        if (rec.score_state === "UNSCORABLE") {
          console.log("[sync-whoop] skipping UNSCORABLE recovery record cycle_id:", rec.cycle_id);
          continue;
        }
        const date = toDate(rec.created_at);
        console.log("[sync-whoop] upserting whoop_recovery for date:", date, "cycle_id:", rec.cycle_id, "score:", rec.score?.recovery_score);
        const { error: recErr } = await supabase.from("whoop_recovery").upsert({
          user_id,
          whoop_cycle_id: rec.cycle_id,
          date,
          recovery_score: rec.score?.recovery_score ?? null,
          hrv_rmssd: rec.score?.hrv_rmssd_milli ?? null,
          resting_heart_rate: rec.score?.resting_heart_rate ?? null,
          sleep_performance_percentage: rec.score?.sleep_performance_percentage ?? null,
          skin_temp_celsius: rec.score?.skin_temp_celsius ?? null,
          blood_oxygen_percentage: rec.score?.spo2_percentage ?? null,
        }, { onConflict: "user_id,date" });
        if (recErr) console.error("[sync-whoop] whoop_recovery upsert error:", recErr.message, "code:", recErr.code);
        else { console.log("[sync-whoop] whoop_recovery upsert OK for date:", date); synced++; }
      }
    } else if (recoveryData.status === "rejected") {
      console.error("[sync-whoop] recovery fetch failed:", recoveryData.reason);
    } else {
      console.log("[sync-whoop] recovery: no records field in response, value keys:", Object.keys(recoveryData.value ?? {}));
    }

    // Store sleep data + feed into sleep_entries
    if (sleepData.status === "fulfilled" && sleepData.value?.records) {
      const records = sleepData.value.records;
      console.log("[sync-whoop] processing", records.length, "sleep records");
      for (const rec of records) {
        if (rec.nap) { console.log("[sync-whoop] skipping nap sleep_id:", rec.id); continue; }
        if (rec.score_state === "UNSCORABLE") { console.log("[sync-whoop] skipping UNSCORABLE sleep_id:", rec.id); continue; }
        const date = toDate(rec.end ?? rec.start);
        const stages = rec.score?.stage_summary || {};
        const totalSleepMs = (stages.total_light_sleep_time_milli ?? 0) +
          (stages.total_slow_wave_sleep_time_milli ?? 0) +
          (stages.total_rem_sleep_time_milli ?? 0);
        const durationHours = totalSleepMs > 0 ? parseFloat((totalSleepMs / 3600000).toFixed(2)) : null;
        console.log("[sync-whoop] upserting whoop_sleep for date:", date, "sleep_id:", rec.id, "duration_hours:", durationHours);

        const { error: sleepErr } = await supabase.from("whoop_sleep").upsert({
          user_id,
          whoop_sleep_id: rec.id,
          date,
          start_time: rec.start ?? null,
          end_time: rec.end ?? null,
          duration_hours: durationHours,
          sleep_efficiency_percentage: rec.score?.sleep_efficiency_percentage ?? null,
          sleep_performance_percentage: rec.score?.sleep_performance_percentage ?? null,
          disturbance_count: stages.disturbance_count ?? null,
          light_sleep_ms: stages.total_light_sleep_time_milli ?? null,
          slow_wave_sleep_ms: stages.total_slow_wave_sleep_time_milli ?? null,
          rem_sleep_ms: stages.total_rem_sleep_time_milli ?? null,
          awake_ms: stages.total_awake_time_milli ?? null,
          sleep_need_ms: rec.score?.sleep_needed?.baseline_milli ?? null,
          sleep_debt_ms: null,
          respiratory_rate: rec.score?.respiratory_rate ?? null,
        }, { onConflict: "user_id,date" });
        if (sleepErr) console.error("[sync-whoop] whoop_sleep upsert error:", sleepErr.message, "code:", sleepErr.code);
        else console.log("[sync-whoop] whoop_sleep upsert OK for date:", date);

        if (durationHours) {
          const perfScore = rec.score?.sleep_performance_percentage;
          const qualityScore = perfScore ? Math.round((perfScore / 100) * 9) + 1 : null;
          const bedtime = rec.start ? new Date(rec.start).toTimeString().substring(0, 5) : null;
          const wakeTime = rec.end ? new Date(rec.end).toTimeString().substring(0, 5) : null;
          console.log("[sync-whoop] upserting sleep_entries for date:", date, "quality:", qualityScore);
          const { error: seErr } = await supabase.from("sleep_entries").upsert({
            user_id,
            date,
            duration_hours: durationHours,
            quality_score: qualityScore,
            bedtime,
            wake_time: wakeTime,
          }, { onConflict: "user_id,date" });
          if (seErr) console.error("[sync-whoop] sleep_entries upsert error:", seErr.message, "code:", seErr.code);
          else console.log("[sync-whoop] sleep_entries upsert OK for date:", date);
        }
        synced++;
      }
    } else if (sleepData.status === "rejected") {
      console.error("[sync-whoop] sleep fetch failed:", sleepData.reason);
    } else {
      console.log("[sync-whoop] sleep: no records field, value keys:", Object.keys(sleepData.value ?? {}));
    }

    // Store cycle/strain data
    if (cycleData.status === "fulfilled" && cycleData.value?.records) {
      const records = cycleData.value.records;
      console.log("[sync-whoop] processing", records.length, "cycle records");
      for (const rec of records) {
        if (rec.score_state === "UNSCORABLE") { console.log("[sync-whoop] skipping UNSCORABLE cycle_id:", rec.id); continue; }
        const date = toDate(rec.start);
        console.log("[sync-whoop] upserting whoop_strain for date:", date, "cycle_id:", rec.id, "strain:", rec.score?.strain);
        const { error: strainErr } = await supabase.from("whoop_strain").upsert({
          user_id,
          whoop_cycle_id: rec.id,
          date,
          strain: rec.score?.strain ?? null,
          kilojoule: rec.score?.kilojoule ?? null,
          average_heart_rate: rec.score?.average_heart_rate ?? null,
          max_heart_rate: rec.score?.max_heart_rate ?? null,
        }, { onConflict: "user_id,date" });
        if (strainErr) console.error("[sync-whoop] whoop_strain upsert error:", strainErr.message, "code:", strainErr.code);
        else { console.log("[sync-whoop] whoop_strain upsert OK for date:", date); synced++; }
      }
    } else if (cycleData.status === "rejected") {
      console.error("[sync-whoop] cycle fetch failed:", cycleData.reason);
    } else {
      console.log("[sync-whoop] cycles: no records field, value keys:", Object.keys(cycleData.value ?? {}));
    }

    // Store workout data + map rowing to erg_workouts
    if (workoutData.status === "fulfilled" && workoutData.value?.records) {
      const records = workoutData.value.records;
      console.log("[sync-whoop] processing", records.length, "workout records");
      for (const rec of records) {
        if (rec.score_state === "UNSCORABLE") { console.log("[sync-whoop] skipping UNSCORABLE workout_id:", rec.id); continue; }
        const sportId = rec.sport_id ?? -1;
        const sportName = SPORT_NAMES[sportId] ?? `Sport ${sportId}`;
        const zones = rec.score?.zone_duration ?? {};
        console.log("[sync-whoop] upserting whoop_workouts workout_id:", rec.id, "sport:", sportName, "strain:", rec.score?.strain);

        const { error: wkErr } = await supabase.from("whoop_workouts").upsert({
          user_id,
          whoop_workout_id: rec.id,
          start_time: rec.start,
          end_time: rec.end ?? null,
          sport_id: sportId,
          sport_name: sportName,
          strain: rec.score?.strain ?? null,
          kilojoule: rec.score?.kilojoule ?? null,
          average_heart_rate: rec.score?.average_heart_rate ?? null,
          max_heart_rate: rec.score?.max_heart_rate ?? null,
          zone_1_ms: zones.zone_one_milli ?? null,
          zone_2_ms: zones.zone_two_milli ?? null,
          zone_3_ms: zones.zone_three_milli ?? null,
          zone_4_ms: zones.zone_four_milli ?? null,
          zone_5_ms: zones.zone_five_milli ?? null,
        }, { onConflict: "whoop_workout_id" });
        if (wkErr) console.error("[sync-whoop] whoop_workouts upsert error:", wkErr.message, "code:", wkErr.code);
        else console.log("[sync-whoop] whoop_workouts upsert OK workout_id:", rec.id);

        if (ROWING_SPORT_IDS.has(sportId) && rec.start && rec.end) {
          const durationMs = new Date(rec.end).getTime() - new Date(rec.start).getTime();
          const durationMin = Math.round(durationMs / 60000);
          const workoutDate = toDate(rec.start);
          const calories = rec.score?.kilojoule ? Math.round(rec.score.kilojoule / 4.184) : null;
          console.log("[sync-whoop] rowing workout detected, checking for existing erg_workout on date:", workoutDate);

          const { data: existing, error: existErr } = await supabase
            .from("erg_workouts")
            .select("id")
            .eq("user_id", user_id)
            .eq("workout_date", workoutDate)
            .eq("notes", `Whoop: ${sportName}`)
            .maybeSingle();
          if (existErr) console.error("[sync-whoop] erg_workouts lookup error:", existErr.message);

          if (!existing) {
            console.log("[sync-whoop] inserting erg_workout for rowing on date:", workoutDate);
            const { error: ergErr } = await supabase.from("erg_workouts").insert({
              user_id,
              workout_date: workoutDate,
              duration: `${Math.floor(durationMin / 60)}:${String(durationMin % 60).padStart(2, "0")}:00`,
              avg_heart_rate: rec.score?.average_heart_rate ?? null,
              calories,
              notes: `Whoop: ${sportName}`,
            });
            if (ergErr) console.error("[sync-whoop] erg_workouts insert error:", ergErr.message, "code:", ergErr.code);
            else console.log("[sync-whoop] erg_workouts insert OK for date:", workoutDate);
          } else {
            console.log("[sync-whoop] erg_workout already exists for date:", workoutDate, "id:", existing.id);
          }
        }
        synced++;
      }
    } else if (workoutData.status === "rejected") {
      console.error("[sync-whoop] workout fetch failed:", workoutData.reason);
    } else {
      console.log("[sync-whoop] workouts: no records field, value keys:", Object.keys(workoutData.value ?? {}));
    }

    console.log("[sync-whoop] updating last_sync_at for user_id:", user_id, "total synced:", synced);
    const { error: syncTimeErr } = await supabase.from("whoop_connections").update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user_id);
    if (syncTimeErr) console.error("[sync-whoop] failed to update last_sync_at:", syncTimeErr.message);

    console.log("[sync-whoop] done. synced:", synced);
    return new Response(JSON.stringify({ success: true, synced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-whoop] unhandled error:", e instanceof Error ? e.message : e);
    console.error("[sync-whoop] stack:", e instanceof Error ? e.stack : "no stack");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
