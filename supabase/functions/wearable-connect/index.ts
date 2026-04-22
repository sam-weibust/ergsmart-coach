import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const TERRA_API_KEY = Deno.env.get("TERRA_API_KEY");
    const TERRA_DEV_ID = Deno.env.get("TERRA_DEV_ID");
    const APP_URL = Deno.env.get("APP_URL") || "https://crewsync.app";

    if (!TERRA_API_KEY || !TERRA_DEV_ID) {
      return new Response(JSON.stringify({ error: "Wearable integration not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, provider } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Create Terra widget session — user picks provider in the hosted UI if none specified
    const body: Record<string, string> = {
      reference_id: user_id,
      auth_success_redirect_url: `${APP_URL}/recovery?wearable=connected`,
      auth_failure_redirect_url: `${APP_URL}/recovery?wearable=failed`,
      language: "en",
    };
    if (provider) body.providers = provider.toUpperCase();

    const res = await fetch("https://api.tryterra.ai/v2/auth/generateWidgetSession", {
      method: "POST",
      headers: {
        "dev-id": TERRA_DEV_ID,
        "x-api-key": TERRA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[wearable-connect] Terra error:", err);
      return new Response(JSON.stringify({ error: "Failed to create widget session" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ url: data.url, session_id: data.session_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wearable-connect]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
