import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
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
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ----------------------------------
      // PRO CREATOR SUBSCRIPTION ACTIVE
      // ----------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        if (
          !invoice.subscription ||
          typeof invoice.subscription !== "string"
        ) {
          console.warn("Invoice missing subscription ID");
          break;
        }

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "active" })
          .eq("stripe_subscription_id", invoice.subscription);

        break;
      }

      // ----------------------------------
      // SUBSCRIPTION CANCELED
      // ----------------------------------
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subscription.id);

        break;
      }

      // ----------------------------------
      // PLACEMENT PURCHASE
      // ----------------------------------
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

        const durationDays = Number(session.metadata.duration_days);
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);

        await supabaseAdmin.from("placements").insert({
          creator_id: session.metadata.creator_id,
          type: session.metadata.placement_type,
          category: session.metadata.category ?? null,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          stripe_checkout_session_id: session.id,
        });

        break;
      }

      // ----------------------------------
      // REFUND → DEACTIVATE PLACEMENT
      // ----------------------------------
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;

        if (!charge.payment_intent) break;

        await supabaseAdmin
          .from("placements")
          .update({ is_active: false })
          .eq("stripe_payment_intent_id", charge.payment_intent);

        break;
      }

      default:
        // Ignore unhandled events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
