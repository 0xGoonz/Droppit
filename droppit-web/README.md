# Droppit AI — Web Application

Next.js application for [Droppit AI](https://droppit.ai): an agentic NFT drop platform on **Base**.
Creators launch one-artwork ERC-1155 drops via the web wizard **or** by tagging `@droppit` on Farcaster.
Collectors mint in 1–2 taps from a universal share link or a Farcaster Frame.

> Full product spec: [`../droppitv2.md`](../droppitv2.md)

---

## Quick Start

```bash
# Install dependencies
npm install

# Run local dev server (http://localhost:3000)
npm run dev

# Type-check without emitting
npx tsc --noEmit

# Lint
npm run lint

# Run unit tests
npm test              # single run
npm run test:watch    # watch mode

# Validate schema conformance
npm run check:schema
```

---

## Environment Variables

Create a `.env.local` in this directory. All variables below are used by at least one route.

### Required

| Variable | Used By | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All server + edge routes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | OG image routes, edge routes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes (server-side) | Supabase service role key (bypasses RLS) |
| `NEXT_PUBLIC_ENVIRONMENT` | All chain-aware routes | `production` → Base mainnet; anything else → Base Sepolia |
| `NEXT_PUBLIC_BASE_URL` | Webhooks, frames, receipt pages | Canonical app URL (e.g. `https://droppit.ai`). Fallback: `https://droppit.ai` |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Create page, deploy routes | EIP-1167 Factory contract address |
| `NEXT_PUBLIC_IMPLEMENTATION_ADDRESS` | Mint page trust section | Master implementation contract address |
| `PINATA_JWT` | Webhook, upload routes | Pinata API JWT for IPFS pinning |
| `NEXT_PUBLIC_GATEWAY_URL` | Pinata client | Pinata IPFS gateway URL |
| `NEYNAR_WEBHOOK_SECRET` | `/api/webhooks/neynar` | HMAC SHA-512 secret for webhook signature verification |
| `NEYNAR_API_KEY` | `/api/frame/drop/[contractAddress]/mint` | Neynar API key for frame message validation |
| `GEMINI_API_KEY` | `/lib/agent.ts` (intent parser) | Google Gemini API key for LLM-based cast parsing |
| `CDP_API_KEY_NAME` | `/lib/agent.ts` (AgentKit wallet) | Coinbase CDP API key name used to initialize AgentKit wallet provider |
| `CDP_API_KEY_PRIVATE_KEY` | `/lib/agent.ts` (AgentKit wallet) | Coinbase CDP API key private key used for AgentKit wallet auth |
| `LOCKED_CONTENT_ENCRYPTION_KEY` | `/api/drop/locked`, publish flow | AES-256 key for envelope-encrypting locked content |

### Optional

| Variable | Used By | Description |
|---|---|---|
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Frame drop, receipt, stats routes | Alchemy RPC key. If set, routes use `https://<network>.g.alchemy.com/v2/<key>` instead of default public RPC |
| `NEXT_PUBLIC_ONCHAINKIT_API_KEY` | `OnchainKitProvider` | Coinbase OnchainKit API key for wallet connector |

---

## Base / Base Sepolia Environment Behavior

The `NEXT_PUBLIC_ENVIRONMENT` variable controls all chain-dependent behavior:

| Aspect | `production` | Any other value (e.g. `sandbox`) |
|---|---|---|
| **Chain** | Base (chainId `8453`) | Base Sepolia (chainId `84532`) |
| **Block explorer** | `basescan.org` | `sepolia.basescan.org` |
| **Alchemy network** | `base-mainnet` | `base-sepolia` |
| **CDP Agent network** | `base-mainnet` | `base-sepolia` |
| **Nonce chain binding** | `"8453"` | `"84532"` |
| **CAIP-2 (frames)** | `eip155:8453` | `eip155:84532` |

This switch is used consistently across: `create/page.tsx`, `drop/base/[contractAddress]/page.tsx`, `drop/locked/route.ts`, `frame/drop/*/route.ts`, `frame/drop/*/mint/route.ts`, `receipt/[txHash]/route.tsx`, `r/receipt/[txHash]/route.ts`, `identity/link/nonce`, `identity/link/verify`, `stats/[contractAddress]`, and the AI parsing/deploy path (`lib/agent.ts`, `lib/frame-deploy.ts`).

---

## MVP Scope & Non-Goals

### Implemented Features (MVP)
Droppit AI implements a highly focused set of features aimed at frictionless ERC-1155 drops and agentic creation.
- **Canonical Minting:** `/drop/base/[contractAddress]`
- **Farcaster Minting Frames:** `/api/frame/drop/[contractAddress]`, `/api/frame/drop/[contractAddress]/mint`
- **Agentic Creation:** NLP-driven drop deployment via `@droppit` tags (`/api/webhooks/neynar`).
- **Locked Content:** Mint-to-unlock encrypted secrets (`/api/drop/locked`).
- **Creator Stats:** Signature-gated analytics dashboard (`/api/stats/[contractAddress]`).

### Explicit Non-Goals
To keep the MVP minimal, secure, and highly focused, the following are explicitly **not** supported:
- ❌ **No Public Gallery:** There is no index or discovery page for drops. Drops are exclusively distributed via direct link or Farcaster Frame.
- ❌ **No Allowlists or Presales:** Drops are public and open to anyone with the link/frame.
- ❌ **No Token Gating:** We do not restrict minting based on external token or NFT ownership.

---

## Key API Routes

### Drop Lifecycle

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/drops` | Create a draft drop |
| `GET`  | `/api/drops/[id]` | Fetch drop details |
| `POST` | `/api/drops/[id]/publish` | Publish: deploy contract, freeze metadata |
| `GET`  | `/api/drops/by-address/[address]` | Lookup drop by contract address |

### Farcaster Agentic Flow

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/webhooks/neynar` | Ingest Farcaster casts (HMAC-verified, idempotent). Parses deploy intent via Gemini, pins media to IPFS, creates draft |
| `GET`  | `/api/frame/deploy/[castHash]` | Deploy frame for creator (parsed summary + controls) |
| `POST` | `/api/frame/draft/[draftId]/deploy` | Execute deployment from frame |

### Farcaster Frames (Collector)

| Method | Route | Description |
|---|---|---|
| `GET`  | `/api/frame/drop/[contractAddress]` | Frame metadata (mint UI in-feed) |
| `POST` | `/api/frame/drop/[contractAddress]/mint` | Returns `eth_sendTransaction` calldata for `mint(1)`. Non-custodial |

### Mint-to-Unlock (Locked Content)

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/drop/locked/nonce` | Issue challenge nonce (chain-bound, rate-limited) |
| `POST` | `/api/drop/locked` | Verify signature + onchain ownership → return decrypted secret |

### Identity Linking

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/identity/link/nonce` | Issue structured identity challenge (rate-limited) |
| `POST` | `/api/identity/link/verify` | Verify wallet signature → store link proof |

### Attribution & Analytics

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/attribution/view` | Record page view with referral attribution (rate-limited) |
| `POST` | `/api/attribution/mint` | Record mint success with referral attribution (rate-limited) |
| `POST` | `/api/stats/auth/nonce` | Issue challenge nonce for creator stats access (rate-limited) |
| `POST` | `/api/stats/[contractAddress]` | Canonical creator-only stats (signature + nonce required) |
| `POST` | `/api/creator/drops/[id]/stats` | Backward-compat redirect to canonical stats route |

### OG Images & Receipts

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/og/drop/[dropIdOrAddress]` | Dynamic OG image (title, price, creator) |
| `GET` | `/api/og/draft/[draftId]` | OG image for draft drops |
| `GET` | `/api/receipt/[txHash].png` | Receipt OG image with drop metadata + tx status |

### Redirects

| Method | Route | Description |
|---|---|---|
| `GET` | `/r/[code]` | Referral code → canonical drop URL with `?ref=` |
| `GET` | `/r/receipt/[txHash]` | Receipt share page with OG tags + explorer link |

---

## Canonical Mint Flow

```
Creator publishes drop
  └─ POST /api/drops              → draft created (dropId)
  └─ POST /api/drops/[id]/publish → contract deployed (contractAddress)

Collector mints (web)
  └─ GET /drop/base/[contractAddress]   → mint page
  └─ Wallet signs mint(quantity) tx     → onchain ERC-1155 mint
  └─ POST /api/attribution/mint        → analytics recorded
  └─ GET /api/receipt/[txHash].png      → shareable receipt

Collector mints (Farcaster Frame)
  └─ GET /api/frame/drop/[contractAddress]       → frame metadata
  └─ POST /api/frame/drop/[contractAddress]/mint  → tx calldata returned
  └─ Wallet signs and submits                     → onchain mint
```

---

## Rate Limiting

Server-side rate limiting uses the Postgres `check_and_increment_rate_limit` RPC (defined in `schema.sql`). The shared helper is at `src/lib/rate-limit.ts`.

| Preset | Max Requests | Window | Applied To |
|---|---|---|---|
| `nonce` | 20 | 5 min | `/api/drop/locked/nonce`, `/api/identity/link/nonce`, `/api/stats/auth/nonce` |
| `analytics` | 120 | 1 min | `/api/attribution/view`, `/api/attribution/mint` |
| `webhook` | 60 | 5 min | `/api/webhooks/neynar` |

Exceeded limits return **HTTP 429** with a `Retry-After` header and structured JSON body.

---

## Supabase Schema & Migrations

### Canonical Schema

[`supabase/schema.sql`](supabase/schema.sql) is the **source of truth** for all tables. Run it against a fresh Supabase project to bootstrap a new environment:

| # | Table | Purpose |
|---|---|---|
| 1 | `drops` | Core drop lifecycle (DRAFT → LIVE) |
| 2 | `nonces` | Challenge nonces for signature verification |
| 3 | `analytics_events` | Attribution & analytics tracking |
| 4 | `identity_links` | Wallet-to-handle identity proofs |
| 5 | `webhook_events` | Idempotency tracking for Farcaster webhooks |
| 6 | `rate_limits` | IP-based rate limiting + `check_and_increment_rate_limit` RPC |
| 7 | `referral_links` | Short-code referral redirects |

### Forward Migrations

Migrations live in `supabase/migrations/` and are ordered by timestamp. They are **idempotent** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) and safe to run on any database state:

