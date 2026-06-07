import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { MONAD_NETWORK, x402Server } from "@/lib/x402-server";
import { PLANS } from "@/lib/plans";
import { createSession } from "@/lib/session";
import { allowIp } from "@/lib/firewall";

if (!process.env.PAY_TO_ADDRESS) {
  throw new Error("PAY_TO_ADDRESS environment variable is required");
}
const PAY_TO = process.env.PAY_TO_ADDRESS;

const renewHandlers = Object.fromEntries(
  PLANS.map((plan) => {
    async function handler(req: NextRequest) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "unknown";
      const mac = req.headers.get("x-client-mac") ?? null;
      const wallet = req.headers.get("x-payment-sender") ?? "unknown";

      const session = await createSession({
        wallet,
        ip,
        mac,
        planId: plan.id,
        paidAmount: plan.priceUsd,
        durationMs: plan.durationMs,
      });

      allowIp(ip);

      return NextResponse.json({
        sessionId: session.id,
        planId: plan.id,
        expiresAt: session.expires_at,
        durationMs: plan.durationMs,
        renewed: true,
      });
    }

    return [
      plan.id,
      withX402(
        handler,
        {
          accepts: {
            scheme: "exact",
            network: MONAD_NETWORK,
            payTo: PAY_TO,
            price: `$${plan.priceUsd}`,
          },
          resource: `/api/renew?plan=${plan.id}`,
        },
        x402Server
      ),
    ];
  })
);

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("plan") ?? "2min";
  const renewHandler = renewHandlers[planId];

  if (!renewHandler) {
    return NextResponse.json({ error: `Unknown plan: ${planId}` }, { status: 400 });
  }

  return renewHandler(req);
}
