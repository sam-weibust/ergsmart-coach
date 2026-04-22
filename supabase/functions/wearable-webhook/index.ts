import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function verifyTerraSignature(body: string, sig: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = new Uint8Array(atob(sig).split("").map(c => c.charCodeAt(0)));
    return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(body));
  } catch { return false; }
}

/** Convert a UTC ISO timestamp to YYYY-MM-DD in a given IANA timezone. */
function utcToLocalDate(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(isoString));
  } catch {
    return isoString.split("T")[0];
  }
}

/** "Previous night" rule: sleep ending before 14:00 local time belongs to the previous calendar date. */
function sleepDate(sleepEndIso: string, timezone: string): string {
  const endHour = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false })
      .format(new Date(sleepEndIso))
  );
  if (endHour < 14) {
    // Woke before 2pm — belongs to "today" (start date is yesterday)
    const d = new Date(sleepEndIso);
    d.setDate(d.getDate() - 1);
    return utcToLocalDate(d.toISOString(), timezone);
  }
  return utcToLocalDate(sleepEndIso, timezone);
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleUserAuth(supabase: any, payload: any) {
  const { user, type } = payload;
  if (!user?.reference_id) return;

  const { error } = await supabase.from("wearable_connections").upsert({
    user_id: user.reference_id,
    provider: user.provider?.toLowerCase() || "unknown",
    terra_user_id: user.user_id,
    is_active: true,
    connected_at: new Date().toISOString(),
    error_message: null,
  }, { onConflict: "user_id,provider" });

  if (error) console.error("[webhook] user_auth upsert error:", error);
  else console.log("[webhook] user_auth: connected", user.provider, "for", user.reference_id);
}

