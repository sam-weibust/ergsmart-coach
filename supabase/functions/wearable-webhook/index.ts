import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyWebhookSignature, utcToLocalDate, sleepDate, localHHMM,
  type OWWebhookPayload, type OWSleepSession, type OWDailySummary, type OWWorkout,
} from "../_shared/openWearables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleConnectionCreated(supabase: any, payload: OWWebhookPayload) {
  const { reference_id, open_wearables_user_id, provider } = payload;
  if (!reference_id) return;

  const { error } = await supabase.from("wearable_connections").upsert({
    user_id: reference_id,
    provider: provider.toLowerCase(),
    open_wearables_user_id,
    is_active: true,
    connected_at: new Date().toISOString(),
    error_message: null,
  }, { onConflict: "user_id,provider" });

  if (error) console.error("[webhook] connection.created upsert error:", error);
  else console.log("[webhook] connected", provider, "for", reference_id);
}

async function handleConnectionError(supabase: any, payload: OWWebhookPayload) {
  const { reference_id, provider, data } = payload;
  if (!reference_id) return;

  await supabase.from("wearable_connections")
    .update({ is_active: false, error_message: (data as any).message || "Connection error" })
    .eq("user_id", reference_id)
    .eq("provider", provider.toLowerCase());
}

async function handleSleepUpdated(supabase: any, payload: OWWebhookPayload, tz: string) {
  const { reference_id, provider, data } = payload;
  if (!reference_id) return;

  const s = data as OWSleepSession;
  if (!s.end_time || !s.duration_seconds) return;

  const date = sleepDate(s.end_time, tz);
  const durationHours = parseFloat((s.duration_seconds / 3600).toFixed(2));

  // Quality 1-10: prefer sleep_score/10, fall back to efficiency*10
  let qualityScore: number | null = null;
  if (s.sleep_score != null) qualityScore = Math.round(Math.min(10, Math.max(1, s.sleep_score / 10)));
  else if (s.efficiency != null) qualityScore = Math.round(Math.min(10, Math.max(1, s.efficiency * 10)));

  const bedtime = s.start_time ? localHHMM(s.start_time, tz) : null;
  const wakeTime = localHHMM(s.end_time, tz);
  const wearableTs = new Date().toISOString();

  const { data: existing } = await supabase.from("sleep_entries")
    .select("id, source, wearable_updated_at")
    .eq("user_id", reference_id)
    .eq("date", date)
    .maybeSingle();

  if (existing?.source === "manual") {
    console.log("[webhook] sleep: skipping manual entry for", date);
    return;
  }

  const row = {
    duration_hours: durationHours, quality_score: qualityScore,
    bedtime, wake_time: wakeTime,
    source: "wearable", provider: provider.toLowerCase(), wearable_updated_at: wearableTs,
  };

  if (existing) {
    await supabase.from("sleep_entries").update(row).eq("id", existing.id);
  } else {
    await supabase.from("sleep_entries").insert({ user_id: reference_id, date, ...row });
    console.log("[webhook] sleep inserted for", date);
  }

  // If the sleep payload also includes HRV/RHR, push to recovery_metrics
  if (s.hrv_rmssd != null || s.resting_hr != null) {
    const metricsRow: Record<string, any> = {
      user_id: reference_id, date, provider: provider.toLowerCase(),
      source: "wearable", wearable_updated_at: wearableTs, updated_at: wearableTs,
    };
    if (s.hrv_rmssd != null) metricsRow.hrv = s.hrv_rmssd;
    if (s.resting_hr != null) metricsRow.resting_hr = s.resting_hr;
    await supabase.from("recovery_metrics")
      .upsert(metricsRow, { onConflict: "user_id,date" });
  }

  // Update last_sync_at
  await supabase.from("wearable_connections")
    .update({ last_sync_at: wearableTs })
    .eq("user_id", reference_id)
    .eq("provider", provider.toLowerCase());
}

async function handleDailyUpdated(supabase: any, payload: OWWebhookPayload, tz: string) {
  const { reference_id, provider, data } = payload;
  if (!reference_id) return;

  const d = data as OWDailySummary;
  // d.date is YYYY-MM-DD UTC — convert to user local
  const date = d.date ? utcToLocalDate(d.date + "T12:00:00Z", tz) : utcToLocalDate(payload.timestamp, tz);
  const wearableTs = new Date().toISOString();

  const row: Record<string, any> = {
    user_id: reference_id, date,
    provider: provider.toLowerCase(), source: "wearable",
    wearable_updated_at: wearableTs, updated_at: wearableTs,
  };
  if (d.hrv_rmssd != null) row.hrv = d.hrv_rmssd;
  if (d.resting_hr != null) row.resting_hr = d.resting_hr;
  if (d.readiness_score != null) row.recovery_score_input = d.readiness_score;
  if (d.steps != null) row.steps = d.steps;
  if (d.active_calories != null) row.active_calories = d.active_calories;
  if (d.strain != null) row.strain = d.strain;

  await supabase.from("recovery_metrics")
    .upsert(row, { onConflict: "user_id,date" });

  await supabase.from("wearable_connections")
    .update({ last_sync_at: wearableTs })
    .eq("user_id", reference_id)
    .eq("provider", provider.toLowerCase());
}

async function handleWorkoutCreated(supabase: any, payload: OWWebhookPayload, tz: string) {
  const { reference_id, provider, data } = payload;
  if (!reference_id) return;

  const w = data as OWWorkout;
  if (!w.workout_id || !w.start_time) return;

  const date = utcToLocalDate(w.start_time, tz);
  const wearableTs = new Date().toISOString();

  // Update recovery_metrics strain if provided
  if (w.strain != null) {
    await supabase.from("recovery_metrics")
      .upsert({
        user_id: reference_id, date, strain: w.strain,
        provider: provider.toLowerCase(), source: "wearable",
        wearable_updated_at: wearableTs, updated_at: wearableTs,
      }, { onConflict: "user_id,date" });
  }

  await supabase.from("wearable_connections")
    .update({ last_sync_at: wearableTs })
    .eq("user_id", reference_id)
    .eq("provider", provider.toLowerCase());
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OW_SECRET = Deno.env.get("OPEN_WEARABLES_WEBHOOK_SECRET");
    const rawBody = await req.text();

    // Verify signature when secret is configured
    if (OW_SECRET) {
      const sigHeader = req.headers.get("x-open-wearables-signature") || "";
      const valid = await verifyWebhookSignature(rawBody, sigHeader, OW_SECRET);
      if (!valid) {
        console.error("[webhook] invalid Open Wearables signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload: OWWebhookPayload = JSON.parse(rawBody);
    console.log("[webhook] event:", payload.event, "provider:", payload.provider, "user:", payload.reference_id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Resolve user timezone
    let tz = "UTC";
    if (payload.reference_id) {
      const { data: profile } = await supabase.from("profiles")
        .select("timezone").eq("id", payload.reference_id).maybeSingle();
      if (profile?.timezone) tz = profile.timezone;
    }

    switch (payload.event) {
      case "connection.created":
        await handleConnectionCreated(supabase, payload);
        break;
      case "connection.error":
      case "connection.revoked":
        await handleConnectionError(supabase, payload);
        break;
      case "sleep.updated":
      case "sleep.created":
        await handleSleepUpdated(supabase, payload, tz);
        break;
      case "daily.updated":
      case "daily.created":
        await handleDailyUpdated(supabase, payload, tz);
        break;
      case "workout.created":
      case "workout.updated":
        await handleWorkoutCreated(supabase, payload, tz);
        break;
      default:
        console.log("[webhook] unhandled event:", payload.event);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[webhook] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
