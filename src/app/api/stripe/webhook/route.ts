import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ----------------------------------
      // PRO CREATOR SUBSCRIPTION
      // ----------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "active" })
          .eq("stripe_subscription_id", subscriptionId);

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", sub.id);

        break;
      }

      // ----------------------------------
      // PLACEMENTS
      // ----------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (!session.metadata?.placement_type) break;

        const days = Number(session.metadata.duration_days);
        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + days);

        await supabaseAdmin.from("placements").insert({
          creator_id: session.metadata.creator_id,
          type: session.metadata.placement_type,
          category: session.metadata.category || null,
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          stripe_checkout_session_id: session.id,
        });

        break;
      }

      // ----------------------------------
      // REFUNDS
      // ----------------------------------
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;

        await supabaseAdmin
          .from("placements")
          .update({ is_active: false })
          .eq("stripe_payment_intent_id", charge.payment_intent);

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