async function handleSleep(supabase: any, payload: any, userTimezone: string) {
  const { user, data } = payload;
  if (!user?.reference_id || !Array.isArray(data)) return;

  for (const entry of data) {
    const sleepEndIso = entry.sleep_end_utc || entry.end_time;
    const sleepStartIso = entry.sleep_start_utc || entry.start_time;
    if (!sleepEndIso) continue;

    const date = sleepDate(sleepEndIso, userTimezone);

    // Duration in hours from seconds
    const durationSec = entry.sleep_durations_data?.sleep_efficiency != null
      ? entry.sleep_durations_data?.asleep_duration_in_seconds
      : entry.duration_in_seconds;
    if (!durationSec) continue;
    const durationHours = parseFloat((durationSec / 3600).toFixed(2));

    // Quality score 1-10 from sleep efficiency (0-1) or sleep score (0-100)
    let qualityScore: number | null = null;
    const efficiency = entry.sleep_durations_data?.sleep_efficiency;
    const sleepScore = entry.sleep_score;
    if (sleepScore != null) qualityScore = Math.round(Math.min(10, Math.max(1, sleepScore / 10)));
    else if (efficiency != null) qualityScore = Math.round(Math.min(10, Math.max(1, efficiency * 10)));

    // Bedtime / wake time as local HH:MM
    const bedtime = sleepStartIso
      ? new Intl.DateTimeFormat("en-US", { timeZone: userTimezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(sleepStartIso))
      : null;
    const wakeTime = sleepEndIso
      ? new Intl.DateTimeFormat("en-US", { timeZone: userTimezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(sleepEndIso))
      : null;

    const wearableTs = new Date().toISOString();

    // Fetch existing row — never overwrite a more recent manual entry
    const { data: existing } = await supabase.from("sleep_entries")
      .select("id, source, wearable_updated_at")
      .eq("user_id", user.reference_id)
      .eq("date", date)
      .maybeSingle();

    if (existing) {
      if (existing.source === "manual") {
        // Manual entry exists — only update metadata, not core fields
        console.log("[webhook] sleep: skipping manual entry for", date);
        continue;
      }
      // Update existing wearable entry if newer
      const { error } = await supabase.from("sleep_entries").update({
        duration_hours: durationHours,
        quality_score: qualityScore,
        bedtime,
        wake_time: wakeTime,
        source: "wearable",
        provider: user.provider?.toLowerCase(),
        wearable_updated_at: wearableTs,
      }).eq("id", existing.id);
      if (error) console.error("[webhook] sleep update error:", error);
    } else {
      const { error } = await supabase.from("sleep_entries").insert({
        user_id: user.reference_id,
        date,
        duration_hours: durationHours,
        quality_score: qualityScore,
        bedtime,
        wake_time: wakeTime,
        source: "wearable",
        provider: user.provider?.toLowerCase(),
        wearable_updated_at: wearableTs,
      });
      if (error) console.error("[webhook] sleep insert error:", error);
      else console.log("[webhook] sleep inserted for", date);
    }
  }
}

async function handleDaily(supabase: any, payload: any, userTimezone: string) {
  const { user, data } = payload;
  if (!user?.reference_id || !Array.isArray(data)) return;

  for (const entry of data) {
    const dateIso = entry.date || entry.metadata?.start_time;
    if (!dateIso) continue;
    const date = utcToLocalDate(dateIso, userTimezone);

    const hrv = entry.heart_rate_data?.summary?.hrv_rmssd_data?.avg
      ?? entry.heart_rate_data?.summary?.hrv_sdnn_data?.avg
      ?? null;
    const restingHr = entry.heart_rate_data?.summary?.resting_hr_bpm
      ?? entry.heart_rate_data?.resting_hr
      ?? null;
    const readiness = entry.readiness_data?.score
      ?? entry.wellness_data?.recovery_score
      ?? null;
    const steps = entry.active_durations_data?.steps ?? null;
    const activeCal = entry.calories_data?.total_burned_calories ?? entry.calories_data?.active_calories ?? null;
    const strain = entry.strain_data?.strain_level ?? null;

    const wearableTs = new Date().toISOString();

    // Merge: only overwrite if wearable data is newer or no row exists
    const { data: existing } = await supabase.from("recovery_metrics")
      .select("id, wearable_updated_at")
      .eq("user_id", user.reference_id)
      .eq("date", date)
      .maybeSingle();

    const row: Record<string, any> = {
      user_id: user.reference_id,
      date,
      provider: user.provider?.toLowerCase(),
      source: "wearable",
      wearable_updated_at: wearableTs,
      updated_at: wearableTs,
    };
    if (hrv !== null) row.hrv = hrv;
    if (restingHr !== null) row.resting_hr = restingHr;
    if (readiness !== null) row.recovery_score_input = readiness;
    if (steps !== null) row.steps = steps;
    if (activeCal !== null) row.active_calories = activeCal;
    if (strain !== null) row.strain = strain;

    if (existing) {
      const { error } = await supabase.from("recovery_metrics").update(row).eq("id", existing.id);
      if (error) console.error("[webhook] daily update error:", error);
    } else {
      const { error } = await supabase.from("recovery_metrics").insert(row);
      if (error) console.error("[webhook] daily insert error:", error);
    }

    // Also update wearable last_sync_at
    await supabase.from("wearable_connections").update({ last_sync_at: wearableTs })
      .eq("user_id", user.reference_id)
      .eq("provider", user.provider?.toLowerCase());
  }
}

async function handleActivity(supabase: any, payload: any, userTimezone: string) {
  const { user, data } = payload;
  if (!user?.reference_id || !Array.isArray(data)) return;
  // Activity/workout data is informational — update recovery_metrics strain only
  for (const entry of data) {
    const dateIso = entry.active_durations_data?.activity_datetime || entry.metadata?.start_time;
    if (!dateIso) continue;
    const date = utcToLocalDate(dateIso, userTimezone);
    const strain = entry.strain_data?.strain_level ?? null;
    if (strain === null) continue;
    await supabase.from("recovery_metrics")
      .upsert({ user_id: user.reference_id, date, strain, provider: user.provider?.toLowerCase(), updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const WEBHOOK_SECRET = Deno.env.get("TERRA_WEBHOOK_SECRET");
    const rawBody = await req.text();

    // Verify signature if secret is configured
    if (WEBHOOK_SECRET) {
      const sig = req.headers.get("terra-signature") || req.headers.get("x-terra-signature") || "";
      const valid = await verifyTerraSignature(rawBody, sig, WEBHOOK_SECRET);
      if (!valid) {
        console.error("[webhook] invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.type || "";
    console.log("[webhook] event:", eventType, "user:", payload.user?.reference_id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Resolve user timezone from profile
    let userTimezone = "UTC";
    if (payload.user?.reference_id) {
      const { data: profile } = await supabase.from("profiles")
        .select("timezone").eq("id", payload.user.reference_id).maybeSingle();
      if (profile?.timezone) userTimezone = profile.timezone;
    }

    switch (eventType) {
      case "user_auth":
        await handleUserAuth(supabase, payload);
        break;
      case "sleep":
        await handleSleep(supabase, payload, userTimezone);
        break;
      case "daily":
        await handleDaily(supabase, payload, userTimezone);
        break;
      case "activity":
        await handleActivity(supabase, payload, userTimezone);
        break;
      default:
        console.log("[webhook] unhandled event type:", eventType);
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
