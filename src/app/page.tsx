"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { PLANS, Plan } from "@/lib/plans";
import { motion, AnimatePresence } from "motion/react";

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
    <main
      className="min-h-screen flex flex-col overflow-hidden relative"
      style={{ background: "#08080f" }}
    >
      {/* Background ambient glows — fixed, non-interactive */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="glow-orb absolute rounded-full"
          style={{
            width: 600, height: 600,
            top: "-200px", left: "-150px",
            background: "radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          className="glow-orb absolute rounded-full"
          style={{
            width: 500, height: 500,
            top: "30%", right: "-180px",
            background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
            animationDelay: "2s",
          }}
        />
        <div
          className="glow-orb absolute rounded-full"
          style={{
            width: 400, height: 400,
            bottom: "-100px", left: "30%",
            background: "radial-gradient(circle, rgba(88,28,135,0.15) 0%, transparent 70%)",
            animationDelay: "1s",
          }}
        />
        {/* Grid lines */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Nav bar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 4V10L7 13L1 10V4L7 1Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="7" cy="7" r="2" fill="white"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-sm tracking-wide">WiFi402</span>
        </div>
        <div
          className="text-xs px-3 py-1 rounded-full border"
          style={{ borderColor: "rgba(139,92,246,0.3)", color: "rgba(167,139,250,0.8)", background: "rgba(109,40,217,0.1)" }}
        >
          Monad Testnet
        </div>
      </nav>

      {/* Active session view */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-12"
          >
            {/* Pulsing ring */}
            <div className="relative mb-8">
              <div
                className="glow-orb absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(34,197,94,0.2), transparent 70%)", transform: "scale(1.8)" }}
              />
              <div
                className="relative w-32 h-32 rounded-full flex items-center justify-center"
                style={{ border: "1px solid rgba(34,197,94,0.4)", background: "rgba(20,83,45,0.3)" }}
              >
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <path d="M20 4C11.163 4 4 11.163 4 20s7.163 16 16 16 16-7.163 16-16S28.837 4 20 4z" stroke="rgba(134,239,172,0.8)" strokeWidth="1.5"/>
                  <path d="M8 20c4-8 20-8 24 0" stroke="#86efac" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M11 16c3-4 15-4 18 0" stroke="#86efac" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="20" cy="20" r="2.5" fill="#86efac"/>
                </svg>
              </div>
            </div>

            <div className="text-green-400 text-xs uppercase tracking-widest font-semibold mb-2">
              Internet Active
            </div>
            <div
              className="text-7xl font-bold font-mono mb-1 tabular-nums"
              style={{ color: "#dcfce7", letterSpacing: "-2px" }}
            >
              {formatMs(remainingMs)}
            </div>
            <div className="text-green-600 text-sm mb-10">remaining on {PLANS.find(p => p.id === activeSession.planId)?.label ?? selectedPlan.label} plan</div>

            <div className="w-full max-w-xs space-y-3">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePay(true)}
                disabled={status === "loading"}
                className="w-full py-3 font-semibold rounded-xl text-sm transition-all"
                style={{
                  background: status === "loading" ? "rgba(20,83,45,0.5)" : "linear-gradient(135deg, #16a34a, #15803d)",
                  color: "white",
                  border: "1px solid rgba(34,197,94,0.3)",
                }}
              >
                {status === "loading" ? "Processing..." : `Renew — ${selectedPlan.priceDisplay}`}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main portal UI */}
      {!activeSession && (
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-8">

          {/* Hero text */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div
              className="inline-block text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6"
              style={{
                border: "1px solid rgba(139,92,246,0.35)",
                color: "rgba(167,139,250,0.9)",
                background: "rgba(109,40,217,0.12)",
              }}
            >
              Pay-per-use · Monad Blockchain
            </div>
            <h1
              className="text-5xl font-bold leading-tight mb-4"
              style={{
                color: "white",
                letterSpacing: "-1.5px",
                textShadow: "0 0 60px rgba(139,92,246,0.3)",
              }}
            >
              Internet Access,<br />
              <span style={{ color: "#a78bfa" }}>On-Chain.</span>
            </h1>
            <p className="text-sm" style={{ color: "rgba(161,161,170,0.8)", maxWidth: 320, margin: "0 auto" }}>
              Connect to the hotspot, choose a plan, pay in USDC — access granted instantly.
            </p>
          </motion.div>

          {/* Plan cards */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="grid grid-cols-3 gap-3 w-full max-w-lg mb-8"
          >
            {PLANS.map((plan) => {
              const isSelected = selectedPlan.id === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className="relative p-4 rounded-2xl text-left transition-all duration-200"
                  style={{
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(109,40,217,0.35), rgba(76,29,149,0.25))"
                      : "rgba(255,255,255,0.03)",
                    border: isSelected
                      ? "1px solid rgba(139,92,246,0.6)"
                      : "1px solid rgba(255,255,255,0.07)",
                    boxShadow: isSelected
                      ? "0 0 24px rgba(109,40,217,0.2), inset 0 1px 0 rgba(255,255,255,0.05)"
                      : "none",
                  }}
                >
                  {isSelected && (
                    <div
                      className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full"
                      style={{ background: "#a78bfa", boxShadow: "0 0 6px #a78bfa" }}
                    />
                  )}
                  <div
                    className="text-lg font-bold mb-0.5 tabular-nums"
                    style={{ color: isSelected ? "#ede9fe" : "rgba(255,255,255,0.85)" }}
                  >
                    {plan.priceDisplay}
                  </div>
                  <div
                    className="text-xs font-medium"
                    style={{ color: isSelected ? "rgba(196,181,253,0.8)" : "rgba(161,161,170,0.6)" }}
                  >
                    {plan.label}
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: isSelected ? "rgba(167,139,250,0.5)" : "rgba(113,113,122,0.5)" }}
                  >
                    USDC
                  </div>
                </button>
              );
            })}
          </motion.div>

          {/* Wallet + pay section */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="w-full max-w-sm space-y-3"
          >
            {!mounted ? (
              <button
                className="w-full py-3.5 rounded-xl font-semibold text-sm opacity-40"
                style={{ background: "rgba(109,40,217,0.4)", color: "white" }}
              >
                Loading...
              </button>
            ) : !isConnected ? (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => connect({ connector: injected() })}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                  color: "white",
                  boxShadow: "0 0 24px rgba(124,58,237,0.4)",
                }}
              >
                Connect Wallet
              </motion.button>
            ) : (
              <>
                <div
                  className="flex items-center justify-between rounded-xl px-4 py-2.5"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <span className="text-xs font-mono truncate" style={{ color: "rgba(161,161,170,0.7)" }}>
                    {address}
                  </span>
                  <button
                    onClick={() => disconnect()}
                    className="text-xs ml-3 shrink-0 transition-colors"
                    style={{ color: "rgba(113,113,122,0.7)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(161,161,170,1)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(113,113,122,0.7)")}
                  >
                    Disconnect
                  </button>
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePay(false)}
                  disabled={status === "loading" || !walletClient}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all"
                  style={{
                    background: status === "loading" || !walletClient
                      ? "rgba(109,40,217,0.3)"
                      : "linear-gradient(135deg, #7c3aed, #5b21b6)",
                    color: "white",
                    boxShadow: status === "loading" || !walletClient
                      ? "none"
                      : "0 0 28px rgba(124,58,237,0.45)",
                    cursor: status === "loading" || !walletClient ? "wait" : "pointer",
                  }}
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
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl p-3.5 text-sm"
                  style={{
                    background: "rgba(127,29,29,0.25)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "rgba(252,165,165,0.9)",
                  }}
                >
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-center text-xs pt-1" style={{ color: "rgba(82,82,91,0.8)" }}>
              Need USDC?{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(139,92,246,0.8)" }} className="hover:underline">
                faucet.circle.com
              </a>
              {" · "}MON gas:{" "}
              <a href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(139,92,246,0.8)" }} className="hover:underline">
                faucet.monad.xyz
              </a>
            </p>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 text-center pb-6">
        <p className="text-xs" style={{ color: "rgba(63,63,70,0.8)" }}>
          Powered by x402 · Monad Testnet
        </p>
      </div>
    </main>
  );
}
