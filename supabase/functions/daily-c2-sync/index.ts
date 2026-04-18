import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Verify cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (expectedSecret && cronSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Get all users with connected Concept2 accounts
  const { data: tokens } = await supabase
    .from("concept2_tokens")
    .select("user_id");

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ synced: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let synced = 0;
  let errors = 0;

  for (const { user_id } of tokens) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-concept2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
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
