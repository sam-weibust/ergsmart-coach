import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationEmailRequest {
  type: "friend_request" | "team_addition" | "friend_accepted";
  recipientEmail: string;
  recipientName?: string;
  senderName: string;
  teamName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, recipientEmail, recipientName, senderName, teamName }: NotificationEmailRequest = await req.json();

    console.log("Sending notification email:", { type, recipientEmail, senderName, teamName });

    let subject: string;
    let html: string;
    const appName = "CrewSync";

    switch (type) {
      case "friend_request":
        subject = `${senderName} sent you a friend request on ${appName}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px;">New Friend Request</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Hi${recipientName ? ` ${recipientName}` : ""},
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              <strong>${senderName}</strong> has sent you a friend request on ${appName}!
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Log in to your account to accept or decline this request.
            </p>
            <p style="color: #888; font-size: 14px; margin-top: 30px;">
              - The ${appName} Team
            </p>
          </div>
        `;
        break;

      case "friend_accepted":
        subject = `${senderName} accepted your friend request on ${appName}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px;">Friend Request Accepted!</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Hi${recipientName ? ` ${recipientName}` : ""},
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              <strong>${senderName}</strong> has accepted your friend request on ${appName}!
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              You can now view each other's training plans and compare progress.
            </p>
            <p style="color: #888; font-size: 14px; margin-top: 30px;">
              - The ${appName} Team
            </p>
          </div>
        `;
        break;

      case "team_addition":
        subject = `You've been added to ${teamName} on ${appName}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px;">Welcome to the Team!</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Hi${recipientName ? ` ${recipientName}` : ""},
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              <strong>${senderName}</strong> has added you to the team <strong>${teamName}</strong> on ${appName}!
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Log in to view your team's leaderboard, goals, and shared training plans.
            </p>
            <p style="color: #888; font-size: 14px; margin-top: 30px;">
              - The ${appName} Team
            </p>
          </div>
        `;
        break;

      default:
        throw new Error("Unknown notification type");
    }

    // Send via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CrewSync <onboarding@resend.dev>",
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailData);
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, id: emailData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
