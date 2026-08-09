import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FN = "generate-workout";
const MODEL = "claude-sonnet-5";
const REPAIR_MODEL = "claude-haiku-4-5";

// Chunks are generated CONCURRENTLY over fixed 4-week windows, so total wall
// time is the slowest single chunk (~50-75s) rather than the sum of all of them.
// Supabase kills the isolate at 150s wall clock; the old sequential loop blew
// through that on any plan longer than one chunk.
//
// Fixed windows are what make concurrency possible: each chunk's week range is
// known up front instead of depending on how many weeks the previous chunk
// actually returned. The trade-off is that a chunk returning 3 weeks instead
// of 4 leaves a genuine gap, so the final plan can come up short.
// max_tokens is a size limit, not a speed limit — going parallel does nothing
// for it. Measured: dense workout JSON runs ~2.1 chars/token, so a 6,000-token
// cap truncates a 4-week chunk at ~12,600 chars, mid-object. Truncated JSON
// then fails both the parser and the repair pass, losing the whole chunk.
// 8,000 clears a full 4-week chunk with headroom.
const CHUNK_SIZE = 4;
const MAX_TOKENS_PER_CHUNK = 8000;

// Fewer than this from a chunk and the chunk is retried.
const MIN_CHUNK_WEEKS = 2;

// No bytes from Anthropic for this long => the request is stalled, abort it.
// This is an IDLE timeout, not a wall-clock one: a legitimate 6k-token chunk
// takes 60-120s but never goes 25s without a delta.
const IDLE_TIMEOUT_MS = 25_000;
// Absolute ceiling per Anthropic call. Must stay under Supabase's 150s isolate
// limit: a ceiling above it can never fire, so a hung chunk would get the whole
// function killed instead of surfacing an error to the client. Concurrent
// chunks run slower than a solo one (shared output-token throughput), so this
// has to be generous — 70s was low enough to abort healthy chunks mid-stream.
const HARD_TIMEOUT_MS = 115_000;
// Whole-request budget, measured from handler entry and shared by every chunk.
// Each Anthropic call is capped at whatever is left, so the function always
// gets to emit an error event instead of being killed silently at 150s.
const TOTAL_BUDGET_MS = 130_000;
// Don't start a retry unless there is realistically time for it to finish.
const MIN_RETRY_BUDGET_MS = 45_000;
// Ceiling for the top-up call that fills weeks the parallel pass left missing.
// Still clamped by the shared deadline; the parallel pass typically finishes
// around 56s, leaving ~70s of the budget for this.
const TOPUP_TIMEOUT_MS = 100_000;
// A top-up needs less time than a full chunk (usually one week), but don't
// start one that can't plausibly finish.
const MIN_TOPUP_BUDGET_MS = 20_000;
// SSE comment frame cadence — keeps bytes on the wire through proxies.
const HEARTBEAT_MS = 10_000;

const FALLBACK_PHILOSOPHY = `You are generating training plans following a competitive high school rowing program methodology.

ZONE SYSTEM (paces relative to athlete 2k time per 500m):
UT2: 2k+20-25s, rate 16-20. Pure aerobic base.
UT1: 2k+15-20s, rate 18-24. Moderate aerobic, rate ladders.
AT: 2k+4-9s, rate 26-28. Anaerobic threshold.
TR1: 2k+0-4s, rate 26-32. Threshold, hard pieces.
TR2: below 2k pace, rate 32+. Race specific, peak phase only within 6 weeks of race.

CORRECT WEEKLY STRUCTURE — CRITICAL RULES:
- Each day has EXACTLY ONE required session.
- Lifting is ALWAYS optional — NEVER a standalone required session Monday through Friday.
- Saturday may have lifting as the required session when erg is the optional.
- Sunday is ALWAYS OFF — no required or optional sessions.

Monday: Required — erg session (UT1). Optional — lift (Day A Lower Power) after erg.
Tuesday: Required — erg session (AT or TR1, higher intensity). Optional — second easy erg (UT2) or lift (Day B Upper Pull).
Wednesday: Required — erg session (UT2/UT1 high volume). Optional — lift (Day B Upper Pull or Day C Lower Endurance) after erg.
Thursday: Required — erg session (moderate intensity) or rest depending on weekly load. Optional — lift (Day C Lower Endurance) or easy erg.
Friday: Required — erg quality session (AT/TR1). Optional — second easy session.
Saturday: Required — lift (Day D Upper Endurance) or easy erg. Optional — second erg or rest.
Sunday: OFF. No sessions at all.

NEVER generate Tuesday, Wednesday, or Thursday as "lift only" required days.
NEVER generate more than one required session per day.

3-WEEK LOADING CYCLE: Week 1 easy, Week 2 medium, Week 3 hard, Week 4 recovery (50% volume).

Always specify piece duration/distance, rest interval, stroke rate, warmup, cooldown. Express paces as 2k +/- seconds, never absolute splits.`;

// ---------------------------------------------------------------------------
// Prompt construction
//
// The system prompt is split into two cache_control blocks:
//   BLOCK 1 — philosophy + lifting program + JSON schema. Byte-identical for
//             every request on a team, so it caches across users and days.
//   BLOCK 2 — preferences + athlete personalization + plan length. Identical
//             across the N chunks of a single request, so chunks 2..N read it
//             from cache instead of paying full input price.
// Nothing that varies per chunk may live in the system prompt — the chunk
// instruction goes in the user message, after both cache breakpoints.
// ---------------------------------------------------------------------------

