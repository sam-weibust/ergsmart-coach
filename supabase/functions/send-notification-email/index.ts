import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "CrewSync <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EmailType =
  | "friend_request"
  | "friend_accepted"
  | "team_board_post"
  | "coach_viewed_profile"
  | "new_pr"
  | "weekly_challenge"
  | "training_plan_updated";

interface NotificationEmailRequest {
  type: EmailType;
  recipientEmail?: string;
  recipientUserId?: string;
  recipientName?: string;
  senderName?: string;
  teamId?: string;
  teamName?: string;
  postContent?: string;
  distanceLabel?: string;
  challengeName?: string;
  planName?: string;
  coachSchool?: string;
}

// ── Branded email template ────────────────────────────────────────────────────

function buildEmail(body: string, ctaText: string, ctaUrl: string, unsubscribeUrl: string): string {
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
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">CrewSync</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:13px;">Your rowing performance platform</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 28px;">
          ${body}
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 32px 36px;">
          <a href="${ctaUrl}"
             style="display:inline-block;background:#2d6be4;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.1px;">
            ${ctaText}
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0a1628;padding:20px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;">
            © 2026 CrewSync &nbsp;·&nbsp;
            <a href="${unsubscribeUrl}" style="color:#2d6be4;text-decoration:none;">Unsubscribe from this email</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function unsubscribeUrl(token: string, type: EmailType): string {
  return `${SUPABASE_URL}/functions/v1/send-notification-email?action=unsubscribe&token=${encodeURIComponent(token)}&type=${type}`;
}

// ── Build subject + body per type ────────────────────────────────────────────

function buildEmailContent(
  type: EmailType,
  recipientName: string | undefined,
  params: NotificationEmailRequest,
  token: string,
): { subject: string; html: string } {
  const hi = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const appUrl = "https://crewsync.app";
  const unsub = unsubscribeUrl(token, type);

  switch (type) {
    case "friend_request": {
      const subject = `${params.senderName} wants to connect on CrewSync`;
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          <strong style="color:#0a1628;">${params.senderName}</strong> sent you a friend request on CrewSync.
          Accept it to compare workouts and track each other's progress.
        </p>
        <p style="margin:0;color:#4a5568;font-size:15px;line-height:1.7;">Log in to accept or decline the request.</p>`;
      return { subject, html: buildEmail(body, "View Friend Request", appUrl, unsub) };
    }

    case "friend_accepted": {
      const subject = `${params.senderName} accepted your friend request`;
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          <strong style="color:#0a1628;">${params.senderName}</strong> accepted your friend request on CrewSync.
          You can now view each other's training plans and compare performance.
        </p>`;
      return { subject, html: buildEmail(body, "View Profile", appUrl, unsub) };
    }

    case "team_board_post": {
      const subject = `New post in ${params.teamName ?? "your team"} on CrewSync`;
      const preview = params.postContent
        ? params.postContent.slice(0, 180) + (params.postContent.length > 180 ? "…" : "")
        : "";
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          <strong style="color:#0a1628;">${params.senderName ?? "Someone"}</strong> posted in the
          <strong style="color:#0a1628;">${params.teamName ?? "team"}</strong> message board.
        </p>
        ${preview ? `<div style="background:#f8f9fb;border-left:3px solid #2d6be4;padding:12px 16px;border-radius:0 6px 6px 0;margin:0 0 16px;color:#4a5568;font-size:14px;line-height:1.6;">${preview}</div>` : ""}`;
      return { subject, html: buildEmail(body, "View Team Board", appUrl, unsub) };
    }

    case "coach_viewed_profile": {
      const school = params.coachSchool ? ` from ${params.coachSchool}` : "";
      const subject = `A coach${school} is following your recruiting profile`;
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          A college rowing coach${school} is now following your recruiting profile on CrewSync.
          Make sure your profile is complete and up-to-date to make the best impression.
        </p>
        <p style="margin:0;color:#4a5568;font-size:15px;line-height:1.7;">
          Keep your erg scores current and add a highlight video to stand out.
        </p>`;
      return { subject, html: buildEmail(body, "Update Recruiting Profile", appUrl, unsub) };
    }

    case "new_pr": {
      const dist = params.distanceLabel ?? "distance";
      const subject = `New ${dist} PR detected — nice work!`;
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          You just set a new personal record for <strong style="color:#0a1628;">${dist}</strong> after your latest workout sync. 🏆
        </p>
        <p style="margin:0;color:#4a5568;font-size:15px;line-height:1.7;">
          Check your Personal Records page to see your full history and track your progress over time.
        </p>`;
      return { subject, html: buildEmail(body, "View Personal Records", appUrl, unsub) };
    }

    case "weekly_challenge": {
      const challenge = params.challengeName ?? "this week's challenge";
      const subject = `Weekly challenge started: ${challenge}`;
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          A new weekly challenge has started on CrewSync: <strong style="color:#0a1628;">${challenge}</strong>.
        </p>
        <p style="margin:0;color:#4a5568;font-size:15px;line-height:1.7;">
          Log your workouts and submit your entry before the week ends to compete on the leaderboard.
        </p>`;
      return { subject, html: buildEmail(body, "Join the Challenge", appUrl, unsub) };
    }

    case "training_plan_updated": {
      const plan = params.planName ? `"${params.planName}"` : "a training plan";
      const subject = `Your coach updated ${plan} on CrewSync`;
      const body = `
        <p style="margin:0 0 16px;color:#0a1628;font-size:16px;font-weight:600;">${hi}</p>
        <p style="margin:0 0 16px;color:#4a5568;font-size:15px;line-height:1.7;">
          <strong style="color:#0a1628;">${params.senderName ?? "Your coach"}</strong> shared a new training plan
          ${params.teamName ? `for <strong style="color:#0a1628;">${params.teamName}</strong>` : "with you"} on CrewSync.
        </p>
        <p style="margin:0;color:#4a5568;font-size:15px;line-height:1.7;">
          Log in to view your upcoming workouts.
        </p>`;
      return { subject, html: buildEmail(body, "View Training Plan", appUrl, unsub) };
    }

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── Unsubscribe via GET ──────────────────────────────────────────────────
  if (req.method === "GET" && action === "unsubscribe") {
    const token = url.searchParams.get("token");
    const type = url.searchParams.get("type") as EmailType | null;

    if (!token || !type) {
      return new Response("<h2>Invalid unsubscribe link.</h2>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: prefs } = await serviceClient
      .from("notification_preferences")
      .select("id")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (!prefs) {
      return new Response(
        `<html><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;">
          <h2>Link expired or invalid.</h2>
          <p>This unsubscribe link is no longer valid.</p>
        </body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } },
      );
    }

    const validTypes: EmailType[] = [
      "friend_request", "friend_accepted", "team_board_post",
      "coach_viewed_profile", "new_pr", "weekly_challenge", "training_plan_updated",
    ];
    if (!validTypes.includes(type)) {
      return new Response("<h2>Unknown notification type.</h2>", { status: 400, headers: { "Content-Type": "text/html" } });
    }

    await serviceClient
      .from("notification_preferences")
      .update({ [type]: false, updated_at: new Date().toISOString() })
      .eq("unsubscribe_token", token);

    const typeLabels: Record<EmailType, string> = {
      friend_request: "Friend Request",
      friend_accepted: "Friend Accepted",
      team_board_post: "Team Board Posts",
      coach_viewed_profile: "Coach Profile Views",
      new_pr: "New Personal Records",
      weekly_challenge: "Weekly Challenges",
      training_plan_updated: "Training Plan Updates",
    };

    return new Response(
      `<html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#0a1628;">
        <h2 style="color:#0a1628;">Unsubscribed</h2>
        <p style="color:#4a5568;">You've been unsubscribed from <strong>${typeLabels[type]}</strong> emails.</p>
        <p style="color:#4a5568;font-size:14px;">You can re-enable this in your CrewSync notification settings.</p>
        <a href="https://crewsync.app" style="display:inline-block;margin-top:16px;background:#2d6be4;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;">Back to CrewSync</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // ── Send email via POST ──────────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: NotificationEmailRequest = await req.json();
    const { type, recipientUserId, teamId } = body;

    console.log("send-notification-email:", { type, recipientUserId, teamId });

    // Build list of recipients
    type Recipient = { email: string; name?: string; userId?: string };
    const recipients: Recipient[] = [];

    if (teamId && type === "team_board_post") {
      // Fetch all team members
      const { data: members } = await serviceClient
        .from("team_members")
        .select("user_id, profiles(email, full_name)")
        .eq("team_id", teamId);

      if (members) {
        for (const m of members) {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          if (profile?.email) {
            recipients.push({ email: profile.email, name: profile.full_name ?? undefined, userId: m.user_id });
          }
        }
      }
    } else if (teamId && type === "training_plan_updated") {
      // Fetch all team members
      const { data: members } = await serviceClient
        .from("team_members")
        .select("user_id, profiles(email, full_name)")
        .eq("team_id", teamId);

      if (members) {
        for (const m of members) {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          if (profile?.email) {
            recipients.push({ email: profile.email, name: profile.full_name ?? undefined, userId: m.user_id });
          }
        }
      }
    } else if (recipientUserId) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("email, full_name")
        .eq("id", recipientUserId)
        .maybeSingle();

      if (profile?.email) {
        recipients.push({ email: profile.email, name: profile.full_name ?? undefined, userId: recipientUserId });
      }
    } else if (body.recipientEmail) {
      recipients.push({ email: body.recipientEmail, name: body.recipientName });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no recipients" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send to each recipient (check preferences, skip if disabled)
    const results: { email: string; sent: boolean; reason?: string }[] = [];

    for (const recipient of recipients) {
      // Fetch or initialize preferences
      let token = "default";
      if (recipient.userId) {
        const { data: prefs } = await serviceClient
          .from("notification_preferences")
          .select("*")
          .eq("user_id", recipient.userId)
          .maybeSingle();

        if (prefs) {
          // Check if this type is disabled
          if (prefs[type] === false) {
            results.push({ email: recipient.email, sent: false, reason: "preference disabled" });
            continue;
          }
          token = prefs.unsubscribe_token;
        } else {
          // Create default preferences for this user
          const { data: newPrefs } = await serviceClient
            .from("notification_preferences")
            .insert({ user_id: recipient.userId })
            .select()
            .single();
          if (newPrefs) token = newPrefs.unsubscribe_token;
        }
      }

      const name = recipient.name ?? body.recipientName;
      const { subject, html } = buildEmailContent(type, name, body, token);

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [recipient.email],
          subject,
          html,
        }),
      });

      const emailData = await emailResponse.json();

      if (!emailResponse.ok) {
        console.error("Resend error for", recipient.email, emailData);
        results.push({ email: recipient.email, sent: false, reason: emailData.message ?? "resend error" });
      } else {
        results.push({ email: recipient.email, sent: true });
      }
    }

    const sentCount = results.filter((r) => r.sent).length;
    console.log(`Sent ${sentCount}/${results.length} emails for type ${type}`);

    return new Response(JSON.stringify({ success: true, results }), {
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
