import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";
import { extractJson } from "../_shared/extractJson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "generate-team-plan";

// ---------------------------------------------------------------------------
// Chunked generation
//
// One call for the whole plan is output-size bound, not time bound: 12 weeks x
// 7 detailed days overflowed max_tokens 16000, the JSON came back cut off, and
// JSON.parse threw ("Failed to parse Claude response as JSON") after ~102s.
// 4 weeks fit in one call and worked, which is what fixed the window at 4.
//
// Chunks run CONCURRENTLY (Promise.all), so wall time is the slowest chunk
// (~50s) rather than the sum (~150s, past the isolate budget). Fixed 4-week
// windows are what makes that possible: every chunk's range is known up front
// instead of depending on how many weeks the previous chunk returned.
//
// TRADE-OFF: parallel chunks cannot thread `previous_context` from the chunk
// before them the way generate-team-training-plan's serial caller does. Instead
// every chunk is handed the SAME plan-level context — team, goal, goal date,
// intensity, total week count, the periodisation phase map for the whole plan,
// and the 3-week loading position of each of its own weeks. That is the only
// information the serial thread was actually carrying, so the chunks stay
// coherent (week 5 knows it is a "hard" week inside the Build phase of a
// 12-week plan) without depending on each other's output.
//
// A 4-week request produces exactly one chunk and therefore behaves exactly as
// it does today, apart from the lower per-call token cap.
// ---------------------------------------------------------------------------
const CHUNK_SIZE = 4;
const MAX_TOKENS_PER_CHUNK = 8000;

// How much of each raw model reply to write to the function logs. Enough to see
// where a truncated chunk stopped, small enough not to flood the log drain.
const RAW_LOG_CHARS = 1500;

const DEFAULT_SYSTEM_PROMPT = `Expert rowing coach. Generate a structured training plan.

ZONES (pace = offset from athlete 2k split, per 500m):
UT2: 2k+20-25s, rate 16-20 — aerobic base
UT1: 2k+15-20s, rate 18-24 — moderate aerobic, rate ladders
AT: 2k+4-9s, rate 26-28 — anaerobic threshold
TR1: 2k+0-4s, rate 26-32 — threshold, hard pieces
TR2: below 2k pace, rate 32+ — race specific, peak phase only, within 6 weeks of race

WEEKLY STRUCTURE — CRITICAL:
- Exactly ONE required session per day.
- Lifting is ALWAYS optional; never a standalone required session Mon-Fri.
- Saturday may have lifting as the required session when erg is the optional.
- Sunday is ALWAYS OFF: no required and no optional session.

3-WEEK LOADING CYCLE: wk1 easy, wk2 medium, wk3 hard, wk4 recovery at 50% volume.

Every session must specify piece duration/distance, rest interval, stroke rate, warmup, cooldown. Express paces as 2k +/- seconds, never absolute splits.

Return ONLY valid JSON. No explanation, no markdown.`;

/**
 * True when the plan actually contains weeks. Mirrors the shapes
 * personalizePlanData accepts. Used as the cache guard on both sides so a
 * degenerate parse (`{}`, or a model reply with no JSON) is never written to
 * the cache and never served from it.
 */
function hasPlanWeeks(p: any): boolean {
  const weeks = Array.isArray(p?.plan) ? p.plan : Array.isArray(p?.weeks) ? p.weeks : Array.isArray(p) ? p : [];
  return weeks.length > 0;
}

/** Fixed 4-week windows covering 1..totalWeeks. 12 -> [1-4, 5-8, 9-12]; 4 -> [1-4]. */
function chunkRanges(totalWeeks: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 1; start <= totalWeeks; start += CHUNK_SIZE) {
    ranges.push({ start, end: Math.min(start + CHUNK_SIZE - 1, totalWeeks) });
  }
  return ranges;
}

/**
 * Plan-wide periodisation map, computed once and given to every chunk.
 *
 * This is the piece that replaces `previous_context`. A chunk generating weeks
 * 9-12 cannot see weeks 1-8, but it can see that weeks 1-4 were Base, 5-7 were
 * Build and 8-11 are Peak with week 12 a taper — which is what it needed from
 * them. Deterministic from totalWeeks alone, so all chunks agree by construction.
 */
