/**
 * stripe-webhook
 *
 * The only writer of subscription state. Runs with verify_jwt = false (Stripe
 * cannot present a Supabase JWT) and authenticates the request by verifying the
 * Stripe signature instead — an unsigned or badly-signed POST is rejected
 * before any database write.
 *
 * Handles:
 *   checkout.session.completed          → first activation
 *   customer.subscription.created       → activation (redundant, idempotent)
 *   customer.subscription.updated       → renewal, plan change, cancel-at-end
 *   customer.subscription.deleted       → downgrade to free
 *   invoice.payment_failed              → mark past_due
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

/** Stripe treats any 2xx as delivered; only retry-worthy failures return 5xx. */
const ok = (body: unknown = { received: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** Subscription statuses that entitle the user to their paid tier. */
const ENTITLED = new Set(["active", "trialing", "past_due"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secretKey || !webhookSecret) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set");
    return new Response("Billing not configured", { status: 500, headers: cors });
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400, headers: cors });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    // Async variant — the sync one uses Node crypto and throws under Deno.
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed:", e instanceof Error ? e.message : e);
    return new Response("Invalid signature", { status: 400, headers: cors });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  /** Resolve the CrewSync user for a subscription, by metadata then by customer. */
  const resolveUserId = async (
    meta: Record<string, string> | undefined,
    customerId: string | null,
  ): Promise<string | null> => {
    const fromMeta = meta?.supabase_user_id;
    if (fromMeta) return fromMeta;
    if (!customerId) return null;
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return (data as any)?.id ?? null;
  };

  const syncSubscription = async (sub: Stripe.Subscription) => {
    const meta = (sub.metadata ?? {}) as Record<string, string>;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    const userId = await resolveUserId(meta, customerId);
    if (!userId) {
      console.error("[stripe-webhook] no CrewSync user for subscription", sub.id);
      return;
    }

    const entitled = ENTITLED.has(sub.status);
    const tier = meta.tier === "elite" || meta.tier === "pro" ? meta.tier : "pro";

    const { error: subErr } = await admin.from("subscriptions").upsert({
      user_id: userId,
      team_id: meta.team_id || null,
      stripe_customer_id: customerId ?? "",
      stripe_subscription_id: sub.id,
      plan_id: meta.plan_id || "pro",
      tier,
      team_size: meta.team_size || null,
      status: sub.status,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    }, { onConflict: "stripe_subscription_id" });
    if (subErr) throw subErr;

    const { error: profErr } = await admin
      .from("profiles")
      .update({
        subscription_tier: entitled ? tier : "free",
        stripe_customer_id: customerId ?? undefined,
      })
      .eq("id", userId);
    if (profErr) throw profErr;

    console.log(`[stripe-webhook] ${sub.id} → ${sub.status} (${entitled ? tier : "free"}) for ${userId}`);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;
        const subId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        // Checkout metadata is the authoritative copy — subscription_data should
        // carry it too, but merge so an older session can't land tier-less.
        sub.metadata = { ...(sub.metadata ?? {}), ...((session.metadata ?? {}) as any) };
        await syncSubscription(sub);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!subId) break;
        await syncSubscription(await stripe.subscriptions.retrieve(subId));
        break;
      }

      default:
        console.log("[stripe-webhook] ignoring", event.type);
    }
    return ok();
  } catch (e) {
    // 500 makes Stripe retry with backoff, so a transient database error does
    // not silently lose a paid subscription.
    console.error("[stripe-webhook] handler failed:", e instanceof Error ? e.message : e);
    return new Response("Handler error", { status: 500, headers: cors });
  }
});
