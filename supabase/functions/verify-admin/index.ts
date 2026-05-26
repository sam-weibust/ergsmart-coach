import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "sam.weibust@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    if (user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ admin: true, user_id: user.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