function phaseFor(week: number, totalWeeks: number): string {
  if (totalWeeks <= 4) return "Base";
  const base = Math.max(1, Math.floor(totalWeeks * 0.4));
  const build = Math.max(1, Math.floor(totalWeeks * 0.3));
  const peakEnd = totalWeeks - 1; // final week always tapers
  if (week <= base) return "Base";
  if (week <= base + build) return "Build";
  if (week <= peakEnd) return "Peak";
  return "Taper";
}

function phaseMap(totalWeeks: number): string {
  const lines: string[] = [];
  let runStart = 1;
  for (let w = 2; w <= totalWeeks + 1; w++) {
    if (w > totalWeeks || phaseFor(w, totalWeeks) !== phaseFor(runStart, totalWeeks)) {
      const end = w - 1;
      lines.push(
        runStart === end
          ? `Week ${runStart}: ${phaseFor(runStart, totalWeeks)}`
          : `Weeks ${runStart}-${end}: ${phaseFor(runStart, totalWeeks)}`,
      );
      runStart = w;
    }
  }
  return lines.join("\n");
}

/** wk1 easy, wk2 medium, wk3 hard, wk4 recovery — repeating over the whole plan. */
const LOAD_CYCLE = ["easy", "medium", "hard", "recovery (50% volume)"];
function loadFor(week: number): string {
  return LOAD_CYCLE[(week - 1) % 4];
}

/**
 * Reject a week that is present but hollow. The old single-call path could not
 * produce this (it either parsed or threw), but a chunk that stops early can,
 * and a plan with an empty `days` array renders as a blank week in the athlete UI.
 */
function weekIsUsable(week: any): boolean {
  return Boolean(week) && Array.isArray(week.days) && week.days.length > 0;
}

function formatPace(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}/500m`;
}

function personalizeSplit(splitStr: string, athlete2kSeconds: number): string {
  if (!splitStr) return splitStr;
  const match = splitStr.match(/2K([+-])(\d+)s?\/500m/i);
  if (!match) return splitStr;
  const sign = match[1];
  const offset = parseInt(match[2]);
  const basePer500 = athlete2kSeconds / 4;
  const finalPace = sign === "+" ? basePer500 + offset : basePer500 - offset;
  return `${formatPace(finalPace)} (2K${sign}${offset}s/500m)`;
}

function personalizePlanData(planData: any, athlete2kSeconds: number): any {
  const cloned = JSON.parse(JSON.stringify(planData));
  const weeks = cloned.plan || cloned.weeks || (Array.isArray(cloned) ? cloned : []);
  for (const week of weeks) {
    for (const day of (week.days || [])) {
      if (day.required && day.required.targetSplit) {
        day.required.targetSplit = personalizeSplit(day.required.targetSplit, athlete2kSeconds);
      }
      if (day.optional && day.optional.targetSplit) {
        day.optional.targetSplit = personalizeSplit(day.optional.targetSplit, athlete2kSeconds);
      }
    }
  }
  return cloned;
}

async function personalizePlanForTeam(
  teamId: string,
  planData: any,
  planTitle: string,
  teamPlanId: string,
  supabase: any,
): Promise<number> {
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, profile:profiles(id, full_name)")
    .eq("team_id", teamId);

  if (!members || members.length === 0) return 0;

  const FALLBACK_2K = 450;
  let updated = 0;

  for (const member of members) {
    const userId = member.user_id;

    const { data: scores } = await supabase
      .from("erg_scores")
      .select("time_seconds")
      .eq("user_id", userId)
      .eq("test_type", "2k")
      .not("time_seconds", "is", null)
      .order("time_seconds", { ascending: true })
      .limit(1);

    const best2k = scores && scores.length > 0 ? scores[0].time_seconds : FALLBACK_2K;
    const personalized = personalizePlanData(planData, best2k);

    await supabase
      .from("workout_plans")
      .delete()
      .eq("user_id", userId)
      .eq("coach_plan_id", teamPlanId);

    await supabase.from("workout_plans").insert({
      user_id: userId,
      title: planTitle,
      workout_data: personalized,
      coach_plan_id: teamPlanId,
      is_coach_assigned: true,
    });

    updated++;
  }

  return updated;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { team_id, coach_id, weeks, intensity, goal, goal_date, use_custom_philosophy } = body;

    if (!team_id || !coach_id || !weeks || !intensity || !goal) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: team_id, coach_id, weeks, intensity, goal" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch team name
    const { data: team } = await supabase
      .from("teams")
      .select("name")
      .eq("id", team_id)
      .single();

    const teamName = team?.name || "Team";

    // Determine system prompt
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let source: "generated" | "custom" = "generated";

    if (use_custom_philosophy) {
      const { data: philosophy } = await supabase
        .from("team_training_philosophy")
        .select("philosophy")
        .eq("team_id", team_id)
        .maybeSingle();

      if (philosophy?.philosophy) {
        const philosophyText = typeof philosophy.philosophy === "string"
          ? philosophy.philosophy
          : JSON.stringify(philosophy.philosophy);
        systemPrompt = `You are an expert rowing coach generating a training plan following the coach's custom training philosophy below. Return ONLY valid JSON with no explanation or markdown.\n\nCOACH'S TRAINING PHILOSOPHY:\n${philosophyText}`;
        source = "custom";
      }
    }

    const weekCount = Math.floor(Number(weeks));
    if (!Number.isFinite(weekCount) || weekCount < 1 || weekCount > 52) {
      return new Response(
        JSON.stringify({ error: `weeks must be a whole number between 1 and 52 (got ${weeks})` }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // Shared plan-level context. Byte-identical across every chunk of this
    // request — it is what keeps concurrently-generated chunks coherent in the
    // absence of previous_context threading (see the CHUNK_SIZE comment).
    const goalDateText = goal_date ? ` Target date: ${goal_date}.` : "";
    const planContext = `Team: ${teamName}
