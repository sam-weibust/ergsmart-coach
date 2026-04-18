import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatDuration(deciseconds: number): string {
  const totalSec = Math.floor(deciseconds / 10);
  const tenths = deciseconds % 10;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const C2_CLIENT_ID = Deno.env.get("CONCEPT2_CLIENT_ID");
  const C2_CLIENT_SECRET = Deno.env.get("CONCEPT2_CLIENT_SECRET");

  if (!C2_CLIENT_ID || !C2_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Concept2 OAuth not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow } = await supabase
      .from("concept2_tokens")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "No Concept2 account connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { access_token, refresh_token, expires_at } = tokenRow;

    // Refresh if expired or expiring within 5 minutes
    const isExpired = !expires_at || new Date(expires_at) <= new Date(Date.now() + 5 * 60 * 1000);
    if (isExpired && refresh_token) {
      const refreshRes = await fetch("https://log.concept2.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          client_id: C2_CLIENT_ID,
          client_secret: C2_CLIENT_SECRET,
        }),
      });

      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        access_token = refreshed.access_token;
        refresh_token = refreshed.refresh_token ?? refresh_token;
        expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        await supabase.from("concept2_tokens").update({
          access_token,
          refresh_token,
          expires_at,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user_id);
      }
    }

    // Fetch all workouts (paginate)
    let allWorkouts: any[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(
        `https://log.concept2.com/api/users/me/results?per_page=100&page=${page}`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (!res.ok) break;
      const json = await res.json();
      const items = json.data ?? [];
      allWorkouts = allWorkouts.concat(items);
      if (!json.meta?.pagination?.next) break;
      page++;
    }

    // Map to erg_workouts schema
    const rows = allWorkouts.map((w: any) => ({
      user_id,
      external_id: `c2_${w.id}`,
      workout_date: w.date ? w.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
      workout_type: w.workout_type ?? w.type ?? "unknown",
      distance: w.distance ?? null,
      duration: w.time != null ? formatDuration(w.time) : null,
      avg_split: w.pace ?? null,
      avg_heart_rate: w.avg_heart_rate ?? null,
      calories: w.cal_total ?? null,
      notes: w.comments || null,
    }));

    // Upsert by (user_id, external_id) — skips duplicates
    let imported = 0;
    if (rows.length > 0) {
      // Insert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from("erg_workouts").upsert(batch, {
          onConflict: "user_id,external_id",
          ignoreDuplicates: false,
        });
        if (!error) imported += batch.length;
      }
    }

    // Update last_concept2_sync and last_sync_at on token
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabase.from("athlete_profiles").upsert(
        { user_id, last_concept2_sync: nowIso },
        { onConflict: "user_id" }
      ),
      supabase.from("concept2_tokens").update({ last_sync_at: nowIso }).eq("user_id", user_id),
    ]);

    return new Response(JSON.stringify({ success: true, imported, total: allWorkouts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-concept2 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
