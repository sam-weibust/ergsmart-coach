import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (expectedSecret && cronSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: connections } = await supabase
    .from("whoop_connections")
    .select("user_id");

  if (!connections || connections.length === 0) {
    return new Response(JSON.stringify({ synced: 0 }), {
      headers: { "Content-Type": "application/json" },
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
        await supabase
          .from("whoop_connections")
          .update({ last_auto_sync_at: now })
          .eq("user_id", user_id);
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return new Response(JSON.stringify({ synced, errors, total: connections.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
