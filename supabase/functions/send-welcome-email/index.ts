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

function buildWelcomeEmail(firstName: string, userId: string, unsubscribeToken: string): string {
  const notifyUrl = `${SUPABASE_URL}/functions/v1/notify-me?user_id=${encodeURIComponent(userId)}`;
  const unsubUrl = `${SUPABASE_URL}/functions/v1/send-welcome-email?action=unsubscribe&token=${encodeURIComponent(unsubscribeToken)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#0a1628;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">CrewSync</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:13px;">Your rowing performance platform</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 0;">
          <p style="margin:0 0 16px;color:#0a1628;font-size:17px;font-weight:600;">Hey ${firstName},</p>

          <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
            Welcome to CrewSync. You just joined the rowing platform built for serious athletes and coaches.
          </p>

          <p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.7;">
            You are one of our early beta users — which means <strong style="color:#0a1628;">everything is completely free right now</strong>.
            When paid plans launch in Fall 2026, you will automatically get <strong style="color:#2d6be4;">20% off for life</strong> — no code needed,
            it applies to your account automatically.
          </p>

          <!-- Steps -->
          <div style="background:#f8f9fb;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
            <p style="margin:0 0 14px;color:#0a1628;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Here is what to do first:</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="width:28px;vertical-align:top;padding-top:1px;">
                  <div style="width:22px;height:22px;border-radius:50%;background:#2d6be4;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:22px;">1</div>
                </td>
                <td style="color:#4a5568;font-size:14px;line-height:1.6;padding-bottom:12px;">
                  <strong style="color:#0a1628;">Connect your Concept2 account</strong> to sync your full workout history automatically
                </td>
              </tr>
              <tr>
                <td style="width:28px;vertical-align:top;padding-top:1px;">
                  <div style="width:22px;height:22px;border-radius:50%;background:#2d6be4;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:22px;">2</div>
                </td>
                <td style="color:#4a5568;font-size:14px;line-height:1.6;padding-bottom:12px;">
                  <strong style="color:#0a1628;">Log your first erg score</strong> to appear on the global leaderboard
                </td>
              </tr>
              <tr>
                <td style="width:28px;vertical-align:top;padding-top:1px;">
                  <div style="width:22px;height:22px;border-radius:50%;background:#2d6be4;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:22px;">3</div>
                </td>
                <td style="color:#4a5568;font-size:14px;line-height:1.6;">
                  <strong style="color:#0a1628;">Try the live PM5 Bluetooth connection</strong> if you have a Concept2 erg nearby
                </td>
              </tr>
            </table>
          </div>

          <p style="margin:0 0 28px;color:#4a5568;font-size:15px;line-height:1.7;">
            One question — would you like us to notify you when paid plans launch so you can lock in your beta discount?
            Reply <strong style="color:#0a1628;">YES</strong> to this email or click the button below.
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 32px 36px;">
          <a href="${notifyUrl}"
             style="display:inline-block;background:#2d6be4;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.1px;">
            Yes, notify me when plans launch
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0a1628;padding:20px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;">
            © 2026 CrewSync &nbsp;·&nbsp;
            <a href="${APP_URL}" style="color:#2d6be4;text-decoration:none;">crewsync.app</a>
            &nbsp;·&nbsp;
            <a href="${unsubUrl}" style="color:#2d6be4;text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle unsubscribe GET
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "unsubscribe") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("<h2>Invalid link.</h2>", { status: 400, headers: { "Content-Type": "text/html" } });
      }
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: prefs } = await serviceClient
        .from("notification_preferences")
        .select("id")
        .eq("unsubscribe_token", token)
        .maybeSingle();

      if (prefs) {
        await serviceClient
          .from("notification_preferences")
          .update({ welcome_email: false, updated_at: new Date().toISOString() })
          .eq("unsubscribe_token", token);
      }

      return new Response(
        `<html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#0a1628;">
          <h2>Unsubscribed</h2>
          <p style="color:#4a5568;">You won't receive welcome-related emails from CrewSync.</p>
          <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#2d6be4;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;">Back to CrewSync</a>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { user_id, email, full_name } = body;

    if (!user_id || !email) {
      return new Response(JSON.stringify({ error: "user_id and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("send-welcome-email:", { user_id, email });

    // Get or create notification preferences for unsubscribe token
    let unsubscribeToken = "default";
    const { data: prefs } = await serviceClient
      .from("notification_preferences")
      .select("unsubscribe_token")
      .eq("user_id", user_id)
      .maybeSingle();

    if (prefs) {
      unsubscribeToken = prefs.unsubscribe_token;
    } else {
      const { data: newPrefs } = await serviceClient
        .from("notification_preferences")
        .insert({ user_id })
        .select()
        .single();
      if (newPrefs) unsubscribeToken = newPrefs.unsubscribe_token;
    }

    // Derive first name from full_name or fall back to email prefix
    const firstName = full_name
      ? full_name.trim().split(" ")[0]
      : email.split("@")[0];

    const html = buildWelcomeEmail(firstName, user_id, unsubscribeToken);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Welcome to CrewSync — you're in early",
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend error:", emailData);
      return new Response(JSON.stringify({ error: emailData.message ?? "resend error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Welcome email sent to", email, emailData.id);
    return new Response(JSON.stringify({ success: true, id: emailData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-welcome-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
