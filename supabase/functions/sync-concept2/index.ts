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

    if (tokenErr) console.error("[sync-concept2] Error fetching token row:", tokenErr);

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "No Concept2 account connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { access_token, refresh_token, expires_at } = tokenRow;

    const isExpired = !expires_at || new Date(expires_at) <= new Date(Date.now() + 5 * 60 * 1000);
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
      console.log(`[sync-concept2] Refresh status=${refreshRes.status}`);
      if (refreshRes.ok) {
        const refreshed = JSON.parse(refreshBody);
        access_token = refreshed.access_token;
        refresh_token = refreshed.refresh_token ?? refresh_token;
        expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabase.from("concept2_tokens").update({
          access_token, refresh_token, expires_at, updated_at: new Date().toISOString(),
        }).eq("user_id", user_id);
      }
    }

    // ── Step 1: Fetch paginated list ──────────────────────────────────────────
    let allWorkouts: any[] = [];
    let page = 1;
    let apiError: string | null = null;
    let firstRawResponse: string | null = null;

    while (true) {
      const url = `https://log.concept2.com/api/users/me/results?per_page=100&page=${page}`;
      console.log(`[sync-concept2] Fetching list page=${page}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
      const rawBody = await res.text();
      if (page === 1) firstRawResponse = rawBody;

      if (!res.ok) {
        apiError = `HTTP ${res.status}: ${rawBody}`;
        console.error(`[sync-concept2] API error: ${apiError}`);
        break;
      }

      let json: any;
      try { json = JSON.parse(rawBody); }
      catch (e) { apiError = `JSON parse error: ${e}`; break; }

      const items = json.data ?? [];
      console.log(`[sync-concept2] Page ${page}: ${items.length} items`);
      allWorkouts = allWorkouts.concat(items);
      if (!json.meta?.pagination?.next) break;
      page++;
    }

    console.log(`[sync-concept2] Total fetched: ${allWorkouts.length}`);

    // ── Step 2: Upsert basic data ─────────────────────────────────────────────
    const basicRows = allWorkouts.map((w: any) => ({
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

    let imported = 0;
    for (let i = 0; i < basicRows.length; i += 50) {
      const batch = basicRows.slice(i, i + 50);
      const { data: upserted, error: upsertErr } = await supabase
        .from("erg_workouts")
        .upsert(batch, { onConflict: "user_id,external_id", ignoreDuplicates: false })
        .select("id");
      if (upsertErr) {
        console.error(`[sync-concept2] Upsert error batch ${i}:`, upsertErr);
      } else {
        imported += upserted?.length ?? batch.length;
      }
    }

    // ── Step 3: Find workouts that still need detail data ─────────────────────
    const externalIds = basicRows.map(r => r.external_id);
    const { data: existingRows } = await supabase
      .from("erg_workouts")
      .select("id, external_id, detail_fetched_at")
      .eq("user_id", user_id)
      .in("external_id", externalIds);

    // Only fetch detail for workouts where detail_fetched_at is null (never detailed)
    const needsDetail = (existingRows ?? []).filter(r => r.detail_fetched_at == null);
    const c2IdToDbId = new Map((existingRows ?? []).map(r => [r.external_id, r.id]));

    console.log(`[sync-concept2] ${needsDetail.length} of ${existingRows?.length ?? 0} workouts need detail fetch`);

    // ── Step 4: Fetch full detail in batches of 10 ────────────────────────────
    const DETAIL_BATCH = 10;
    let detailFetched = 0;
    let detailErrors = 0;
    let firstDetailLogged = false;

    for (let i = 0; i < needsDetail.length; i += DETAIL_BATCH) {
      const batch = needsDetail.slice(i, i + DETAIL_BATCH);
      await Promise.all(batch.map(async (row) => {
        const c2Id = row.external_id.replace("c2_", "");
        const dbId = c2IdToDbId.get(row.external_id);
        if (!dbId) return;

        const detailRes = await fetch(
          `https://log.concept2.com/api/users/me/results/${c2Id}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );

        if (!detailRes.ok) {
          console.error(`[sync-concept2] Detail fetch failed for c2_id=${c2Id}: ${detailRes.status}`);
          detailErrors++;
          return;
        }

        const rawDetail = await detailRes.text();

        // Log the complete raw JSON of the first detail response
        if (!firstDetailLogged) {
          firstDetailLogged = true;
          console.log(`[sync-concept2] FIRST DETAIL RAW JSON (c2_id=${c2Id}):`, rawDetail);
        }

        let detailJson: any;
        try { detailJson = JSON.parse(rawDetail); }
        catch (e) {
          console.error(`[sync-concept2] Detail JSON parse error for c2_id=${c2Id}:`, e);
          detailErrors++;
          return;
        }

        // Concept2 wraps single-result responses in { data: { ... } }
        const d = detailJson.data ?? detailJson;

        console.log(`[sync-concept2] Detail top-level keys for c2_id=${c2Id}: ${Object.keys(d).join(", ")}`);
        console.log(`[sync-concept2] splits field: ${JSON.stringify(d.splits ?? d.intervals ?? "NOT FOUND").substring(0, 500)}`);

        // Derive best split from splits array (lowest pace value)
        const splits: any[] = d.splits ?? [];
        let bestSplitDeciseconds: number | null = null;
        for (const s of splits) {
          const pace = s.pace ?? s.split ?? null;
          if (pace != null && (bestSplitDeciseconds == null || pace < bestSplitDeciseconds)) {
            bestSplitDeciseconds = pace;
          }
        }

        // Build the detail update object and log it
        const detailUpdate: Record<string, any> = {
          stroke_rate: d.avg_stroke_rate ?? d.stroke_rate ?? null,
          max_heart_rate: d.max_heart_rate ?? null,
          min_heart_rate: d.min_heart_rate ?? null,
          drag_factor: d.avg_drag_factor ?? d.drag_factor ?? null,
          cal_hour: d.cal_hour ?? d.calories_per_hour ?? null,
          work_per_stroke: d.work_per_stroke ?? null,
          avg_watts: d.watts ?? d.avg_watts ?? null,
          split_best: bestSplitDeciseconds != null ? decisecondsToPgInterval(bestSplitDeciseconds) : null,
          intervals: splits.length > 0 ? JSON.stringify(splits) : null,
          detail_fetched_at: new Date().toISOString(),
        };

        console.log(`[sync-concept2] MAPPED DETAIL for c2_id=${c2Id}:`, JSON.stringify(detailUpdate));

        const { error: updateErr } = await supabase.from("erg_workouts")
          .update(detailUpdate)
          .eq("id", dbId);

        if (updateErr) {
          console.error(`[sync-concept2] Detail update error for ${dbId}:`, JSON.stringify(updateErr));
          detailErrors++;
          return;
        }

        // Insert splits into erg_workout_splits
        if (splits.length > 0) {
          const splitRows = splits.map((s: any, idx: number) => ({
            workout_id: dbId,
            split_number: idx + 1,
            distance: s.distance ?? null,
            time_seconds: s.time != null ? s.time / 10 : null,
            pace_deciseconds: s.pace ?? s.split ?? null,
            stroke_rate: s.stroke_rate ?? null,
            avg_stroke_rate: s.avg_stroke_rate ?? null,
            calories: s.calories ?? null,
            cal_per_hour: s.cal_per_hour ?? s.calories_per_hour ?? null,
            heart_rate_avg: s.heart_rate?.average ?? s.avg_heart_rate ?? null,
            heart_rate_min: s.heart_rate?.min ?? s.min_heart_rate ?? null,
            heart_rate_max: s.heart_rate?.max ?? s.max_heart_rate ?? null,
            drag_factor: s.avg_drag_factor ?? s.drag_factor ?? null,
            rest_time_seconds: s.rest_time != null ? s.rest_time / 10 : null,
            finish: s.finish ?? false,
          }));

          console.log(`[sync-concept2] Inserting ${splitRows.length} splits for workout ${dbId}. First split:`, JSON.stringify(splitRows[0]));

          const { error: splitsErr } = await supabase
            .from("erg_workout_splits")
            .upsert(splitRows, { onConflict: "workout_id,split_number", ignoreDuplicates: false });

          if (splitsErr) {
            console.error(`[sync-concept2] Splits upsert error for workout ${dbId}:`, JSON.stringify(splitsErr));
          } else {
            console.log(`[sync-concept2] Splits saved OK for workout ${dbId}`);
          }
        } else {
          console.log(`[sync-concept2] No splits array found for c2_id=${c2Id}. Keys present: ${Object.keys(d).join(", ")}`);
        }

        detailFetched++;
      }));
    }

    console.log(`[sync-concept2] Detail: fetched=${detailFetched} errors=${detailErrors}`);

    // ── Step 5: Update sync timestamps ───────────────────────────────────────
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
        detail_fetched: detailFetched,
        detail_errors: detailErrors,
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
