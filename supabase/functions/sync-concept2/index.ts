import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert Concept2 deciseconds to HH:MM:SS (valid PostgreSQL interval)
function decisecondsToPgInterval(deciseconds: number): string {
  const totalSec = Math.floor(deciseconds / 10);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

    console.log(`[sync-concept2] Starting sync for user_id=${user_id}`);

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("concept2_tokens")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (tokenErr) {
      console.error("[sync-concept2] Error fetching token row:", tokenErr);
    }

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "No Concept2 account connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sync-concept2] Token row found. expires_at=${tokenRow.expires_at}`);

    let { access_token, refresh_token, expires_at } = tokenRow;

    // Refresh if expired or expiring within 5 minutes
    const isExpired = !expires_at || new Date(expires_at) <= new Date(Date.now() + 5 * 60 * 1000);
    console.log(`[sync-concept2] Token isExpired=${isExpired}`);

    if (isExpired && refresh_token) {
      console.log("[sync-concept2] Refreshing access token...");
      const refreshRes = await fetch("https://log.concept2.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          client_id: C2_CLIENT_ID,
          client_secret: C2_CLIENT_SECRET,
        }),
      });

      const refreshBody = await refreshRes.text();
      console.log(`[sync-concept2] Refresh response status=${refreshRes.status} body=${refreshBody}`);

      if (refreshRes.ok) {
        const refreshed = JSON.parse(refreshBody);
        access_token = refreshed.access_token;
        refresh_token = refreshed.refresh_token ?? refresh_token;
        expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        const { error: updateErr } = await supabase.from("concept2_tokens").update({
          access_token,
          refresh_token,
          expires_at,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user_id);

        if (updateErr) {
          console.error("[sync-concept2] Failed to persist refreshed token:", updateErr);
        } else {
          console.log("[sync-concept2] Token refreshed and saved successfully.");
        }
      } else {
        console.error("[sync-concept2] Token refresh failed — proceeding with existing token.");
      }
    }

    console.log(`[sync-concept2] Using access_token (first 10 chars): ${access_token?.substring(0, 10)}...`);

    // Fetch all workouts (paginate)
    let allWorkouts: any[] = [];
    let page = 1;
    let apiError: string | null = null;
    let firstRawResponse: string | null = null;

    while (true) {
      const url = `https://log.concept2.com/api/users/me/results?per_page=100&page=${page}`;
      console.log(`[sync-concept2] Fetching page=${page} url=${url}`);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const rawBody = await res.text();
      if (page === 1) firstRawResponse = rawBody;

      console.log(`[sync-concept2] Page ${page} status=${res.status} body=${rawBody.substring(0, 500)}`);

      if (!res.ok) {
        apiError = `HTTP ${res.status}: ${rawBody}`;
        console.error(`[sync-concept2] API error on page ${page}: ${apiError}`);
        break;
      }

      let json: any;
      try {
        json = JSON.parse(rawBody);
      } catch (parseErr) {
        apiError = `JSON parse error: ${parseErr}. Raw: ${rawBody.substring(0, 200)}`;
        console.error(`[sync-concept2] ${apiError}`);
        break;
      }

      const items = json.data ?? [];
      console.log(`[sync-concept2] Page ${page} returned ${items.length} items. meta=${JSON.stringify(json.meta)}`);
      allWorkouts = allWorkouts.concat(items);

      if (!json.meta?.pagination?.next) break;
      page++;
    }

    console.log(`[sync-concept2] Total workouts fetched: ${allWorkouts.length}`);

    if (allWorkouts.length > 0) {
      console.log("[sync-concept2] Sample workout[0]:", JSON.stringify(allWorkouts[0]));
    }

    // Map to erg_workouts schema
    const rows = allWorkouts.map((w: any) => ({
      user_id,
      external_id: `c2_${w.id}`,
      workout_date: w.date ? w.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
      workout_type: w.workout_type ?? w.type ?? "unknown",
      distance: w.distance ?? null,
      duration: w.time != null ? decisecondsToPgInterval(w.time) : null,
      avg_split: w.pace != null ? decisecondsToPgInterval(w.pace) : null,
      avg_heart_rate: w.avg_heart_rate ?? null,
      calories: w.cal_total ?? null,
      notes: w.comments || null,
    }));

    console.log(`[sync-concept2] Mapped ${rows.length} rows for upsert.`);
    if (rows.length > 0) {
      console.log("[sync-concept2] Sample mapped row[0]:", JSON.stringify(rows[0]));
    }

    // Upsert by (user_id, external_id)
    let imported = 0;
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        console.log(`[sync-concept2] Upserting batch ${Math.floor(i / 50) + 1} (${batch.length} rows)...`);
        const { data: upsertData, error: upsertErr } = await supabase
          .from("erg_workouts")
          .upsert(batch, { onConflict: "user_id,external_id", ignoreDuplicates: false })
          .select("id");

        if (upsertErr) {
          console.error(`[sync-concept2] Upsert error on batch starting at ${i}:`, upsertErr);
        } else {
          const count = upsertData?.length ?? batch.length;
          console.log(`[sync-concept2] Batch upserted, ${count} rows affected.`);
          imported += count;
        }
      }
    }

    console.log(`[sync-concept2] Sync complete. imported=${imported} total=${allWorkouts.length}`);

    // Update last_concept2_sync and last_sync_at on token
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabase.from("athlete_profiles").upsert(
        { user_id, last_concept2_sync: nowIso },
        { onConflict: "user_id" }
      ),
      supabase.from("concept2_tokens").update({ last_sync_at: nowIso }).eq("user_id", user_id),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        total: allWorkouts.length,
        ...(apiError ? { api_error: apiError } : {}),
        ...(firstRawResponse && allWorkouts.length === 0 ? { raw_response: firstRawResponse.substring(0, 1000) } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[sync-concept2] Unhandled error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", stack: e instanceof Error ? e.stack : undefined }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
