"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useWalletClient, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { PLANS, Plan } from "@/lib/plans";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";

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

/* ---------- Floating particles ---------- */
function Particles() {
  const count = 28;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const size = 2 + Math.random() * 3;
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 6}s`;
        const duration = `${5 + Math.random() * 6}s`;
        const dx = `${(Math.random() - 0.5) * 60}px`;
        const opacity = 0.3 + Math.random() * 0.5;
        const color = Math.random() > 0.5 ? "#a855f7" : "#e879f9";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: `${Math.random() * 40}%`,
              left,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 ${size * 3}px ${color}`,
              "--dx": dx,
              opacity: 0,
              animation: `particle-float ${duration} ${delay} ease-in-out infinite`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

/* ---------- Split text animation ---------- */
function SplitText({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.4, delay: delay + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: char === " " ? "inline" : "inline-block" }}
        >
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </span>
  );
}

/* ---------- Glowing plan card ---------- */
function PlanCard({
  plan,
  selected,
  onClick,
  index,
}: {
  plan: Plan;
  selected: boolean;
  onClick: () => void;
  index: number;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-60, 60], [6, -6]);
  const rotateY = useTransform(x, [-60, 60], [-6, 6]);

  function onMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  }
  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 800,
        background: selected
          ? "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)"
          : "rgba(255,255,255,0.7)",
        border: selected ? "1.5px solid #a855f7" : "1.5px solid #e4e4e7",
        boxShadow: selected
          ? "0 0 0 1px #a855f740, 0 8px 32px rgba(168,85,247,0.18), 0 2px 8px rgba(168,85,247,0.08)"
          : "0 2px 12px rgba(0,0,0,0.06)",
        backdropFilter: "blur(12px)",
      } as React.CSSProperties}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className="relative text-left p-5 rounded-2xl transition-all duration-200 group"
    >
      {/* Neon top border on selected */}
      {selected && (
        <div
          className="absolute top-0 left-4 right-4 h-px rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, #a855f7, transparent)" }}
        />
      )}

      {/* Selected dot */}
      {selected && (
        <motion.div
          layoutId="selected-dot"
          className="absolute top-3 right-3 w-2 h-2 rounded-full"
          style={{ background: "#a855f7", boxShadow: "0 0 8px #a855f7, 0 0 16px #a855f780" }}
        />
      )}

      <div className="text-2xl font-bold mb-1 tabular-nums"
        style={{ color: selected ? "#6d28d9" : "#18181b" }}>
        {plan.priceDisplay}
      </div>
      <div className="text-sm font-medium" style={{ color: selected ? "#7c3aed" : "#71717a" }}>
        {plan.label}
      </div>
      <div className="text-xs mt-1" style={{ color: selected ? "#a855f780" : "#a1a1aa60" }}>
        USDC · Monad
      </div>
    </motion.button>
  );
}

