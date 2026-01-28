import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    priceId,
    successUrl,
    cancelUrl,
    metadata, // { placement_type, duration_days, creator_id, category? }
    mode, // "payment" | "subscription"
  } = body;

  if (!priceId || !successUrl || !cancelUrl || !mode) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata,
  });

  return NextResponse.json({ url: session.url });
}
