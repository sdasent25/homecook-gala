import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Invalid webhook signature:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // -------------------------------
      // SUBSCRIPTION PAYMENT SUCCESS
      // -------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription;

        if (!subscriptionId || typeof subscriptionId !== "string") break;

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "active" })
          .eq("stripe_subscription_id", subscriptionId);

        break;
      }

      // -------------------------------
      // SUBSCRIPTION CANCELED
      // -------------------------------
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subscription.id);

        break;
      }

      // -------------------------------
      // PLACEMENT PURCHASE
      // -------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (
          !session.metadata ||
          !session.metadata.creator_id ||
          !session.metadata.placement_type ||
          !session.metadata.duration_days
        ) {
          break;
        }

        const days = Number(session.metadata.duration_days);
        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + days);

        await supabaseAdmin.from("placements").insert({
          creator_id: session.metadata.creator_id,
          type: session.metadata.placement_type,
          category: session.metadata.category ?? null,
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          stripe_checkout_session_id: session.id,
        });

        break;
      }

      // -------------------------------
      // REFUND → DEACTIVATE PLACEMENT
      // -------------------------------
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;

        if (!charge.payment_intent) break;

        await supabaseAdmin
          .from("placements")
          .update({ is_active: false })
          .eq("stripe_payment_intent_id", charge.payment_intent);

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler failed:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
