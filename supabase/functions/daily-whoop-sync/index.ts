import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (expectedSecret && cronSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Only sync users active within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connections } = await supabase
    .from("whoop_connections")
    .select("user_id, profiles!inner(last_active_at)")
    .gte("profiles.last_active_at", thirtyDaysAgo);

  if (!connections || connections.length === 0) {
    return new Response(JSON.stringify({ synced: 0, skipped: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let synced = 0, errors = 0;
  const now = new Date().toISOString();

  for (const { user_id } of connections) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-whoop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ user_id }),
      });
      if (res.ok) {
        synced++;
        await supabase.from("whoop_connections").update({ last_auto_sync_at: now }).eq("user_id", user_id);
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return new Response(JSON.stringify({ synced, errors, total: connections.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
