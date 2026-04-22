import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  exchangeProviderCode, encryptToken, decodeState, type Provider,
} from "../_shared/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const APP_URL = Deno.env.get("APP_URL") || "https://crewsync.app";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const redirectUri = `${SUPABASE_URL}/functions/v1/wearable-callback`;

  // ── GET: OAuth redirect from provider ────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      console.error("[wearable-callback] provider error:", oauthError);
      return Response.redirect(
        `${APP_URL}/recovery?wearable=failed&error=${encodeURIComponent(oauthError)}`, 302
      );
    }

    if (!code || !state) {
      return Response.redirect(`${APP_URL}/recovery?wearable=failed&error=missing_params`, 302);
    }

    const decoded = decodeState(state);
    if (!decoded) {
      return Response.redirect(`${APP_URL}/recovery?wearable=failed&error=invalid_state`, 302);
    }

    const { userId, provider } = decoded;

    try {
      const tokens = await exchangeProviderCode(provider, code, redirectUri);

      const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
      const accessEnc = await encryptToken(tokens.access_token);
      const refreshEnc = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null;

      const { error: dbError } = await supabase.from("wearable_connections").upsert({
        user_id: userId,
        provider,
        open_wearables_user_id: tokens.provider_user_id ?? null,
        access_token_enc: accessEnc,
        refresh_token_enc: refreshEnc,
        token_expires_at: tokens.expires_at ?? null,
        is_active: true,
        connected_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "user_id,provider" });

      if (dbError) {
        console.error("[wearable-callback] DB error:", dbError);
        return Response.redirect(`${APP_URL}/recovery?wearable=failed&error=db_error`, 302);
      }

      console.log("[wearable-callback] connected", provider, "for user", userId);
      return Response.redirect(
        `${APP_URL}/recovery?wearable=connected&provider=${provider}`, 302
      );
    } catch (e) {
      console.error("[wearable-callback] error:", e);
      const msg = encodeURIComponent(e instanceof Error ? e.message : "Unknown error");
      return Response.redirect(`${APP_URL}/recovery?wearable=failed&error=${msg}`, 302);
    }
  }

  // ── POST: Direct store (internal / webhook use) ───────────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { user_id, provider, access_token, refresh_token, token_expires_at, provider_user_id } = body;

      if (!user_id || !provider || !access_token) {
        return new Response(JSON.stringify({ error: "Missing required fields: user_id, provider, access_token" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
      const accessEnc = await encryptToken(access_token);
      const refreshEnc = refresh_token ? await encryptToken(refresh_token) : null;

      const { error } = await supabase.from("wearable_connections").upsert({
        user_id,
        provider: provider.toLowerCase(),
        open_wearables_user_id: provider_user_id ?? null,
        access_token_enc: accessEnc,
        refresh_token_enc: refreshEnc,
        token_expires_at: token_expires_at ?? null,
        is_active: true,
        connected_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "user_id,provider" });

      if (error) throw error;

      console.log("[wearable-callback] stored connection for", provider, user_id);
      return new Response(JSON.stringify({ success: true, provider }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[wearable-callback] POST error:", e);
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
