import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── GET: OAuth callback from Concept2 ──────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // user_id

    let errMsg = "";
    try {
      if (!code || !state) throw new Error("Missing authorization code or state");

      const C2_CLIENT_ID = Deno.env.get("C2_CLIENT_ID") ?? Deno.env.get("CONCEPT2_CLIENT_ID") ?? "";
      const C2_CLIENT_SECRET = Deno.env.get("C2_CLIENT_SECRET") ?? Deno.env.get("CONCEPT2_CLIENT_SECRET") ?? "";
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
      const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const redirectUri = `${SUPABASE_URL}/functions/v1/c2-logbook-auth`;
      const user_id = decodeURIComponent(state);

      const tokenRes = await fetch("https://log.concept2.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: C2_CLIENT_ID,
          client_secret: C2_CLIENT_SECRET,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("[c2-logbook-auth] Token exchange failed:", tokenRes.status, errText);
        throw new Error("Token exchange failed");
      }

      const tokens = await tokenRes.json();
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

      await supabase.from("concept2_tokens").upsert({
        user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Trigger initial sync
      fetch(`${SUPABASE_URL}/functions/v1/sync-concept2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ user_id }),
      }).catch((e) => console.error("[c2-logbook-auth] Initial sync failed:", e));

      return new Response(
        `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "c2_auth_success" }, "*");
      window.close();
    } else {
      window.location.href = "${Deno.env.get("SITE_URL") ?? "https://ergsmart-coach.vercel.app"}";
    }
  </script><p>Connected! Closing...</p></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "Unknown error";
      console.error("[c2-logbook-auth] OAuth callback error:", errMsg);
      return new Response(
        `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "c2_auth_error", error: ${JSON.stringify(errMsg)} }, "*");
      window.close();
    } else {
      window.location.href = "${Deno.env.get("SITE_URL") ?? "https://ergsmart-coach.vercel.app"}?c2_error=1";
    }
  </script><p>Auth failed. Closing...</p></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    }
  }

  // ── POST: legacy API-key validation (kept for backwards compat) ────────────
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user_id, c2_api_key } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!c2_api_key) {
      return new Response(JSON.stringify({ error: "Missing Concept2 API key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const testResponse = await fetch("https://log.concept2.com/api/users/me", {
      headers: { Authorization: `Bearer ${c2_api_key}` },
    });

    if (!testResponse.ok) {
      const t = await testResponse.text();
      console.error("C2 validation error:", testResponse.status, t);
      return new Response(JSON.stringify({ error: "Invalid Concept2 API key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userData = await testResponse.json();

    await supabase.from("c2_tokens").upsert({
      user_id,
      access_token: c2_api_key,
      c2_user_id: userData.id,
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, c2_user: userData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("c2-logbook-auth error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
