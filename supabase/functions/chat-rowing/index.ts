import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // ⭐ USE YOUR ANTHROPIC KEY
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY)
      throw new Error("ANTHROPIC_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Fetch user context
    const [profileRes, goalsRes, recentErgRes, recentStrengthRes, plansRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("user_goals")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("erg_workouts")
          .select("*")
          .eq("user_id", user.id)
          .order("workout_date", { ascending: false })
          .limit(5),
        supabase
          .from("strength_workouts")
          .select("*")
          .eq("user_id", user.id)
          .order("workout_date", { ascending: false })
          .limit(5),
        supabase
          .from("workout_plans")
          .select("title, description, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = recentErgRes.data || [];
    const recentStrength = recentStrengthRes.data || [];
    const plans = plansRes.data || [];

    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Type: ${profile?.user_type || "rower"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${
      profile?.weight || "Unknown"
    }kg, Height: ${profile?.height || "Unknown"}cm
- Goals: ${profile?.goals || "Not set"}

USER GOALS:
- Current 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${
      goals?.goal_2k_time || "Not set"
    }
- Current 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${
      goals?.goal_5k_time || "Not set"
    }
- Current 6K: ${goals?.current_6k_time || "Not set"} → Goal: ${
      goals?.goal_6k_time || "Not set"
    }

RECENT ERG WORKOUTS:
${
  recentErg.length
    ? recentErg
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.workout_type}, ${w.distance}m, duration: ${w.duration}, avg split: ${w.avg_split}`
        )
        .join("\n")
    : "No recent workouts"
}

RECENT STRENGTH WORKOUTS:
${
  recentStrength.length
    ? recentStrength
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.exercise}, ${w.sets}x${w.reps} @ ${w.weight}kg`
        )
        .join("\n")
    : "No recent workouts"
}

TRAINING PLANS:
${
  plans.length
    ? plans
        .map((p) => `- ${p.title}: ${p.description || "No description"}`)
        .join("\n")
    : "No plans"
}
`.trim();

    const systemPrompt = `You are CrewSync AI, an expert rowing and strength training coach assistant.

You know:
- Rowing technique, training periodization, race strategy
- Erg training (steady state, intervals, test pieces)
- Strength training for rowers
- Nutrition and recovery
- Training plan design for 2K, 5K, 6K

Use the user's real data:

${userContext}

Guidelines:
- Be encouraging but honest
- Give specific, actionable advice
- Use rowing terminology naturally
- Suggest paces based on fitness
- Use markdown formatting
- Keep answers focused unless asked for detail`;

    // ⭐ STREAMING REQUEST TO ANTHROPIC
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 4096,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", anthropicResponse.status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ⭐ RETURN STREAM DIRECTLY TO FRONTEND
    return new Response(anthropicResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
      },
    });
  } catch (e) {
    console.error("chat-rowing error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
- Current 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${goals?.goal_5k_time || "Not set"}
- Current 6K: ${goals?.current_6k_time || "Not set"} → Goal: ${goals?.goal_6k_time || "Not set"}

RECENT ERG WORKOUTS (last 5):
${recentErg.length ? recentErg.map(w => `- ${w.workout_date}: ${w.workout_type}, ${w.distance}m, duration: ${w.duration}, avg split: ${w.avg_split}`).join("\n") : "No recent workouts"}

RECENT STRENGTH WORKOUTS (last 5):
${recentStrength.length ? recentStrength.map(w => `- ${w.workout_date}: ${w.exercise}, ${w.sets}x${w.reps} @ ${w.weight}kg`).join("\n") : "No recent workouts"}

TRAINING PLANS:
${plans.length ? plans.map(p => `- ${p.title}: ${p.description || "No description"}`).join("\n") : "No plans"}
`.trim();

    const systemPrompt = `You are CrewSync AI, an expert rowing and strength training coach assistant. You have deep knowledge of:
- Rowing technique, training periodization, and race strategy
- Erg (Concept2) training: steady state, intervals, rate work, test pieces
- Strength training for rowers: compound lifts, injury prevention, mobility
- Nutrition and recovery for endurance athletes
- Training plan design for 2K, 5K, and 6K races

You have access to this user's data to give personalized advice:

${userContext}

Guidelines:
- Be encouraging but honest. Give specific, actionable advice.
- Reference the user's actual data when relevant (their times, recent workouts, goals).
- Use rowing terminology naturally (splits, rate, steady state, etc.).
- When suggesting workouts, give specific paces based on their current fitness.
- Format responses with markdown for readability.
- Keep answers focused and concise unless asked for detail.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-rowing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