/* ---------- Main page ---------- */
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
    <main className="min-h-screen bg-white flex flex-col overflow-hidden relative">
      <Particles />

      {/* Radial glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(232,121,249,0.10) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/3 w-72 h-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />
        {/* Subtle grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: "linear-gradient(rgba(168,85,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", boxShadow: "0 0 16px rgba(168,85,247,0.5)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1C4 4 1 5.5 1 7s3 6 6 6 6-4.5 6-6-3-3-6-6z" stroke="white" strokeWidth="1.2" fill="none" />
              <circle cx="7" cy="7" r="1.8" fill="white" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight text-zinc-900">WiFi402</span>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xs font-medium px-3 py-1.5 rounded-full"
          style={{
            border: "1px solid rgba(168,85,247,0.3)",
            color: "#7c3aed",
            background: "rgba(168,85,247,0.06)",
          }}
        >
          Monad Testnet
        </motion.div>
      </nav>

      {/* Active session view */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-12"
          >
            {/* Ring */}
            <div className="relative mb-10">
              <motion.div
                animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(34,197,94,0.2), transparent)", transform: "scale(2)" }}
              />
              <div className="w-28 h-28 rounded-full flex items-center justify-center"
                style={{
                  border: "2px solid rgba(34,197,94,0.5)",
                  background: "rgba(240,253,244,0.8)",
                  boxShadow: "0 0 32px rgba(34,197,94,0.2)",
                }}>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <path d="M18 4C9.16 4 2 11.16 2 20s7.16 16 16 16 16-7.16 16-16S26.84 4 18 4z" stroke="rgba(22,163,74,0.6)" strokeWidth="1.5" />
                  <path d="M6 18c4-8 20-8 24 0" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
                  <path d="M9.5 14.5c2.8-4 14-4 17 0" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="18" cy="19" r="2.5" fill="#16a34a" />
                </svg>
              </div>
            </div>

            <div className="text-green-600 text-xs uppercase tracking-widest font-bold mb-2">Connected</div>
            <div className="text-8xl font-bold tabular-nums mb-1 text-zinc-900" style={{ letterSpacing: "-3px" }}>
              {formatMs(remainingMs)}
            </div>
            <div className="text-zinc-400 text-sm mb-10">
              {PLANS.find(p => p.id === activeSession.planId)?.label ?? selectedPlan.label} plan remaining
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePay(true)}
              disabled={status === "loading"}
              className="neon-btn px-8 py-3.5 rounded-xl font-semibold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", minWidth: 240 }}
            >
              {status === "loading" ? "Processing..." : `Renew — ${selectedPlan.priceDisplay}`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main portal */}
      {!activeSession && (
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-8">

          {/* Hero */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-7"
              style={{
                border: "1px solid rgba(168,85,247,0.25)",
                color: "#7c3aed",
                background: "rgba(168,85,247,0.05)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block"
                style={{ boxShadow: "0 0 6px #a855f7" }} />
              Pay-per-use · x402 · Monad Blockchain
            </motion.div>

            <h1 className="text-6xl font-bold leading-none mb-5 text-zinc-900" style={{ letterSpacing: "-2px" }}>
              <SplitText text="Internet Access," delay={0.05} />
              <br />
              <SplitText
                text="On-Chain."
                delay={0.3}
                className="shimmer-text"
              />
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="text-zinc-500 text-sm max-w-xs mx-auto leading-relaxed"
            >
              Connect to the hotspot · choose a plan · pay in USDC — access granted instantly on Monad.
            </motion.p>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-3 gap-4 w-full max-w-md mb-8">
            {PLANS.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan.id === plan.id}
                onClick={() => setSelectedPlan(plan)}
                index={i}
              />
            ))}
          </div>

          {/* Wallet + pay */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.5 }}
            className="w-full max-w-sm space-y-3"
          >
            {!mounted ? (
              <button className="w-full py-3.5 rounded-xl font-semibold text-sm text-white opacity-40"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
                Loading...
              </button>
            ) : !isConnected ? (
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.975 }}
                onClick={() => connect({ connector: injected() })}
                className="neon-btn w-full py-3.5 rounded-xl font-semibold text-sm text-white"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
              >
                Connect Wallet
              </motion.button>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-xl px-4 py-2.5"
                  style={{ background: "#fafafa", border: "1px solid #e4e4e7" }}>
                  <span className="text-xs font-mono truncate text-zinc-400">{address}</span>
                  <button
                    onClick={() => disconnect()}
                    className="text-xs ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.975 }}
                  onClick={() => handlePay(false)}
                  disabled={status === "loading" || !walletClient}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all"
                  style={{
                    background: status === "loading" || !walletClient
                      ? "linear-gradient(135deg, #c4b5fd, #ddd6fe)"
                      : "linear-gradient(135deg, #7c3aed, #a855f7)",
                    boxShadow: status === "loading" || !walletClient
                      ? "none"
                      : "0 0 24px rgba(168,85,247,0.35), 0 4px 16px rgba(124,58,237,0.25)",
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
                  initial={{ opacity: 0, y: 6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl px-4 py-3 text-sm overflow-hidden"
                  style={{
                    background: "rgba(254,242,242,0.9)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#dc2626",
                  }}
                >
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-center text-xs text-zinc-400 pt-1">
              Need USDC?{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">
                faucet.circle.com
              </a>
              {" · "}MON gas:{" "}
              <a href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">
                faucet.monad.xyz
              </a>
            </p>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 text-center pb-5">
        <p className="text-xs text-zinc-300">Powered by x402 · Monad Testnet</p>
      </div>
    </main>
  );
}
