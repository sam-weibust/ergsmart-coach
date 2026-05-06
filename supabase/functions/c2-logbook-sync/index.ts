import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const C2_CLIENT_ID = Deno.env.get("C2_CLIENT_ID");
    const C2_CLIENT_SECRET = Deno.env.get("C2_CLIENT_SECRET");

    if (!C2_CLIENT_ID || !C2_CLIENT_SECRET) {
      throw new Error("Concept2 OAuth environment variables not configured");
    }

    // Use service role key (fixes all RLS/401 issues)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Extract user_id from the Authorization header (Bearer JWT)
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwtPayload = JSON.parse(atob(jwt.split(".")[1]));
    const user_id: string = jwtPayload.sub;
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Could not determine user_id from token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch stored tokens
    const { data: tokenRow } = await supabase
      .from("c2_tokens")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(
        JSON.stringify({ error: "No Concept2 tokens found for user" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let { access_token, refresh_token, expires_at } = tokenRow;

    // Refresh token if expired or expiring within 5 minutes
    const isExpired = !expires_at || new Date(expires_at) <= new Date(Date.now() + 5 * 60 * 1000);
    if (isExpired && refresh_token) {
      console.log("[c2-logbook-sync] Token expired or expiring soon, refreshing...");
      const refreshResponse = await fetch(
        "https://log.concept2.com/oauth/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token,
            client_id: C2_CLIENT_ID,
            client_secret: C2_CLIENT_SECRET,
          }),
        }
      );

      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        access_token = refreshed.access_token;
        refresh_token = refreshed.refresh_token ?? refresh_token;
        expires_at = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();

        await supabase.from("c2_tokens").update({
          access_token,
          refresh_token,
          expires_at,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user_id);
        console.log("[c2-logbook-sync] Token refreshed, new expires_at:", expires_at);
      } else {
        const errText = await refreshResponse.text();
        console.error("[c2-logbook-sync] Token refresh failed:", refreshResponse.status, errText);
      }
    }

    // Fetch workouts from Concept2 Logbook
    const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const toDate = new Date().toISOString().split("T")[0];
    const apiUrl = `https://log.concept2.com/api/users/me/results?per_page=50&from=${fromDate}&to=${toDate}`;
    console.log(`[c2-logbook-sync] Fetching workouts for user ${user_id}, date range: ${fromDate} → ${toDate}`);

    const workoutsResponse = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!workoutsResponse.ok) {
      const t = await workoutsResponse.text();
      console.error("[c2-logbook-sync] C2 API error:", workoutsResponse.status, t);
      return new Response(JSON.stringify({ error: "Failed to fetch workouts" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workouts = await workoutsResponse.json();
    console.log(`[c2-logbook-sync] C2 API returned ${workouts.data?.length ?? 0} workouts (date range: ${fromDate} → ${toDate})`);

    // Insert or update workouts in Supabase
    const formatted = workouts.data.map((w) => ({
      user_id,
      c2_id: w.id,
      workout_date: w.date,
      distance: w.distance,
      duration: w.time,
      avg_split: w.pace,
      stroke_rate: w.stroke_rate,
      raw: w,
      updated_at: new Date().toISOString(),
    }));

    // Upsert by c2_id
    await supabase.from("erg_workouts").upsert(formatted, {
      onConflict: "c2_id",
    });

    return new Response(
      JSON.stringify({
        success: true,
        imported: formatted.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error("c2-logbook-sync error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
