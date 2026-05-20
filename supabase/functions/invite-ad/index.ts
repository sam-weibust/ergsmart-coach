import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "CrewSync <noreply@crewsync.app>";
const APP_URL = "https://crewsync.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    ).auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { team_id, email } = await req.json();
    if (!team_id || !email) throw new Error("team_id and email required");

    // Verify caller is head coach
    const { data: team } = await serviceClient.from("teams").select("id, name, coach_id").eq("id", team_id).maybeSingle();
    const { data: isHeadCoach } = await serviceClient
      .from("team_coaches").select("id").eq("team_id", team_id).eq("user_id", user.id).eq("role", "head_coach").maybeSingle();
    if (team?.coach_id !== user.id && !isHeadCoach) throw new Error("Only head coaches can invite ADs");

    const { data: inviterProfile } = await serviceClient
      .from("profiles").select("full_name, username").eq("id", user.id).maybeSingle();
    const inviterName = inviterProfile?.full_name || inviterProfile?.username || "Your head coach";
    const teamName = team?.name || "the team";

    const { data: invite, error: insertErr } = await serviceClient
      .from("team_athletic_directors")
      .upsert({ team_id, invited_by: user.id, invited_email: email.toLowerCase().trim(), status: "pending" },
        { onConflict: "team_id,invited_email" })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const acceptUrl = `${APP_URL}/dashboard?accept_ad_invite=${invite.token}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#0a1628;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">CrewSync</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:13px;">Athletic Director Access</p>
        </td></tr>
        <tr><td style="padding:36px 32px 28px;">
          <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">You've been granted Athletic Director access</p>
          <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
            <strong style="color:#0a1628;">${inviterName}</strong> has invited you to have Athletic Director oversight access to <strong style="color:#0a1628;">${teamName}</strong> on CrewSync.
          </p>
          <p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.7;">
            As an Athletic Director you'll have read-only access to program-level data including athlete performance, attendance, and season reports. You will not have access to individual coaching decisions, direct messages, or wellness check-ins.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 36px;">
          <a href="${acceptUrl}" style="display:inline-block;background:#0a1628;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;">
            Accept AD Access
          </a>
        </td></tr>
        <tr><td style="background:#0a1628;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.45);font-size:12px;">© 2026 CrewSync · If you did not expect this email, you can ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: `Athletic Director access to ${teamName} — CrewSync`, html }),
    });
    if (!emailResp.ok) console.error("Resend error:", await emailResp.json());

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