Plan length: ${weekCount} weeks, numbered 1 through ${weekCount}.
Intensity: ${intensity}
Training goal: ${goal}${goalDateText}

PERIODISATION FOR THE WHOLE PLAN (every week you write must match its phase):
${phaseMap(weekCount)}

3-WEEK LOADING CYCLE runs continuously across the whole plan: week 1 easy,
week 2 medium, week 3 hard, week 4 recovery at 50% volume, then repeating.`;

    const SCHEMA_BLOCK = `{
  "plan": [
    {
      "week": number,
      "phase": string,
      "days": [
        {
          "day_name": string,
          "required": {
            "session_type": string,
            "zone": string,
            "title": string,
            "description": string,
            "targetSplit": string,
            "rate": string,
            "warmup": string,
            "cooldown": string,
            "restPeriods": string
          } or null,
          "optional": {
            "session_type": string,
            "title": string,
            "description": string
          } or null
        }
      ]
    }
  ]
}`;

    const ranges = chunkRanges(weekCount);

    const chunkPrompt = (start: number, end: number): string => {
      const count = end - start + 1;
      const perWeek: string[] = [];
      for (let w = start; w <= end; w++) {
        perWeek.push(`  Week ${w}: phase ${phaseFor(w, weekCount)}, loading ${loadFor(w)}`);
      }
      return `${planContext}

YOUR TASK: generate ONLY weeks ${start} through ${end} of this ${weekCount}-week plan.
Do not generate any other week. Number them exactly ${start} through ${end}.

${perWeek.join("\n")}

Each week must contain all 7 days (Monday through Sunday) in order.

Return valid JSON matching this schema exactly, containing EXACTLY ${count} week object(s):
${SCHEMA_BLOCK}

