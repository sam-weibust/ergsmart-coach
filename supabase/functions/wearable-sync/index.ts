import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchProviderSleep, fetchProviderDaily, fetchProviderWorkouts,
  refreshProviderToken, decryptToken, encryptToken,
  utcToLocalDate, sleepDate, localHHMM, type Provider,
} from "../_shared/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, days = 7 } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: connections } = await supabase
      .from("wearable_connections")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (!connections?.length) {
      return new Response(JSON.stringify({ synced: [], errors: [], message: "No active wearable connections" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user_id)
      .maybeSingle();
    const tz = profile?.timezone || "UTC";

    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000).toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];
    const synced: string[] = [];
    const errors: string[] = [];

    for (const conn of connections) {
      try {
        if (!conn.access_token_enc) {
          errors.push(conn.provider);
          await supabase.from("wearable_connections")
            .update({ error_message: "No access token — please reconnect" })
            .eq("id", conn.id);
          continue;
        }

        // Refresh token if expired or expiring within 5 minutes
        let accessToken = await decryptToken(conn.access_token_enc);
        if (conn.token_expires_at && conn.refresh_token_enc) {
          const expiresAt = new Date(conn.token_expires_at).getTime();
          if (expiresAt <= Date.now() + 5 * 60 * 1000) {
            try {
              const refreshToken = await decryptToken(conn.refresh_token_enc);
              const newTokens = await refreshProviderToken(conn.provider as Provider, refreshToken);
              accessToken = newTokens.access_token;
              await supabase.from("wearable_connections").update({
                access_token_enc: await encryptToken(newTokens.access_token),
                refresh_token_enc: newTokens.refresh_token
                  ? await encryptToken(newTokens.refresh_token)
                  : conn.refresh_token_enc,
                token_expires_at: newTokens.expires_at ?? null,
              }).eq("id", conn.id);
            } catch (refreshErr) {
              console.error(`[wearable-sync] ${conn.provider} token refresh failed:`, refreshErr);
              await supabase.from("wearable_connections")
                .update({ is_active: false, error_message: "Token expired — please reconnect" })
                .eq("id", conn.id);
              errors.push(conn.provider);
              continue;
            }
          }
        }

        const wearableTs = new Date().toISOString();
        const provider = conn.provider as Provider;

        // ── Sleep ────────────────────────────────────────────────────────────
        const sleepSessions = await fetchProviderSleep(provider, accessToken, startDate, endDate);
        for (const s of sleepSessions) {
          if (!s.end_time || !s.duration_seconds) continue;

          const date = sleepDate(s.end_time, tz);
          const durationHours = parseFloat((s.duration_seconds / 3600).toFixed(2));

          let qualityScore: number | null = null;
          if (s.sleep_score != null) qualityScore = Math.round(Math.min(10, Math.max(1, s.sleep_score / 10)));
          else if (s.efficiency != null) qualityScore = Math.round(Math.min(10, Math.max(1, s.efficiency * 10)));

          const bedtime = s.start_time ? localHHMM(s.start_time, tz) : null;
          const wakeTime = localHHMM(s.end_time, tz);

          const { data: existing } = await supabase.from("sleep_entries")
            .select("id, source").eq("user_id", user_id).eq("date", date).maybeSingle();

          if (!existing) {
            await supabase.from("sleep_entries").insert({
              user_id, date, duration_hours: durationHours, quality_score: qualityScore,
              bedtime, wake_time: wakeTime,
              source: "wearable", provider: conn.provider, wearable_updated_at: wearableTs,
            });
          } else if (existing.source !== "manual") {
            await supabase.from("sleep_entries").update({
              duration_hours: durationHours, quality_score: qualityScore,
              bedtime, wake_time: wakeTime,
              source: "wearable", provider: conn.provider, wearable_updated_at: wearableTs,
            }).eq("id", existing.id);
          }

          if (s.hrv_rmssd != null || s.resting_hr != null) {
            const mRow: Record<string, unknown> = {
              user_id, date, provider: conn.provider, source: "wearable",
              wearable_updated_at: wearableTs, updated_at: wearableTs,
            };
            if (s.hrv_rmssd != null) mRow.hrv = s.hrv_rmssd;
            if (s.resting_hr != null) mRow.resting_hr = s.resting_hr;
            await supabase.from("recovery_metrics").upsert(mRow, { onConflict: "user_id,date" });
          }
        }

        // ── Daily summaries ──────────────────────────────────────────────────
        const dailySummaries = await fetchProviderDaily(provider, accessToken, startDate, endDate);
        for (const d of dailySummaries) {
          const date = d.date ? utcToLocalDate(d.date + "T12:00:00Z", tz) : null;
          if (!date) continue;

          const row: Record<string, unknown> = {
            user_id, date, provider: conn.provider,
            source: "wearable", wearable_updated_at: wearableTs, updated_at: wearableTs,
          };
          if (d.hrv_rmssd != null) row.hrv = d.hrv_rmssd;
          if (d.resting_hr != null) row.resting_hr = d.resting_hr;
          if (d.readiness_score != null) row.recovery_score_input = d.readiness_score;
          if (d.steps != null) row.steps = d.steps;
          if (d.active_calories != null) row.active_calories = d.active_calories;
          if (d.strain != null) row.strain = d.strain;

          await supabase.from("recovery_metrics").upsert(row, { onConflict: "user_id,date" });
        }

        // ── Workouts ─────────────────────────────────────────────────────────
        const workouts = await fetchProviderWorkouts(provider, accessToken, startDate, endDate);
        for (const w of workouts) {
          if (!w.workout_id || !w.start_time) continue;
          if (w.strain == null) continue;
          const date = utcToLocalDate(w.start_time, tz);
          await supabase.from("recovery_metrics").upsert({
            user_id, date, strain: w.strain, provider: conn.provider,
            source: "wearable", wearable_updated_at: wearableTs, updated_at: wearableTs,
          }, { onConflict: "user_id,date" });
        }

        await supabase.from("wearable_connections")
          .update({ last_sync_at: wearableTs, error_message: null })
          .eq("id", conn.id);

        synced.push(conn.provider);
        console.log("[wearable-sync] synced", conn.provider);
      } catch (providerErr) {
        console.error(`[wearable-sync] ${conn.provider} error:`, providerErr);
        errors.push(conn.provider);
        await supabase.from("wearable_connections")
          .update({ error_message: providerErr instanceof Error ? providerErr.message : "Sync failed" })
          .eq("id", conn.id);
      }
    }

    return new Response(JSON.stringify({ synced, errors, start_date: startDate, end_date: endDate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wearable-sync]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
