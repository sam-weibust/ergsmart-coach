import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory cache
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Serve from cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cache.data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const [usersRes, workoutsRes, metersRes, twoKRes] = await Promise.all([
    // Total users
    supabase.rpc("get_user_count"),

    // Total workouts
    supabase.from("erg_workouts").select("id", { count: "exact", head: true }),

    // Total meters
    supabase.rpc("get_total_meters"),

    // Average best 2k from verified sources only
    supabase.rpc("get_avg_verified_2k"),
  ]);

  const total_users = (usersRes.data as number) ?? 0;
  const total_workouts = workoutsRes.count ?? 0;

  const rawMeters = (metersRes.data as number) ?? 0;
  const total_meters =
    rawMeters >= 1_000_000
      ? `${(rawMeters / 1_000_000).toFixed(1)}M`
      : rawMeters >= 1_000
      ? `${(rawMeters / 1_000).toFixed(0)}K`
      : String(rawMeters);

  const avgSec = twoKRes.data as number | null;
  let average_2k = "---";
  if (avgSec && avgSec > 0) {
    const m = Math.floor(avgSec / 60);
    const s = Math.round(avgSec % 60);
    average_2k = `${m}:${s.toString().padStart(2, "0")}`;
  }

  const data = { total_users, average_2k, total_workouts, total_meters };
  cache = { data, ts: Date.now() };

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