```
supabase/migrations/
├── 2026030101000_align_schema_with_code.sql
├── 20260301070706_add_cast_hash_to_drops.sql
├── 20260301090000_add_payout_recipient_to_drops.sql
├── 20260302072800_normalize_schema.sql
├── 20260302080200_backfill_all_drop_columns.sql
└── 20260302134000_create_referral_links.sql
```

**To apply migrations** to an existing database, run them in timestamp order via the Supabase SQL editor or CLI:

```bash
# If using Supabase CLI
supabase db push
```

**To set up a fresh environment**, run `schema.sql` directly — it includes everything the migrations build incrementally.

### Key Conventions

- `mint_price` is stored as **TEXT** containing a wei string (never NUMERIC — avoids BigInt precision loss)
- All address columns (`creator_address`, `contract_address`, `payout_recipient`) are **lowercase-enforced**
- `referral_links.code` has a `CHECK` constraint matching the route regex: `^[A-Za-z0-9_-]{1,64}$`
- Locked content is encrypted at rest via `encryptLockedContent()` and only written at publish time

---

## Project Structure

```
droppit-web/
├── src/
│   ├── app/
│   │   ├── api/            # API routes (drops, frames, webhooks, attribution, etc.)
│   │   ├── create/         # Creator wizard page
│   │   ├── drop/base/      # Canonical mint page (/drop/base/[contractAddress])
│   │   └── r/              # Redirects (referral codes, receipt share pages)
│   ├── lib/
│   │   ├── supabase.ts     # Supabase client (anon + service role)
│   │   ├── rate-limit.ts   # Shared rate-limit helper
│   │   ├── pinata.ts       # Pinata IPFS client
│   │   ├── contracts.ts    # Factory + Implementation addresses
│   │   ├── agent.ts        # Gemini LLM client
│   │   ├── intent-parser.ts# Cast text → structured deploy intent
│   │   ├── crypto/         # Locked content encryption
│   │   └── validation/     # Drop validation helpers
│   └── providers/          # React context providers (OnchainKit)
├── supabase/
│   ├── schema.sql          # Canonical schema (source of truth)
│   └── migrations/         # Forward migrations (idempotent)
└── package.json
```

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Onchain:** viem + Coinbase OnchainKit
- **Database:** Supabase (PostgreSQL)
- **IPFS:** Pinata
- **AI:** Google Gemini 2.5 Flash (via LangChain)
- **Webhooks:** Neynar (Farcaster)
- **Testing:** Vitest
