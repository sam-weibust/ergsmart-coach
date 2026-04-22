import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-GCM encryption for token storage
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "default-insecure-key-replace-me";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  const buf = new Uint8Array(12 + enc.byteLength);
  buf.set(iv);
  buf.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...buf));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // This endpoint is called after Terra's redirect with session confirmation
    // Terra's primary data flow is via webhook (user_auth event)
    // This handles explicit token exchange for providers that support direct OAuth
    const body = await req.json();
    const { user_id, provider, terra_user_id, access_token, refresh_token, token_expires_at } = body;

    if (!user_id || !provider) return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const accessEnc = access_token ? await encryptToken(access_token) : null;
    const refreshEnc = refresh_token ? await encryptToken(refresh_token) : null;

    const { error } = await supabase.from("wearable_connections").upsert({
      user_id,
      provider: provider.toLowerCase(),
      terra_user_id,
      access_token_enc: accessEnc,
      refresh_token_enc: refreshEnc,
      token_expires_at: token_expires_at || null,
      is_active: true,
      connected_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: "user_id,provider" });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wearable-callback]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
