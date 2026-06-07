import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const MONAD_NETWORK = "eip155:10143";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

if (!process.env.PAY_TO_ADDRESS) {
  throw new Error("PAY_TO_ADDRESS environment variable is required");
}
const PAY_TO = process.env.PAY_TO_ADDRESS;

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);

const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_NETWORK) {
    const tokenAmount = Math.floor(amount * 1_000_000).toString();
    return {
      amount: tokenAmount,
      asset: MONAD_USDC,
      extra: { name: "USDC", version: "2" },
    };
  }
  return null;
});

server.register(MONAD_NETWORK, monadScheme);

async function handler(_req: NextRequest) {
  return NextResponse.json({
    content: "You have unlocked the premium content!",
    unlockedAt: new Date().toISOString(),
  });
}

export const GET = withX402(handler, {
  accepts: {
    scheme: "exact",
    network: MONAD_NETWORK,
    payTo: PAY_TO,
    price: "$0.001",
  },
  resource: "/api/premium",
}, server);
