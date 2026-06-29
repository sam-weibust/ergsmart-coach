import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-20250514";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { team_id, coach_id, file_path, file_name } = body;

    if (!team_id || !coach_id || !file_path) {
      return new Response(JSON.stringify({ error: "Missing team_id, coach_id, or file_path" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache permanently by team + file_path hash
    const cacheKey = `philosophy_${team_id}_${hashKey(file_path)}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id: coach_id, function_name: "analyze-training-philosophy", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify({ success: true, ...(cached as any) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: coach_id ?? null, functionName: "analyze-training-philosophy", corsHeaders });
    if (blocked) return blocked;

    const { data: signedData, error: signErr } = await supabase.storage
      .from("training-files")
      .createSignedUrl(file_path, 120);

    if (signErr || !signedData?.signedUrl) throw new Error(`Could not generate signed URL: ${signErr?.message}`);

    const fileResp = await fetch(signedData.signedUrl);
    if (!fileResp.ok) throw new Error(`Failed to download training file: HTTP ${fileResp.status}`);

    const ext = (file_name || file_path).toLowerCase().split(".").pop();
    let fileText = "";

    if (ext === "csv" || ext === "txt") {
      fileText = await fileResp.text();
    } else {
      const bytes = new Uint8Array(await fileResp.arrayBuffer());
      const XLSX = await import("https://esm.sh/xlsx@0.18.5");
      const workbook = XLSX.read(bytes, { type: "array" });
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) sheets.push(`Sheet: ${sheetName}\n${csv}`);
      }
      fileText = sheets.join("\n\n");
    }

    if (!fileText.trim()) throw new Error("File appears to be empty after parsing");
    const truncated = fileText.length > 30000 ? fileText.slice(0, 30000) + "\n[truncated]" : fileText;

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: `Expert rowing coach analyst. Analyze a training spreadsheet and extract coaching methodology. Return ONLY valid JSON, no markdown, no code fences.`,
        messages: [{
          role: "user",
          content: `Analyze this rowing training spreadsheet and return JSON with fields: weekly_structure, zone_system, piece_structures, rate_patterns, breakup_patterns, loading_cycle, periodization, testing_frequency, terminology, system_prompt (200-300 word coaching methodology paragraph for AI use, under 1500 chars).\n\nReturn only valid JSON.\n\n${truncated}`,
        }],
      }),
    });

    if (!anthropicResp.ok) {
      console.error("Anthropic error:", await anthropicResp.text());
      await recordApiError(supabase, "analyze-training-philosophy");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "analyze-training-philosophy");

    const aiResult = await anthropicResp.json();
    const usage = aiResult?.usage ?? {};
    const aiText = aiResult?.content?.[0]?.text ?? "";

    let philosophy: any = null;
    try {
      const s = aiText.indexOf("{");
      const e = aiText.lastIndexOf("}");
      if (s !== -1 && e !== -1) philosophy = JSON.parse(aiText.slice(s, e + 1));
    } catch { throw new Error("AI returned invalid JSON for philosophy"); }

    if (!philosophy) throw new Error("Could not extract philosophy from AI response");

    const summary = [
      philosophy.weekly_structure ? `Weekly: ${typeof philosophy.weekly_structure === "string" ? philosophy.weekly_structure.slice(0, 100) : JSON.stringify(philosophy.weekly_structure).slice(0, 100)}` : null,
      philosophy.zone_system ? `Zones: ${typeof philosophy.zone_system === "string" ? philosophy.zone_system.slice(0, 100) : Object.keys(philosophy.zone_system || {}).join(", ")}` : null,
      philosophy.loading_cycle ? `Loading: ${typeof philosophy.loading_cycle === "string" ? philosophy.loading_cycle.slice(0, 80) : JSON.stringify(philosophy.loading_cycle).slice(0, 80)}` : null,
    ].filter(Boolean).join(" | ");

    await supabase.from("team_training_philosophy").upsert({
      team_id, coach_id, philosophy, raw_file_url: file_path,
      summary: summary.slice(0, 500), updated_at: new Date().toISOString(),
    }, { onConflict: "team_id" });

    const cachePayload = {
      summary,
      philosophy: {
        weekly_structure: philosophy.weekly_structure,
        zone_system: philosophy.zone_system,
        piece_structures: philosophy.piece_structures,
        loading_cycle: philosophy.loading_cycle,
        periodization: philosophy.periodization,
        terminology: philosophy.terminology,
      },
    };

    await setCached(supabase, cacheKey, cachePayload, TTL.PERMANENT, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id: coach_id, function_name: "analyze-training-philosophy", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, coach_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

    return new Response(JSON.stringify({ success: true, ...cachePayload }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-training-philosophy: unhandled error:", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
