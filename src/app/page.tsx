"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useWalletClient, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { PLANS, Plan } from "@/lib/plans";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "motion/react";

const MONAD_CHAIN_ID = "eip155:10143";
type Status = "idle" | "loading" | "success" | "error";
interface ActiveSession {
  id: string;
  planId: string;
  expiresAt: number;
  remainingMs: number;
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/* ── Orbiting ring decoration ── */
function OrbitalRings() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {/* Deep purple blob — top left */}
      <div className="orb absolute rounded-full" style={{
        width: 720, height: 720,
        top: -260, left: -200,
        background: "radial-gradient(circle, rgba(110,84,255,0.18) 0%, transparent 65%)",
      }} />
      {/* Softer blob — bottom right */}
      <div className="orb absolute rounded-full" style={{
        width: 580, height: 580,
        bottom: -180, right: -160,
        background: "radial-gradient(circle, rgba(131,110,249,0.14) 0%, transparent 65%)",
        animationDelay: "2.5s",
      }} />
      {/* Accent mid blob */}
      <div className="orb absolute rounded-full" style={{
        width: 380, height: 380,
        top: "42%", left: "52%",
        background: "radial-gradient(circle, rgba(79,71,235,0.10) 0%, transparent 70%)",
        animationDelay: "4s",
      }} />

      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(131,110,249,0.18) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
      }} />

      {/* Scan line */}
      <div className="scan-line" />
    </div>
  );
}

/* ── Ticker tape ── */
const TICKER_ITEMS = [
  "x402 MICROPAYMENTS", "MONAD TESTNET", "10,000 TPS",
  "INSTANT FINALITY", "EVM COMPATIBLE", "USDC PAYMENTS",
  "PAY-PER-USE WIFI", "NO SUBSCRIPTION", "TRUSTLESS ACCESS",
  "x402 MICROPAYMENTS", "MONAD TESTNET", "10,000 TPS",
  "INSTANT FINALITY", "EVM COMPATIBLE", "USDC PAYMENTS",
  "PAY-PER-USE WIFI", "NO SUBSCRIPTION", "TRUSTLESS ACCESS",
];

