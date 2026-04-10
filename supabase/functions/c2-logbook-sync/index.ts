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

    // Frontend must send: { user_id }
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
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

    let { access_token, refresh_token } = tokenRow;

    // Refresh token if needed
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
      refresh_token = refreshed.refresh_token;

      // Store updated tokens
      await supabase.from("c2_tokens").update({
        access_token,
        refresh_token,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user_id);
    }

    // Fetch workouts from Concept2 Logbook
    const workoutsResponse = await fetch(
      "https://log.concept2.com/api/users/me/results?per_page=50",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (!workoutsResponse.ok) {
      const t = await workoutsResponse.text();
      console.error("C2 sync error:", workoutsResponse.status, t);
      return new Response(JSON.stringify({ error: "Failed to fetch workouts" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workouts = await workoutsResponse.json();

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
