import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [profileRes, ergRes, strengthRes, athleteProfileRes, goalsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase.from("erg_workouts").select("*").eq("user_id", user_id).order("workout_date", { ascending: false }).limit(10),
      supabase.from("strength_workouts").select("*").eq("user_id", user_id).order("workout_date", { ascending: false }).limit(5),
      supabase.from("athlete_profiles").select("*").eq("user_id", user_id).maybeSingle(),
      supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const ap = athleteProfileRes.data;
    const goals = goalsRes.data;
    const ergs = ergRes.data || [];
    const strengths = strengthRes.data || [];

    const bestErg = ergs.reduce((best: any, w: any) => {
      if (!w.avg_split) return best;
      if (!best || w.avg_split < best.avg_split) return w;
      return best;
    }, null);

    const recentErg = ergs[0];

    const wkg = profile?.weight && bestErg?.avg_split
      ? (() => {
          const splitSeconds = bestErg.avg_split ?
            (typeof bestErg.avg_split === 'string' ?
              bestErg.avg_split.split(':').reduce((a: number, b: string) => a * 60 + parseFloat(b), 0) :
              bestErg.avg_split) : 0;
          const watts = splitSeconds > 0 ? 2.80 / Math.pow(splitSeconds / 500, 3) : 0;
          return watts > 0 ? (watts / (profile.weight)).toFixed(2) : null;
        })()
      : null;

    const ctx = `
Athlete: ${profile?.full_name || "Unknown"}
Grad Year: ${ap?.grad_year || profile?.grad_year || "N/A"}
School: ${ap?.school || "N/A"} | Club: ${ap?.club_team || "N/A"}
Location: ${ap?.location || "N/A"}
Height: ${profile?.height ? Math.round(profile.height / 2.54 * 10) / 10 + '"' : "N/A"} | Weight: ${profile?.weight ? Math.round(profile.weight * 2.205) + " lbs" : "N/A"}
Experience: ${profile?.experience_level || "N/A"}
${wkg ? `Watts/kg: ${wkg}` : ""}
Best 2K split: ${bestErg?.avg_split || "N/A"} | Recent erg: ${recentErg?.distance || "N/A"}m
2K Goal: ${goals?.goal_2k_time || "N/A"}
Bio: ${ap?.bio || ""}
Personal statement: ${ap?.personal_statement || ""}
Personal facts: ${JSON.stringify(ap?.personal_facts || [])}
Recruiting: ${ap?.is_recruiting ? `Yes - Division interest: ${ap?.division_interest || "N/A"}, Major: ${ap?.intended_major || "N/A"}, GPA: ${ap?.gpa || "N/A"}` : "Not actively recruiting"}
Recent strength sessions: ${strengths.length}
`.trim();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Write a 3-4 sentence athlete summary for a college rowing recruiting profile. Be specific, highlight their strongest attributes, and make it compelling for college coaches. Use third person. Do not use the athlete's name in the first sentence. Focus on performance metrics, athletic profile, and potential.\n\nAthlete data:\n${ctx}\n\nWrite only the summary paragraph, no preamble.`,
        }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "AI unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const summary = result?.content?.[0]?.text?.trim() || "";

    await supabase.from("athlete_profiles").upsert({
      user_id,
      ai_summary: summary,
      ai_summary_updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