Express all pace targets as 2K±Xs/500m format. Return ONLY the JSON object — no
markdown fences, no explanation. If space is tight, compress descriptions, but
never omit a week or a day.`;
    };

    // Cache the MODEL OUTPUT (the combined plan JSON), not the HTTP response.
    // The response carries a freshly-inserted team_plan_id and an athlete count;
    // replaying those would hand back a row that may have been deleted and would
    // skip assigning the plan to athletes who joined since. Key is the exact
    // model input (system prompt + shared plan context + week count), so it is
    // deterministic by construction and picks up team-name and philosophy edits
    // without a separate key field. It is keyed on the SHARED context rather
    // than a single user message because the request now issues several: the
    // per-chunk prompts are derived from planContext + weekCount, so those two
    // fully determine every call this request makes.
    // coach_id is deliberately excluded: it does not shape the plan, so two
    // coaches on the same team share the entry.
    const cacheKey = `generate-team-plan_${hashKey({ system: systemPrompt, context: planContext, weeks: weekCount })}`;
    const cachedPlan = await getCached(supabase, cacheKey);
    const cachedUsable = hasPlanWeeks(cachedPlan) &&
      Array.isArray((cachedPlan as any)?.plan) &&
      (cachedPlan as any).plan.length === weekCount;
    let planData: any = cachedUsable ? cachedPlan : null;
    const cacheHit = planData !== null;

    if (cacheHit) {
      await logUsage(supabase, {
        user_id: coach_id ?? null,
        function_name: FN,
        model: MODEL,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_hit: true,
      });
    } else {
      // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
      // Runs once for the whole request, not once per chunk.
      const blocked = await preflight(supabase, { userId: coach_id ?? null, functionName: FN, corsHeaders });
      if (blocked) return blocked;

      type ChunkOutcome = {
        start: number;
        end: number;
        weeks: any[] | null;
        tok: ReturnType<typeof tokensFrom>;
        httpError: string | null;
        parseError: string | null;
      };

      const attemptChunk = async (start: number, end: number, attempt: number): Promise<ChunkOutcome> => {
        const label = `weeks ${start}-${end}`;
        const expected = end - start + 1;
        const empty = tokensFrom(null);

        console.log(`${FN}: dispatching chunk ${label} of ${weekCount} (attempt ${attempt})`);

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            // Per CHUNK, not per plan. A 4-week window of detailed sessions
            // lands well inside 8000; the single-call path needed 16000 and
            // still truncated at 12 weeks.
            max_tokens: MAX_TOKENS_PER_CHUNK,
            // Disable adaptive thinking (Sonnet 5 default) so the whole budget
            // goes to the plan JSON.
            thinking: { type: "disabled" },
            system: systemPrompt,
            messages: [{ role: "user", content: chunkPrompt(start, end) }],
          }),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          console.error(`${FN}: chunk ${label} Anthropic HTTP ${resp.status}: ${body.slice(0, 500)}`);
          return { start, end, weeks: null, tok: empty, httpError: `HTTP ${resp.status}`, parseError: null };
        }

        const data = await resp.json();
        const rawText: string = data?.content?.[0]?.text ?? "";
        const tok = tokensFrom(data?.usage);

        // Log the raw reply BEFORE parsing so a future failure is diagnosable
        // from the function logs alone — this is exactly what was missing when
        // 12 weeks started returning "Failed to parse Claude response as JSON".
        console.log(
          `${FN}: chunk ${label} stop_reason=${data?.stop_reason} chars=${rawText.length} ` +
            `out_tokens=${tok.output_tokens} raw[0..${RAW_LOG_CHARS}]=${rawText.slice(0, RAW_LOG_CHARS)}`,
        );

        let parsed: any;
        try {
          // Balanced-brace extractor: tolerant of markdown fences and trailing
          // prose, and it reports truncation as truncation instead of an opaque
          // "Unexpected end of JSON input". It does NOT repair invalid JSON
          // *inside* the balanced braces (e.g. a stray unescaped quote in a
          // description) — that surfaces here as a JSON.parse error even
          // though the response was complete (stop_reason "end_turn"). That
          // case is retried by the caller rather than "fixed" here: patching
          // arbitrary malformed JSON is unreliable, a fresh sample is not.
          parsed = extractJson<any>(rawText);
        } catch (e: any) {
          return {
            start,
            end,
            weeks: null,
            tok,
            httpError: null,
            parseError: `${e?.message ?? e} (stop_reason=${data?.stop_reason}, ${rawText.length} chars)`,
          };
        }

        const got = Array.isArray(parsed?.plan)
          ? parsed.plan
          : Array.isArray(parsed?.weeks)
          ? parsed.weeks
          : null;

        if (!got) {
          return { start, end, weeks: null, tok, httpError: null, parseError: "response JSON had no `plan` array" };
        }
        if (got.length !== expected) {
          return {
            start,
            end,
            weeks: null,
            tok,
            httpError: null,
            parseError: `expected ${expected} week object(s), got ${got.length}`,
          };
        }
        const hollow = got.findIndex((w: any) => !weekIsUsable(w));
        if (hollow !== -1) {
          return {
            start,
            end,
            weeks: null,
            tok,
            httpError: null,
            parseError: `week ${start + hollow} has no days array`,
          };
        }

        // Renumber against this chunk's own window. The model is asked for the
        // right numbers, but the combine step must not depend on it getting
        // them right — position within a fixed window is authoritative.
        const weeksOut = got.map((w: any, i: number) => ({ ...w, week: start + i }));
        console.log(`${FN}: chunk ${label} ok — ${weeksOut.length} week(s) (attempt ${attempt})`);
        return { start, end, weeks: weeksOut, tok, httpError: null, parseError: null };
      };

      // A chunk that comes back with a parseError (malformed-but-complete
      // JSON, wrong week count, or a hollow week) had a normal HTTP response
      // — the model just produced bad content on that sample. Observed live:
      // weeks 5-8 of a 12-week plan came back with stop_reason "end_turn" (not
      // truncated) but JSON.parse still failed mid-object, most likely an
      // unescaped quote inside a session description. One retry against a
      // fresh sample clears this most of the time. HTTP errors are NOT
      // retried here — those already have their own failure path below.
      const MAX_ATTEMPTS_PER_CHUNK = 2;
      const runChunk = async (start: number, end: number): Promise<ChunkOutcome> => {
        let outcome = await attemptChunk(start, end, 1);
        let attempt = 1;
        while (outcome.parseError && attempt < MAX_ATTEMPTS_PER_CHUNK) {
          attempt++;
          console.warn(
            `${FN}: chunk weeks ${start}-${end} attempt ${attempt - 1} failed (${outcome.parseError}) — retrying (attempt ${attempt}/${MAX_ATTEMPTS_PER_CHUNK})`,
          );
          const retryOutcome = await attemptChunk(start, end, attempt);
          // Token usage from every attempt counts toward accounting, even a
          // discarded failed one — it was still real API spend.
          retryOutcome.tok = {
            input_tokens: outcome.tok.input_tokens + retryOutcome.tok.input_tokens,
            output_tokens: outcome.tok.output_tokens + retryOutcome.tok.output_tokens,
            cache_creation_input_tokens:
              outcome.tok.cache_creation_input_tokens + retryOutcome.tok.cache_creation_input_tokens,
            cache_read_input_tokens: outcome.tok.cache_read_input_tokens + retryOutcome.tok.cache_read_input_tokens,
          };
          outcome = retryOutcome;
        }
        return outcome;
      };

      // All chunks in flight at once: wall time is the slowest chunk, not the
      // sum. runChunk never rejects, so Promise.all always settles and every
      // chunk's token usage is accounted for even when a sibling failed.
      const outcomes = await Promise.all(ranges.map((r) => runChunk(r.start, r.end)));

      // --- Accounting, before any failure path returns --------------------
      const totals = outcomes.reduce(
        (acc, o) => ({
          input_tokens: acc.input_tokens + o.tok.input_tokens,
          output_tokens: acc.output_tokens + o.tok.output_tokens,
          cache_creation_input_tokens: acc.cache_creation_input_tokens + o.tok.cache_creation_input_tokens,
          cache_read_input_tokens: acc.cache_read_input_tokens + o.tok.cache_read_input_tokens,
        }),
        { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      );
      await logUsage(supabase, {
        user_id: coach_id ?? null,
        function_name: FN,
        model: MODEL,
        ...totals,
        cache_hit: false,
      });
      await recordUsage(supabase, coach_id, totals.input_tokens + totals.output_tokens);

      const httpFailures = outcomes.filter((o) => o.httpError);
      if (httpFailures.length > 0) {
        await recordApiError(supabase, FN);
        console.error(
          `${FN}: ${httpFailures.length}/${outcomes.length} chunk(s) failed upstream: ` +
            httpFailures.map((o) => `weeks ${o.start}-${o.end}: ${o.httpError}`).join("; "),
        );
        return jsonError(corsHeaders, 503, "AI service unavailable");
      }
      await recordApiSuccess(supabase, FN);

      // Fail loudly and specifically. The old path collapsed every failure into
      // "Failed to parse Claude response as JSON" with no indication of which
      // part of the plan broke.
      const parseFailures = outcomes.filter((o) => o.parseError);
      if (parseFailures.length > 0) {
        throw new Error(
          `Plan generation failed for ${parseFailures.length} of ${outcomes.length} chunk(s): ` +
            parseFailures
              .map(
                (o) =>
                  `chunk ${Math.floor((o.start - 1) / CHUNK_SIZE) + 1}/${outcomes.length} ` +
                  `(weeks ${o.start}-${o.end}) — ${o.parseError}`,
              )
              .join("; "),
        );
      }

      // --- Combine in week order and validate before returning -------------
      const allWeeks: any[] = [];
      for (const o of [...outcomes].sort((a, b) => a.start - b.start)) {
        allWeeks.push(...(o.weeks as any[]));
      }

      if (allWeeks.length !== weekCount) {
        throw new Error(
          `Combined plan has ${allWeeks.length} weeks but ${weekCount} were requested ` +
            `(chunks: ${ranges.map((r) => `${r.start}-${r.end}`).join(", ")})`,
        );
      }
      for (let i = 0; i < allWeeks.length; i++) {
        if (allWeeks[i].week !== i + 1) {
          throw new Error(`Combined plan is out of order at position ${i + 1} (week=${allWeeks[i].week})`);
        }
        if (!weekIsUsable(allWeeks[i])) {
          throw new Error(`Combined plan week ${i + 1} has no days array`);
        }
      }

      // Same shape the athlete UI and personalizePlanData already read:
      // { total_weeks, plan: [ { week, phase, days: [ { required: {...} } ] } ] }
      planData = { total_weeks: weekCount, plan: allWeeks };
      console.log(`${FN}: combined ${allWeeks.length} weeks from ${ranges.length} chunk(s)`);

      // Six hours: long enough to absorb retries and duplicate clicks, short
      // enough that a coach who edits the team philosophy and regenerates the
      // same week is not served a plan built on the old one for long.
      await setCached(
        supabase,
        cacheKey,
        planData,
        TTL.SIX_HOURS,
        MODEL,
        totals.input_tokens,
        totals.output_tokens,
      );
    }

    const planTitle = `${weekCount}-Week ${goal} Plan (${intensity})`;
    // Both the frontend "done" state and the athlete UI key off this, so derive
    // it from the plan actually being written rather than the request.
    const totalWeeks = (planData.plan || []).length || planData.total_weeks || weekCount;

    // Insert team_plan
    const { data: teamPlan, error: insertError } = await supabase
      .from("team_plans")
      .insert({
        team_id,
        coach_id,
        title: planTitle,
        source,
        plan_data: planData,
        total_weeks: totalWeeks,
        is_active: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Personalize and push to all athletes
    const athletesUpdated = await personalizePlanForTeam(
      team_id,
      planData,
      planTitle,
      teamPlan.id,
      supabase,
    );

    return new Response(
      JSON.stringify({
        success: true,
        team_plan_id: teamPlan.id,
        athletes_updated: athletesUpdated,
        total_weeks: totalWeeks,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json", "X-Cache": cacheHit ? "HIT" : "MISS" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
