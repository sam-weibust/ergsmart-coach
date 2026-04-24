import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // ── Step 1: Load user's manually-deleted external_ids ────────────────────
    const { data: deletedRows, error: deletedErr } = await supabase
      .from("deleted_c2_workouts")
      .select("external_id")
      .eq("user_id", user_id);
    if (deletedErr) console.error("[sync-concept2] deleted_c2_workouts query error:", JSON.stringify(deletedErr));
    const deletedSet = new Set((deletedRows ?? []).map((r: any) => r.external_id));
    console.log(`[sync-concept2] deleted_c2_workouts: ${deletedSet.size} entries, error=${deletedErr?.message ?? "none"}`);

    // ── Step 2: Fetch full paginated list from Concept2 ───────────────────────
    let allWorkouts: any[] = [];
    let page = 1;
    let apiError: string | null = null;
    let paginationComplete = false;

    while (true) {
      const url = `https://log.concept2.com/api/users/me/results?per_page=100&page=${page}`;
      console.log(`[sync-concept2] Fetching list page=${page}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
      const rawBody = await res.text();

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
      if (!json.meta?.pagination?.next) { paginationComplete = true; break; }
      page++;
    }

    console.log(`[sync-concept2] Total fetched: ${allWorkouts.length}, paginationComplete=${paginationComplete}`);

    // Build set of all C2 external_ids currently in the API (only if full list was retrieved)
    const c2ExternalIds = new Set(allWorkouts.map((w: any) => `c2_${w.id}`));

    // Filter out manually-deleted workouts before import
    const workoutsToImport = allWorkouts.filter((w: any) => !deletedSet.has(`c2_${w.id}`));
    const skippedDeleted = allWorkouts.length - workoutsToImport.length;
    console.log(`[sync-concept2] Filter: total=${allWorkouts.length} toImport=${workoutsToImport.length} skippedDeleted=${skippedDeleted}`);

    // ── Step 3: Upsert basic data ─────────────────────────────────────────────
    // Keep only core columns on the basic upsert — new detail columns are populated
    // in Step 5 (detail fetch) to avoid type-mismatch errors from list-endpoint nulls.
    const basicRows = workoutsToImport.map((w: any) => ({
      user_id,
      external_id: `c2_${w.id}`,
      workout_date: w.date ? w.date.substring(0, 10) : new Date().toLocaleDateString("en-CA"),
      workout_type: w.workout_type ?? w.type ?? "unknown",
      distance: w.distance != null ? Math.round(Number(w.distance)) : null,
      duration: w.time != null ? decisecondsToPgInterval(Number(w.time)) : null,
      avg_split: w.pace != null ? decisecondsToPgInterval(Number(w.pace)) : null,
      avg_heart_rate: w.heart_rate?.average != null ? Math.round(Number(w.heart_rate.average)) : null,
      calories: w.calories_total != null ? Math.round(Number(w.calories_total)) : null,
      notes: w.comments || null,
    }));

    if (basicRows.length > 0) {
      console.log(`[sync-concept2] First basicRow sample:`, JSON.stringify(basicRows[0]));
    }

    let imported = 0;
    let upsertErrorCount = 0;
    for (let i = 0; i < basicRows.length; i += 50) {
      const batch = basicRows.slice(i, i + 50);
      const { error: upsertErr } = await supabase
        .from("erg_workouts")
        .upsert(batch, { onConflict: "user_id,external_id", ignoreDuplicates: false });
      if (upsertErr) {
        console.error(`[sync-concept2] Upsert error batch i=${i}:`, JSON.stringify(upsertErr));
        upsertErrorCount++;
      } else {
        // Count all rows in the batch — upsert may INSERT or UPDATE, Supabase
        // only returns inserted rows from .select(), so count batch size directly.
        imported += batch.length;
        console.log(`[sync-concept2] Upsert batch i=${i} OK — ${batch.length} rows`);
      }
    }
    console.log(`[sync-concept2] Upsert complete: imported=${imported} errorBatches=${upsertErrorCount}`);

    // ── Step 4: Deletion sync — remove workouts deleted from C2 logbook ───────
    let deleted = 0;
    if (paginationComplete && c2ExternalIds.size > 0) {
      // Fetch all C2-sourced external_ids currently stored for this user
      const { data: storedRows } = await supabase
        .from("erg_workouts")
        .select("id, external_id")
        .eq("user_id", user_id)
        .like("external_id", "c2_%");

      const toDelete = (storedRows ?? []).filter(
        (r: any) => r.external_id && !c2ExternalIds.has(r.external_id) && !deletedSet.has(r.external_id)
      );

      if (toDelete.length > 0) {
        console.log(`[sync-concept2] Deleting ${toDelete.length} workouts removed from C2:`, toDelete.map((r: any) => r.external_id));
        const { error: deleteErr } = await supabase
          .from("erg_workouts")
          .delete()
          .in("id", toDelete.map((r: any) => r.id));
        if (deleteErr) {
          console.error("[sync-concept2] Deletion sync error:", JSON.stringify(deleteErr));
        } else {
          deleted = toDelete.length;
        }
      } else {
        console.log("[sync-concept2] No workouts to delete — C2 logbook matches Supabase");
      }
    }

    // ── Step 5: Fetch full detail for new workouts ────────────────────────────
    const externalIds = basicRows.map(r => r.external_id);

    // Build ID map from all rows
    const { data: allExistingRows } = await supabase
      .from("erg_workouts")
      .select("id, external_id")
      .eq("user_id", user_id)
      .in("external_id", externalIds);
    const c2IdToDbId = new Map((allExistingRows ?? []).map((r: any) => [r.external_id, r.id]));

    // Only fetch detail for workouts that don't yet have workout_data stored
    const { data: needsDetailRows } = await supabase
      .from("erg_workouts")
      .select("id, external_id")
      .eq("user_id", user_id)
      .in("external_id", externalIds)
      .is("workout_data", null);
    const needsDetail = needsDetailRows ?? [];

    console.log(`[sync-concept2] ${needsDetail.length} of ${allExistingRows?.length ?? 0} workouts need detail fetch`);

    const DETAIL_BATCH = 10;
    let detailFetched = 0;
    let detailErrors = 0;
    let firstDetailLogged = false;

    for (let i = 0; i < needsDetail.length; i += DETAIL_BATCH) {
      const batch = needsDetail.slice(i, i + DETAIL_BATCH);
      await Promise.all(batch.map(async (row: any) => {
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

        // Log full raw JSON of the first detail response to verify field names
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

        // Concept2 wraps single results in { data: { ... } }
        const d = detailJson.data ?? detailJson;

        console.log(`[sync-concept2] Detail keys for c2_id=${c2Id}: ${Object.keys(d).join(", ")}`);

        // Build mapped update using actual Concept2 field names
        const detailUpdate: Record<string, any> = {
          // Duration / pace (override basic upsert with detail values if present)
          duration: d.time != null ? decisecondsToPgInterval(d.time) : undefined,
          avg_split: d.pace != null ? decisecondsToPgInterval(d.pace) : undefined,
          time_formatted: d.time_formatted ?? null,

          // Calories — actual field name is calories_total on detail endpoint
          calories: d.calories_total ?? d.cal_total ?? null,
          calories_total: d.calories_total ?? d.cal_total ?? null,

          // Heart rate — nested object: { average, min, max }
          avg_heart_rate: d.heart_rate?.average ?? null,
          heart_rate_average: d.heart_rate?.average ?? null,
          heart_rate_min: d.heart_rate?.min ?? null,
          heart_rate_max: d.heart_rate?.max ?? null,
          max_heart_rate: d.heart_rate?.max ?? null,
          min_heart_rate: d.heart_rate?.min ?? null,

          // Stroke data
          stroke_rate: d.stroke_rate ?? null,
          stroke_rate_average: d.stroke_rate ?? null,
          stroke_count: d.stroke_count ?? null,

          // Machine / effort metrics
          drag_factor: d.drag_factor ?? null,
          work_per_stroke: d.work_per_stroke ?? null,
          avg_watts: d.watts ?? d.avg_watts ?? null,
          cal_hour: d.cal_hour ?? null,

          // Rest (for interval workouts)
          rest_distance: d.rest_distance ?? null,
          rest_time_seconds: d.rest_time != null ? d.rest_time / 10 : null,

          // Raw full objects — preserve everything regardless of workout type
          workout_data: d,
          real_time_data: d.real_time ?? null,

          detail_fetched_at: new Date().toISOString(),
        };

        // Remove undefined values (don't overwrite duration/split if not returned)
        for (const key of Object.keys(detailUpdate)) {
          if (detailUpdate[key] === undefined) delete detailUpdate[key];
        }

        console.log(`[sync-concept2] MAPPED DETAIL for c2_id=${c2Id}:`, JSON.stringify(detailUpdate));
        console.log(`[sync-concept2] workout_data populated=${detailUpdate.workout_data != null}, real_time_data populated=${detailUpdate.real_time_data != null}, splits count=${(detailUpdate.workout_data as any)?.splits?.length ?? 0}`);

        const { error: updateErr } = await supabase.from("erg_workouts")
          .update(detailUpdate)
          .eq("id", dbId);

        if (updateErr) {
          console.error(`[sync-concept2] Detail update error for ${dbId}:`, JSON.stringify(updateErr));
          detailErrors++;
          return;
        }

        // Also insert into erg_workout_splits if the detail contains split-level data
        // (Concept2 may return this as splits, real_time, or workout_intervals depending on type)
        const splits: any[] = d.splits ?? d.workout_intervals ?? [];
        if (splits.length > 0) {
          const splitRows = splits.map((s: any, idx: number) => ({
            workout_id: dbId,
            split_number: idx + 1,
            distance: s.distance ?? null,
            time_seconds: s.time != null ? s.time / 10 : null,
            pace_deciseconds: s.pace ?? s.split ?? null,
            stroke_rate: s.stroke_rate ?? null,
            avg_stroke_rate: s.avg_stroke_rate ?? s.stroke_rate ?? null,
            calories: s.calories ?? s.calories_total ?? null,
            cal_per_hour: s.cal_per_hour ?? s.cal_hour ?? null,
            heart_rate_avg: s.heart_rate?.average ?? null,
            heart_rate_min: s.heart_rate?.min ?? null,
            heart_rate_max: s.heart_rate?.max ?? null,
            drag_factor: s.drag_factor ?? null,
            rest_time_seconds: s.rest_time != null ? s.rest_time / 10 : null,
            finish: s.finish ?? false,
          }));

          console.log(`[sync-concept2] Inserting ${splitRows.length} splits for workout ${dbId}`);

          const { error: splitsErr } = await supabase
            .from("erg_workout_splits")
            .upsert(splitRows, { onConflict: "workout_id,split_number", ignoreDuplicates: false });

          if (splitsErr) {
            console.error(`[sync-concept2] Splits upsert error for workout ${dbId}:`, JSON.stringify(splitsErr));
          }
        } else {
          console.log(`[sync-concept2] No splits/intervals for c2_id=${c2Id} (workout_type=${d.workout_type})`);
        }

        detailFetched++;
      }));
    }

    console.log(`[sync-concept2] Detail: fetched=${detailFetched} errors=${detailErrors}`);

    // ── Step 6: Upsert benchmark erg_scores from verified C2 workouts ────────
    const BENCHMARK_MAP: Record<number, string> = {
      2000: "2k", 5000: "5k", 6000: "6k", 10000: "10k",
    };
    const TOLERANCE = 15;
    const SECS_IN_HOUR = 3600;

    // Get user weight for w/kg calculation
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("weight_kg")
      .eq("id", user_id)
      .maybeSingle();
    const weight_kg: number | null = (profileRow as any)?.weight_kg ?? null;

    const benchmarkRows: any[] = [];
    for (const w of workoutsToImport) {
      const dist = w.distance != null ? Math.round(Number(w.distance)) : null;
      const timeDecisecs = w.time != null ? Number(w.time) : null; // C2 time is in deciseconds
      if (!dist || !timeDecisecs) continue;

      const timeSecs = timeDecisecs / 10;
      let testType: string | null = null;

      // Check fixed distances
      for (const [bd, tt] of Object.entries(BENCHMARK_MAP)) {
        if (Math.abs(dist - Number(bd)) <= TOLERANCE) { testType = tt; break; }
      }
      // Check 60-minute piece (time ≈ 3600s ± 30s)
      if (!testType && Math.abs(timeSecs - SECS_IN_HOUR) <= 30) testType = "60min";

      if (!testType) continue;

      const avgSplit = timeSecs > 0 && dist > 0 ? (timeSecs / dist) * 500 : null;
      // splitToWatts: watts = 2.80/(split_500m_seconds^3)
      const watts = avgSplit ? Math.round(2.80 / Math.pow(avgSplit / 500, 3)) : null;
      const wattsPerKg = watts && weight_kg ? Math.round((watts / weight_kg) * 1000) / 1000 : null;

      benchmarkRows.push({
        user_id,
        test_type: testType,
        time_seconds: testType === "60min" ? null : Math.round(timeSecs),
        total_meters: testType === "60min" ? dist : null,
        avg_split_seconds: avgSplit,
        watts,
        watts_per_kg: wattsPerKg,
        recorded_at: w.date ? w.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
        source: "concept2_sync",
        is_verified: true,
        to_leaderboard: true,
        notes: w.comments || null,
      });
    }

    if (benchmarkRows.length > 0) {
      console.log(`[sync-concept2] Upserting ${benchmarkRows.length} benchmark erg_scores`);
      // No unique constraint on (user_id, test_type, recorded_at) — insert only, duplicates will stack
      // Use upsert keyed on (user_id, test_type, recorded_at) if constraint exists, else insert
      const { error: ergScoreErr } = await supabase
        .from("erg_scores")
        .insert(benchmarkRows);
      if (ergScoreErr) {
        console.error("[sync-concept2] erg_scores insert error:", JSON.stringify(ergScoreErr));
      }
    }

    // ── Step 7: Update sync timestamps ───────────────────────────────────────
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
        deleted,
        detail_fetched: detailFetched,
        detail_errors: detailErrors,
        ...(apiError ? { api_error: apiError } : {}),
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
