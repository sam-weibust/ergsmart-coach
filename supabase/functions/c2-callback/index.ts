import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const C2_CLIENT_ID = Deno.env.get("CONCEPT2_CLIENT_ID");
  const C2_CLIENT_SECRET = Deno.env.get("CONCEPT2_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!C2_CLIENT_ID || !C2_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Concept2 OAuth not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { code, user_id } = await req.json();

    if (!code || !user_id) {
      return new Response(JSON.stringify({ error: "Missing code or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://log.concept2.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: C2_CLIENT_ID,
        client_secret: C2_CLIENT_SECRET,
        redirect_uri: "https://ergsmart-coach.vercel.app/auth/concept2/callback",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange error (status %d):", tokenRes.status, errText);
      let errDetail: unknown = errText;
      try { errDetail = JSON.parse(errText); } catch { /* keep raw text */ }
      return new Response(
        JSON.stringify({
          error: "Failed to exchange authorization code",
          concept2_status: tokenRes.status,
          concept2_error: errDetail,
          redirect_uri_sent: "https://ergsmart-coach.vercel.app/auth/concept2/callback",
          client_id_present: !!C2_CLIENT_ID,
          client_secret_present: !!C2_CLIENT_SECRET,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tokens = await tokenRes.json();
    const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store tokens securely — never exposed to frontend
    await supabase.from("concept2_tokens").upsert({
      user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // Trigger initial sync
    const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-concept2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ user_id }),
    });

    let imported = 0;
    if (syncRes.ok) {
      const syncData = await syncRes.json();
      imported = syncData.imported ?? 0;
    }

    return new Response(JSON.stringify({ success: true, imported }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("c2-callback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
