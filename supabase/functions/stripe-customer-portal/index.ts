/**
 * stripe-customer-portal
 *
 * Returns a Stripe Billing Portal URL so a subscriber can update their card,
 * download invoices, or cancel. Requires a signed-in caller who already has a
 * Stripe customer — there is nothing to manage otherwise.
 *
 * POST { return_url? } → { url }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://crewsync.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) throw new Error("Billing is not configured yet (STRIPE_SECRET_KEY missing).");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Not authenticated");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const customerId = (profile as any)?.stripe_customer_id;
    if (!customerId) throw new Error("No billing account yet — subscribe first.");

    const body = await req.json().catch(() => ({}));
    const stripe = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: body.return_url ?? `${SITE_URL}/dashboard`,
    });

    return json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stripe-customer-portal]", message);
    return json({ error: message }, 400);
  }
});
