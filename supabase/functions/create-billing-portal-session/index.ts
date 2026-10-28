import Stripe from "npm:stripe@22.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

type StripeMode = "test" | "live";

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
    const { venueId } = await request.json();

    if (typeof venueId !== "string") {
      return jsonResponse({ error: "A venue is required." }, { status: 400 });
    }

    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id")
      .eq("id", venueId)
      .eq("is_claimed", true)
      .eq("claimed_by", user.id)
      .maybeSingle();

    if (venueError) throw venueError;
    if (!venue) return jsonResponse({ error: "You can only manage billing for venues you own." }, { status: 403 });

    const { data: subscription, error: subscriptionError } = await supabase
      .from("venue_subscriptions")
      .select("billing_provider,billing_customer_id,stripe_mode")
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (subscription?.billing_provider !== "stripe" || !subscription.billing_customer_id) {
      return jsonResponse({ error: "This venue does not have Stripe billing yet." }, { status: 400 });
    }

    const stripeMode = (subscription.stripe_mode as StripeMode | null) ?? getStripeModeForRequest(request);
    const stripeSecretKey = getStripeSecretKey(stripeMode);
    const appUrl = getAppUrlForRequest(request, stripeMode);
    if (!stripeSecretKey || !appUrl) {
      console.error("create-billing-portal-session not configured", { stripeMode, hasSecretKey: Boolean(stripeSecretKey), hasAppUrl: Boolean(appUrl) });
      return jsonResponse({ error: "Stripe billing portal is not configured." }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.billing_customer_id,
      return_url: `${appUrl}/owner/billing?portal_return=1`,
    });

    console.log("create-billing-portal-session created", { venueId: venue.id, stripeMode });
    return jsonResponse({ url: portalSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create billing portal session.";
    console.error("create-billing-portal-session failed", { reason: message });
    return jsonResponse({ error: message }, { status: 500 });
  }
});
