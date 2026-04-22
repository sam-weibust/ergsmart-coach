import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getOAuthUrl, encodeState, SUPPORTED_PROVIDERS, type Provider } from "../_shared/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, provider } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!provider) {
      return new Response(JSON.stringify({ error: "Missing provider" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The redirect_uri must be registered in each provider's OAuth app settings.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const redirectUri = `${SUPABASE_URL}/functions/v1/wearable-callback`;
    const state = encodeState(user_id, provider as Provider);
    const url = getOAuthUrl(provider as Provider, redirectUri, state);

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wearable-connect]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
