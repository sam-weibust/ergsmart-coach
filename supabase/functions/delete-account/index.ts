import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Verify caller is authenticated
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
    console.log("delete-account: starting hard delete for user", userId);

    // Log deletion request
    await adminClient.from("audit_logs").insert({
      user_id: userId,
      action: "account_deletion",
      resource_type: "user",
      metadata: { email: user.email, initiated_at: new Date().toISOString() },
    });

    // Hard delete personal data
    const tables = [
      "erg_workouts", "erg_scores", "recovery_logs",
      "wellness_checkins", "parent_contacts", "workout_plans",
      "user_goals", "team_members", "athlete_academics",
      "ai_response_cache", "data_requests",
    ];

    for (const table of tables) {
      const col = table === "erg_workouts" || table === "erg_scores" ? "user_id" : "user_id";
      const { error } = await adminClient.from(table as any).delete().eq(col, userId);
      if (error) console.warn(`delete-account: could not delete from ${table}:`, error.message);
      else console.log(`delete-account: deleted from ${table}`);
    }

    // Delete storage files
    const buckets = ["avatars", "videos", "training-files"];
    for (const bucket of buckets) {
      const { data: files } = await adminClient.storage.from(bucket).list(userId);
      if (files?.length) {
        const paths = files.map((f: any) => `${userId}/${f.name}`);
        await adminClient.storage.from(bucket).remove(paths);
        console.log(`delete-account: removed ${paths.length} files from ${bucket}`);
      }
    }

    // Delete team logos for teams the user owns
    const { data: ownedTeams } = await adminClient
      .from("teams")
      .select("id")
      .eq("coach_id", userId);
    for (const team of ownedTeams ?? []) {
      const { data: logoFiles } = await adminClient.storage.from("team-logos").list(team.id);
      if (logoFiles?.length) {
        const paths = logoFiles.map((f: any) => `${team.id}/${f.name}`);
        await adminClient.storage.from("team-logos").remove(paths);
      }
    }

    // Delete profile last (foreign key constraint)
    await adminClient.from("profiles").delete().eq("id", userId);
    console.log("delete-account: deleted profile");

    // Send confirmation email via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY && user.email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "CrewSync <noreply@crewsync.app>",
          to: user.email,
          subject: "Your CrewSync account has been deleted",
          html: `<p>Your CrewSync account and all associated personal data have been permanently deleted as requested.</p>
<p>This includes your profile, training history, erg scores, recovery logs, and all other personal information.</p>
<p>If you did not request this deletion, please contact sam.weibust@gmail.com immediately.</p>
<p>— CrewSync</p>`,
        }),
      });
    }

    // Delete the Supabase auth user (must be last)
    const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthErr) console.error("delete-account: auth delete error:", deleteAuthErr.message);
    else console.log("delete-account: auth user deleted");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delete-account error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
