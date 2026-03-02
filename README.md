<h1 align="center">🎨 Droppit AI</h1>

<p align="center">
  <strong>The native Farcaster drop infrastructure for Base.</strong><br/>
  Launch ERC-1155 NFT drops directly into the feed — via the web or by casting to <code>@droppit</code>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Base-0052FF?logo=coinbase&logoColor=white" alt="Base" />
  <img src="https://img.shields.io/badge/Solidity-^0.8.20-363636?logo=solidity" alt="Solidity" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## What is Droppit AI?

Droppit is an **agentic web platform for Base** that lets creators launch single-artwork NFT drops in two ways:

1. **Web Wizard** — A 4-step guided flow: metadata → economics → identity → deploy.
2. **Farcaster AI Agent** — Cast an image and tag `@droppit` with natural-language instructions. The AI parses your intent, drafts the drop, and returns a deploy frame — all without leaving Warpcast.

Every drop gets its own **smart contract address** on Base (gas-optimized via EIP-1167 minimal proxy clones), a **canonical mint page**, and a **Farcaster Frame** for zero-UI minting directly in-feed.

---

## ✨ Core Features

### 🚀 Creator-Friendly Drop Generator
Two first-class creation paths. Web creators get a step-by-step wizard with live preview. Farcaster creators just cast and go.

