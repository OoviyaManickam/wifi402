# WifiX402 — Complete Project Reference

> **One liner:** WifiX402 — agentic pay-per-use WiFi powered by x402 micropayments and AI agents on Monad.

---

## What is WifiX402?

WifiX402 is a decentralized hotspot access system that lets anyone connect to a WiFi network and pay for internet access in real-time using USDC on Monad Testnet — no accounts, no subscriptions, no middlemen.

When a device connects to the hotspot and opens a browser, it is redirected to a captive portal. The user picks a time plan, connects their wallet, and pays a tiny amount of USDC. The payment is verified on-chain via the **x402 protocol**, and the firewall instantly grants internet access for the purchased duration. When the session expires, access is automatically revoked.

**Built at: Monad Blitz Bangalore V4 Hackathon**

---

## How it Works — Full Flow

```
Device joins hotspot
        ↓
Opens browser → HTTP request
        ↓
PF firewall intercepts (unpaid IP)
        ↓
Redirects to 192.168.2.1:3000 (captive portal)
        ↓
User picks plan → connects wallet → signs USDC payment
        ↓
x402 agent verifies payment on Monad Testnet
        ↓
Firewall agent adds IP to paid_users table
        ↓
Internet access granted instantly
        ↓
Session intelligence agent monitors countdown
        ↓
On expiry → firewall agent removes IP → access revoked
```

---

## Plans

| Plan | Duration | Price (USDC) | Internal ID |
|------|----------|--------------|-------------|
| Taste | 2 Minutes | $0.01 | `2min` |
| Cruise | 30 Minutes | $0.10 | `30min` |
| Commit | 1 Hour | $0.25 | `1hr` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Monad Testnet (EVM, chain ID `10143`, 400ms settlement) |
| Payment Protocol | x402 — HTTP 402 micropayments |
| Token | USDC — `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Facilitator | `https://x402-facilitator.molandak.org` |
| Payment Scheme | `ExactEvmScheme` via EIP-3009 `TransferWithAuthorization` |
| Frontend | Next.js 16.2.7, Tailwind CSS v4, Motion (motion/react) |
| Wallet | wagmi v3, viem, injected connector (MetaMask / injected) |
| Session Storage | Supabase (PostgreSQL) |
| Firewall | macOS PF (`pfctl`) — grants/revokes per-IP access |
| Hotspot Interface | macOS Internet Sharing → `bridge100` at `192.168.2.1` |
| Hotspot Subnet | `192.168.2.0/24` |
| Font | Inter (same as monad.xyz) |
| UI Components | shadcn/ui (base-nova style), Motion animations |

---

## Repository

```
GitHub: https://github.com/OoviyaManickam/wifi402
Branch: main
Working directory: /wifi402/x402/
```

---

## Project Structure

```
x402/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main captive portal UI
│   │   ├── layout.tsx            ← Inter font, metadata
│   │   ├── globals.css           ← Monad palette, animations, scan-line
│   │   ├── providers.tsx         ← wagmi + Supabase providers
│   │   └── api/
│   │       ├── purchase/route.ts ← x402 payment + grant access
│   │       ├── renew/route.ts    ← x402 renewal + extend session
│   │       ├── session/route.ts  ← Check active session by IP
│   │       └── premium/route.ts  ← Protected premium route (demo)
│   ├── lib/
│   │   ├── firewall.ts           ← pfctl wrapper (allowIp, blockIp)
│   │   ├── scheduler.ts          ← Expiry checker (runs every 1s)
│   │   ├── session.ts            ← Supabase session CRUD
│   │   ├── plans.ts              ← Plan definitions
│   │   ├── x402-server.ts        ← x402 server config
│   │   └── supabase.ts           ← Supabase client
│   └── components/               ← (unused Bear files, shadcn ui)
├── pf/
│   └── wifi402.conf              ← PF firewall anchor rules
├── next.config.ts                ← Turbopack root fix
├── components.json               ← shadcn config
└── package.json
```

---

## Agents Architecture

WifiX402 uses three agents, each owning a distinct responsibility:

### 1. Firewall Agent (`src/lib/firewall.ts`)
Owns all `pfctl` interactions. No other part of the system touches the firewall directly.

| Function | What it does | pfctl command |
|----------|-------------|---------------|
| `allowIp(ip)` | Grants internet access | `pfctl -a wifi402 -t paid_users -T add <ip>` |
| `blockIp(ip)` | Revokes internet access | `pfctl -a wifi402 -t paid_users -T delete <ip>` |
| `listAllowedIps()` | Lists all active IPs | `pfctl -a wifi402 -t paid_users -T show` |
| `getHotspotIp()` | Gets bridge100 IP | `ifconfig bridge100` |

