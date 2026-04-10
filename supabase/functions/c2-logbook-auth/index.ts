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

  try {
    // Service role key (fixes all RLS/401 issues)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Frontend must send: { user_id, c2_api_key }
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

    // Validate the key by hitting the C2 API
    const testResponse = await fetch("https://log.concept2.com/api/users/me", {
      headers: {
        Authorization: `Bearer ${c2_api_key}`,
      },
    });

    if (!testResponse.ok) {
      const t = await testResponse.text();
      console.error("C2 validation error:", testResponse.status, t);
      return new Response(
        JSON.stringify({ error: "Invalid Concept2 API key" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userData = await testResponse.json();

    // Store the key securely
    await supabase.from("c2_tokens").upsert({
      user_id,
      access_token: c2_api_key,
      c2_user_id: userData.id,
      updated_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        c2_user: userData,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error("c2-logbook-auth error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
