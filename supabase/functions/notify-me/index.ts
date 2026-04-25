import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = "https://crewsync.app";

serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");

  if (!userId) {
    return new Response(
      `<html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#0a1628;">
        <h2>Invalid link</h2>
        <p style="color:#4a5568;">This link is missing required information.</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#2d6be4;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;">Back to CrewSync</a>
      </body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await serviceClient
      .from("profiles")
      .update({ wants_launch_notification: true })
      .eq("id", userId);

    if (error) {
      console.error("notify-me update error:", error);
    } else {
      console.log("notify-me: opted in user", userId);
    }

    // Redirect to a success page (handled by the SPA)
    return new Response(null, {
      status: 302,
      headers: {
        "Location": `${APP_URL}/?notified=1`,
      },
    });
  } catch (err: any) {
    console.error("notify-me error:", err);
    return new Response(
      `<html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#0a1628;">
        <h2>Something went wrong</h2>
        <p style="color:#4a5568;">Please try again or reply YES to the welcome email.</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#2d6be4;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;">Back to CrewSync</a>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } },
    );
  }
});
