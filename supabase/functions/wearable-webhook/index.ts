/**
 * wearable-webhook
 *
 * Handles direct provider webhooks. Currently supports:
 *   - Strava (subscription verification + activity events)
 *
 * Other providers (Oura, WHOOP, Fitbit, Polar) use pull-based sync via wearable-sync.
 * Route provider via ?provider=strava query param (defaults to strava).
 *
 * Strava env vars required:
 *   STRAVA_WEBHOOK_VERIFY_TOKEN  — arbitrary token set when creating the Strava subscription
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  utcToLocalDate, decryptToken, encryptToken, refreshProviderToken,
} from "../_shared/providers.ts";

serve(async (req) => {
  const reqUrl = new URL(req.url);
  const provider = reqUrl.searchParams.get("provider") ?? "strava";

  // ── Strava subscription verification (GET) ───────────────────────────────────
  if (req.method === "GET" && provider === "strava") {
    const mode = reqUrl.searchParams.get("hub.mode");
    const token = reqUrl.searchParams.get("hub.verify_token");
    const challenge = reqUrl.searchParams.get("hub.challenge");
    const VERIFY_TOKEN = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── Strava activity events (POST) ────────────────────────────────────────────
  if (req.method === "POST" && provider === "strava") {
    // Respond 200 immediately; Strava requires fast acknowledgement.
    const responsePromise = new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });

    try {
      const event = await req.json();
      console.log("[webhook] strava event:", event.aspect_type, event.object_type, "owner:", event.owner_id);

      if (
        event.object_type === "activity" &&
        (event.aspect_type === "create" || event.aspect_type === "update")
      ) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: conn } = await supabase
          .from("wearable_connections")
          .select("*")
          .eq("provider", "strava")
          .eq("open_wearables_user_id", String(event.owner_id))
          .eq("is_active", true)
          .maybeSingle();

        if (!conn?.access_token_enc) {
          console.log("[webhook] no active strava connection for athlete", event.owner_id);
          return responsePromise;
        }

        // Refresh token if needed
        let accessToken = await decryptToken(conn.access_token_enc);
        if (conn.token_expires_at && conn.refresh_token_enc) {
          const expiresAt = new Date(conn.token_expires_at).getTime();
          if (expiresAt <= Date.now() + 5 * 60 * 1000) {
            const refreshToken = await decryptToken(conn.refresh_token_enc);
            const newTokens = await refreshProviderToken("strava", refreshToken);
            accessToken = newTokens.access_token;
            await supabase.from("wearable_connections").update({
              access_token_enc: await encryptToken(newTokens.access_token),
              refresh_token_enc: newTokens.refresh_token
                ? await encryptToken(newTokens.refresh_token)
                : conn.refresh_token_enc,
              token_expires_at: newTokens.expires_at ?? null,
            }).eq("id", conn.id);
          }
        }

        // Fetch the specific activity
        const actRes = await fetch(
          `https://www.strava.com/api/v3/activities/${event.object_id}`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        if (!actRes.ok) {
          console.error("[webhook] strava activity fetch failed:", await actRes.text());
          return responsePromise;
        }
        const activity = await actRes.json();

        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", conn.user_id)
          .maybeSingle();
        const tz = profile?.timezone || "UTC";

        const date = utcToLocalDate(activity.start_date, tz);
        const wearableTs = new Date().toISOString();

        const metricsRow: Record<string, unknown> = {
          user_id: conn.user_id,
          date,
          provider: "strava",
          source: "wearable",
          wearable_updated_at: wearableTs,
          updated_at: wearableTs,
        };
        if (activity.calories != null) metricsRow.active_calories = activity.calories;

        await supabase.from("recovery_metrics")
          .upsert(metricsRow, { onConflict: "user_id,date" });

        await supabase.from("wearable_connections")
          .update({ last_sync_at: wearableTs })
          .eq("id", conn.id);

        console.log("[webhook] strava activity processed for user", conn.user_id, "date", date);
      }
    } catch (e) {
      // Log but return 200 to prevent Strava from retrying indefinitely
      console.error("[webhook] strava processing error:", e);
    }

    return responsePromise;
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
});