const STATIC_RULES = `You are CrewSync AI, an expert rowing and strength training coach generating a personalized plan.

LIFTING PROGRAM:
Day A — Lower Power: Back Squat 5x3, Romanian Deadlift 4x5, Power Clean 4x3, Box Jump 4x5, Glute Ham Raise 3x8, Plank 3x60s
Day B — Upper Pull: Deadlift 5x3, Weighted Pull-ups 4x5, Barbell Row 4x6, Single Arm DB Row 3x8, Face Pulls 3x15, Hanging Leg Raise 3x12
Day C — Lower Endurance: Front Squat 4x6, Bulgarian Split Squat 3x8, Trap Bar Deadlift 4x8, Step-ups 3x10, Nordic Hamstring Curl 3x6, Pallof Press 3x12
Day D — Upper Endurance: Hex Bar Deadlift 4x8, DB Romanian Deadlift 3x12, Lat Pulldown 4x10, Cable Row 4x12, DB Curl to Press 3x10, Copenhagen Plank 3x30s, Reverse Hyper 3x15

CRITICAL STRUCTURE RULE:
Each day has exactly one required session. Optional sessions are always lower intensity.
NEVER make lifting a standalone required session on Monday-Friday.
Sunday always has is_rest: true, required: null, optional: null.

OUTPUT FORMAT — you always emit a JSON ARRAY of week objects. No wrapping object.
No prose, no markdown fences, no text before or after the array.

WEEK OBJECT SCHEMA:
{
  "week": 1,
  "phase": "Base",
  "phase_label": "Week 1 — Base Phase",
  "summary": "Easy base building week. Focus on UT2 aerobic base. Two UT1 sessions.",
  "intensity_label": "Easy Week",
  "days": [
    {
      "day": 1,
      "day_name": "Monday",
      "is_rest": false,
      "required": {
        "session_type": "erg",
        "zone": "UT1",
        "title": "UT1 Steady State",
        "description": "45 min steady state at UT1",
        "distance": "10000",
        "duration": "45 min",
        "targetSplit": "2k+18s/500m",
        "rate": "r20-22",
        "warmup": "10 min easy at r18",
        "cooldown": "5 min easy",
        "restPeriods": ""
      },
      "optional": {
        "session_type": "lift",
        "title": "Optional Lift — Day A (Lower Power)",
        "description": "Back Squat 5x3, Romanian Deadlift 4x5, Power Clean 4x3, Box Jump 4x5, Glute Ham Raise 3x8, Plank 3x60s",
        "note": "Complete only if energy allows after required erg session."
      }
    },
    { "day": 7, "day_name": "Sunday", "is_rest": true, "required": null, "optional": null }
  ]
}

Erg sessions use session_type "erg"; lift sessions use session_type "lift".
Rest days: is_rest true, required null, optional null.
targetSplit: use the athlete's exact computed splits when supplied, otherwise the 2k+Xs/500m format.
EVERY week object MUST contain all 7 days (day 1 = Monday through day 7 = Sunday), and every
non-rest day MUST have a fully populated required session (title plus zone/type plus a
description or duration or distance). Never emit an empty or placeholder day.

You MUST generate exactly the weeks requested. Do not stop early. If you are running out of
space, compress individual workout descriptions but never omit a week.`;

// Compact preference directives. Every line here is consumed by the model —
// verbose prose was stripped because it added input tokens without changing output.
function buildPreferencePrompt(prefs: Record<string, unknown>): string {
  const goal = (prefs.training_goal as string) || "general_fitness";
  const intensity = (prefs.intensity as string) || "moderate";
  const goalDate = prefs.goal_date as string | null;
  const includeLift = prefs.include_lifting !== false;
  const liftDays = (prefs.lifting_days_per_week as number) || 2;
  const twoADays = prefs.include_two_a_days !== false;

  const lines: string[] = ["PREFERENCES:"];

  if (intensity === "easy") {
    lines.push("Intensity easy: 3-4 sessions/week, UT2+UT1 only, no TR unless goal is within 4 weeks, long rests.");
  } else if (intensity === "hard") {
    lines.push("Intensity hard: 6 sessions/week, TR1 from 8 weeks out, TR2 from 4 weeks out, tight rests.");
  } else {
    lines.push("Intensity moderate: 5-6 sessions/week, UT1+AT base, TR1 from 6 weeks out.");
  }

  const goalLine: Record<string, string> = {
    erg_testing: "Goal erg testing: 2k simulation in week 3 of each 4-week block, sharp taper in the final week.",
    upcoming_race: "Goal race: full periodization, TR2 in the final 3 weeks, race-specific pieces.",
    tryouts: "Goal tryouts: peak at the tryout date, competitive and seat-race simulation pieces in the final 2 weeks.",
    off_season: "Goal off-season: UT2 dominant, low volume maintenance, no TR2.",
    return_from_injury:
      "Goal injury return: weeks 1-2 max 3 sessions, UT2 only, nothing over 20 min, no lifting, >=4 rest days, summary must say 'Injury return — listen to your body, stop if pain returns.' Weeks 3-4 max 4 sessions, UT2/UT1, no intervals. TR1 not before week 5.",
    general_fitness: "Goal general fitness: heavy UT2/UT1, no TR2, no testing blocks, steady progressive overload.",
  };
  lines.push(goalLine[goal] ?? goalLine.general_fitness);
  if (goalDate && goal !== "off_season" && goal !== "return_from_injury" && goal !== "general_fitness") {
    lines.push(`Target date ${goalDate} — peak the plan here.`);
  }

  if (!includeLift) lines.push("Lifting: none. Erg-only program.");
  else if (liftDays === 3) lines.push("Lifting: optional Mon (Day A), Wed (Day B or C), Sat (Day D). Never required Mon-Fri.");
  else lines.push("Lifting: optional Mon (Day A) and Thu (Day C). Never required Mon-Fri.");

  if (!twoADays) lines.push("2-a-days: none. Set optional to null on every day.");
  else lines.push("2-a-days: optional second session Mon-Sat, always easier than the required session. None on Sunday.");

  return lines.join("\n");
}

