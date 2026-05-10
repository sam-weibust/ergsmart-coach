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

  const C2_CLIENT_ID     = Deno.env.get("CONCEPT2_CLIENT_ID");
  const C2_CLIENT_SECRET = Deno.env.get("CONCEPT2_CLIENT_SECRET");
  const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // ── Log 1: request received ───────────────────────────────────────────────
  let rawBody = "";
  try { rawBody = await req.text(); } catch {}
  console.log("[c2-callback] LOG1 request received — method:", req.method, "body:", rawBody);

  if (!C2_CLIENT_ID || !C2_CLIENT_SECRET) {
    console.error("[c2-callback] MISSING SECRETS — CONCEPT2_CLIENT_ID:", !!C2_CLIENT_ID, "CONCEPT2_CLIENT_SECRET:", !!C2_CLIENT_SECRET);
    return new Response(JSON.stringify({ error: "Concept2 OAuth not configured — missing secrets" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, user_id, redirect_uri: clientRedirectUri } = parsed;

    if (!code || !user_id) {
      console.error("[c2-callback] missing params — code:", !!code, "user_id:", !!user_id);
      return new Response(JSON.stringify({ error: "Missing code or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectUri = clientRedirectUri ?? "https://crewsync.app/auth/concept2/callback";

    // ── Log 2: token exchange request ─────────────────────────────────────
    console.log("[c2-callback] LOG2 token exchange — user_id:", user_id,
      "redirect_uri:", redirectUri,
      "client_id prefix:", C2_CLIENT_ID.slice(0, 6),
      "code prefix:", String(code).slice(0, 8));

    const tokenBody = new URLSearchParams({
      grant_type:    "authorization_code",
      code:          String(code),
      client_id:     C2_CLIENT_ID,
      client_secret: C2_CLIENT_SECRET,
      redirect_uri:  redirectUri,
    });

    console.log("[c2-callback] LOG2b token request body (no secret):",
      `grant_type=authorization_code&code=${String(code).slice(0,8)}...&client_id=${C2_CLIENT_ID.slice(0,6)}...&redirect_uri=${redirectUri}`);

    const tokenRes = await fetch("https://log.concept2.com/oauth/access_token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    tokenBody,
    });

    const tokenText = await tokenRes.text();

    // ── Log 3: Concept2 response ──────────────────────────────────────────
    console.log("[c2-callback] LOG3 Concept2 response — status:", tokenRes.status, "body:", tokenText);

    if (!tokenRes.ok) {
      let errDetail: unknown = tokenText;
      try { errDetail = JSON.parse(tokenText); } catch { /* keep raw */ }
      return new Response(
        JSON.stringify({
          error:                "Failed to exchange authorization code",
          concept2_status:      tokenRes.status,
          concept2_error:       errDetail,
          redirect_uri_sent:    redirectUri,
          client_id_present:    !!C2_CLIENT_ID,
          client_secret_present: !!C2_CLIENT_SECRET,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let tokens: any;
    try {
      tokens = JSON.parse(tokenText);
    } catch {
      console.error("[c2-callback] failed to parse token JSON:", tokenText);
      return new Response(JSON.stringify({ error: "Invalid token response from Concept2" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tokens.access_token) {
      console.error("[c2-callback] no access_token in response:", JSON.stringify(tokens));
      return new Response(JSON.stringify({ error: "No access_token in Concept2 response", detail: tokens }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const expires_at = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString();

    const upsertPayload = {
      user_id,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at,
      created_at:    now,
      updated_at:    now,
    };

    // ── Log 4: upsert attempt ────────────────────────────────────────────
    console.log("[c2-callback] LOG4 upserting concept2_tokens for user_id:", user_id,
      "expires_at:", expires_at,
      "has_refresh_token:", !!tokens.refresh_token);

    const { data: upsertData, error: upsertError } = await supabase
      .from("concept2_tokens")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select();

    // ── Log 5: upsert result ─────────────────────────────────────────────
    console.log("[c2-callback] LOG5 upsert result — data:", JSON.stringify(upsertData), "error:", JSON.stringify(upsertError));

    if (upsertError) {
      console.error("[c2-callback] UPSERT FAILED:", upsertError.message, upsertError.details, upsertError.hint);
      return new Response(JSON.stringify({
        error: "Failed to save tokens to database",
        db_error: upsertError.message,
        db_details: upsertError.details,
        db_hint: upsertError.hint,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[c2-callback] tokens saved successfully — triggering sync");

    // Trigger initial sync — fire and forget (don't block the success response)
    fetch(`${SUPABASE_URL}/functions/v1/sync-concept2`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ user_id }),
    }).then(async (r) => {
      const t = await r.text();
      console.log("[c2-callback] sync-concept2 response:", r.status, t.slice(0, 200));
    }).catch((e) => {
      console.warn("[c2-callback] sync-concept2 trigger failed (non-fatal):", e.message);
    });

    return new Response(JSON.stringify({ success: true, imported: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[c2-callback] UNHANDLED ERROR:", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
