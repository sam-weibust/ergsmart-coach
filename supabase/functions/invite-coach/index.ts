import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "CrewSync <onboarding@resend.dev>";
const APP_URL = "https://crewsync.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLE_LABELS: Record<string, string> = {
  assistant_coach: "Assistant Coach",
  volunteer_coach: "Volunteer Coach",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "")
      .auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { team_id, team_name, email, role } = await req.json();
    if (!team_id || !email || !role) throw new Error("team_id, email, and role are required");

    // Verify caller is head coach of this team
    const { data: team } = await serviceClient.from("teams").select("id, coach_id, name").eq("id", team_id).maybeSingle();
    const { data: isHeadCoach } = await serviceClient
      .from("team_coaches")
      .select("id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .eq("role", "head_coach")
      .maybeSingle();

    if (team?.coach_id !== user.id && !isHeadCoach) throw new Error("Only the head coach can invite coaches");

    // Get inviter's name
    const { data: inviterProfile } = await serviceClient
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .maybeSingle();
    const inviterName = inviterProfile?.full_name || inviterProfile?.username || "Your head coach";
    const resolvedTeamName = team?.name || team_name || "the team";

    // Create invite record
    const { data: invite, error: insertError } = await serviceClient
      .from("coach_invites")
      .insert({
        team_id,
        email: email.toLowerCase().trim(),
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const acceptUrl = `${APP_URL}/dashboard?accept_coach_invite=${invite.token}`;
    const roleLabel = ROLE_LABELS[role] || role;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#0a1628;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">CrewSync</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:13px;">Your rowing performance platform</p>
        </td></tr>
        <tr><td style="padding:36px 32px 28px;">
          <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">You've been invited to join a coaching staff</p>
          <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
            <strong style="color:#0a1628;">${inviterName}</strong> has invited you to join
            <strong style="color:#0a1628;">${resolvedTeamName}</strong> as a
            <strong style="color:#0a1628;">${roleLabel}</strong> on CrewSync.
          </p>
          <p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.7;">
            As a ${roleLabel} you'll have access to the team's training data, lineups, and tools.
            This invitation expires in 7 days.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 36px;">
          <a href="${acceptUrl}"
             style="display:inline-block;background:#2d6be4;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;">
            Accept Invitation
          </a>
        </td></tr>
        <tr><td style="background:#0a1628;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.45);font-size:12px;">
            © 2026 CrewSync · If you did not expect this email, you can ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `${inviterName} invited you to coach ${resolvedTeamName} on CrewSync`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.json();
      console.error("Resend error:", err);
    }

    return new Response(JSON.stringify({ success: true, invite_id: invite.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("invite-coach error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
