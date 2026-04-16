import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { pieces, boat_class, athletes } = await req.json();
    if (!pieces || pieces.length === 0) {
      return new Response(JSON.stringify({ error: "No seat race pieces provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `You are an expert rowing coach analyzing seat racing results.

Boat class: ${boat_class}
Athletes: ${JSON.stringify(athletes)}

Seat race pieces (each piece swaps athletes between lineups A and B):
${JSON.stringify(pieces, null, 2)}

Analyze the cumulative seat racing data. Consider:
- Time margins between lineup A and B in each piece
- Which athletes were in which lineup
- Statistical significance of margins
- Any inconsistencies or noise in results

Respond with ONLY valid JSON:
{
  "rankings": [
    {"rank": 1, "user_id": "...", "name": "...", "score": 0.95, "rationale": "brief explanation"},
    ...
  ],
  "overall_confidence": 0.0-1.0,
  "confidence_notes": "explanation of confidence level",
  "more_racing_needed": true/false,
  "suggested_pairs": [["athlete1_id", "athlete2_id"], ...],
  "method_notes": "statistical method used"
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic error: ${await resp.text()}`);
    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "{}";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const analysis = JSON.parse(text.slice(start, end + 1));

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
