/**
 * stripe-create-checkout
 *
 * Creates a Stripe Checkout Session for a CrewSync subscription and returns its
 * URL. The caller must be signed in; the price comes from the server-side
 * catalogue in _shared/plans.ts, never from the request body.
 *
 * POST { plan_id, team_size?, team_id?, success_url?, cancel_url? }
 *  → { url }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { resolvePlan } from "../_shared/plans.ts";

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

    const body = await req.json().catch(() => ({}));
    const planId = String(body.plan_id ?? "");
    const teamSize = body.team_size ? String(body.team_size) : null;
    const teamId = body.team_id ? String(body.team_id) : null;

    const plan = resolvePlan(planId, teamSize);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const stripe = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Reuse the customer if this account has bought before, so Stripe keeps one
    // billing history and the customer portal shows every past invoice.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | null = (profile as any)?.stripe_customer_id ?? null;
    if (customerId) {
      // A customer deleted in the Stripe dashboard would fail checkout — drop it.
      const existing = await stripe.customers.retrieve(customerId).catch(() => null);
      if (!existing || (existing as any).deleted) customerId = null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (profile as any)?.email ?? user.email ?? undefined,
        name: (profile as any)?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // metadata is echoed back on the webhook — it is how we know which user and
    // which tier a completed payment belongs to.
    const metadata: Record<string, string> = {
      supabase_user_id: user.id,
      plan_id: planId,
      tier: plan.tier,
    };
    if (teamSize) metadata.team_size = teamSize;
    if (teamId) metadata.team_id = teamId;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan.amount,
          recurring: { interval: "month" },
          product_data: { name: plan.name },
        },
      }],
      metadata,
      subscription_data: { metadata },
      success_url: `${body.success_url ?? `${SITE_URL}/dashboard`}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${body.cancel_url ?? `${SITE_URL}/pricing`}?checkout=cancelled`,
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stripe-create-checkout]", message);
    return json({ error: message }, 400);
  }
});
