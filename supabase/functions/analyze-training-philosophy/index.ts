import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  console.log("analyze-training-philosophy: function started");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    console.log("analyze-training-philosophy: ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    console.log("analyze-training-philosophy: request body keys:", Object.keys(body));
    const { team_id, coach_id, file_path, file_name } = body;

    if (!team_id || !coach_id || !file_path) {
      return new Response(JSON.stringify({ error: "Missing team_id, coach_id, or file_path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("analyze-training-philosophy: generating signed URL for", file_path);

    // Generate a signed URL to download the file
    const { data: signedData, error: signErr } = await supabase.storage
      .from("training-files")
      .createSignedUrl(file_path, 120);

    if (signErr) {
      console.error("analyze-training-philosophy: signed URL error:", signErr.message);
      throw new Error(`Could not generate signed URL: ${signErr.message}`);
    }
    if (!signedData?.signedUrl) {
      throw new Error("Signed URL was empty");
    }

    console.log("analyze-training-philosophy: downloading file");

    // Download the file
    const fileResp = await fetch(signedData.signedUrl);
    console.log("analyze-training-philosophy: file download status:", fileResp.status);
    if (!fileResp.ok) throw new Error(`Failed to download training file: HTTP ${fileResp.status}`);

    const ext = (file_name || file_path).toLowerCase().split(".").pop();
    console.log("analyze-training-philosophy: file extension:", ext);

    let fileText = "";

    if (ext === "csv" || ext === "txt") {
      fileText = await fileResp.text();
      console.log("analyze-training-philosophy: read text file, chars:", fileText.length);
    } else {
      // Excel: read as bytes and convert using basic xlsx parsing
      const bytes = new Uint8Array(await fileResp.arrayBuffer());
      console.log("analyze-training-philosophy: read excel bytes:", bytes.length);
      const XLSX = await import("https://esm.sh/xlsx@0.18.5");
      const workbook = XLSX.read(bytes, { type: "array" });
      console.log("analyze-training-philosophy: excel sheets:", workbook.SheetNames);
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) sheets.push(`Sheet: ${sheetName}\n${csv}`);
      }
      fileText = sheets.join("\n\n");
      console.log("analyze-training-philosophy: converted excel to text, chars:", fileText.length);
    }

    if (!fileText.trim()) throw new Error("File appears to be empty after parsing");

    // Truncate to avoid token limits (keep first ~30k chars)
    const truncated = fileText.length > 30000 ? fileText.slice(0, 30000) + "\n[truncated]" : fileText;
    console.log("analyze-training-philosophy: sending to Anthropic, chars:", truncated.length);

    // Analyze with Claude
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: `You are an expert rowing coach analyst. Analyze a training spreadsheet and extract the coaching methodology.
Return ONLY a valid JSON object with no markdown, no code fences, no extra text.`,
        messages: [
          {
            role: "user",
            content: `Analyze this rowing training spreadsheet and extract the coaching methodology. Return a JSON object with these fields:
- weekly_structure: which days are erg vs lift vs rest
- zone_system: what training zones are used and how they are described
- piece_structures: typical workout formats by zone — sets, distances, rest intervals
- rate_patterns: stroke rates used for each zone
- breakup_patterns: rate ladders or variations within pieces
- loading_cycle: how difficulty progresses week to week
- periodization: how the season builds from base to peak
- testing_frequency: how often test pieces appear
- terminology: specific words or phrases the coach uses

Also include a "system_prompt" field: a concise paragraph (200-300 words) describing this coaching methodology that can be used as an AI system prompt to generate training plans following this same style. Keep it under 1500 characters total.

Return only valid JSON.

SPREADSHEET DATA:
${truncated}`,
          },
        ],
      }),
    });

    console.log("analyze-training-philosophy: Anthropic response status:", anthropicResp.status);

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("analyze-training-philosophy: Anthropic error:", errText);
      throw new Error(`Anthropic error ${anthropicResp.status}: ${errText}`);
    }

    const aiResult = await anthropicResp.json();
    const aiText = aiResult?.content?.[0]?.text ?? "";
    console.log("analyze-training-philosophy: AI response length:", aiText.length);

    let philosophy: any = null;
    try {
      const s = aiText.indexOf("{");
      const e = aiText.lastIndexOf("}");
      if (s !== -1 && e !== -1) philosophy = JSON.parse(aiText.slice(s, e + 1));
    } catch (parseErr) {
      console.error("analyze-training-philosophy: JSON parse error:", parseErr);
      throw new Error("AI returned invalid JSON for philosophy");
    }

    if (!philosophy) throw new Error("Could not extract philosophy from AI response");

    console.log("analyze-training-philosophy: philosophy extracted, keys:", Object.keys(philosophy));

    // Build human-readable summary
    const summary = [
      philosophy.weekly_structure ? `Weekly: ${typeof philosophy.weekly_structure === "string" ? philosophy.weekly_structure.slice(0, 100) : JSON.stringify(philosophy.weekly_structure).slice(0, 100)}` : null,
      philosophy.zone_system ? `Zones: ${typeof philosophy.zone_system === "string" ? philosophy.zone_system.slice(0, 100) : Object.keys(philosophy.zone_system || {}).join(", ")}` : null,
      philosophy.loading_cycle ? `Loading: ${typeof philosophy.loading_cycle === "string" ? philosophy.loading_cycle.slice(0, 80) : JSON.stringify(philosophy.loading_cycle).slice(0, 80)}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    console.log("analyze-training-philosophy: upserting to team_training_philosophy");

    // Upsert into team_training_philosophy
    const { error: upsertErr } = await supabase
      .from("team_training_philosophy")
      .upsert(
        {
          team_id,
          coach_id,
          philosophy,
          raw_file_url: file_path,
          summary: summary.slice(0, 500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id" }
      );

    if (upsertErr) {
      console.error("analyze-training-philosophy: DB upsert error:", upsertErr.message);
      throw new Error(`DB upsert failed: ${upsertErr.message}`);
    }

    console.log("analyze-training-philosophy: success");

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        philosophy: {
          weekly_structure: philosophy.weekly_structure,
          zone_system: philosophy.zone_system,
          piece_structures: philosophy.piece_structures,
          loading_cycle: philosophy.loading_cycle,
          periodization: philosophy.periodization,
          terminology: philosophy.terminology,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-training-philosophy: unhandled error:", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
