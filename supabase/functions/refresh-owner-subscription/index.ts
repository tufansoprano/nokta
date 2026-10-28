import Stripe from "npm:stripe@22.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StripeMode = "test" | "live";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...init.headers },
  });
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function getUserFromRequest(request: Request) {
  const supabase = createAdminClient();
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Missing authorization token.");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error(error?.message ?? "Could not verify user.");
  return { supabase, user: data.user };
}

function getStripeSecretKey(mode: StripeMode) {
  return Deno.env.get(mode === "test" ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_LIVE_SECRET_KEY") ?? (mode === "live" ? Deno.env.get("STRIPE_SECRET_KEY") : null);
}

function getPlanFromStripePriceId(priceId: string | null | undefined, mode: StripeMode) {
  if (!priceId) return null;
  const prefix = mode === "test" ? "STRIPE_TEST" : "STRIPE_LIVE";
  if (priceId === Deno.env.get(`${prefix}_STARTER_PRICE_ID`) || (mode === "live" && priceId === Deno.env.get("STRIPE_STARTER_PRICE_ID"))) return "starter";
  if (priceId === Deno.env.get(`${prefix}_GROWTH_PRICE_ID`) || (mode === "live" && priceId === Deno.env.get("STRIPE_GROWTH_PRICE_ID"))) return "growth";
  if (priceId === Deno.env.get(`${prefix}_PRO_PRICE_ID`) || (mode === "live" && priceId === Deno.env.get("STRIPE_PRO_PRICE_ID"))) return "pro";
  return null;
}

function mapStripeSubscriptionStatusToNoktaStatus(status: string) {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      return "inactive";
  }
}

function unixToIso(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { supabase, user } = await getUserFromRequest(request);
    const { venueId } = await request.json();
    if (typeof venueId !== "string") return jsonResponse({ error: "A venue is required." }, { status: 400 });

    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id")
      .eq("id", venueId)
      .eq("is_claimed", true)
      .eq("claimed_by", user.id)
      .maybeSingle();
    if (venueError) throw venueError;
    if (!venue) return jsonResponse({ error: "You can only refresh billing for venues you own." }, { status: 403 });

    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("venue_subscriptions")
      .select("billing_subscription_id,stripe_mode")
      .eq("venue_id", venue.id)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscriptionRow?.billing_subscription_id) return jsonResponse({ refreshed: false, reason: "No Stripe subscription ID exists yet." });

    const stripeMode = (subscriptionRow.stripe_mode === "test" ? "test" : "live") as StripeMode;
    const stripeSecretKey = getStripeSecretKey(stripeMode);
    if (!stripeSecretKey) {
      console.error("refresh-owner-subscription not configured", { reason: "missing_secret_key", stripeMode });
      return jsonResponse({ error: "Stripe secret key is not configured for this mode." }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionRow.billing_subscription_id);
    const item = stripeSubscription.items.data[0];
    const priceId = item?.price.id ?? null;
    const plan = getPlanFromStripePriceId(priceId, stripeMode);
    if (!plan) {
      console.error("refresh-owner-subscription unknown price", { venueId: venue.id, subscriptionId: stripeSubscription.id, priceId, stripeMode });
      return jsonResponse({ error: "Could not map Stripe price to a Nokta plan." }, { status: 400 });
    }

    const status = mapStripeSubscriptionStatusToNoktaStatus(stripeSubscription.status);
    const hasPaidAccess = status === "active" || status === "trial" || status === "past_due";
    const customerId = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : stripeSubscription.customer.id;
    const productId = typeof item?.price.product === "string" ? item.price.product : item?.price.product?.id ?? null;
    const cancelsAtPeriodEnd = stripeSubscription.cancel_at_period_end || Boolean(stripeSubscription.cancel_at);

    const { error: subscriptionUpdateError } = await supabase.from("venue_subscriptions").update({
      plan,
      status,
      billing_provider: "stripe",
      billing_customer_id: customerId,
      stripe_price_id: priceId,
      stripe_product_id: productId,
      stripe_mode: stripeMode,
      current_period_start: unixToIso(item?.current_period_start ?? stripeSubscription.current_period_start),
      current_period_end: unixToIso(item?.current_period_end ?? stripeSubscription.current_period_end),
      cancel_at_period_end: cancelsAtPeriodEnd,
      cancelled_at: stripeSubscription.status === "canceled" ? new Date().toISOString() : null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("venue_id", venue.id);
    if (subscriptionUpdateError) throw subscriptionUpdateError;

    const { error: venueUpdateError } = await supabase.from("venues").update({
      partner_tier: hasPaidAccess ? plan : "none",
      monetisation_status: status === "cancelled" ? "churned" : hasPaidAccess ? "paying" : "not-contacted",
      updated_at: new Date().toISOString(),
    }).eq("id", venue.id);
    if (venueUpdateError) throw venueUpdateError;

    console.log("refresh-owner-subscription refreshed", { venueId: venue.id, subscriptionId: stripeSubscription.id, plan, status });
    return jsonResponse({ refreshed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh subscription.";
    console.error("refresh-owner-subscription failed", { reason: message });
    return jsonResponse({ error: message }, { status: 500 });
  }
});
