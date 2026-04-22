import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exchangeCode, encryptToken } from "../_shared/openWearables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    // Supports two modes:
    // 1. Code exchange: { user_id, code, session_id } — Open Wearables returns tokens
    // 2. Direct store: { user_id, provider, open_wearables_user_id, access_token, refresh_token }
    const { user_id, code, session_id } = body;

    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    let provider: string;
    let owUserId: string;
    let accessEnc: string | null = null;
    let refreshEnc: string | null = null;
    let expiresAt: string | null = null;

    if (code) {
      // Exchange code via Open Wearables
      const tokens = await exchangeCode(code, session_id);
      provider = tokens.provider.toLowerCase();
      owUserId = tokens.open_wearables_user_id;
      accessEnc = await encryptToken(tokens.access_token);
      if (tokens.refresh_token) refreshEnc = await encryptToken(tokens.refresh_token);
      expiresAt = tokens.expires_at ?? null;
    } else {
      // Direct store (e.g. from webhook connection.created)
      const { provider: p, open_wearables_user_id, access_token, refresh_token, token_expires_at } = body;
      if (!p || !open_wearables_user_id) return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      provider = p.toLowerCase();
      owUserId = open_wearables_user_id;
      if (access_token) accessEnc = await encryptToken(access_token);
      if (refresh_token) refreshEnc = await encryptToken(refresh_token);
      expiresAt = token_expires_at ?? null;
    }

    const { error } = await supabase.from("wearable_connections").upsert({
      user_id,
      provider,
      open_wearables_user_id: owUserId,
      access_token_enc: accessEnc,
      refresh_token_enc: refreshEnc,
      token_expires_at: expiresAt,
      is_active: true,
      connected_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: "user_id,provider" });

    if (error) throw error;

    console.log("[wearable-callback] connected", provider, "for user", user_id);
    return new Response(JSON.stringify({ success: true, provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wearable-callback]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
