import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Wearable integrations have been removed. This function is no longer active.
serve(() => new Response(JSON.stringify({ error: "Wearable integrations are not available" }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