// Athlete context, compressed to exactly what the prompt asks the model to use:
// name, experience level, 2k time (and derived splits), goal, weeks until the
// goal date, and the last 3 erg workouts.
function buildPersonalizationPrompt(
  profile: any,
  goals: any,
  recentErg: any[],
  preferences: Record<string, unknown>,
): string {
  const lines: string[] = [];
  const athleteName = profile?.full_name || "this athlete";
  const experience = profile?.experience_level || "unknown";

  lines.push("ATHLETE (use this real data, reference them by name in week summaries):");
  lines.push(`Name: ${athleteName}. Experience: ${experience}.`);

  const current2k = goals?.current_2k_time as string | null;
  let hasSplits = false;
  if (current2k && current2k !== "Not set" && String(current2k).trim()) {
    const parts = String(current2k).trim().replace(",", ".").split(":");
    let totalSec: number | null = null;
    if (parts.length === 2) totalSec = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    else if (parts.length === 1) totalSec = parseFloat(parts[0]);

    if (totalSec && totalSec > 0) {
      hasSplits = true;
      const per500 = totalSec / 4;
      const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}`;
      lines.push(`2k: ${current2k} (base split ${fmt(per500)}/500m). Goal 2k: ${goals?.goal_2k_time || "not set"}.`);
      lines.push(
        `Pace targets — UT2 ${fmt(per500 + 20)}-${fmt(per500 + 25)}, UT1 ${fmt(per500 + 15)}-${fmt(per500 + 20)}, ` +
          `AT ${fmt(per500 + 4)}-${fmt(per500 + 9)}, TR1 ${fmt(per500)}-${fmt(per500 + 4)}, TR2 faster than ${fmt(per500 - 2)} (all /500m).`,
      );
      lines.push(`Write these exact splits in every targetSplit field (e.g. "${fmt(per500 + 17)}/500m"). Never write "2k+Xs".`);
    }
  }
  if (!hasSplits) {
    lines.push('No 2k on record. Use the 2k+Xs/500m format for targetSplit and add to the week 1 summary: "Set your 2K time in Profile Settings for personalized pace targets."');
    const exp = String(experience).toLowerCase();
    if (exp === "beginner" || exp === "novice") {
      lines.push("Beginner: add 10% to all zone paces (slower) and cap required sessions at 30 minutes.");
    }
  }

  if (recentErg.length > 0) {
    lines.push("Last 3 erg sessions (acknowledge current fitness in the week 1 summary):");
    recentErg.slice(0, 3).forEach((w: any) => {
      lines.push(`  ${w.workout_date}: ${w.workout_type || "erg"}, ${w.distance || "?"}m, split ${w.avg_split || "n/a"}`);
    });
  }

  const goal = preferences.training_goal as string;
  const goalDate = preferences.goal_date as string | null;
  const totalW = Math.max(1, ((preferences.months as number) ?? 3) * 4);

  if (goalDate) {
    const target = new Date(goalDate + "T00:00:00");
    const weeksUntil = Math.max(1, Math.round((target.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)));
    lines.push(`Weeks until goal date (${goalDate}): ${weeksUntil}.`);

    if (goal === "tryouts") {
      const baseWks = Math.floor(totalW * 0.4);
      const buildWks = Math.floor(totalW * 0.3);
      const peakWks = Math.floor(totalW * 0.2);
      const taperWks = totalW - baseWks - buildWks - peakWks;
      lines.push(
        `Phase blocks for phase_label — Base weeks 1-${baseWks}, Build weeks ${baseWks + 1}-${baseWks + buildWks}, ` +
          `Peak weeks ${baseWks + buildWks + 1}-${totalW - taperWks}, Taper final ${taperWks} week(s) into ${goalDate}.`,
      );
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Anthropic transport
// ---------------------------------------------------------------------------

type AnthropicResult = {
  ok: boolean;
  status: number;
  text: string;
  usage: any;
  errorText?: string;
  timedOut?: boolean;
};

/**
 * Stream an Anthropic Messages request, accumulating text server-side while
 * invoking onProgress as tokens arrive.
 *
 * Two independent guards keep a stalled upstream from hanging the function:
 *  - an IDLE watchdog (IDLE_TIMEOUT_MS) rearmed on every chunk read, wired to
 *    an AbortController so the socket is actually torn down; and
 *  - a HARD ceiling applied by the caller via withHardTimeout().
 */
async function streamAnthropicText(
  apiKey: string,
  requestBody: Record<string, unknown>,
  onProgress?: (charsSoFar: number) => void,
): Promise<AnthropicResult> {
  const ac = new AbortController();
  let idleTimer: number | undefined;
  let idleFired = false;
  const armIdle = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      try { ac.abort(); } catch { /* noop */ }
    }, IDLE_TIMEOUT_MS);
  };

  try {
    armIdle();
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...requestBody, stream: true }),
      signal: ac.signal,
    });

    if (!resp.ok || !resp.body) {
      const errorText = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, text: "", usage: {}, errorText };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let usage: any = {};
    let lastTick = 0;

    while (true) {
      armIdle();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            text += evt.delta.text;
            if (onProgress && text.length - lastTick >= 800) {
              lastTick = text.length;
              onProgress(text.length);
            }
          } else if (evt.type === "message_start" && evt.message?.usage) {
            usage = { ...usage, ...evt.message.usage };
          } else if (evt.type === "message_delta" && evt.usage) {
            usage = { ...usage, ...evt.usage };
          }
        } catch {
          // keepalive / partial line
        }
      }
    }
    return { ok: true, status: resp.status, text, usage };
  } catch (err) {
    const msg = idleFired
      ? `Anthropic stream idle for ${IDLE_TIMEOUT_MS}ms — aborted`
      : err instanceof Error
        ? err.message
        : "Anthropic request failed";
    console.error(`${FN}: streamAnthropicText failed: ${msg}`);
    return { ok: false, status: 0, text: "", usage: {}, errorText: msg, timedOut: idleFired };
  } finally {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
  }
}

/**
 * Absolute ceiling for a single upstream call. The losing side of the race is
 * always given a handler so neither branch can surface as an unhandled
 * rejection, and the timer is cleared on every exit path.
 */
function withHardTimeout(p: Promise<AnthropicResult>, ms: number, label: string): Promise<AnthropicResult> {
  let timer: number | undefined;
  const timeout = new Promise<AnthropicResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, status: 0, text: "", usage: {}, errorText: `${label} exceeded ${ms}ms`, timedOut: true }),
      ms,
    );
  });
  p.catch(() => { /* loser must never be unhandled */ });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// ---------------------------------------------------------------------------
// Plan validation — nothing incomplete is ever emitted or cached.
// ---------------------------------------------------------------------------

const tryParseJsonArray = (raw: string): any[] | null => {
  const s = raw.indexOf("[");
  const e = raw.lastIndexOf("]");
  if (s === -1 || e === -1 || e <= s) return null;
  try {
    const v = JSON.parse(raw.slice(s, e + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Recover the complete leading elements of a truncated JSON array.
 *
 * A chunk cut off at max_tokens ends mid-object, so the whole array fails to
 * parse and every already-finished week is thrown away with it. Walk the text
 * tracking nesting depth (string- and escape-aware), find where the last
 * top-level element closed, and close the array there.
 */
const salvageJsonArray = (raw: string): any[] | null => {
  const start = raw.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastElementEnd = -1;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      // Back to depth 1 means a top-level array element just closed cleanly.
      if (depth === 1) lastElementEnd = i;
    }
  }

  if (lastElementEnd === -1) return null;
  try {
    const v = JSON.parse(raw.slice(start, lastElementEnd + 1) + "]");
    return Array.isArray(v) && v.length > 0 ? v : null;
  } catch {
    return null;
  }
};

const requiredIsPopulated = (req: any): boolean => {
  if (!req || typeof req !== "object") return false;
  if (typeof req.title !== "string" || !req.title.trim()) return false;
  if (!req.zone && !req.session_type) return false;
  return Boolean(req.description || req.duration || req.distance || req.pieces);
};

const weekIsComplete = (week: any): boolean => {
  if (!week || !Array.isArray(week.days) || week.days.length !== 7) return false;
  let populated = 0;
  for (const day of week.days) {
    if (day?.is_rest === true) continue;
    if (requiredIsPopulated(day?.required)) populated++;
  }
  return populated >= 1;
};

/**
 * null when the plan is usable, otherwise a human-readable reason.
 *
 * `minWeeks` is a floor, not an exact count: with fixed parallel windows a
 * chunk that returns 3 weeks instead of 4 is accepted, so a 12-week request can
 * legitimately settle at 11. Every week that IS present must still be complete.
 */
const planIssue = (weeks: any[], minWeeks: number): string | null => {
  if (!Array.isArray(weeks) || weeks.length < minWeeks) {
    return `expected at least ${minWeeks} weeks, got ${Array.isArray(weeks) ? weeks.length : 0}`;
  }
  for (let i = 0; i < weeks.length; i++) {
    if (!weekIsComplete(weeks[i])) {
      return `week ${weeks[i]?.week ?? i + 1} is incomplete (missing days or empty required sessions)`;
    }
  }
  return null;
};

/** Weeks we insist on before calling a plan usable: at most one short week per chunk. */
const minAcceptableWeeks = (totalWeeks: number): number =>
  Math.max(1, totalWeeks - Math.ceil(totalWeeks / CHUNK_SIZE));

// ---------------------------------------------------------------------------
// Handler
//
// The SSE Response is returned immediately after the OPTIONS check. Every piece
// of I/O — request body, cache lookup, preflight, profile queries, Anthropic —
// runs inside ReadableStream.start(), so the client receives headers and the
// first heartbeat within milliseconds instead of after ~10 database round trips.
// ---------------------------------------------------------------------------

serve((req) => {
  console.log("generate-workout: function started");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  let heartbeat: number | undefined;
  const stopHeartbeat = () => {
    if (heartbeat !== undefined) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true; // client disconnected
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const close = () => {
        stopHeartbeat();
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      };

      // Comment frame. Per the SSE spec a line beginning with ":" is ignored by
      // conforming parsers; src/lib/api.ts additionally skips it explicitly.
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      try {
        send("progress", { phase: "starting" });

        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
        if (!ANTHROPIC_API_KEY) {
          send("error", { error: "Server misconfigured: missing ANTHROPIC_API_KEY", status: 500 });
          return;
        }

        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // Read the request body here rather than before the Response so the
        // client gets headers immediately. Guarded by a timeout so a stalled
        // upload degrades to an SSE error instead of hanging the function.
        let body: Record<string, unknown>;
        try {
          let bodyTimer: number | undefined;
          const bodyRead = req.text();
          bodyRead.catch(() => { /* loser of the race must never be unhandled */ });
          const raw = await Promise.race([
            bodyRead,
            new Promise<null>((resolve) => { bodyTimer = setTimeout(() => resolve(null), 10_000); }),
          ]).finally(() => { if (bodyTimer !== undefined) clearTimeout(bodyTimer); });
          if (raw === null) {
            send("error", { error: "Timed out reading request body", status: 408 });
            return;
          }
          body = JSON.parse(raw);
        } catch {
          send("error", { error: "Invalid JSON body", status: 400 });
          return;
        }

        const user_id = body.user_id as string;
        const preferences = (body.preferences ?? {}) as Record<string, unknown>;
        if (!user_id) {
          send("error", { error: "Missing user_id", status: 400 });
          return;
        }

        const totalWeeks = Math.max(1, ((preferences.months as number) ?? 3) * 4);
        const durationLabel = `${preferences.months ?? 3} months (${totalWeeks} weeks)`;

        // --- Cache -------------------------------------------------------
        const today = new Date().toISOString().slice(0, 10);
        const prefKey = `${preferences.training_goal ?? "g"}:${preferences.intensity ?? "m"}:${preferences.include_lifting ?? 1}:${preferences.lifting_days_per_week ?? 2}:${preferences.include_two_a_days ?? 1}`;
        const cacheKey = `training_plan_v6:${user_id}:${preferences.months ?? 3}:${prefKey}:${today}`;

        send("progress", { phase: "cache_check", totalWeeks });
        const cached = await getCached(supabase, cacheKey);
        if (cached) {
          const cachedWeeks = Array.isArray((cached as any)?.plan) ? (cached as any).plan : [];
          const cachedIssue = planIssue(cachedWeeks, minAcceptableWeeks(totalWeeks));
          if (!cachedIssue) {
            console.log("generate-workout: cache hit (complete plan)");
            await logUsage(supabase, { user_id, function_name: FN, model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
            send("done", { ...(cached as Record<string, unknown>), cached: true });
            return;
          }
          console.log(`generate-workout: cached plan rejected (${cachedIssue}), regenerating`);
          await supabase.from("ai_response_cache").delete().eq("cache_key", cacheKey);
        }

        // --- Guards ------------------------------------------------------
        const blocked = await preflight(supabase, { userId: user_id, functionName: FN, corsHeaders });
        if (blocked) {
          let message = "AI features are temporarily unavailable. Please try again shortly.";
          try {
            const j = await blocked.json();
            if (j?.error) message = j.error;
          } catch { /* keep default */ }
          send("error", { error: message, status: blocked.status });
          return;
        }

        // --- Athlete context ---------------------------------------------
        send("progress", { phase: "loading_profile", totalWeeks });
        const [profileRes, goalsRes, ergRes, teamMemberRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name, experience_level, user_type").eq("id", user_id).maybeSingle(),
          supabase.from("user_goals").select("current_2k_time, goal_2k_time").eq("user_id", user_id).maybeSingle(),
          supabase.from("erg_workouts").select("workout_date, workout_type, distance, avg_split").eq("user_id", user_id).order("workout_date", { ascending: false }).limit(3),
          supabase.from("team_members").select("team_id").eq("user_id", user_id).limit(1).maybeSingle(),
        ]);

        const profile = profileRes.data;
        const goals = goalsRes.data;
        const recentErg = ergRes.data || [];

        let philosophyPrompt = "";
        try {
          const teamId = teamMemberRes.data?.team_id;
          if (teamId) {
            const { data: customPhil } = await supabase
              .from("team_training_philosophy")
              .select("philosophy")
              .eq("team_id", teamId)
              .maybeSingle();
            const sp = (customPhil?.philosophy as { system_prompt?: string } | null)?.system_prompt;
            if (sp) philosophyPrompt = sp;
          }
          if (!philosophyPrompt) {
            const { data: defaultPhil } = await supabase
              .from("default_training_philosophy")
              .select("system_prompt")
              .eq("is_default", true)
              .maybeSingle();
            if (defaultPhil?.system_prompt) philosophyPrompt = defaultPhil.system_prompt;
          }
        } catch (philErr) {
          console.error("generate-workout: philosophy fetch threw:", philErr);
        }
        if (philosophyPrompt.length > 1500) {
          philosophyPrompt = philosophyPrompt.slice(0, 1500) + "\n[see full methodology — follow all rules]";
        }
        if (!philosophyPrompt) philosophyPrompt = FALLBACK_PHILOSOPHY;

        // --- Prompt blocks -------------------------------------------------
        // BLOCK 1 is byte-identical for every request sharing a philosophy;
        // BLOCK 2 is byte-identical across the chunks of this request. Both
        // carry a cache breakpoint, and the breakpoint sits on the LAST block
        // of each stable prefix.
        const stableBlock = `${philosophyPrompt}\n\n${STATIC_RULES}`;
        const requestBlock = `${buildPreferencePrompt(preferences)}

${buildPersonalizationPrompt(profile, goals, recentErg, preferences)}

PLAN LENGTH: ${durationLabel}, ${totalWeeks} weeks total, numbered 1 to ${totalWeeks}.`;

        const systemBlocks = [
          { type: "text", text: stableBlock, cache_control: { type: "ephemeral" } },
          { type: "text", text: requestBlock, cache_control: { type: "ephemeral" } },
        ];

        // --- Generation ----------------------------------------------------
        const allWeeks: any[] = [];
        let inTok = 0;
        let outTok = 0;
        let cacheReadTok = 0;
        let cacheWriteTok = 0;

        const flushUsage = async () => {
          await logUsage(supabase, { user_id, function_name: FN, model: MODEL, input_tokens: inTok, output_tokens: outTok, cache_hit: false });
          await recordUsage(supabase, user_id, inTok + outTok);
        };

        // Fixed 4-week windows, known up front — that is what lets every chunk
        // fire at once.
        const chunks: Array<{ start: number; end: number }> = [];
        for (let start = 1; start <= totalWeeks; start += CHUNK_SIZE) {
          chunks.push({ start, end: Math.min(start + CHUNK_SIZE - 1, totalWeeks) });
        }

        // Counters mutated from concurrent tasks. Safe without locking: Deno
        // runs this on a single thread, so each `+=` completes between awaits.
        let chunksDone = 0;
        let weeksSoFar = 0;

        console.log(`generate-workout: dispatching ${chunks.length} chunk(s) concurrently for ${totalWeeks} weeks`);
        send("progress", { phase: "chunks_dispatched", chunks: chunks.length, totalWeeks });

        const generateChunk = async (
          chunkStart: number,
          chunkEnd: number,
        ): Promise<{ start: number; weeks: any[] } | { start: number; error: string }> => {
          const expectedChunkWeeks = chunkEnd - chunkStart + 1;
          // A 1-week chunk is legitimate when the plan length isn't a multiple of 4.
          const minChunkWeeks = Math.min(MIN_CHUNK_WEEKS, expectedChunkWeeks);

          const userMessage =
            `Generate ONLY weeks ${chunkStart} through ${chunkEnd} of the ${totalWeeks}-week plan. ` +
            `Week numbers must start at ${chunkStart}. ` +
            `Output only valid JSON: an array of exactly ${expectedChunkWeeks} week object(s), numbered ${chunkStart} through ${chunkEnd}. ` +
            `No prose, no markdown fences. ` +
            `Every week must contain all 7 days (Monday-Sunday) with fully populated required sessions. ` +
            `You MUST generate exactly the weeks requested. Do not stop early. If you are running out of space, ` +
            `compress individual workout descriptions but never omit a week.`;

          let lastError = "";

          // Two attempts: one retry covers a timeout, a transport error, or a
          // truncated/incomplete response.
          for (let attempt = 1; attempt <= 2; attempt++) {
            const budgetLeft = deadline - Date.now();
            if (attempt === 2 && budgetLeft < MIN_RETRY_BUDGET_MS) {
              console.warn(`generate-workout: chunk ${chunkStart}-${chunkEnd} skipping retry, only ${budgetLeft}ms left`);
              break;
            }
            const attemptTimeout = Math.min(HARD_TIMEOUT_MS, budgetLeft);
            if (attemptTimeout <= 0) {
              lastError = lastError || "ran out of time budget";
              break;
            }

            const r = await withHardTimeout(
              streamAnthropicText(
                ANTHROPIC_API_KEY,
                {
                  model: MODEL,
                  max_tokens: MAX_TOKENS_PER_CHUNK,
                  thinking: { type: "disabled" },
                  system: systemBlocks,
                  messages: [{ role: "user", content: userMessage }],
                },
                (chars) => send("progress", { phase: "streaming", chunkStart, chunkEnd, chars, weeksSoFar, totalWeeks, attempt }),
              ),
              attemptTimeout,
              `chunk ${chunkStart}-${chunkEnd}`,
            );

            if (!r.ok) {
              lastError = r.errorText || "AI service unavailable";
              console.error(`generate-workout: chunk ${chunkStart}-${chunkEnd} attempt ${attempt} failed: ${lastError}`);
              send("progress", { phase: "chunk_attempt_failed", chunkStart, chunkEnd, attempt, reason: lastError, status: r.status, timedOut: r.timedOut === true });
              await recordApiError(supabase, FN);
              continue;
            }

            await recordApiSuccess(supabase, FN);
            inTok += r.usage?.input_tokens ?? 0;
            outTok += r.usage?.output_tokens ?? 0;
            cacheReadTok += r.usage?.cache_read_input_tokens ?? 0;
            cacheWriteTok += r.usage?.cache_creation_input_tokens ?? 0;

            let candidate = tryParseJsonArray(r.text);

            // Truncated at max_tokens? Salvage the weeks that did finish. Free
            // and deterministic, so try it before spending a repair call.
            if (!candidate && r.text) {
              candidate = salvageJsonArray(r.text);
              if (candidate) {
                console.warn(`generate-workout: chunk ${chunkStart}-${chunkEnd} truncated, salvaged ${candidate.length} week(s)`);
              }
            }

            // Cheap Haiku repair pass for a syntactically broken array.
            if (!candidate && r.text) {
              console.warn(`generate-workout: chunk ${chunkStart}-${chunkEnd} parse failed, repairing`);
              const rep = await withHardTimeout(
                streamAnthropicText(ANTHROPIC_API_KEY, {
                  model: REPAIR_MODEL,
                  max_tokens: MAX_TOKENS_PER_CHUNK,
                  thinking: { type: "disabled" },
                  system: "You are a JSON repair tool. Output only a valid JSON array. No text before or after. Fix any syntax errors in the training plan JSON provided.",
                  messages: [{ role: "user", content: r.text }],
                }),
                Math.max(0, Math.min(HARD_TIMEOUT_MS, deadline - Date.now())),
                `repair ${chunkStart}-${chunkEnd}`,
              );
              if (rep.ok) candidate = tryParseJsonArray(rep.text);
            }

            // Trim any trailing truncated week and keep the complete ones.
            let usable: any[] | null = null;
            if (candidate) {
              usable = candidate.slice(0, expectedChunkWeeks);
              const firstBad = usable.findIndex((w: any) => !weekIsComplete(w));
              if (firstBad !== -1) usable = usable.slice(0, firstBad);
            }

            const issue = !candidate
              ? "invalid JSON"
              : !usable || usable.length < minChunkWeeks
                ? `expected ${expectedChunkWeeks} weeks, got ${usable?.length ?? 0} complete`
                : null;

            if (!issue && usable) {
              if (usable.length < expectedChunkWeeks) {
                console.warn(`generate-workout: chunk ${chunkStart}-${chunkEnd} short (${usable.length}/${expectedChunkWeeks}) — accepting`);
              }
              // Number against this chunk's own window. The final combine
              // renumbers globally, which is what closes any gap a short chunk left.
              const weeks = usable.map((w: any, i: number) => ({ ...w, week: chunkStart + i }));

              chunksDone++;
              weeksSoFar += weeks.length;
              console.log(`generate-workout: chunk ${chunkStart}-${chunkEnd} done with ${weeks.length} weeks (${chunksDone}/${chunks.length} chunks)`);
              send("chunk", { weeks, chunkStart, chunkEnd, weeksSoFar, chunksDone, chunksTotal: chunks.length, totalWeeks });
              return { start: chunkStart, weeks };
            }
            lastError = issue;
            console.warn(`generate-workout: chunk ${chunkStart}-${chunkEnd} attempt ${attempt} rejected: ${issue}`);
            send("progress", { phase: "chunk_attempt_rejected", chunkStart, chunkEnd, attempt, reason: issue, chars: r.text.length, parsed: candidate?.length ?? 0, complete: usable?.length ?? 0 });
          }

          console.error(`generate-workout: chunk ${chunkStart}-${chunkEnd} failed after retry (${lastError})`);
          return { start: chunkStart, error: lastError };
        };

        // All chunks in flight simultaneously: wall time is the slowest chunk,
        // not the sum. allSettled rather than all so one rejection can't leave
        // the others unhandled mid-flight.
        const settled = await Promise.allSettled(chunks.map((c) => generateChunk(c.start, c.end)));

        const failures: string[] = [];
        const succeeded: Array<{ start: number; weeks: any[] }> = [];
        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          const { start, end } = chunks[i];
          if (s.status === "rejected") {
            failures.push(`weeks ${start}-${end}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
          } else if ("error" in s.value) {
            failures.push(`weeks ${start}-${end}: ${s.value.error}`);
          } else {
            succeeded.push(s.value);
          }
        }

        if (failures.length > 0) {
          await flushUsage();
          send("error", {
            error: `Plan generation failed for ${failures.length} of ${chunks.length} block(s). Please try again.`,
            detail: failures.join("; "),
          });
          return;
        }

        // Combine in window order. Week numbers are still the per-window ones,
        // so a short chunk leaves a real hole (chunk 1-4 returning 3 weeks
        // yields 1,2,3,5,6,7,8,...). The gaps must be read BEFORE renumbering,
        // since renumbering is what closes them.
        succeeded.sort((a, b) => a.start - b.start);
        for (const s of succeeded) allWeeks.push(...s.weeks);

        const present = new Set(allWeeks.map((w: any) => Number(w.week)));
        const missingWeeks: number[] = [];
        for (let w = 1; w <= totalWeeks; w++) if (!present.has(w)) missingWeeks.push(w);

        // --- Top-up: one extra call for whatever the parallel pass missed ----
        if (missingWeeks.length > 0) {
          const topupBudget = Math.min(TOPUP_TIMEOUT_MS, deadline - Date.now());
          if (topupBudget < MIN_TOPUP_BUDGET_MS) {
            console.warn(`generate-workout: skipping top-up for weeks ${missingWeeks.join(", ")}, only ${topupBudget}ms left`);
          } else {
            console.log(`generate-workout: topping up missing weeks ${missingWeeks.join(", ")}`);
            send("progress", { phase: "topup", missingWeeks, weeksSoFar: allWeeks.length, totalWeeks });

            const topupMessage =
              `Generate ONLY the following missing weeks of the ${totalWeeks}-week plan: ${missingWeeks.join(", ")}. ` +
              `Output only a valid JSON array of ${missingWeeks.length} week object(s), starting at week ${missingWeeks[0]}. ` +
              `No prose, no markdown fences. ` +
              `Every week must contain all 7 days (Monday-Sunday) with fully populated required sessions. ` +
              `Do not stop early. If you are running out of space, compress individual workout ` +
              `descriptions but never omit a week.`;

            // Single attempt by design — a short top-up is acceptable, and a
            // retry risks the isolate deadline for a marginal extra week.
            const t = await withHardTimeout(
              streamAnthropicText(
                ANTHROPIC_API_KEY,
                {
                  model: MODEL,
                  max_tokens: MAX_TOKENS_PER_CHUNK,
                  thinking: { type: "disabled" },
                  system: systemBlocks,
                  messages: [{ role: "user", content: topupMessage }],
                },
                (chars) => send("progress", { phase: "streaming", topup: true, missingWeeks, chars, weeksSoFar: allWeeks.length, totalWeeks }),
              ),
              topupBudget,
              `topup ${missingWeeks.join(",")}`,
            );

            if (!t.ok) {
              console.error(`generate-workout: top-up failed: ${t.errorText}`);
              await recordApiError(supabase, FN);
            } else {
              await recordApiSuccess(supabase, FN);
              inTok += t.usage?.input_tokens ?? 0;
              outTok += t.usage?.output_tokens ?? 0;
              cacheReadTok += t.usage?.cache_read_input_tokens ?? 0;
              cacheWriteTok += t.usage?.cache_creation_input_tokens ?? 0;

              const topupCandidate = tryParseJsonArray(t.text) ?? salvageJsonArray(t.text);
              const topupComplete = (topupCandidate ?? []).filter((w: any) => weekIsComplete(w));
              // Assign the missing numbers positionally — the model's own
              // numbering can't be trusted when the gaps aren't contiguous.
              const topped = topupComplete
                .slice(0, missingWeeks.length)
                .map((w: any, i: number) => ({ ...w, week: missingWeeks[i] }));

              if (topped.length > 0) {
                allWeeks.push(...topped);
                console.log(`generate-workout: top-up recovered ${topped.length} of ${missingWeeks.length} missing week(s)`);
              } else {
                console.warn(`generate-workout: top-up returned no complete weeks`);
              }
              send("progress", { phase: "topup_done", recovered: topped.length, requested: missingWeeks.length, weeksSoFar: allWeeks.length, totalWeeks });
            }
          }
        }

        // Order by week number (top-up weeks were appended out of order), then
        // renumber sequentially so any still-missing week leaves no hole.
        allWeeks.sort((a: any, b: any) => Number(a.week) - Number(b.week));
        for (let i = 0; i < allWeeks.length; i++) allWeeks[i].week = i + 1;

        await flushUsage();
        console.log(`generate-workout: tokens in=${inTok} out=${outTok} cacheRead=${cacheReadTok} cacheWrite=${cacheWriteTok}`);

        const parsed = { duration: durationLabel, total_weeks: allWeeks.length, plan: allWeeks };

        // Final gate — a plan can be short (a chunk returning 3 of 4 weeks is
        // accepted), but every week present must be complete.
        const finalIssue = planIssue(allWeeks, minAcceptableWeeks(totalWeeks));
        if (finalIssue) {
          console.warn(`generate-workout: rejecting incomplete plan: ${finalIssue}`);
          send("error", { error: `Plan generation incomplete (${finalIssue}). Please try again.` });
          return;
        }
        if (allWeeks.length < totalWeeks) {
          console.warn(`generate-workout: plan short — ${allWeeks.length} of ${totalWeeks} weeks requested`);
        }

        await setCached(supabase, cacheKey, parsed, TTL.DAY, MODEL, inTok, outTok);
        send("done", { ...parsed, cached: false });
      } catch (streamErr) {
        console.error("generate-workout: stream error:", streamErr);
        send("error", { error: streamErr instanceof Error ? streamErr.message : "Unknown error" });
      } finally {
        close();
      }
    },
    cancel() {
      // Client hung up mid-generation.
      stopHeartbeat();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Defeat proxy response buffering, which otherwise withholds every byte
      // until the stream ends and looks exactly like a hang to curl.
      "X-Accel-Buffering": "no",
    },
  });
});
