import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { user_id } = await req.json();
  const { data: conn } = await supabase
    .from("whoop_connections")
    .select("access_token")
    .eq("user_id", user_id)
    .maybeSingle();

  if (!conn?.access_token) {
    return new Response(JSON.stringify({ error: "No token" }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Fetch both with and without date filter so we can compare
  const [r1, r2] = await Promise.all([
    fetch("https://api.prod.whoop.com/developer/v1/recovery?limit=10", {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    }),
    fetch("https://api.prod.whoop.com/developer/v1/recovery?limit=10&nextToken=", {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    }),
  ]);

  const raw1 = await r1.text();
  const raw2 = await r2.text();

  return new Response(JSON.stringify({ status: r1.status, recovery: raw1, recovery2: raw2 }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
