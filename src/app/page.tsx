"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { PLANS, Plan } from "@/lib/plans";

const MONAD_CHAIN_ID = "eip155:10143";

type Status = "idle" | "loading" | "success" | "error";

interface ActiveSession {
  id: string;
  planId: string;
  expiresAt: number;
  remainingMs: number;
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[0]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  // Prevent SSR/client hydration mismatch for wallet state
  useEffect(() => { setMounted(true); }, []);

  // Poll session status on load
  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        if (data.session) {
          setActiveSession(data.session);
          setRemainingMs(data.session.remainingMs);
          setStatus("success");
        }
      })
      .catch(() => {});
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) {
          setActiveSession(null);
          setStatus("idle");
          setErrorMsg("Session expired. Pay again to reconnect.");
          clearInterval(interval);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const handlePay = useCallback(
    async (isRenewal = false) => {
      if (!address || !walletClient) {
        setErrorMsg("Wallet not ready — please wait a moment and try again.");
        return;
      }

      setStatus("loading");
      setErrorMsg(null);

      try {
        // Use the official toClientEvmSigner helper — correctly handles
        // BigInt message fields that EIP-3009 TransferWithAuthorization requires
        const signer = toClientEvmSigner({
          address: address as `0x${string}`,
          signTypedData: (args) => walletClient.signTypedData(args as Parameters<typeof walletClient.signTypedData>[0]),
        });

        const client = new x402Client().register(
          MONAD_CHAIN_ID,
          new ExactEvmScheme(signer)
        );
        const paymentFetch = wrapFetchWithPayment(fetch, client);

        const endpoint = isRenewal ? "/api/renew" : "/api/purchase";
        const response = await paymentFetch(
          `${endpoint}?plan=${selectedPlan.id}`,
          { method: "POST" }
        );

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          let detail = `Payment failed: ${response.status}`;
          try {
            const json = JSON.parse(text);
            detail = json.error ?? json.details ?? detail;
          } catch {}
          throw new Error(detail);
        }

        const data = await response.json();
        setActiveSession({
          id: data.sessionId,
          planId: data.planId,
          expiresAt: data.expiresAt,
          remainingMs: data.durationMs,
        });
        setRemainingMs(data.durationMs);
        setStatus("success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setStatus("error");
        if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
          setErrorMsg("Transaction rejected.");
        } else if (msg.toLowerCase().includes("insufficient")) {
          setErrorMsg("Insufficient USDC. Get tokens from faucet.circle.com.");
        } else {
          setErrorMsg(msg);
        }
      }
    },
    [walletClient, address, selectedPlan]
  );

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-violet-400 text-4xl font-bold">WiFi402</div>
          <p className="text-zinc-400 text-sm">Pay-as-you-go internet on Monad</p>
        </div>

        {/* Active session countdown */}
        {activeSession && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-5 text-center space-y-2">
            <div className="text-green-400 text-xs uppercase tracking-widest font-semibold">
              Internet Active
            </div>
            <div className="text-green-200 text-5xl font-mono font-bold">
              {formatMs(remainingMs)}
            </div>
            <div className="text-green-500 text-xs">remaining</div>
            <button
              onClick={() => handlePay(true)}
              disabled={status === "loading"}
              className="mt-2 w-full py-2 px-4 bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {status === "loading" ? "Processing..." : `Renew — ${selectedPlan.priceDisplay}`}
            </button>
          </div>
        )}

        {/* Plan selector */}
        {!activeSession && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedPlan.id === plan.id
                      ? "border-violet-500 bg-violet-950 text-white"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-semibold text-sm">{plan.label}</div>
                  <div className={`text-xl font-bold mt-1 ${selectedPlan.id === plan.id ? "text-violet-300" : "text-zinc-300"}`}>
                    {plan.priceDisplay}
                  </div>
                  <div className="text-xs mt-1 opacity-60">USDC</div>
                </button>
              ))}
            </div>

            {/* Wallet connect / pay button — only render after mount to avoid hydration mismatch */}
            {!mounted ? (
              <button className="w-full py-3 px-4 bg-violet-600 text-white font-medium rounded-xl opacity-50 cursor-wait">
                Loading...
              </button>
            ) : !isConnected ? (
              <button
                onClick={() => connect({ connector: injected() })}
                className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl transition-colors"
              >
                Connect Wallet
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
                  <span className="text-zinc-400 text-xs font-mono truncate">{address}</span>
                  <button
                    onClick={() => disconnect()}
                    className="text-zinc-600 hover:text-zinc-300 text-xs ml-2 shrink-0"
                  >
                    Disconnect
                  </button>
                </div>
                <button
                  onClick={() => handlePay(false)}
                  disabled={status === "loading" || !walletClient}
                  className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-wait text-white font-semibold rounded-xl transition-colors"
                >
                  {status === "loading"
                    ? "Processing payment..."
                    : !walletClient
                    ? "Connecting wallet..."
                    : `Pay ${selectedPlan.priceDisplay} for ${selectedPlan.label}`}
                </button>
              </div>
            )}
          </>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Faucet links */}
        <p className="text-center text-zinc-600 text-xs">
          Need USDC?{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
            faucet.circle.com
          </a>{" "}
          · MON gas:{" "}
          <a href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
            faucet.monad.xyz
          </a>
        </p>
      </div>
    </main>
  );
}
