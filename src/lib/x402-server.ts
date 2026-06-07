import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

export const MONAD_NETWORK = "eip155:10143";
export const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
export const x402Server = new x402ResourceServer(facilitatorClient);

const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_NETWORK) {
    return {
      amount: Math.floor(amount * 1_000_000).toString(),
      asset: MONAD_USDC,
      extra: { name: "USDC", version: "2" },
    };
  }
  return null;
});

x402Server.register(MONAD_NETWORK, monadScheme);
