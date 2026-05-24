import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { team_id, coach_id, file_path, file_name } = await req.json();
    if (!team_id || !coach_id || !file_path) {
      return new Response(JSON.stringify({ error: "Missing team_id, coach_id, or file_path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a signed URL to download the file
    const { data: signedData, error: signErr } = await supabase.storage
      .from("training-files")
      .createSignedUrl(file_path, 60);
    if (signErr || !signedData?.signedUrl) throw new Error("Could not generate signed URL");

    // Download the file
    const fileResp = await fetch(signedData.signedUrl);
    if (!fileResp.ok) throw new Error("Failed to download training file");

    let fileText = "";
    const ext = (file_name || file_path).toLowerCase().split(".").pop();

    if (ext === "csv" || ext === "txt") {
      fileText = await fileResp.text();
    } else {
      // Excel: read as bytes and convert using basic xlsx parsing
      const bytes = new Uint8Array(await fileResp.arrayBuffer());
      // Import xlsx dynamically
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

    if (!fileText.trim()) throw new Error("File appears to be empty");

    // Truncate to avoid token limits (keep first ~40k chars)
    const truncated = fileText.length > 40000 ? fileText.slice(0, 40000) + "\n[truncated]" : fileText;

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

Also include a "system_prompt" field: a comprehensive paragraph (300-500 words) describing this coaching methodology that can be used as an AI system prompt to generate training plans following this same style.

Return only valid JSON.

SPREADSHEET DATA:
${truncated}`,
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      throw new Error(`Anthropic error: ${errText}`);
    }

    const aiResult = await anthropicResp.json();
    const aiText = aiResult?.content?.[0]?.text ?? "";

    let philosophy: any = null;
    try {
      const s = aiText.indexOf("{");
      const e = aiText.lastIndexOf("}");
      if (s !== -1 && e !== -1) philosophy = JSON.parse(aiText.slice(s, e + 1));
    } catch {
      throw new Error("AI returned invalid JSON for philosophy");
    }

    if (!philosophy) throw new Error("Could not extract philosophy from file");

    // Build human-readable summary
    const summary = [
      philosophy.weekly_structure ? `Weekly structure: ${typeof philosophy.weekly_structure === "string" ? philosophy.weekly_structure : JSON.stringify(philosophy.weekly_structure)}` : null,
      philosophy.zone_system ? `Zones: ${typeof philosophy.zone_system === "string" ? philosophy.zone_system : Object.keys(philosophy.zone_system || {}).join(", ")}` : null,
      philosophy.loading_cycle ? `Loading: ${typeof philosophy.loading_cycle === "string" ? philosophy.loading_cycle : JSON.stringify(philosophy.loading_cycle)}` : null,
      philosophy.periodization ? `Periodization: ${typeof philosophy.periodization === "string" ? philosophy.periodization : JSON.stringify(philosophy.periodization)}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

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

    if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

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
    console.error("analyze-training-philosophy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
