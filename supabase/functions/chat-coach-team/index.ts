import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logUsage, TTL } from "../_shared/cache.ts";
import {
  chatCacheKey,
  getCachedChat,
  replayAsSSE,
  instrumentAnthropicStream,
} from "../_shared/streamCache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FN = "chat-coach-team";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { coach_id, team_id, messages } = await req.json();
    if (!coach_id || !team_id) {
      return new Response(JSON.stringify({ error: "Missing coach_id or team_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError(corsHeaders, 400, "Missing messages");
    }

    // Gather team context in parallel
    const [teamRes, membersRes, ergRes, onwaterRes, seatRaceRes, lineupRes, attendanceRes, wellnessRes] =
      await Promise.all([
        supabase.from("teams").select("name, description").eq("id", team_id).maybeSingle(),
        supabase.from("team_members").select(`
          user_id,
          profile:profiles(id, full_name, username, best_2k_seconds, best_6k_seconds, weight, height, age)
        `).eq("team_id", team_id),
        supabase.from("erg_workouts")
          .select("user_id, workout_date, workout_type, distance, avg_split, duration")
          .in("user_id", (await supabase.from("team_members").select("user_id").eq("team_id", team_id)).data?.map((m: any) => m.user_id) ?? [])
          .order("workout_date", { ascending: false })
          .limit(200),
        supabase.from("on_water_results" as any)
          .select("*")
          .eq("team_id", team_id)
          .order("result_date", { ascending: false })
          .limit(50),
        supabase.from("seat_race_sessions" as any)
          .select("*")
          .eq("team_id", team_id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("published_lineups" as any)
          .select("boat_name, published_at, lineup_data")
          .eq("team_id", team_id)
          .order("published_at", { ascending: false })
          .limit(10),
        supabase.from("attendance_records" as any)
          .select("user_id, practice_date, status")
          .eq("team_id", team_id)
          .gte("practice_date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0])
          .order("practice_date", { ascending: false }),
        supabase.from("wellness_checkins" as any)
          .select("user_id, checkin_date, fatigue_level, soreness_level, sleep_hours, mood")
          .eq("team_id", team_id)
          .gte("checkin_date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
          .order("checkin_date", { ascending: false }),
      ]);

    const team = teamRes.data;
    const members = membersRes.data || [];
    const ergWorkouts = ergRes.data || [];
    const onWater = onwaterRes.data || [];
    const seatRaces = seatRaceRes.data || [];
    const lineups = lineupRes.data || [];
    const attendance = attendanceRes.data || [];
    const wellness = wellnessRes.data || [];

    // Build per-athlete summaries
    const athleteSummaries = members.map((m: any) => {
      const p = m.profile;
      const name = p?.full_name || p?.username || "Unknown";
      const athleteErg = ergWorkouts.filter((w: any) => w.user_id === m.user_id);
      const best2k = p?.best_2k_seconds ? `${Math.floor(p.best_2k_seconds/60)}:${String(Math.round(p.best_2k_seconds%60)).padStart(2,"0")}` : "N/A";
      const best6k = p?.best_6k_seconds ? `${Math.floor(p.best_6k_seconds/60)}:${String(Math.round(p.best_6k_seconds%60)).padStart(2,"0")}` : "N/A";
      const recentErg = athleteErg[0];
      const athleteAttendance = attendance.filter((a: any) => a.user_id === m.user_id);
      const attendanceRate = athleteAttendance.length > 0
        ? Math.round((athleteAttendance.filter((a: any) => a.status === "present").length / athleteAttendance.length) * 100)
        : null;
      const recentWellness = wellness.filter((w: any) => w.user_id === m.user_id)[0];

      return `  - ${name}: best 2K ${best2k}, best 6K ${best6k}${
        recentErg ? `, last workout ${recentErg.workout_date} (${recentErg.workout_type} ${recentErg.distance}m, split ${recentErg.avg_split})` : ""
      }${attendanceRate !== null ? `, attendance ${attendanceRate}%` : ""}${
        recentWellness ? `, latest wellness: fatigue ${recentWellness.fatigue_level}/10, soreness ${recentWellness.soreness_level}/10, sleep ${recentWellness.sleep_hours}h` : ""
      }`;
    }).join("\n");

    const systemPrompt = `You are the CrewSync Coach AI — an expert rowing head coach assistant with access to full team data.

TEAM: ${team?.name || "Unknown"}
${team?.description ? `Description: ${team.description}` : ""}

ROSTER (${members.length} athletes):
${athleteSummaries || "No athletes on roster"}

RECENT ON-WATER RESULTS:
${onWater.length ? onWater.slice(0, 10).map((r: any) => `  - ${r.result_date || "Unknown date"}: ${r.boat_name || "boat"} — ${r.split_per_500 ? `split ${r.split_per_500}` : ""} ${r.notes || ""}`).join("\n") : "None logged"}

RECENT SEAT RACES:
${seatRaces.length ? seatRaces.slice(0, 5).map((s: any) => `  - ${s.created_at?.split("T")[0]}: ${s.athlete_a_name || ""} vs ${s.athlete_b_name || ""} — winner: ${s.winner_name || "TBD"}`).join("\n") : "None logged"}

RECENT PUBLISHED LINEUPS:
${lineups.length ? lineups.map((l: any) => `  - ${l.published_at?.split("T")[0]}: ${l.boat_name}`).join("\n") : "None"}

INSTRUCTIONS:
- Answer with specific athlete names and actual data from the context above
- Be direct and decisive — coaches need clear recommendations
- When recommending lineups, justify with data
- Flag athletes showing overtraining signs (high fatigue/soreness + poor attendance)
- Use rowing terminology naturally
- Format responses clearly with markdown
- Keep answers focused and finish your thought within ~700 words
- End with: "⚠️ AI analysis is based on logged data only. Use your coaching judgment."`;

    // Cache-before-call. The key covers the full message history AND the team
    // context, so a reply is only ever reused for an identical conversation
    // against identical team data — a new workout, lineup or wellness entry
    // changes the prefix and therefore the key. Short TTL.
    const cacheKey = chatCacheKey(FN, systemPrompt, messages);
    const cachedText = await getCachedChat(supabase, cacheKey);
    if (cachedText) {
      await logUsage(supabase, {
        user_id: coach_id ?? null,
        function_name: FN,
        model: MODEL,
        cache_hit: true,
      });
      return new Response(replayAsSSE(cachedText, MODEL), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after the cache
    // check — a cache hit is free and must never be blocked).
    const blocked = await preflight(supabase, { userId: coach_id ?? null, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        // claude-sonnet-5 runs ADAPTIVE THINKING when this field is omitted,
        // and thinking tokens are billed and counted against max_tokens. At a
        // 1000-token budget that could consume the whole reply. Chat needs low
        // latency and a visible answer, not reasoning — so disable it.
        thinking: { type: "disabled" },
        // Prompt caching: this system block is the whole team roster plus 90
        // days of attendance and wellness — comfortably the largest prompt in
        // the codebase and re-sent verbatim on every turn of a conversation.
        // Caching it turns those repeats into 0.1x cache reads. The breakpoint
        // sits on the last block of the stable prefix; the volatile message
        // history follows it.
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", t);
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    if (!anthropicResponse.body) {
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service returned an empty stream");
    }

    // Pass the SSE through untouched while accumulating the answer and the real
    // token usage; the cache write and usage log happen when the stream ends.
    const instrumented = instrumentAnthropicStream(anthropicResponse.body, {
      supabase,
      cacheKey,
      functionName: FN,
      model: MODEL,
      userId: coach_id ?? null,
      ttlSeconds: TTL.HOUR,
      onUsage: (total) => recordUsage(supabase, coach_id ?? null, total),
    });

    return new Response(instrumented, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("chat-coach-team error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
