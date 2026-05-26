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

  // Only sync users active within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Batch query: join concept2_tokens with profiles to filter active users
  const { data: tokens } = await supabase
    .from("concept2_tokens")
    .select("user_id, profiles!inner(last_active_at)")
    .gte("profiles.last_active_at", thirtyDaysAgo);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ synced: 0, skipped: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let synced = 0;
  let errors = 0;

  for (const { user_id } of tokens) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-concept2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ user_id }),
      });
      if (res.ok) synced++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return new Response(JSON.stringify({ synced, errors, total: tokens.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