function Ticker() {
  return (
    <div className="marquee-wrap w-full overflow-hidden border-y py-2.5"
      style={{ borderColor: "rgba(131,110,249,0.12)", background: "rgba(14,9,28,0.6)" }}>
      <div className="marquee-track">
        {TICKER_ITEMS.map((item, i) => (
          <span key={i} className="mx-6 text-xs font-semibold tracking-widest"
            style={{ color: i % 3 === 1 ? "#836EF9" : "rgba(251,250,249,0.35)" }}>
            {item}
            <span className="mx-6 opacity-30">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Stat badge ── */
function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-5 py-3 rounded-xl"
      style={{ background: "rgba(131,110,249,0.07)", border: "1px solid rgba(131,110,249,0.15)" }}>
      <span className="text-2xl font-bold tracking-tight flicker" style={{ color: "#836EF9" }}>{value}</span>
      <span className="text-xs tracking-widest uppercase" style={{ color: "rgba(251,250,249,0.4)" }}>{label}</span>
    </div>
  );
}

/* ── Plan card ── */
function PlanCard({ plan, selected, onClick, index }: {
  plan: Plan; selected: boolean; onClick: () => void; index: number;
}) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-50, 50], [8, -8]), { stiffness: 300, damping: 30 });
  const ry = useSpring(useTransform(mx, [-50, 50], [-8, 8]), { stiffness: 300, damping: 30 });

  function onMove(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top - r.height / 2);
  }
  function onLeave() { mx.set(0); my.set(0); }

  const plans = PLANS;
  const labels = ["Taste", "Cruise", "Commit"];

  return (
    <motion.button
      initial={{ opacity: 0, y: 28, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay: 0.3 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      style={{
        rotateX: rx, rotateY: ry,
        transformStyle: "preserve-3d",
        position: "relative",
        background: selected
          ? "linear-gradient(145deg, rgba(131,110,249,0.2) 0%, rgba(110,84,255,0.08) 100%)"
          : "rgba(14,9,28,0.7)",
        border: selected
          ? "1px solid rgba(131,110,249,0.65)"
          : "1px solid rgba(131,110,249,0.14)",
        boxShadow: selected
          ? "0 0 0 1px rgba(131,110,249,0.25), 0 8px 40px rgba(110,84,255,0.18), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "inset 0 1px 0 rgba(255,255,255,0.03)",
        backdropFilter: "blur(16px)",
        borderRadius: 16,
        padding: "20px 16px 18px",
        textAlign: "left",
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s",
      } as React.CSSProperties}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={selected ? "neon-ring" : ""}
    >
      {/* Top gradient line on selected */}
      {selected && (
        <div style={{
          position: "absolute", top: 0, left: 12, right: 12, height: 1,
          background: "linear-gradient(90deg, transparent, #836EF9, #6E54FF, #836EF9, transparent)",
          borderRadius: 99,
        }} />
      )}

      {/* Index label */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
        color: selected ? "#836EF9" : "rgba(255,255,255,0.2)",
        marginBottom: 10, textTransform: "uppercase",
      }}>
        {String(index + 1).padStart(2, "0")} · {labels[index]}
      </div>

      <div style={{
        fontSize: 28, fontWeight: 800, letterSpacing: "-1px",
        color: selected ? "#fbfaf9" : "rgba(251,250,249,0.85)",
        marginBottom: 2,
      }}>
        {plan.priceDisplay}
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, color: selected ? "#836EF9" : "#737373", marginBottom: 8 }}>
        {plan.label}
      </div>

      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: selected ? "rgba(131,110,249,0.6)" : "rgba(255,255,255,0.1)",
        textTransform: "uppercase",
      }}>
        USDC · Monad
      </div>

      {/* Selected dot */}
      <AnimatePresence>
        {selected && (
          <motion.div
            layoutId="plan-dot"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            style={{
              position: "absolute", top: 14, right: 14,
              width: 8, height: 8, borderRadius: "50%",
              background: "#836EF9",
              boxShadow: "0 0 10px #836EF9, 0 0 20px rgba(131,110,249,0.5)",
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ── Main ── */
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
      .then(r => r.json())
      .then(data => {
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
    const t = setInterval(() => {
      setRemainingMs(prev => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) {
          setActiveSession(null);
          setStatus("idle");
          setErrorMsg("Session expired. Pay again to reconnect.");
          clearInterval(t);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeSession]);

  const handlePay = useCallback(async (isRenewal = false) => {
    if (!address || !walletClient) {
      setErrorMsg("Wallet not ready — please wait a moment.");
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
        try { const j = JSON.parse(text); detail = j.error ?? j.details ?? detail; } catch {}
        throw new Error(detail);
      }
      const data = await response.json();
      setActiveSession({ id: data.sessionId, planId: data.planId, expiresAt: data.expiresAt, remainingMs: data.durationMs });
      setRemainingMs(data.durationMs);
      setStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStatus("error");
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied"))
        setErrorMsg("Transaction rejected.");
      else if (msg.toLowerCase().includes("insufficient"))
        setErrorMsg("Insufficient USDC. Get tokens at faucet.circle.com.");
      else
        setErrorMsg(msg);
    }
  }, [walletClient, address, selectedPlan]);

  return (
    <main style={{ minHeight: "100svh", background: "#0e100f", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <OrbitalRings />

      {/* ── Nav ── */}
      <nav style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo mark */}
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "linear-gradient(145deg, #6E54FF 0%, #836EF9 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(110,84,255,0.45)",
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="white" />
              <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
              <circle cx="8" cy="8" r="9" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px", color: "#fbfaf9" }}>WiFi402</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            padding: "5px 12px", borderRadius: 99,
            border: "1px solid rgba(131,110,249,0.28)",
            color: "#836EF9",
            background: "rgba(131,110,249,0.07)",
          }}>
            Monad Testnet
          </div>
        </div>
      </nav>

      {/* ── Ticker ── */}
      <Ticker />

      {/* ── Active session ── */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            key="session"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: "relative", zIndex: 10,
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "48px 24px",
            }}
          >
            {/* Connected badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 22 }}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "6px 16px", borderRadius: 99,
                border: "1px solid rgba(34,197,94,0.35)",
                color: "rgba(74,222,128,0.9)",
                background: "rgba(34,197,94,0.07)",
                marginBottom: 36,
              }}
            >
              <motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }}
              />
              Connected · Internet Active
            </motion.div>

            {/* Giant timer */}
            <div style={{
              fontSize: "clamp(80px,18vw,160px)",
              fontWeight: 900,
              letterSpacing: "-4px",
              color: "#fbfaf9",
              lineHeight: 1,
              marginBottom: 12,
              fontVariantNumeric: "tabular-nums",
            }} className="number-glow">
              {formatMs(remainingMs)}
            </div>

            <div style={{ fontSize: 13, color: "#737373", marginBottom: 40, letterSpacing: "0.06em" }}>
              {PLANS.find(p => p.id === activeSession.planId)?.label ?? selectedPlan.label} · remaining
            </div>

            {/* Plan selector (compact) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
              {PLANS.map(p => (
                <button key={p.id} onClick={() => setSelectedPlan(p)} style={{
                  fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 99,
                  border: selectedPlan.id === p.id ? "1px solid #836EF9" : "1px solid rgba(131,110,249,0.18)",
                  color: selectedPlan.id === p.id ? "#836EF9" : "#737373",
                  background: selectedPlan.id === p.id ? "rgba(131,110,249,0.12)" : "transparent",
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  {p.priceDisplay} / {p.label}
                </button>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePay(true)}
              disabled={status === "loading"}
              className="neon-ring"
              style={{
                padding: "14px 40px", borderRadius: 12,
                background: "linear-gradient(135deg, #6E54FF 0%, #836EF9 100%)",
                border: "none", color: "#fff",
                fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
                cursor: status === "loading" ? "wait" : "pointer",
                minWidth: 220,
                boxShadow: "0 4px 32px rgba(110,84,255,0.35)",
              }}
            >
              {status === "loading" ? "Processing…" : `↻ Renew — ${selectedPlan.priceDisplay}`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Portal (no session) ── */}
      {!activeSession && (
        <div style={{
          position: "relative", zIndex: 10,
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "32px 24px",
          gap: 0,
        }}>

          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "5px 14px", borderRadius: 99, marginBottom: 24,
              border: "1px solid rgba(131,110,249,0.22)",
              color: "rgba(131,110,249,0.75)",
              background: "rgba(131,110,249,0.05)",
            }}
          >
            ◆ Pay-per-use · x402 Protocol · Monad Blockchain
          </motion.div>

          {/* Hero headline */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: "clamp(38px,9vw,76px)",
              fontWeight: 900,
              letterSpacing: "-2.5px",
              lineHeight: 1.05,
              textAlign: "center",
              color: "#fbfaf9",
              maxWidth: 640,
              marginBottom: 0,
            }}
          >
            Internet Access,
          </motion.h1>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: "clamp(38px,9vw,76px)",
              fontWeight: 900,
              letterSpacing: "-2.5px",
              lineHeight: 1.05,
              textAlign: "center",
              maxWidth: 640,
              marginBottom: 18,
            }}
            className="shimmer-text"
          >
            On&#8209;Chain.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38, duration: 0.5 }}
            style={{
              fontSize: 14, color: "#737373", textAlign: "center",
              maxWidth: 320, lineHeight: 1.65, marginBottom: 32,
            }}
          >
            Connect to the hotspot. Pick a plan. Pay in USDC.
            Access is granted instantly, on-chain.
          </motion.p>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.46, duration: 0.5 }}
            style={{ display: "flex", gap: 10, marginBottom: 36 }}
          >
            <StatBadge value="10k" label="TPS" />
            <StatBadge value="<1s" label="Finality" />
            <StatBadge value="$0.01" label="Min. price" />
          </motion.div>

          {/* Plan cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)",
            gap: 12, width: "100%", maxWidth: 440, marginBottom: 24,
          }}>
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.58, duration: 0.5 }}
            style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}
          >
            {!mounted ? (
              <button style={{
                width: "100%", padding: "15px 0", borderRadius: 12,
                background: "linear-gradient(135deg, rgba(110,84,255,0.3), rgba(131,110,249,0.2))",
                border: "1px solid rgba(131,110,249,0.2)", color: "rgba(251,250,249,0.35)",
                fontSize: 14, fontWeight: 700, cursor: "default",
              }}>
                Loading…
              </button>
            ) : !isConnected ? (
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 8px 48px rgba(110,84,255,0.4)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => connect({ connector: injected() })}
                style={{
                  width: "100%", padding: "15px 0", borderRadius: 12,
                  background: "linear-gradient(135deg, #6E54FF 0%, #836EF9 100%)",
                  border: "none", color: "#fff",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
                  cursor: "pointer",
                  boxShadow: "0 4px 32px rgba(110,84,255,0.3)",
                }}
              >
                Connect Wallet
              </motion.button>
            ) : (
              <>
                {/* Address bar */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderRadius: 10,
                  background: "rgba(14,9,28,0.8)",
                  border: "1px solid rgba(131,110,249,0.14)",
                }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#737373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {address}
                  </span>
                  <button onClick={() => disconnect()} style={{
                    fontSize: 11, fontWeight: 600, marginLeft: 10, flexShrink: 0,
                    color: "rgba(131,110,249,0.6)", background: "none", border: "none",
                    cursor: "pointer",
                  }}>
                    Disconnect
                  </button>
                </div>

                {/* Pay button */}
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 8px 48px rgba(110,84,255,0.45)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handlePay(false)}
                  disabled={status === "loading" || !walletClient}
                  className={!walletClient || status === "loading" ? "" : "neon-ring"}
                  style={{
                    width: "100%", padding: "15px 0", borderRadius: 12,
                    background: !walletClient || status === "loading"
                      ? "rgba(131,110,249,0.15)"
                      : "linear-gradient(135deg, #6E54FF 0%, #836EF9 100%)",
                    border: !walletClient || status === "loading"
                      ? "1px solid rgba(131,110,249,0.2)"
                      : "none",
                    color: !walletClient || status === "loading" ? "rgba(251,250,249,0.35)" : "#fff",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
                    cursor: !walletClient || status === "loading" ? "wait" : "pointer",
                    boxShadow: !walletClient || status === "loading" ? "none" : "0 4px 32px rgba(110,84,255,0.3)",
                    transition: "background 0.2s, box-shadow 0.2s",
                  }}
                >
                  {status === "loading"
                    ? "Processing payment…"
                    : !walletClient
                    ? "Connecting wallet…"
                    : `Pay ${selectedPlan.priceDisplay} → ${selectedPlan.label}`}
                </motion.button>
              </>
            )}

            {/* Error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: 6 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    overflow: "hidden", padding: "10px 14px", borderRadius: 10,
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#f87171", fontSize: 13,
                  }}
                >
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Faucets */}
            <p style={{ textAlign: "center", fontSize: 11, color: "#3a3a3f", paddingTop: 2 }}>
              Need USDC?{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                style={{ color: "rgba(131,110,249,0.6)" }}>faucet.circle.com</a>
              {" · "} MON gas:{" "}
              <a href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer"
                style={{ color: "rgba(131,110,249,0.6)" }}>faucet.monad.xyz</a>
            </p>
          </motion.div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        position: "relative", zIndex: 10,
        textAlign: "center", paddingBottom: 20, paddingTop: 8,
        fontSize: 11, color: "#3a3a3f", letterSpacing: "0.1em",
      }}>
        POWERED BY x402 · MONAD TESTNET · EVM
      </div>
    </main>
  );
}
