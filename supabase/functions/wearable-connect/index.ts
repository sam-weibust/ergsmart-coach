import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createConnectSession } from "../_shared/openWearables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!Deno.env.get("OPEN_WEARABLES_API_KEY")) {
      return new Response(JSON.stringify({ error: "Wearable integration not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, provider } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const APP_URL = Deno.env.get("APP_URL") || "https://crewsync.app";

    const session = await createConnectSession({
      reference_id: user_id,
      provider: provider ?? undefined,
      success_url: `${APP_URL}/recovery?wearable=connected`,
      failure_url: `${APP_URL}/recovery?wearable=failed`,
    });

    return new Response(JSON.stringify({ url: session.auth_url, session_id: session.session_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wearable-connect]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
