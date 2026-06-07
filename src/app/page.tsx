"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { PLANS, Plan } from "@/lib/plans";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";

const BearScene = dynamic(() => import("@/components/BearScene"), { ssr: false });

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

const BEAR_LABELS = ["Shy Bear", "Happy Bear", "Smug Bear"];

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

  useEffect(() => { setMounted(true); }, []);

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
        const signer = toClientEvmSigner({
          address: address as `0x${string}`,
          signTypedData: (args) => walletClient.signTypedData(args as Parameters<typeof walletClient.signTypedData>[0]),
        });
        const client = new x402Client().register(MONAD_CHAIN_ID, new ExactEvmScheme(signer));
        const paymentFetch = wrapFetchWithPayment(fetch, client);
        const endpoint = isRenewal ? "/api/renew" : "/api/purchase";
        const response = await paymentFetch(`${endpoint}?plan=${selectedPlan.id}`, { method: "POST" });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          let detail = `Payment failed: ${response.status}`;
          try { const json = JSON.parse(text); detail = json.error ?? json.details ?? detail; } catch {}
          throw new Error(detail);
        }
        const data = await response.json();
        setActiveSession({ id: data.sessionId, planId: data.planId, expiresAt: data.expiresAt, remainingMs: data.durationMs });
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
    <main className="min-h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="text-center pt-8 pb-2 z-10 relative">
        <div className="text-violet-400 text-4xl font-bold tracking-tight">WiFi402</div>
        <p className="text-zinc-500 text-sm mt-1">Pay-as-you-go internet on Monad</p>
      </div>

      {/* Active session banner */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-auto w-full max-w-sm px-4 z-10 mt-2"
          >
            <div className="bg-green-950 border border-green-800 rounded-xl p-4 text-center">
              <div className="text-green-400 text-xs uppercase tracking-widest font-semibold">Internet Active</div>
              <div className="text-green-200 text-5xl font-mono font-bold mt-1">{formatMs(remainingMs)}</div>
              <div className="text-green-500 text-xs mb-2">remaining</div>
              <button
                onClick={() => handlePay(true)}
                disabled={status === "loading"}
                className="w-full py-2 px-4 bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {status === "loading" ? "Processing..." : `Renew — ${selectedPlan.priceDisplay}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Bear Scene */}
      {!activeSession && (
        <div className="flex-1 relative" style={{ minHeight: "60vh" }}>
          <BearScene
            plans={PLANS}
            selectedPlan={selectedPlan}
            onSelectPlan={setSelectedPlan}
          />

          {/* Bear labels overlay */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-around px-4 pointer-events-none">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.id}
                animate={{ opacity: selectedPlan.id === plan.id ? 1 : 0.45, scale: selectedPlan.id === plan.id ? 1.05 : 1 }}
                className="text-center"
              >
                <div className="text-violet-300 text-xs font-semibold">{BEAR_LABELS[i]}</div>
                <div className="text-white text-sm font-bold">{plan.priceDisplay}</div>
                <div className="text-zinc-500 text-xs">{plan.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom panel */}
      {!activeSession && (
        <div className="px-4 pb-6 pt-2 space-y-3 z-10 max-w-sm mx-auto w-full">
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
            <>
              <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
                <span className="text-zinc-400 text-xs font-mono truncate">{address}</span>
                <button onClick={() => disconnect()} className="text-zinc-600 hover:text-zinc-300 text-xs ml-2 shrink-0">
                  Disconnect
                </button>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => handlePay(false)}
                disabled={status === "loading" || !walletClient}
                className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-wait text-white font-semibold rounded-xl transition-colors"
              >
                {status === "loading"
                  ? "Processing payment..."
                  : !walletClient
                  ? "Connecting wallet..."
                  : `Pay ${selectedPlan.priceDisplay} — ${selectedPlan.label}`}
              </motion.button>
            </>
          )}

          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm"
              >
                {errorMsg}
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-center text-zinc-600 text-xs">
            Need USDC?{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">faucet.circle.com</a>
            {" · "}MON gas:{" "}
            <a href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">faucet.monad.xyz</a>
          </p>
        </div>
      )}
    </main>
  );
}
