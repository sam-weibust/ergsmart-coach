import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-GCM decryption
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "default-insecure-key-replace-me";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function decryptToken(enc: string): Promise<string> {
  const key = await getKey();
  const buf = new Uint8Array(atob(enc).split("").map(c => c.charCodeAt(0)));
  const iv = buf.slice(0, 12);
  const data = buf.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(dec);
}

function utcToLocalDate(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(isoString));
  } catch { return isoString.split("T")[0]; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const TERRA_API_KEY = Deno.env.get("TERRA_API_KEY");
    const TERRA_DEV_ID = Deno.env.get("TERRA_DEV_ID");

    if (!TERRA_API_KEY || !TERRA_DEV_ID) {
      return new Response(JSON.stringify({ error: "Wearable integration not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, days = 7 } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch active connections
    const { data: connections } = await supabase.from("wearable_connections")
      .select("*").eq("user_id", user_id).eq("is_active", true);

    if (!connections?.length) {
      return new Response(JSON.stringify({ message: "No active wearable connections" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve user timezone
    const { data: profile } = await supabase.from("profiles")
      .select("timezone").eq("id", user_id).maybeSingle();
    const userTimezone = profile?.timezone || "UTC";

    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000).toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];
    const synced: string[] = [];
    const errors: string[] = [];

    for (const conn of connections) {
      if (!conn.terra_user_id) continue;
      const baseHeaders = {
        "dev-id": TERRA_DEV_ID,
        "x-api-key": TERRA_API_KEY,
      };

      try {
        // Fetch sleep data
        const sleepRes = await fetch(
          `https://api.tryterra.ai/v2/sleep?user_id=${conn.terra_user_id}&start_date=${startDate}&end_date=${endDate}&to_webhook=false`,
          { headers: baseHeaders }
        );
        if (sleepRes.ok) {
          const sleepData = await sleepRes.json();
          if (sleepData.data?.length) {
            // Re-use webhook handler logic inline
            for (const entry of sleepData.data) {
              const sleepEndIso = entry.sleep_end_utc;
              if (!sleepEndIso) continue;
              const durationSec = entry.sleep_durations_data?.asleep_duration_in_seconds;
              if (!durationSec) continue;
              const durationHours = parseFloat((durationSec / 3600).toFixed(2));

              // Previous-night rule
              const endHour = parseInt(
                new Intl.DateTimeFormat("en-US", { timeZone: userTimezone, hour: "2-digit", hour12: false })
                  .format(new Date(sleepEndIso))
              );
              const entryDate = endHour < 14
                ? utcToLocalDate(new Date(new Date(sleepEndIso).getTime() - 86400000).toISOString(), userTimezone)
                : utcToLocalDate(sleepEndIso, userTimezone);

              const efficiency = entry.sleep_durations_data?.sleep_efficiency;
              const sleepScore = entry.sleep_score;
              let qualityScore: number | null = null;
              if (sleepScore != null) qualityScore = Math.round(Math.min(10, Math.max(1, sleepScore / 10)));
              else if (efficiency != null) qualityScore = Math.round(Math.min(10, Math.max(1, efficiency * 10)));

              const { data: existing } = await supabase.from("sleep_entries")
                .select("id, source").eq("user_id", user_id).eq("date", entryDate).maybeSingle();

              if (!existing) {
                await supabase.from("sleep_entries").insert({
                  user_id, date: entryDate, duration_hours: durationHours,
                  quality_score: qualityScore, source: "wearable",
                  provider: conn.provider, wearable_updated_at: new Date().toISOString(),
                });
              } else if (existing.source !== "manual") {
                await supabase.from("sleep_entries").update({
                  duration_hours: durationHours, quality_score: qualityScore,
                  source: "wearable", provider: conn.provider,
                  wearable_updated_at: new Date().toISOString(),
                }).eq("id", existing.id);
              }
            }
          }
        }

        // Fetch daily summaries (HRV, RHR, steps)
        const dailyRes = await fetch(
          `https://api.tryterra.ai/v2/daily?user_id=${conn.terra_user_id}&start_date=${startDate}&end_date=${endDate}&to_webhook=false`,
          { headers: baseHeaders }
        );
        if (dailyRes.ok) {
          const dailyData = await dailyRes.json();
          for (const entry of (dailyData.data || [])) {
            const dateIso = entry.date || entry.metadata?.start_time;
            if (!dateIso) continue;
            const date = utcToLocalDate(dateIso, userTimezone);

            const hrv = entry.heart_rate_data?.summary?.hrv_rmssd_data?.avg ?? null;
            const restingHr = entry.heart_rate_data?.summary?.resting_hr_bpm ?? null;
            const readiness = entry.readiness_data?.score ?? null;
            const steps = entry.active_durations_data?.steps ?? null;
            const activeCal = entry.calories_data?.total_burned_calories ?? null;

            const row: Record<string, any> = {
              user_id, date, provider: conn.provider,
              source: "wearable", wearable_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            };
            if (hrv !== null) row.hrv = hrv;
            if (restingHr !== null) row.resting_hr = restingHr;
            if (readiness !== null) row.recovery_score_input = readiness;
            if (steps !== null) row.steps = steps;
            if (activeCal !== null) row.active_calories = activeCal;

            await supabase.from("recovery_metrics")
              .upsert(row, { onConflict: "user_id,date" });
          }
        }

        // Update last_sync_at
        await supabase.from("wearable_connections").update({ last_sync_at: new Date().toISOString() })
          .eq("id", conn.id);

        synced.push(conn.provider);
      } catch (providerErr) {
        console.error(`[wearable-sync] ${conn.provider} error:`, providerErr);
        errors.push(conn.provider);
        // Mark as errored but don't deactivate — token refresh may fix it
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