**Triggered by:** purchase, renew (→ allow), scheduler expiry (→ block)

---

### 2. x402 Agent (`src/lib/x402-server.ts` + API routes)
Owns all payment verification. Wraps API handlers with `withX402` middleware.

**Flow:**
1. Client calls `POST /api/purchase?plan=2min`
2. Server responds `402 Payment Required` with payment details
3. Client signs EIP-3009 typed data with wallet
4. Client re-sends request with `X-PAYMENT` header
5. x402 middleware verifies on Monad Testnet via facilitator
6. On success → handler runs → firewall agent grants IP

**Key constants:**
```
Network:      eip155:10143
USDC:         0x534b2f3A21130d7a60830c2Df862319e593943A3
Facilitator:  https://x402-facilitator.molandak.org
Scheme:       exact (ExactEvmScheme)
```

---

### 3. Session Intelligence Agent (`src/lib/scheduler.ts` + swarm opportunity)
Owns session lifecycle. Runs every 1 second, checks Supabase for expired sessions, triggers firewall revocation.

**Current implementation:**
```typescript
setInterval(async () => {
  const expired = await getExpiredSessions();
  for (const session of expired) {
    blockIp(session.ip);          // → Firewall Agent
    await markSessionExpired(session.id);
  }
}, 1000);
```

**Swarm expansion** — each active session can spawn its own sub-agent:

| Sub-agent | Responsibility |
|-----------|---------------|
| Session Monitor | Watches countdown, triggers revoke at expiry |
| Anomaly Detection | Flags abuse — same IP buying $0.01 plan repeatedly |
| Upsell Agent | At 80% session consumed, nudges user to renew |
| Usage Analytics | Tracks bandwidth, time patterns, plan popularity |
| Fraud Detection | Checks if payment came from a flagged wallet |

---

## Firewall Rules (`pf/wifi402.conf`)

```
table <paid_users>  persist          ← IPs with active sessions
table <hotspot_net> const { 192.168.2.0/24 }

Rule 1: rdr — redirect unpaid HTTP → captive portal (port 3000)
Rule 2: pass DNS (port 53) for all hotspot clients
Rule 3: pass port 3000 (captive portal) for all hotspot clients
Rule 4: block all outbound from unpaid clients
Rule 5: pass all traffic from paid_users
```

**Critical:** `rdr` rule MUST come before filter rules in PF or you get syntax error:
`Rules must be in order: translation, filtering`

---

## API Routes

### `POST /api/purchase?plan=<id>`
- Protected by `withX402` middleware
- Verifies USDC payment on Monad
- Creates session in Supabase
- Calls `allowIp(ip)` via Firewall Agent
- Starts scheduler on first boot
- Returns: `{ sessionId, planId, expiresAt, durationMs }`

### `POST /api/renew?plan=<id>`
- Same as purchase but marks as renewal
- Re-adds IP (safe to call even if already allowed)
- Returns: `{ sessionId, planId, expiresAt, durationMs, renewed: true }`

### `GET /api/session`
- Extracts client IP from request headers
- Queries Supabase for active session with that IP
- Returns remaining time — used on page load to restore session state
- No pfctl call — read-only

---

## Supabase Schema

Table: `sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wallet` | text | Payer wallet address |
| `ip` | text | Client IP (used for firewall) |
| `mac` | text | Client MAC (optional) |
| `plan_id` | text | `2min` / `30min` / `1hr` |
| `paid_amount` | float | USDC amount paid |
| `duration_ms` | int | Plan duration in ms |
| `expires_at` | bigint | Unix timestamp ms |
| `status` | text | `active` / `expired` |

---

## UI Design

**Theme:** Pure white background + Monad purple — exact colours from monad.xyz CSS.

| Token | Value |
|-------|-------|
| Background | `#ffffff` |
| Text | `#0e100f` |
| Purple primary | `#836EF9` |
| Purple bright | `#6E54FF` |
| Surface | `#f5f3ff` |
| Muted text | `#71717a` |
| Font | Inter (same as monad.xyz) |

**Animations:**
- `orb-breathe` — three radial gradient blobs pulse in/out
- `scan-line` — purple beam sweeps top to bottom continuously
- `shimmer` — "On-Chain." hero text sweeps dark→purple gradient
- `flicker` — CRT-style flicker on stat values
- `ring-glow` — neon border pulse on selected plan card and pay button
- `number-pulse` — glowing text-shadow breathe on countdown timer
- `marquee` — ticker tape scrolling across the page

