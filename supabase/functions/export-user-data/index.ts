import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Not authenticated");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const userId = user.id;

    // Log export request
    await adminClient.from("audit_logs").insert({
      user_id: userId,
      action: "data_export",
      resource_type: "user",
    });

    // Fetch all personal data
    const [
      profileRes, goalsRes, ergWorkoutsRes, ergScoresRes,
      recoveryRes, wellnessRes, workoutPlansRes,
    ] = await Promise.all([
      adminClient.from("profiles").select("*").eq("id", userId).maybeSingle(),
      adminClient.from("user_goals").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.from("erg_workouts").select("*").eq("user_id", userId).order("workout_date", { ascending: false }),
      adminClient.from("erg_scores").select("*").eq("user_id", userId).order("recorded_at", { ascending: false }),
      adminClient.from("recovery_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false }),
      adminClient.from("wellness_checkins").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      adminClient.from("workout_plans").select("id, title, description, created_at").eq("user_id", userId),
    ]);

    const export_data = {
      exported_at: new Date().toISOString(),
      account: {
        email: user.email,
        created_at: user.created_at,
        last_sign_in: user.last_sign_in_at,
      },
      profile: profileRes.data,
      goals: goalsRes.data,
      erg_workouts: ergWorkoutsRes.data ?? [],
      erg_scores: ergScoresRes.data ?? [],
      recovery_logs: recoveryRes.data ?? [],
      wellness_checkins: wellnessRes.data ?? [],
      workout_plans: workoutPlansRes.data ?? [],
    };

    return new Response(JSON.stringify(export_data, null, 2), {
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="crewsync-data-export.json"',
      },
    });
  } catch (e) {
    console.error("export-user-data error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
