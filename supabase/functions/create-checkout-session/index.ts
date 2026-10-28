import Stripe from "npm:stripe@22.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PaidVenuePlan = "growth" | "pro";
type StripeMode = "test" | "live";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...init.headers,
    },
  });
}

function isPaidVenuePlan(plan: string): plan is PaidVenuePlan {
  return plan === "growth" || plan === "pro";
}

function getStripePriceIdForPlan(plan: PaidVenuePlan) {
  return getStripePriceIdForPlanAndMode(plan, "live");
}

function getStripePriceIdForPlanAndMode(plan: PaidVenuePlan, mode: StripeMode) {
  const prefix = mode === "test" ? "STRIPE_TEST" : "STRIPE_LIVE";
  const envName = `${prefix}_${plan.toUpperCase()}_PRICE_ID`;

  return Deno.env.get(envName) ?? (mode === "live" ? Deno.env.get(`STRIPE_${plan.toUpperCase()}_PRICE_ID`) : null);
}

function getStripeSecretKey(mode: StripeMode) {
  return Deno.env.get(mode === "test" ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_LIVE_SECRET_KEY") ?? (mode === "live" ? Deno.env.get("STRIPE_SECRET_KEY") : null);
}

const DEFAULT_TEST_ORIGINS = ["localhost", "127.0.0.1"];

function getStripeTestOrigins(): string[] {
  const configured = Deno.env.get("STRIPE_TEST_ORIGINS");
  if (!configured) return DEFAULT_TEST_ORIGINS;
  const origins = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_TEST_ORIGINS;
}

function isTestOrigin(source: string): boolean {
  const haystack = source.toLowerCase();
  return getStripeTestOrigins().some((needle) => haystack.includes(needle));
}

function getStripeModeForRequest(request: Request): StripeMode {
  const origin = request.headers.get("origin") ?? "";
  const referer = request.headers.get("referer") ?? "";
  return isTestOrigin(`${origin} ${referer}`) ? "test" : "live";
}

function getAppUrlForRequest(request: Request, mode: StripeMode) {
  const origin = request.headers.get("origin");
  if (mode === "test" && origin && isTestOrigin(origin)) return origin;
  return Deno.env.get(mode === "test" ? "TEST_APP_URL" : "LIVE_APP_URL") ?? Deno.env.get("APP_URL") ?? Deno.env.get("VITE_APP_URL");
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function getUserFromRequest(request: Request) {
  const supabase = createAdminClient();
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new Error("Missing authorization token.");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not verify user.");
  }

  return { supabase, user: data.user };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { supabase, user } = await getUserFromRequest(request);
    const { venueId, plan } = await request.json();

    if (typeof venueId !== "string" || !isPaidVenuePlan(plan)) {
      return jsonResponse({ error: "A claimed venue and paid plan are required." }, { status: 400 });
    }

    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id,name,claimed_by,is_claimed")
      .eq("id", venueId)
      .eq("is_claimed", true)
      .eq("claimed_by", user.id)
      .maybeSingle();

    if (venueError) throw venueError;
    if (!venue) return jsonResponse({ error: "You can only upgrade venues you own." }, { status: 403 });

    const stripeMode = getStripeModeForRequest(request);
    const priceId = getStripePriceIdForPlanAndMode(plan, stripeMode);
    if (!priceId) {
      console.error("create-checkout-session not configured", { reason: "missing_price_id", plan, stripeMode });
      return jsonResponse({ error: "Stripe price ID is not configured for this plan." }, { status: 500 });
    }

    const stripeSecretKey = getStripeSecretKey(stripeMode);
    const appUrl = getAppUrlForRequest(request, stripeMode);
    if (!stripeSecretKey || !appUrl) {
      console.error("create-checkout-session not configured", { stripeMode, hasSecretKey: Boolean(stripeSecretKey), hasAppUrl: Boolean(appUrl) });
      return jsonResponse({ error: "Stripe checkout is not configured." }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
    const { data: existingSubscription } = await supabase
      .from("venue_subscriptions")
      .select("billing_customer_id")
      .eq("venue_id", venue.id)
      .maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existingSubscription?.billing_customer_id ?? undefined,
      customer_email: existingSubscription?.billing_customer_id ? undefined : user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/owner/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/owner/pricing?cancelled=true`,
      metadata: { venueId: venue.id, userId: user.id, plan, stripeMode },
      subscription_data: { metadata: { venueId: venue.id, userId: user.id, plan, stripeMode } },
      allow_promotion_codes: true,
    });

    const { error: insertError } = await supabase.from("stripe_checkout_sessions").insert({
      venue_id: venue.id,
      user_id: user.id,
      target_plan: plan,
      stripe_checkout_session_id: session.id,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
      stripe_mode: stripeMode,
      status: "created",
    });

    if (insertError) throw insertError;
    console.log("create-checkout-session created", { venueId: venue.id, plan, stripeMode, sessionId: session.id });
    return jsonResponse({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create checkout session.";
    console.error("create-checkout-session failed", { reason: message });
    return jsonResponse({ error: message }, { status: 500 });
  }
});