### ⚡ Gas-Optimized Onchain Architecture
Every drop deploys its own ERC-1155 contract via the `DropFactory` using [EIP-1167 Minimal Proxy Clones](https://eips.ethereum.org/EIPS/eip-1167) — one contract per drop with minimal gas overhead.

### 🔐 Mint-to-Unlock / Encrypted Content
Creators can attach a secret message (passwords, alpha, event codes) that is **encrypted at rest** (AES-256-GCM) and revealed only to wallets that own the NFT. Decryption requires a signed nonce challenge + onchain ownership proof.

### 🖼️ Farcaster Frames
Every drop has interactive Frame endpoints. Collectors can mint directly in Warpcast. Creators get deploy frames with secret input, high-res upload, and auto-deploy support.

### 🛡️ Trust-First Minting
The mint page prominently displays the creator identity (wallet-linked handle), drop contract address, factory address, implementation address, and network — all verifiable on the Base explorer.

### 📊 Creator Analytics
Private per-drop stats: views, mints, conversion rate, top referrers, and revenue breakdown (creator proceeds vs. protocol fees).

---

## 🏗️ Repository Structure

```
droppit/
├── droppit-contracts/          # Foundry — EVM smart contracts
│   ├── src/
│   │   ├── Drop1155.sol        # ERC-1155 implementation (mint, withdraw, locked commitment)
│   │   └── DropFactory.sol     # Clone factory (EIP-1167 + protocol fee config)
│   ├── test/                   # Forge tests
│   └── script/                 # Deployment scripts
│
├── droppit-web/                # Next.js 16 (App Router) — Frontend + API
│   ├── src/
│   │   ├── app/
│   │   │   ├── create/         # Drop creation wizard
│   │   │   ├── drop/           # Canonical mint page
│   │   │   └── api/            # 14+ API routes
│   │   │       ├── drops/      # CRUD + publish lifecycle
│   │   │       ├── frame/      # Farcaster Frame endpoints
│   │   │       ├── drop/       # Locked content unlock
│   │   │       ├── webhooks/   # Neynar webhook ingestion
│   │   │       ├── agent/      # AI intent parser
│   │   │       ├── og/         # Dynamic OG image generation
│   │   │       └── ...
│   │   └── lib/
│   │       ├── crypto/         # AES-256-GCM encryption
│   │       ├── validation/     # Shared input validators
│   │       ├── agent.ts        # Gemini + CDP AgentKit initialization
│   │       └── intent-parser.ts # Cast → drop intent extraction
│   ├── supabase/
│   │   ├── schema.sql          # Canonical DB schema (source of truth)
│   │   └── migrations/         # Forward migrations
│   └── scripts/
│       └── check-schema-conformance.ts  # CI schema drift detection
│
└── droppitv2.md                # MVP Product Specification
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contracts** | Solidity ^0.8.20, Foundry, OpenZeppelin Clones + Upgradeable |
| **Frontend** | Next.js 16 (App Router), React 19, TailwindCSS 4 |
| **Web3** | viem, Wagmi, Coinbase OnchainKit (Smart Wallet + Passkeys) |
| **AI Agent** | CDP AgentKit, LangChain, Google Gemini 2.5 Flash |
| **Farcaster** | Neynar (webhooks + HMAC verification), custom Frame builder |
| **Database** | Supabase (PostgreSQL) — 6 tables, schema-checked in CI |
| **Storage** | Pinata (IPFS pinning for artwork + metadata) |
| **Security** | AES-256-GCM locked content encryption, challenge nonces, commitment validation |
| **Network** | Base (Mainnet + Sepolia) |
| **Testing** | Vitest (unit), Foundry (contracts), schema conformance checks |

---

## 🔒 Security Architecture

```
┌─ Draft Phase ──────────────────────────────────────────┐
│  Frame input → validate → store in locked_content_draft │
│  (plaintext staging column, never in locked_content)    │
└─────────────────────────────────────────────────────────┘
                          │
                    [Publish API]
                          │
┌─ Publish Phase ─────────────────────────────────────────┐
│  1. Resolve plaintext (body override > staged draft)    │
│  2. Validate salt (0x + 64 hex chars)                   │
│  3. Recompute commitment = keccak256(salt ‖ plaintext)  │
│  4. Reject if commitment ≠ onchain commitment           │
│  5. Encrypt with AES-256-GCM → write to locked_content  │
│  6. Clear locked_content_draft → null                   │
└─────────────────────────────────────────────────────────┘
                          │
                    [Unlock Flow]
                          │
┌─ Unlock Phase ──────────────────────────────────────────┐
│  1. Issue time-bound nonce (wallet + contract scoped)   │
│  2. Verify wallet signature                             │
│  3. Burn nonce (anti-replay)                            │
│  4. Verify onchain NFT ownership (balanceOf)            │
│  5. Decrypt AES-256-GCM → return plaintext              │
│  6. Serve with no-store/no-cache headers                │
└─────────────────────────────────────────────────────────┘
```

---

## 📖 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Foundry](https://book.getfoundry.sh/) (for smart contracts)
- A [Supabase](https://supabase.com/) project
- API keys: Pinata, Gemini, CDP, Neynar, Coinbase OnchainKit

### 1. Smart Contracts

```bash
cd droppit-contracts
forge install
forge build
forge test -vvv
```

### 2. Database Setup

Run the canonical schema on a fresh Supabase project:
```sql
-- In the Supabase SQL Editor, paste and run:
-- supabase/schema.sql
```

Or apply forward migrations to an existing database:
```bash
# Apply each migration in supabase/migrations/ in order
```

### 3. Environment Variables

```bash
cd droppit-web
cp .env.local.example .env.local
```

Configure the following in `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `PINATA_JWT` | Pinata JWT for IPFS uploads |
| `NEXT_PUBLIC_GATEWAY_URL` | Pinata gateway URL |
| `GEMINI_API_KEY` | Google Gemini API key |
| `CDP_API_KEY_NAME` | Coinbase Developer Platform key name |
| `CDP_API_KEY_PRIVATE_KEY` | CDP private key |
| `NEXT_PUBLIC_ONCHAINKIT_API_KEY` | Coinbase OnchainKit API key |
| `NEYNAR_API_KEY` | Neynar API key |
| `NEYNAR_WEBHOOK_SECRET` | Neynar webhook HMAC secret |
| `LOCKED_CONTENT_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM |
| `NEXT_PUBLIC_ENVIRONMENT` | `production` or `sandbox` (controls Base vs Sepolia) |
| `NEXT_PUBLIC_BASE_URL` | Public-facing URL (e.g., `https://droppit.ai`) |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Deployed DropFactory contract address |
| `NEXT_PUBLIC_IMPLEMENTATION_ADDRESS` | Deployed Drop1155 implementation address |

### 4. Run the Web App

```bash
cd droppit-web
npm install
npm run dev
```

### 5. Run Tests & Checks

```bash
# Unit tests (Vitest)
npm run test

# Schema conformance (CI-ready — fails on drift)
npm run check:schema
```

---

## ⛓️ Onchain Architecture

```
                    ┌──────────────────┐
                    │   DropFactory     │
                    │  (owner-managed)  │
                    └────────┬─────────┘
                             │ createDrop()
                             │ deploys EIP-1167 clone
                             ▼
              ┌──────────────────────────┐
              │     Drop1155 Clone       │
              │  (unique contract addr)  │
              │                          │
              │  • mint(qty) / mintTo()  │
              │  • withdraw() → creator  │
              │  • uri(1) → frozen IPFS  │
              │  • lockedMessageCommit.. │
              │  • protocolFee → instant │
              └──────────────────────────┘

Protocol Fee: 0.0001 ETH flat per mint (forwarded immediately)
Edition Range: 1–10,000 (enforced onchain)
Metadata: Frozen at initialize — no setURI
```

---

## 🤖 AI Agent Flow

```
Creator casts: "@droppit deploy this. Midnight Run, 100 editions, 0.001 ETH"
                                    │
                         ┌──────────▼──────────┐
                         │  Neynar Webhook      │
                         │  (HMAC-SHA512 verify) │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  Gemini 2.5 Flash    │
                         │  Structured Output   │
                         │  (title, editions,   │
                         │   price, asset URI)  │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  Strict Validation   │
                         │  (fail-closed, no    │
                         │   fallback defaults) │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │  Draft Created + Media Pinned   │
                    │  Deploy Frame returned to cast  │
                    └────────────────────────────────┘
```

---

## 📁 API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/drops` | POST | Create draft drop |
| `/api/drops/[id]` | GET | Fetch draft details |
| `/api/drops/[id]/publish` | POST | Publish: encrypt + transition DRAFT → LIVE |
| `/api/drops/by-address/[addr]` | GET | Lookup drop by contract address |
| `/api/frame/deploy/[castHash]` | POST | Deploy frame for webhook-originated drafts |
| `/api/frame/draft/[id]/deploy` | POST | Deploy frame for direct drafts |
| `/api/frame/drop/[addr]` | GET | Collector mint frame metadata |
| `/api/frame/drop/[addr]/mint` | POST | Frame mint transaction data |
| `/api/drop/locked` | POST | Decrypt + return locked content (ownership-gated) |
| `/api/drop/locked/nonce` | POST | Issue challenge nonce for unlock |
| `/api/webhooks/neynar` | POST | Ingest Farcaster casts (HMAC-verified) |
| `/api/agent/parse-deploy-intent` | POST | Parse cast text into structured drop intent |
| `/api/og/drop/[id]` | GET | Dynamic OG image generation |
| `/api/attribution/view` | POST | Record page view attribution |
| `/api/attribution/mint` | POST | Record mint attribution |

---

## 🧪 Testing

| Layer | Framework | Command |
|-------|-----------|---------|
| Smart Contracts | Foundry | `forge test -vvv` |
| Unit Tests | Vitest | `npm run test` |
| Schema Conformance | Custom (tsx) | `npm run check:schema` |

The schema conformance check scans every API route for Supabase column references and verifies they exist in the canonical `schema.sql`. It exits with code 1 on drift — designed for CI pipelines.

---

## 📄 License

MIT

---

<p align="center">
  Built for the <strong>Base</strong> ecosystem ⚡
</p>
