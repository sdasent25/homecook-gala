export async function startCheckout(payload: {
  priceId: string;
  mode: "payment" | "subscription";
  metadata?: Record<string, string>;
}) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId: payload.priceId,
      mode: payload.mode,
      successUrl: `${window.location.origin}/pricing?success=1`,
      cancelUrl: `${window.location.origin}/pricing?canceled=1`,
      metadata: payload.metadata,
    }),
  });

  const data = await res.json();
  if (data?.url) window.location.href = data.url;
}