**Key UI components:**
- `OrbitalRings` — ambient background with blobs + dot grid + scan line
- `Ticker` — scrolling marquee with `400ms SETTLEMENT`, `x402 MICROPAYMENTS` etc.
- `StatBadge` — `400ms Settlement`, `<1s Finality`, `$0.01 Min. price`
- `PlanCard` — 3D spring tilt on hover, neon ring glow when selected, labeled `01 · Taste / 02 · Cruise / 03 · Commit`
- Active session view — giant glowing countdown timer with pulsing ring

---

## Environment Variables

File: `x402/.env.local` (never commit this)

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
PAY_TO_ADDRESS=             ← wallet address that receives USDC payments
HOTSPOT_INTERFACE=bridge100 ← macOS Internet Sharing interface (default)
```

---

## Running the Project

### Every time from scratch (already cloned)
```bash
cd ~/Desktop/wifi402/x402
git pull origin main
npm install
npm run build
npm start
```

### Pull latest changes (already have it running before)
```bash
cd ~/Desktop/wifi402/x402
git fetch origin
git reset --hard origin/main
npm install
npm run build
npm start
```

### Start the firewall (separate terminal, after npm start)
```bash
sudo pfctl -e -f ~/Desktop/wifi402/x402/pf/wifi402.conf
```

### Verify firewall is running
```bash
sudo pfctl -s rules
sudo pfctl -a wifi402 -t paid_users -T show   # list currently paid IPs
```

---

## Internet Sharing Setup (macOS)

1. System Settings → General → Sharing
2. **Share connection from:** iPhone USB (or Ethernet adapter — NOT Wi-Fi)
3. **To computers using:** Wi-Fi
4. Toggle **Internet Sharing** ON
5. This creates `bridge100` at `192.168.2.1`
6. Connected devices get IPs in `192.168.2.x`

**If hotspot not visible on other devices:**
- Turn Wi-Fi off → wait 10s → turn back on
- Toggle Internet Sharing off → back on

---

## Why Cannot Deploy to Vercel

The app must run locally on the hotspot Mac because:
- `pfctl` is a macOS system call — not available on Vercel/cloud
- The server and the firewall must be on the same machine
- Vercel has no access to your Mac's `bridge100` network interface

**For a public demo URL, use ngrok:**
```bash
npx ngrok http 3000
```

---

## Key Bugs Fixed During Build

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| PF syntax error `Rules must be in order` | `rdr` rule placed after filter rules | Moved `rdr` to top of `wifi402.conf` |
| `Loading...` button stuck | wagmi waiting for MetaMask which didn't exist | Use MetaMask mobile browser or install extension |
| HMR WebSocket failures on hotspot client | Dev server WebSocket blocked by PF | Use `npm run build && npm start` (production) |
| Turbopack parent dir scan error | Turbopack detected parent directory lockfile | Added `turbopack: { root: path.resolve(__dirname) }` in `next.config.ts` |
| Hydration mismatch on wallet connect | SSR/CSR state mismatch | Added `mounted` state guard before rendering wallet UI |
| `bridge100` not found | Internet Sharing was off | Enable Internet Sharing in System Settings |
| Wrong git repo pushed | Pushed from Desktop level not x402 folder | `git init` inside x402, fresh push |
| Double `style` prop on motion.button | Two `style` attributes on same element | Merged into single style object |
| Diverged branches on pull | Remote was force-pushed | `git fetch origin && git reset --hard origin/main` |

---

## Git History (key commits)

```
3a3d728  feat: white + purple theme, 400ms settlement stat
b467bd5  chore: rename WiFi402 to WifiX402
c8440f0  feat: redesign with Monad brand palette, Inter font, wild artistic UI
98730d0  Revert "feat: elite white neon UI..."
02a297e  fix: set turbopack root to x402 dir to prevent parent dir scan error
7daad73  feat: redesign UI with monad-inspired dark aesthetic, remove bears
7948947  fix: wait for walletClient before enabling pay button
542cd9c  fix: use toClientEvmSigner for x402 payments, fix hydration mismatch
fd2c2da  chore: verified clean build
443dacc  feat: captive portal UI with plan selector and countdown timer
```

---

## Why Monad

Monad's **400ms transaction settlement** makes this practical as a real payment UX — users don't wait for block confirmations. At $0.01 per access, gas costs on Monad are negligible. Combined with x402's HTTP-native payment flow, the entire purchase-to-access cycle completes in under 2 seconds.

---

*WifiX402 — agentic pay-per-use WiFi powered by x402 micropayments and AI agents on Monad.*
