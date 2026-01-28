"use client";

import { startCheckout } from "@/lib/checkout";

export default function PricingPage() {
  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Pro Creator</h1>

      <button
        className="px-6 py-3 bg-black text-white rounded"
        onClick={() =>
          startCheckout({
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY!,
            mode: "subscription",
          })
        }
      >
        Pro Monthly – $9.99
      </button>

      <button
        className="px-6 py-3 bg-gray-800 text-white rounded"
        onClick={() =>
          startCheckout({
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY!,
            mode: "subscription",
          })
        }
      >
        Pro Yearly – $99.99
      </button>
    </main>
  );
}
