# NFT Drop-in-Feed on Base — Product Spec (MVP → V1)

## 1) Overview

**Product:** Droppit is an **Agentic Web platform for Base**: creators can launch one-artwork NFT drops either through the web app or directly from Farcaster by tagging the Droppit persona. The product positions Droppit as the **"Clanker for NFTs"** on Farcaster, while preserving a canonical share link and a trust-first mint page where anyone can **mint in 1–2 taps**.

**Payment model (MVP):** Creator pays gas to create the drop (contract deploy + config).

**Mint gas (MVP):** Collectors pay Base network gas when minting.

**Protocol fee (MVP):** Platform charges a **small, transparent protocol fee per mint** to cover infra (servers, OG generation, IPFS pinning). The fee is shown upfront in the mint UI and included in the total. **Onchain, the protocol fee portion is forwarded immediately to the protocol fee recipient at mint time (no later settlement).**

**Protocol fee shape (MVP):** `protocolFeePerMint` is a **flat amount per mint (in wei)**, not a percentage. It is set **by the Factory at deploy time** and is **not configurable or overridable by the creator**. The Factory's `defaultProtocolFeePerMint` is applied to every drop.

**Protocol fee (MVP):** `protocolFeePerMintWei = 100_000_000_000_000` (0.0001 ETH). This value is controlled exclusively by the Factory owner (platform admin) and cannot be changed per drop.

**Future:** Sponsorship can be added later (after grants) to subsidize creator deploy costs and/or collector mint fees.

**Token standards:**

- **MVP:** ERC-1155 (editions)
- **V1:** Add ERC-721 option

**MVP rule:** **One post = one artwork = one drop.** No packs/mini-collections.

**Onchain architecture:** **One contract per drop** (each drop gets its own **contract address** on Base), deployed as an **EIP-1167 minimal proxy clone** via a **Factory** that points to a single **Master Implementation** contract.

**Agentic distribution layer (MVP+):** A proactive Droppit persona on Farcaster handles natural-language drop creation, deployment confirmation frames, and milestone/curation posting powered by backend analytics signals.

**Core invariants that remain unchanged:**
- **EIP-1167 minimal proxy clones** (one contract per drop)
- **Creator pays gas to deploy; collector pays gas to mint**
- **Fixed edition range remains 1–10,000**
- **Mint-to-unlock decryption with server-side envelope encryption remains mandatory**

**Differentiators (all included):**

1. Creator-friendly drop generator
2. Universal share link/card (not tied to one platform)
3. Safety/authenticity shown on mint page (creator + contract info clearly displayed)

---

## 2) Goals & Success Criteria

### Goals (MVP)

- Let creators mint a drop from a single artwork with minimal steps, including a **zero-UI Farcaster path** via AI parsing + deploy frame.
- Provide a **shareable URL** that renders a clean preview card (Open Graph / social embeds).
- Allow collectors to mint in **1–2 taps** (connect wallet → mint).
- Make authenticity obvious on the mint page (creator wallet, contract address, Base network).

### Success Criteria

- **Time to publish drop:** creator can go from upload → share link in **< 3 minutes**.
- **Mint flow:** collector mints in **≤ 2 primary actions** after landing (e.g., “Connect” then “Mint”).
- **Share preview quality:** link reliably generates an OG card across major social platforms.
- **Trust signals:** contract + creator identity visible within first viewport.

### Non-Goals (MVP) (Decision baked in)

- Packs/collections, multi-artwork drops.
- Secondary marketplace features.
- **No token gating / allowlists / presales** (protect the 1–2 tap mint promise).
- Auctions, Dutch auctions, and other advanced sale mechanics.
- Creator profiles, followers, feeds.

* **No public drop gallery / discovery UI** (homepage “collection,” browsing, search). **MVP is link-first:** discovery happens via **shared links and Farcaster Frames**.

---

## 3) Users & Use Cases

### Primary Personas

- **Creator (Crypto Artists & Everyday Users)**
  - Wants a simple drop generator with predictable costs.
  - Wants a link that looks good in a feed and converts to mints instantly.
  - *Event Organizers/Normies:* Wants to create digital souvenirs for weddings, birthdays, and IRL meetups without crypto friction.
- **Collector / Follower / Guest**
  - Sees a link in a feed or scans a QR code at an event.
  - Clicks → lands on mint page → mints quickly and confidently in 1-2 taps.

### Core Use Cases

- **Standard Drop:** Creator uploads artwork, sets editions and price, publishes drop, shares link.
- **Agentic Launch:** Creator casts an artwork on Warpcast and tags `@droppit` with deploy instructions; AI parses, drafts, and returns a deploy frame.
- **Immortalized Events:** Creator sets up a Free Mint for an event (wedding/birthday), guests scan a QR code to claim their "Modern Onchain Souvenir".
- **Frictionless Minting:** Collector opens link, sees art + authenticity, mints in 1–2 taps.

---

## 4) User Flows

### 4.1 Creator Flow (MVP)

1. **Connect Wallet** (Base supported)
2. **Link identity (optional)**
   - **Link Farcaster handle (optional)**

      - Creator enters their Farcaster username manually. (**MVP:** manual entry + wallet signature only; no Warpcast OAuth — see Section 21.)

     - App issues a one-time **link nonce** (expires in 10 minutes) and asks the creator wallet to sign:

       ```
       [AppName] Identity Link

       Action: Link Farcaster handle
       Handle: @<handle>
       Wallet: <0xCreatorAddress>
       Chain: Base (chainId 8453)
       Nonce: <random>
       Issued At: <ISO8601>
       Expires At: <ISO8601>
       ```

     - Backend verifies:

       - signature matches `creatorAddress`
       - nonce is valid + unused + not expired
       - handle is valid (basic charset rules)

     - Backend stores a link-proof record (server-side): `creatorAddress`, `handle`, optional `fid`, `signature`, `nonce`, `issuedAt`, `verifiedAt`.

     - UI labeling must be precise: **“Linked to @handle”** (avoid implying KYC).

     - **Disclosure (MVP):** This is an **app-level wallet-signature proof** that the wallet owner linked the handle at a point in time. It is **not** official Farcaster/Warpcast verification, and it is **not** KYC.

   - **ENS display (automatic, optional)**

     - If `creatorAddress` has an ENS reverse record, display **“ENS: name.eth”**.
     - ENS is display-only and does not affect permissions.
3. **Upload artwork** (image)
   - **Media types (MVP):** images only (PNG/JPG/WebP). No GIF/video/animation in MVP.
   - **V1 (optional):** add GIF/video support later.
4. **Optional: Locked Content / Secret Message (Mint-to-Unlock)**
   - **Text-only. Links/URLs are blocked** to reduce phishing/scam risk.

- **URL/link blocking rules (MVP):** Reject input if it contains any of the following (case-insensitive), after normalizing (see below):
  1. **Scheme URLs:** any `http://`, `https://`, `ipfs://`, `ftp://`, or generally `\b[a-z][a-z0-9+\-.]*://`
  2. **www-prefix:** any `www.`
  3. **Bare domains:** any `domain.tld`-style token, e.g. matches `\b[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+\b` (conservative; blocks `example.com`, `sub.example.co`, etc.)
  4. **IP address links:** any IPv4 token like `\b(\d{1,3}\.){3}\d{1,3}\b` (optionally with `:port` or `/path`)
  5. **Markdown/HTML-style links:** patterns like `\[.*\]\(.*\)` and `<http...>`
- **Normalization before checks (MVP):** apply Unicode NFKC, lowercase a copy for detection, and strip zero-width chars to reduce obfuscation.
- **Max length (MVP):** 1,000 characters.
- Stored **encrypted at rest** (server-side) and never exposed in public metadata/OG.
- **Frozen at publish (MVP):** after the drop is created, the locked message becomes **immutable** to prevent bait-and-switch.
- **Immutability strength (MVP):** This is **policy + backend-enforced immutability** (frozen server record; no post-publish update path). It is **not independently verifiable onchain** in MVP.
- **Optional hardening (V1): Onchain commitment hash:** At `initialize(...)`, store a `lockedMessageCommitment` (`bytes32`) onchain and emit an event (e.g., `LockedMessageCommitted(commitment)`). The message remains offchain/encrypted; the onchain commitment enables later verification that the revealed plaintext matches what was committed at publish time.
  - **Important:** Use a **salted** commitment (or commitment to ciphertext) to reduce brute-force risk if the message is short.
- This message is revealed only to wallets that minted/own the drop.

5. Enter drop settings:
   - Title

   - Description (optional)

   - Edition size (supply) — **fixed hard cap in MVP** (`editionSize`)

   - Validate in UI: `editionSize` must be **1–10,000** (show inline error and block publish).

- **MVP:** fixed supply only (no open editions / timed mints)
- **V1 (optional):** consider open edition “until time X” later
- Price per mint (ETH)
- Payout recipient address (optional; default = creator address)
  - **UI clarity (MVP):** this is a **single address only** (no splits). Label as: “Wallet to receive funds (defaults to you).”

6. **Preview share card** (what it looks like in a feed)
7. **Create Drop**
   - Upload metadata
   - **Freeze metadata at publish:** finalize the artwork + metadata (IPFS CIDs) that will be permanently referenced by the drop
   - Deploy per-drop contract as an **EIP-1167 clone** via **Factory** (one drop = one contract address)
   - **Initialize validation (MVP):** `initialize(...)` MUST revert if `editionSize` is outside **[1, 10,000]**.
   - **Recipient validation (MVP):** `initialize(...)` MUST revert if `payoutRecipient == address(0)` or `protocolFeeRecipient == address(0)`.
   - **Payout recipient (MVP):** defaults to the creator wallet, but the creator can optionally set a different payout recipient address at publish/initialize time. **Single address only (no revenue splits in MVP).**
   - Persist drop record offchain
8. **Receive Share Link**
   - Copy link
   - “Open mint page”

### 4.2 Collector Flow (MVP)

1. Open **share link** (or Frame → open mint page fallback)
2. View mint page:
   - Artwork, title, editions remaining, price
   - Trust section: creator + contract info + network
3. Tap **Connect** (if not connected)
4. Optional: set **Mint to address** (gift)
   - **Quantity rules (MVP):**
     - **Frame:** always `quantity = 1` (no selector).
     - **Mint page:** user can choose `quantity` **1–5** (default 1), subject to remaining supply.
5. Tap **Mint** *(collector signs the transaction and pays Base network gas in MVP)*
6. Receive confirmation (tx pending → success)
7. Post-mint:
   - Show **Unlocked message** (if enabled; only for owners)
   - Show **Shareable receipt image** + Share on Warpcast/X + View tx
8. Optional: view on explorer / open in wallet / share

### 4.3 Creator Flow (Agentic Farcaster Deployer — MVP)

1. Creator publishes a cast on Warpcast with an image (or an `ipfs://` / Arweave URL for full-quality source) and tags `@droppit` with natural-language instructions.
   - Example: `@droppit deploy this. Midnight Run, 100 editions, 0.001 ETH.`
2. Droppit backend ingests the cast via **Neynar webhook** (signature-verified).
3. LLM parser (**Google Gemini 2.5 Flash** alongside **CDP AgentKit** using `responseMimeType: "application/json"` for structured output) extracts and normalizes `title`, `editionSize`, and `mintPrice` and validates MVP invariants (especially edition bounds `1–10,000`).
4. Agent calls existing `POST /api/drops` to create a **Draft**, pins media to IPFS via **Pinata**, and receives `dropId`.
5. Agent replies to the cast with a **Deploy Frame** showing: drop summary, estimated deploy gas, and action controls.
6. Creator enters optional secret in Frame text input (`Enter secret unlockable message (optional)`), which is not posted publicly.
7. Creator taps **Deploy Drop** in-frame; backend finalizes deployment through the standard publish path and freezes metadata + locked content policy state.
8. If creator needs uncompressed media, they tap **Upload High-Res** in the deploy frame, which opens Droppit web upload (in-app browser) to replace source image (up to 20MB) before final deploy.

---

## 5) MVP Feature Requirements

**MVP must-have note (Base-native):** Farcaster Frame support is required to deliver true “drop-in-feed” minting on Base while keeping the universal share link as the canonical artifact.

**MVP growth note (safe):** Referral support is included as **attribution-only** in MVP (no onchain payouts). Affiliate revenue splits can be added in V1 after validation.

### 5.1 Creator-Friendly Drop Generator

**Must have**

- Two first-class creation entry points: web wizard **and** AI-agent Farcaster deploy path
- Short wizard or simple form (avoid advanced overwhelm)
- Cost transparency:
  - Estimated gas for deploy
  - Total cost estimate
- Upload + metadata creation
- Deploy contract from creator wallet (creator pays)
- Post-publish share link

**Creator Stats (MVP)**

- After publish, provide a **private (creator-only)** stats view per drop:
  - Views (unique sessions) and total views
  - Total minted / editions remaining (**onchain** via `totalMinted` and `editionSize`)
  - Conversion rate (MVP): `mints / unique visitors (sessions)`
  - Top referrers (attribution-only; exclude self-ref)
  - Revenue estimates:
    - Creator proceeds (gross): `mintPrice * totalMinted`
    - Protocol fees accrued: `protocolFeePerMint * totalMinted`

**Nice to have**

- Recommended defaults (supply presets)
- Basic preview mint page before deploy

### 5.2 Universal Share Link/Card

**Must have**

- A unique URL per drop
- Open Graph + Twitter card tags:
  - Title, description, image
  - Optional: price/supply in description
- Reliable card image generation:
  - Artwork directly (cropped) or composed OG image
  - Droppit automatically generates **optimized Open Graph preview images** using **safe-area aware composition** (e.g., padding/background treatment) to **minimize awkward cropping across major social feeds**.

**Constraint**

- Preview must not depend on platform-specific embeds (works wherever OG tags are respected).

### 5.3 Referral Attribution Links (No Payouts) (MVP)

**Must have (MVP)**

- Any drop link can optionally include a `ref` parameter (either a **wallet address** or a **platform-generated code**).
- The mint page records attribution for analytics and creator insights (e.g., “Top referrers”).
- **No onchain payments/splits in MVP** (keeps mint reliability + reduces abuse).

**Referral parameter rules (MVP)**

- Accepted forms:

  - **Address:** `ref=0x...` (EVM address). Normalize to lowercase for storage.
  - **Code:** `ref=<code>` where `<code>` is **1–64 chars**, allowed charset: `A–Z a–z 0–9 _ -`.

- Validation & sanitization:

  - If `ref` looks like an address but fails address validation → treat as **invalid**.
  - If `ref` is a code and is empty, contains disallowed characters, or exceeds length → treat as **invalid**.
    - Code must be **1–64 chars** and match charset: `A–Z a–z 0–9 _ -`.

- Redirect/link preservation:

  - Short links and referral links must \*\*preserve \*\***`ref`** through redirects to the canonical drop URL.

- Casing / normalization (MVP):

  - If `ref` is an **address**: treat as **case-insensitive** for lookup and **store normalized lowercase** (`0x...`).
  - If `ref` is a **code**: treat as **case-sensitive**. Store exactly as provided **and** store a normalized copy `ref_code_normalized = lower(ref)` for analytics grouping (optional).

- Referral code generation (MVP):

  - Platform-generated codes must be **globally unique**.
  - On create, if a generated code collides with an existing code, the system retries with a new code until unique.
  - Codes are immutable once created (no reassignment).

- Self-ref handling (analytics hygiene, MVP):

  - If `ref` resolves to the **creator address** or the **minter address**, mark as `self_ref=true` and **exclude** from “Top referrers”/leaderboards (still count the mint normally).

**V1 (optional)**

- Add affiliate payouts via withdraw accounting + guardrails (cap %, optional allowlist).

### 5.4 Farcaster Frame Support (Base-native distribution + deploy layer) (Decision baked in)

**Must have (MVP)**

- **Gas model (MVP):** Frame minting triggers a wallet signature flow; the **collector signs and pays network gas**. No relayed/sponsored transactions in MVP.
- **Non-custodial (MVP):** The server **never submits transactions** and holds **no signing keys**. Frame actions return transaction request/calldata only.
- A Farcaster Frame for each drop that renders inside Warpcast (mint frame) and a creator-facing **deploy frame** for AI-assisted launches.
- **Deploy Frame content:** parsed title/editions/price summary, estimated deploy gas, trust context, and mutable draft state indicator.
- **Deploy Frame actions:**
  - Primary: **Deploy Drop**
  - Secondary: **Upload High-Res** (opens Droppit web uploader in-app browser; supports raw file upload up to 20MB before final deploy)
  - Text Input: **`Enter secret unlockable message (optional)`**
- **Privacy guarantee for secret input:** message is submitted from frame input (not public cast body), then encrypted server-side and frozen at deployment.
- **High-res source support:** natural-language prompt parser must accept `ipfs://...` and Arweave links so creators can bypass Farcaster image compression.
- **Collector mint frame actions (minimal MVP):**
  - Primary: **Mint 1** (to self) — in-frame minting always uses `mint(1)` and never supports quantity selection in MVP.
  - Secondary: **Open mint page** (universal link fallback)
  - Optional: **Gift** → opens mint page with recipient prefill UX (handled off-frame)

**Why**

- Enables zero-UI creation and minting directly in-feed on Farcaster while preserving canonical onchain + web artifacts.
- Reduces funnel steps, aligning with “drop-in-feed” promise on Base.
- Positions Droppit as the operational "Clanker for NFTs" for Base-native creators.

### 5.5 Safety / Authenticity on Mint Page

**Must have**

- Clearly display:
  - **Creator identity (linked proof, not KYC):**
    - **Farcaster:** show `@handle` **only if** a valid wallet-signature link proof exists. Label as **“Linked via wallet signature”** / **“Wallet-linked to @handle”** (not “verified”).
    - **ENS:** label as **“ENS (reverse record): name.eth”** and treat as display-only, not identity verification.
    - **Disclosure (MVP):** Farcaster + ENS indicators are informational trust signals, not official verification and not KYC.
  - **Drop contract address** (per-drop clone)
  - **Factory contract address** (provenance / deployer)
  - **Implementation contract address** (master logic; read-only “code source”)
  - **How UI obtains it (MVP canonical):** `implementation = Factory(drop.factory()).implementation()`.
  - Network: Base
  - **Metadata: Frozen ✅** (immutable after publish)
  - “Created via [AppName]” indicator (offchain record + onchain deploy)
- Linkouts:
  - Base explorer link for drop contract
  - Creator address explorer link
  - Implementation contract explorer link
  - **Metadata link** (IPFS CID / gateway) and **image link** (IPFS CID / gateway)
- Anti-phishing UX:
  - Prominent domain styling
  - Copy buttons for addresses

---

## 6) Data Model (Offchain)

### Drop Record

- `dropId` (server-generated UUID/short id; random, stable per drop; used for short links + analytics + OG lookup; not used onchain)
- `chainId` (Base)
- `contractAddress`
- `creatorAddress`
- `creatorFarcasterFid` (optional)
- `creatorFarcasterHandle` (optional)
- `creatorEnsName` (optional)
- `creatorIdentityStatus` (optional; e.g., `unlinked` | `linked`)
- `creatorIdentityProof` (optional; server-side proof record for Farcaster linking, e.g., `signature`, `nonce`, `verifiedAt`)
- `standard` (`ERC1155` in MVP)
- `title`
- `description`
- `imageUrl` (IPFS + gateway/CDN URL)
- `tokenUri` (IPFS URI for tokenId `1` metadata JSON, e.g., `ipfs://<CID>/1.json`)
- `editionSize` (max supply)
- `mintPriceWei`
- `payoutRecipient` (optional; defaults to `creatorAddress`)
- `protocolFeePerMintWei`
- `protocolFeeRecipient`
- `createdAt`
- `txHashDeploy`
- `status` (`draft` | `deploying` | `live` | `failed`)
- `ogImageUrl` (generated)
- `creationSource` (`web` | `farcaster_agent`)
- `sourceCastHash` (optional)
- `sourceCastAuthorFid` (optional)
- `sourceAssetUri` (optional; supports `ipfs://` or Arweave source)
- `highResAssetUrl` (optional; user override uploaded via web, max 20MB)
- `agentParse` (optional; extracted `title`, `editionSize`, `mintPrice`, parser confidence)
- `lockedMessageCiphertext` (optional; envelope-encrypted secret)
- `lockedMessageFrozenAt` (optional timestamp)
- Optional (V1): `royaltyBps`, `royaltyRecipient`

### Storage (Decision baked in)

- **Primary Database:** **Supabase (PostgreSQL)** (stores the Drop Record, analytics, rate limits, and encrypted locked content).
- **Primary source of truth:** IPFS (image + metadata), **pinned via Pinata**
- **Delivery reliability:** HTTPS gateway/CDN mirror fallback (read-only mirror of the same pinned IPFS content)
- **Metadata immutability (MVP must-have):** metadata is **frozen at publish** (locked once the drop contract is deployed/initialized). No post-publish edits to image/metadata.
- Artwork: IPFS pinned + HTTPS mirror
- Metadata JSON: IPFS pinned (preferred)

---

## 7) Onchain Design (MVP)

### Architecture: One Contract Per Drop (Gas-optimized)

**Decision:** Keep “one contract per drop,” but **avoid full contract deploys** by using **EIP-1167 Minimal Proxy Clones**.

**Components**

- **Master Implementation (ERC-1155 logic):** deployed once (verified), contains mint + supply + pricing logic
- **Factory:** deploys clones and calls `initialize(...)`
- **Per-drop Clone (the drop contract):** a minimal proxy with its own **unique address**, its own storage, and creator ownership

**Metadata immutability (MVP must-have)**

- `tokenUri` (metadata URI for tokenId `1`) is set **once** during `initialize(...)`.
- **One-time initialize:** `initialize(...)` is protected by an `initialized` flag (or equivalent initializer guard) and **reverts on any subsequent call**.
- **No mutable URI setters:** the drop contract exposes **no** `setURI` / `setBaseURI` / `setTokenUri` / metadata update functions (including owner-only setters).
- Optional event: `MetadataFrozen(dropContract, tokenUri)`.

**Locked message commitment (optional, V1):**

- Store `lockedMessageCommitment: bytes32` at initialize-time (optional parameter) and emit `LockedMessageCommitted(bytes32 commitment)`.
- Commitment represents a salted hash (or ciphertext hash) of the locked message. Plaintext is never stored onchain.

**Create Drop flow (onchain)**

1. Creator calls `Factory.createDrop(params)` — note: `protocolFeePerMint` and `protocolFeeRecipient` are **not** creator params; the Factory injects its own defaults
2. Factory deploys a clone pointing to the Master Implementation
3. Factory calls `initialize(...)` **once** on the clone to set (subsequent calls revert):
   - `factory` (store the Factory address in the drop for provenance)
     - **Implementation address (canonical, MVP):** do **not** store per-clone. The Factory exposes the master implementation via `implementation()` (or `masterImplementation()`), and the UI derives it as: `drop.factory()` → `Factory(factory).implementation()`.
   - owner/creator
   - `editionSize`, `mintPrice`, `payoutRecipient`, `protocolFeePerMint`, `protocolFeeRecipient`
   - `tokenUri` (metadata URI for tokenId `1`, e.g., `ipfs://<CID>/1.json`) (**frozen**)
4. Factory emits `DropCreated(creator, dropContract, tokenId, supply, price)`
   - Optional: include `factory` and `implementation` in the event fields for easier indexing

**Upgrade posture (MVP)**

- **Non-upgradeable drops:** keep clones effectively immutable by not introducing upgrade hooks. Simpler + more trustworthy early.
- Clarification: there is **no** UUPS/proxy admin upgrade mechanism; each clone’s implementation target is **fixed by the clone’s deployed bytecode** and cannot be changed post-deploy.

### Required Capabilities (ERC-1155)

**Mint as Gift (MVP must-have)**

- Support minting to another address to enable gifting and viral sharing.

- Contract functions:

  - `mint(quantity)` mints to `msg.sender`
  - `mintTo(address to, uint256 quantity)` mints to a specified recipient

- `mint(quantity)` payable

  - `quantity > 0`
  - Mints to `msg.sender`
  - `totalMinted + quantity <= editionSize`
  - **Exact payment:** `msg.value == (mintPrice + protocolFeePerMint) * quantity` (reject anything else to avoid overpay/refund complexity)
  - `protocolFeePerMint` is a **flat per-mint fee** (wei) and does **not** scale as a percentage of `mintPrice`.
  - **Protocol fee transfer failure (MVP):** the mint **MUST revert** if forwarding `protocolFeePerMint * quantity` to `protocolFeeRecipient` fails. No fallback recipient and no accumulation/settlement later. Use a low-level `call` and require `success == true`.
  - **MVP note:** referral attribution does **not** change mint payment or add onchain splits in MVP.

- `mintTo(address to, uint256 quantity)` payable

  - `to != address(0)`
  - `quantity > 0`
  - Mints to `to`

- Metadata

  - `uri(tokenId)` returns metadata
  - **MVP:** `tokenId = 1` and `uri(1)` returns the frozen `tokenUri` set at initialize-time

- Withdraw

  - `withdraw()` callable by creator/owner (**pull-based**): creator mint proceeds remain in the drop contract balance until `withdraw()` is called (no auto-forward at mint time).
    - Transfers **creator proceeds only** (i.e., `mintPrice * quantity` net of protocol fees) to the configured payout recipient
  - **Payout recipient immutability (MVP):** `payoutRecipient` is set once during `initialize(...)` and is **immutable** afterward (no post-publish update function).

- Events

  - Standard TransferSingle / TransferBatch
  - **Factory event:** `DropCreated(creator, dropContract, tokenId, supply, price)`

### Token ID Policy (MVP)

- Always mint a single tokenId (e.g., tokenId = `1`) as editions.

### Supply policy (MVP)

- **Fixed hard cap only:** `editionSize` is set at initialize-time and represents the maximum supply. No timed/open editions in MVP.
- **V1 (optional):** open edition “until time X” can be added later.

### Supply tracking (MVP)

- The drop contract stores and exposes:
  - `editionSize` (max supply)
  - `totalMinted` (running total minted)
- UI should compute **editions remaining** as `editionSize - totalMinted` from onchain reads.

---

## 8) Backend & Frontend Requirements

### Frontend (Next.js + TypeScript + Tailwind)

**Frames (MVP must-have)**

- Drop pages must support rendering + actions for Farcaster Frames (Warpcast)

**Pages (Decision baked in: canonical ID = contract address)**

- `/create` — creator flow
- `/drop/base/[contractAddress]` — **canonical mint page (portable + verifiable)** (canonical forever; contract address is the canonical ID)
- `dropId` is an offchain identifier created at draft time (random UUID/short id) and mapped to a `contractAddress` once deployed.
- `dropId` exists to support share-friendly short links, OG image routing, and analytics continuity even before deployment.
- `/d/[dropId]` — short-link alias → 301 redirect to canonical; preserves attribution params; usable pre-deploy (draft) and post-deploy (live)
- `/api/og/drop/[dropIdOrAddress]` — dynamic OG image endpoint

**Wallet & RPC Infrastructure**

- Base support
- Wrong-network prompt to switch
- **Primary connector:** Coinbase Smart Wallet (Passkeys) — priority integration via Coinbase OnchainKit for seamless onboarding
- **Fallback connectors:** injected wallets + WalletConnect (e.g., MetaMask/Rabby)
- **RPC Provider:** **Alchemy** (Base Mainnet and Base Sepolia, configured via `.env` such as `NEXT_PUBLIC_ALCHEMY_API_KEY`) to ensure high limits for OnchainKit/viem.

**UI**

- Mobile-first
- Minimal steps, high clarity

### Backend / API

- `POST /api/drops` create draft
- `POST /api/webhooks/neynar` ingest Farcaster casts/mentions for agentic deploy flow (verify webhook signatures + idempotency)
- `POST /api/agent/parse-deploy-intent` parse cast text into `title`, `editionSize`, `mintPrice`, optional asset URI
- `POST /api/frame/deploy/[castHash]` generate/update creator deploy frame payload

- `POST /api/drops/[id]/publish` update status after tx receipt

- `GET /api/drops/[id]` drop details (offchain)

  - Include server-side **onchain reads** (or client-side reads) for `totalMinted`/remaining so the UI reflects the contract as source of truth

- `GET /api/drops/by-address/[address]` lookup

- OG image generation + caching

- **Shareable receipt image (MVP):**

  - `GET /r/receipt/[txHash]` share page with OG tags for the receipt

  - `GET /api/receipt/[txHash].png` renders the receipt image (PNG)

  - **Caching (MVP):**

    - Receipt assets are \*\*deterministic by \*\***`txHash`** and may be cached aggressively.
    - `GET /api/receipt/[txHash].png` should return `Cache-Control: public, max-age=31536000, immutable` once the tx is confirmed.
    - `GET /r/receipt/[txHash]` (HTML share page with OG tags) can be cached with a shorter TTL (e.g., `public, max-age=3600`) and should revalidate if tx status is unknown.
    - If the tx is **pending/unconfirmed**, either:
      - render a “Pending” receipt variant with short cache (`max-age=30`), or
      - return 404/202 and ask the client to retry (implementation choice, but specify one behavior).

  - **Receipt data source (MVP):**

    - Receipt rendering should use **onchain tx receipt data** + drop metadata (title/image) from the canonical drop record; never trust user-supplied query params for amounts/addresses.

- **Referral attribution (MVP):**

  - `GET /r/[code]` resolves referral code → redirects to canonical drop URL with `ref` preserved (and enforces `ref` format/length rules)
  - `POST /api/attribution/view` records drop views with optional `ref`
    - Store: `ref_raw`, `ref_normalized` (lowercased if address), `ref_type` (`address|code|invalid`), `self_ref` (boolean)
  - `POST /api/attribution/mint` records mint intent/success with optional `ref`
    - Apply the same normalization + `self_ref` rules for consistency

* **Frames (MVP must-have):**
  - **Transaction response schema (MVP):** `POST /api/frame/drop/[contractAddress]/mint` must return **transaction data** for the client to prompt the user to sign and submit.

  - **Mint quantity rule (MVP):** Frame minting is always **mint(1)** (to self). No quantity selector in-frame.

  - **Chain (MVP):** Base mainnet, **CAIP-2** chainId string: `chainId = "eip155:8453"`.

  - **Minimum response shape (MVP):**

    ```json
    {
      "chainId": "eip155:8453",
      "method": "eth_sendTransaction",
      "params": {
        "abi": [ /* ERC-1155 drop ABI incl. mint + error types */ ],
        "to": "0xDropContractAddress",
        "data": "0x...",
        "value": "1234567890"
      },
      "attribution": true
    }
    ```

    - `to`: the **per-drop contract address** (the same `[contractAddress]` in the route).
    - `data`: ABI-encoded calldata for `mint(1)` (mints to `msg.sender`).
    - `value` (string, wei): **exact** total required for quantity=1: `(mintPriceWei + protocolFeePerMintWei)`.
    - `abi`: include the target function signature and ideally relevant error types for client UX/debug.
    - `attribution` (optional): if `true` or omitted, clients may append a calldata attribution suffix; set `false` to omit.

  - **Non-custodial (MVP):** the server returns txdata only; it does not relay/broadcast transactions and holds no signing keys.

  - **Failure / fallback (MVP):** if txdata cannot be produced (drop not live, invalid contract, etc.), return a Frame response whose primary action is **Open mint page** (canonical URL).

  - `GET /api/frame/drop/[contractAddress]` returns Farcaster Frame metadata

  - `POST /api/frame/drop/[contractAddress]/mint` returns a **Frame action response** for minting:

  - **Non-custodial:** returns the **tx request / calldata** for the collector wallet to sign + submit (no server relaying)

  - **Fallback (MVP):** when minting in-frame is not possible **or fails**, return an **Open mint page** action to the canonical drop URL

---

## 9) Mint Page UX Requirements (Collector)

**Above the fold**

- Artwork
- Title
- Price per mint
- **Protocol fee per mint**
- **Total per mint**
- Editions remaining (or minted/total)
  - **Source of truth (MVP):** show supply/minted from **onchain state** (e.g., `editionSize` and `totalMinted`) queried from the drop contract on Base. Avoid offchain-only counters for user-facing numbers.
- Primary CTA: **Mint**
- Secondary: **Connect** (if needed)

**Quantity (MVP):**

- Mint page supports a quantity selector with range **1–5** (default = 1).
  - **Remaining supply clamp (MVP):** Let `remaining = editionSize - totalMinted` (onchain).
    - If `remaining == 0`: disable Mint CTA and show **“Sold out”**.
    - Else set `maxSelectable = min(5, remaining)` and **clamp** the selected quantity to `maxSelectable`.
    - Disable quantity options above `maxSelectable` (and/or auto-reduce selection if remaining drops due to another mint).

**Recipient (Mint as Gift)**

- Default: mint to connected wallet
- Optional toggle/field: **Mint to address** (recipient)
  - Validate address format
  - Clear label: “Recipient will receive the NFT”

**Cost breakdown**

- `mintPrice` × quantity
- `protocolFee` × quantity
- **Total**

**Trust section (near top)**

- **Copy rules (MVP):** avoid “verified,” “official,” “KYC,” “identity confirmed.” Use “wallet-linked,” “linked via signature,” “ENS (reverse record).”
- Creator address (shortened + copy)
- Drop contract address (shortened + copy)
- Factory contract address (shortened + copy)
- Network: Base
- Explorer links

**After mint**

- Tx status: Pending → Confirmed → Success
- Quick actions: View on explorer, Copy link

**Unlock Section (Mint-to-Unlock)**

- If wallet **owns** the drop token: show **“Reveal Secret”** button
  - On click: backend issues a **one-time nonce challenge** (short expiry) bound to `{dropContract, chainId, wallet, action}`
  - Wallet signs the nonce → backend verifies signature + verifies **onchain ownership** → returns the secret message
  - Unlock responses are served with **no-store / no-cache** headers and are never CDN-cached
  - Unlock endpoints must be served with `Cache-Control: no-store` and must **never** be CDN-cached, regardless of status code
- If not owner: show “Mint to unlock” teaser (no content revealed)
- Display as **plain text only** (no auto-linking)
- **Copy (MVP):** allow a Copy button for the revealed text (still plain text; URLs remain blocked).
- **Safety note:** For safety, never copy-paste links from secret notes.
- **Immutability (MVP):** locked message is **frozen at publish** and cannot be edited once live.
- **Immutability strength (MVP):** frozen **offchain** (server-enforced).
- **V1 option:** show **“Commitment onchain ✅”** if `lockedMessageCommitment` exists, and link to the commitment event/field for verifiability.

**Post-mint Success: Shareable Receipt Image**

- After mint success, show a generated **receipt-style image** containing:
  - Minted by: ENS if available, else shortened address
  - Item: artwork title
  - Quantity
  - Total paid (mint price + protocol fee)
  - Date/time
  - Network: Base
  - Optional: tx hash (short) and contract (short)
  - Footer: “Powered by [AppName]”
- CTAs:
  - **Share Receipt on Warpcast**
  - **Share Receipt on X**
  - Optional: download image
- Include a **View tx** link on the success state (receipt is a share asset; tx is the verification)

---

## 10) Security & Safety

**Onchain**

- Reentrancy protection for withdraw
- Supply + price enforcement
  - **Edition size bounds (MVP):** `editionSize` must be within **1–10,000**
  - **Free mints (MVP):** allow `mintPrice = 0`, but show a clear “Free mint” label/warning in UI
- Prevent accidental overpayment (exact match recommended)
- Clear ownership/permissions (creator as owner)

**Offchain**

- Validate file type/size
  - **MVP supported media:** PNG/JPG/WebP only (no GIF/video)
  - Enforce max upload size (e.g., 20MB) and sniff MIME/type server-side
- Sanitize title/description
- **Locked Message safety (Mint-to-Unlock):**
  - **Block URLs/links at input validation (MVP minimum rules):** enforce on **both client + server** using conservative detection:
  - Reject if matches any of:
    - `\b[a-z][a-z0-9+\-.]*://` (any scheme)
    - `\bwww\.`
    - `\b[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+\b` (bare domains)
    - `\b(\d{1,3}\.){3}\d{1,3}\b` (IPv4)
    - `\[[^\]]+\]\([^)]+\)` (markdown links)
  - Pre-process input for detection: NFKC normalize, remove zero-width chars, and run checks on a lowercased copy.
  - **Policy choice (MVP):** prefer **false positives over false negatives** (err on blocking) to reduce phishing risk.
  - Render unlocked content as **plain text** (no auto-linking)
  - Encrypt locked message at rest (e.g., envelope encryption; key stored in KMS/secrets manager)
  - Rate limit unlock endpoints (e.g., 10 reveal attempts per wallet per drop per hour)
  - **Challenge/response:** use one-time nonces with short expiry; bind nonce to `{dropContract, chainId, wallet, action}` and persist used nonces to prevent replay
  - Verify **onchain ownership** server-side before decrypting/returning secret
  - Serve unlock responses with **no-store / no-cache** headers (prevent accidental caching/leaks)
- Rate limit create endpoints
  - Example (MVP): max **5 drafts/day per creator wallet**; max **3 publish attempts/hour**
- Harden OG endpoints against SSRF / injection
- Verify Neynar webhook signatures and deduplicate cast processing (idempotency keys by cast hash + event type)
- Treat frame text input for unlockables as sensitive input: never log plaintext in application logs; store encrypted payload only

## 11) Analytics (MVP)

Track:

- Creator funnel: create view → upload → publish start → deploy success → share copied
- Collector funnel (link): drop view → connect → mint click → tx submitted → tx success
- **Collector funnel (Farcaster Frame):** frame view → frame button click → tx submitted → tx success
- Share performance: referrer, visit→mint conversion
- **Frame performance:** frame impressions → button CTR → mint conversion
- **Mint as Gift:** % of mints sent to non-sender recipients, gift-enabled conversion vs standard
- **Identity:** linked-identity adoption rate, conversion lift for linked vs unlinked creators
- **Referral attribution (no payouts):** referral link usage rate, top referrers per drop, referral-attributed mint conversion
- **Revenue:** protocol fees collected/accrued (per drop + total), creator withdrawals
- **Receipt image:** images generated, share clicks (Warpcast/X), receipt page views, downstream mints from receipt shares
- **Agentic creator flow:** mention detected → parse success rate → draft created → deploy frame opened → deploy completed
- **High-res override usage:** deploys with compressed cast media vs IPFS/Arweave URI vs Upload High-Res override
- **Autonomous persona impact:** milestone quote-cast impressions/clickthrough and daily curation post engagement

### 11.1 Autonomous Farcaster Persona (MVP+)

- Droppit operates as an active Farcaster account, not only a command parser.
- **Persona Vibe:** **"Hybrid: Sassy Hype-man"**. High energy, extremely supportive (LFG, 🔥), but with a witty, slightly sarcastic edge to keep Farcaster engagement fun and meme-able.
- Persona behavior is driven by modular prompt configuration (e.g., `soul.md`) with explicit brand/safety constraints.
- **Automated milestone posts:** backend event listeners trigger quote-casts when drops hit configured thresholds (e.g., 25/50/100 mints).
- **Daily curation:** scheduled cron reads `analytics_events` and publishes "Top Drops of the Day" on Base with transparent ranking criteria.
- All autonomous posts must include canonical drop links and respect trust-language policy (no fake verification claims).

---

## 12) Rollout Plan (Decisions baked in)

- **Royalties:** defer to V1 (EIP-2981) to keep MVP lean; marketplaces don’t enforce consistently anyway

### MVP (ERC-1155 + Agentic Base Launch)

- One artwork per drop, one contract per drop on Base via **EIP-1167 clones**
- Web creator flow + zero-UI Farcaster creator flow via `@droppit` deploy intent
- Deploy Frame with secret text input privacy and optional **Upload High-Res** bridge
- Share link with OG card + mint frame + mint page with trust section
- Creator pays deploy gas; collector pays mint gas

**Genesis Launch Strategy: "Bait Drop" demo**
- Launch with a viral Mint-to-Unlock demonstration drop (e.g., cover image: **"The Base Blueprint"** / **"Founder's Key"**).
- Locked secret enforces current policy (plain-text only; no URLs).
- Reveal payload: *Never Gonna Give You Up* lyrics + `... guess who've got rick rolled 🫵🏼🤣`.
- Purpose: make unlock mechanic legible, memorable, and share-native on Farcaster without changing trust/safety rules.

### V1 Roadmap

1. **Token Standard Expansion:** Adding an **ERC-721 option** (MVP is strictly ERC-1155 editions).
2. **Rich Media Support:** Allowing **GIF and Video** uploads (MVP is currently images only: PNG/JPG/WebP).
3. **Flexible Supply Mechanics:** **Open editions "until time X"** (timed mints). (MVP is fixed hard-cap supply only).
4. **Onchain Affiliate Payouts:** Real revenue splitting for referrals using withdraw accounting and guardrails. (MVP only tracks attribution).
5. **Royalties (EIP-2981):** Adding royalty settings and recipients. (Deferred from MVP).
6. **Verifiable Secret Immutability:** Adding an **onchain commitment hash (`lockedMessageCommitment`)** for the mint-to-unlock feature, so users can mathematically verify the secret wasn't changed post-publish, plus adding a **“Commitment onchain ✅”** badge on the UI.
7. **Smarter Agent:** Expanding the AI persona modules (e.g., `soul.md`) for more advanced, style-safe autonomous posting controls.
8. **Theme / Event Modes:** Give creators the option to select UI themes (e.g., Wedding, Birthday, Standard) that change the mint page copy (e.g., changing "Mint" to "Claim Digital Souvenir").
9. **Physical Redeemables (Phygitals):** Explicitly list that the Mint-to-Unlock feature can be used for IRL utilities like Shopify discount codes or event barcodes.
10. **Memory Wall / Guestbook:** Add a feature where collectors can leave a short public message (e.g., "Happy birthday bro!") on the mint page when they claim the drop.
11. **Creator-Selectable Agent Vibe:** Allow creators to override the default "Sassy Hype-man" persona by adding flags to their Farcaster cast (e.g., `@droppit --vibe=gallery` or `--vibe=roast`).

### Later (Post-grants)

- Sponsorship / gas subsidy
- More pricing models
- Creator profiles and discovery
- Deeper autonomous growth loops (milestone triggers + daily "Top Drops on Base" curation)

---

## 13) Landing Page / Homepage (MVP)

**Route:** `/` (root)

**Purpose:** First impression — convert visitors into creators. Must feel premium, modern, and trustworthy. "Built for Base" messaging is front and center.

**Design direction:** Dark theme, mobile-first, modern web aesthetics (glassmorphism, gradients, micro-animations). No generic look.

### Above the fold (Hero)

- **Headline:** Clear value proposition (e.g., "Turn Art into Drops. Share. Mint.")
- **Subheadline:** One-line explanation of what Droppit does
- **Primary CTA:** "Start a Drop" → links to `/create`
- **Secondary info:** "No code required. < $0.50 to deploy."
- **Visual:** Animated gradient background or subtle particle effect. Glowing CTA button.
- **Badge:** "Built for Base" ecosystem branding

### Feature highlights (Bento Grid)

Four feature cards in a modern bento-grid layout:

1. **3-Minute Launch** — Upload art, set price, publish. No complex dashboards.
2. **Feed-Native** — Farcaster Frames + universal OG cards. Mint in the feed.
3. **Safety First** — Metadata frozen instantly. Text-only secrets. Anti-phishing.
4. **Mint Receipt** — Auto-generated shareable receipt for collectors. Visual example of a receipt card.

### How It Works

Three-step visual flow:
1. **Upload Your Art** — PNG, JPG, WebP supported
2. **Set Price & Supply** — Fixed editions, transparent fees
3. **Share the Link** — OG card + Farcaster Frame handled automatically

### Transparent Pricing

- Creator pays gas to deploy (approx. $0.50)
- Platform fee: 0.0001 ETH per mint
- Creator keeps 100% of mint price

### Footer

- "Powered by Base" / "Built on Base" branding
- Links: Docs (if any), GitHub (if public), Warpcast, X/Twitter
- Copyright

### Non-goals (homepage)

- No public gallery / discovery feed (MVP is link-first per Section 2)
- No login/signup flow on homepage

---

## 14) Contract Deployment Infrastructure (MVP)

**Tooling:** Foundry

**Networks:**

| Network | Chain ID | Purpose |
|---|---|---|
| Base Sepolia (testnet) | `84532` | Development + testing |
| Base Mainnet | `8453` | Production |

**Deployment flow:**

1. Deploy `Drop1155` (master implementation) — deployed once per network
2. Deploy `DropFactory` — deployed once per network, references the implementation address
3. Record deployed addresses in environment configuration

**Deployment script:** `script/Deploy.s.sol`
- Deploys implementation → deploys factory (passing implementation address, protocol fee recipient, default protocol fee)
- Outputs both addresses to console for `.env` configuration

**Foundry config (`foundry.toml`):**
- Solidity `^0.8.20`
- Networks: `base_sepolia` (testnet), `base_mainnet` (production)
- Both require RPC URL + deployer private key from env

**Environment variables for deployment:**
- `BASE_SEPOLIA_RPC_URL` — testnet RPC (via Alchemy)
- `BASE_MAINNET_RPC_URL` — mainnet RPC (via Alchemy)
- `DEPLOYER_PRIVATE_KEY` — deployer wallet (dedicated, not personal)
- `NEXT_PUBLIC_IMPLEMENTATION_ADDRESS` — per-network, output of deploy
- `NEXT_PUBLIC_FACTORY_ADDRESS` — per-network, output of deploy

**Network toggle (runtime):**
- `NEXT_PUBLIC_CHAIN_ID` env var determines the **default** active chain
- UI provides a **Mainnet ↔ Testnet toggle** that:
  - Triggers wallet chain switch via viem/OnchainKit
  - Updates the active chain for all onchain reads/writes
  - Persists preference to `localStorage`
- Contract addresses (factory, implementation) must be stored **per chain** in config

**Verification:**
- Verify both contracts on Basescan/Sepolia Basescan after deploy (`forge verify-contract`)

---

## 15) OG Image Design Spec (MVP)

**Endpoint:** `GET /api/og/drop/[dropIdOrAddress]`

**Dimensions:** 1200 × 630 px (standard Open Graph)

**Content / Layout:**

- **Background:** Dark gradient (matching app theme)
- **Artwork:** Centered or left-aligned, with padding — **never** edge-to-edge (safe-area aware to avoid platform cropping)
- **Title:** Bold, large text overlaid or beside artwork
- **Price:** Displayed if > 0 (e.g., "0.01 ETH"), or "Free Mint" if 0
- **Editions:** e.g., "100 editions" or "42 / 100 remaining"
- **Branding:** Small "Droppit" or app logo in corner, "on Base" badge

**Design rules:**
- Max artwork area: ~60% of canvas
- Minimum 40px padding on all sides (safe area for Twitter/Farcaster cropping)
- Use app font (Inter) for text overlay
- No text smaller than 24px

**Caching:**
- Cache by `dropId` or `contractAddress`
- Invalidate when supply changes significantly (optional; static OG is acceptable for MVP)

**Technology:** `@vercel/og` (Satori-based) or `next/og` ImageResponse — renders as PNG server-side

---

## 16) Receipt Image Design Spec (MVP)

**Endpoint:** `GET /api/receipt/[txHash].png`

**Dimensions:** 1080 × 1080 px (square, optimized for social sharing)

**Visual style:** Minimal receipt/ticket aesthetic — light background, mono-spaced or clean serif font, dashed borders, subtle paper texture feel.

**Content:**

```
┌────────────────────────────┐
│       MINT RECEIPT         │
│                            │
│  Item:     [Drop Title]    │
│  Minted by: [ENS or 0x..] │
│  Qty:      [quantity]      │
│  Price:    [mintPrice] ETH │
│  Fee:      [protocolFee]   │
│  ─────────────────────     │
│  TOTAL:    [total] ETH     │
│                            │
│  Date:     [ISO date]      │
│  Network:  Base            │
│  Tx:       [0x1234...cdef] │
│                            │
│    Powered by Droppit      │
└────────────────────────────┘
```

**Caching:** Immutable once tx is confirmed — `Cache-Control: public, max-age=31536000, immutable` (per Section 8 spec).

**Pending tx behavior:** Return a "Pending" variant with short cache (`max-age=30`), showing "Transaction Pending…" instead of confirmed details.

---

## 17) Farcaster Frame Image Spec (MVP)

**Image dimensions:** 1200 × 630 px (same as OG, per Farcaster Frame spec `fc:frame:image` aspect ratio `1.91:1`)

**Content (same as OG with minor adjustments):**
- Artwork (safe-area padded)
- Title
- Price (or "Free")
- Editions remaining: e.g., "23 / 100 left"
- Compact trust: creator address (short) + "on Base"
- If identity linked: show `@farcasterHandle`

**Reuse:** Frame image **may** reuse the OG image endpoint if the content is identical. If Frame-specific layout is needed (e.g., larger mint CTA area), use a separate render path: `GET /api/frame/drop/[contractAddress]/image`

---

## 18) Analytics Implementation (MVP)

**Tooling:** Supabase Analytics (or alternative client tracking) + Supabase PostgreSQL (server-side event log)

**Client-side events:**

| Event | Parameters | Trigger |
|---|---|---|
| `page_view` | `page_path`, `drop_id` | Any page load |
| `create_start` | `creator_address` | Creator opens `/create` |
| `create_upload` | `creator_address`, `file_type` | Artwork uploaded |
| `create_publish_start` | `creator_address`, `drop_id` | "Create Drop" clicked |
| `create_publish_success` | `creator_address`, `drop_id`, `contract_address` | Deploy tx confirmed |
| `create_share_copied` | `drop_id` | Share link copied |
| `mint_page_view` | `drop_id`, `contract_address`, `ref` | Mint page loaded |
| `mint_connect` | `drop_id`, `collector_address` | Wallet connected on mint page |
| `mint_click` | `drop_id`, `quantity`, `is_gift` | "Mint" button clicked |
| `mint_tx_submitted` | `drop_id`, `tx_hash` | Tx sent to chain |
| `mint_success` | `drop_id`, `tx_hash`, `quantity` | Tx confirmed |
| `receipt_share_click` | `drop_id`, `platform` (`warpcast` or `x`) | Receipt share button clicked |

**Server-side event log (Supabase):**

- Table: `analytics_events`
- Used for referral attribution, funnel analysis, and creator stats
- Each row: `{ event, dropId, contractAddress, ref, refType, selfRef, wallet, timestamp, sessionId }`

**Referral attribution events** use the existing `/api/attribution/view` and `/api/attribution/mint` endpoints per Section 8.

---

## 19) Rate Limiting Strategy (MVP)

**Implementation:** Supabase-based counters (using Postgres tables/functions, no Redis needed for MVP scale)

**How it works:**
- Table: `rate_limits`
- Row identifier pattern: `{action}:{identifier}:{time_window}`
  - Example: `create_draft:0xabc123:2026-02-12` (daily)
  - Example: `publish:0xabc123:2026-02-12T01` (hourly)
- Each row stores: `{ count: number, expiresAt: Timestamp }`
- On each request: read row → if `count >= limit`, reject with 429 → else increment atomically

**Limits (MVP):**

| Action | Limit | Window | Identifier |
|---|---|---|---|
| Create draft | 5 | per day | creator wallet |
| Publish (deploy) | 3 | per hour | creator wallet |
| Unlock reveal | 10 | per hour | wallet + drop |
| OG image render | 60 | per minute | IP address |

**Cleanup:** Expired rows can be cleaned up via a pg_cron scheduled function (or left for manual cleanup in MVP — they're small).

---

## 20) Creator Stats Route (MVP)

**Route:** `/drop/base/[contractAddress]/stats`

**Access:** Private — creator-only. Requires:
1. Wallet connected
2. Connected wallet matches `creatorAddress` of the drop (verified server-side via signature challenge, same nonce pattern as unlock)

**Page content (per Section 5.1):**
- Views (unique sessions) and total views
- Total minted / editions remaining (onchain source: `totalMinted`, `editionSize`)
- Conversion rate: `mints / unique visitors`
- Top referrers (exclude self-ref)
- Revenue estimates:
  - Creator proceeds: `mintPrice × totalMinted`
  - Protocol fees accrued: `protocolFeePerMint × totalMinted`

**API:**
- `GET /api/stats/[contractAddress]` — returns stats data
- Authenticated: requires wallet signature (reuse `statsAuth.ts` pattern)

---

## 21) Identity Linking Clarification (MVP)

**MVP scope:** Manual handle entry + wallet signature only.

- Creator enters Farcaster username manually in the create flow
- App generates a link nonce (10-min expiry)
- Creator signs the structured message with their wallet
- Backend verifies signature, stores link-proof record
- **No Warpcast OAuth / Sign In With Farcaster in MVP**

**V1 (optional):** Add Warpcast authentication flow (Sign In With Farcaster / AuthKit) for streamlined linking.

**ENS:** Automatic display-only — if the connected wallet has an ENS reverse record, show it. No user action required.

---

## 22) Locked Content Encryption — Key Management (MVP)

**Tooling:** Supabase / PostgreSQL infrastructure

**Strategy:** Supabase Vault or application-level envelope encryption

**Flow:**
1. Creator submits locked content at publish time
2. Backend generates a random **Data Encryption Key (DEK)** per drop
3. Content is encrypted with the DEK (AES-256-GCM)
4. DEK is encrypted with a **Key Encryption Key (KEK)** stored in **Supabase Vault**
5. Encrypted content + encrypted DEK are stored in Supabase (drop record)
6. On unlock: verify ownership (onchain) → retrieve encrypted DEK → decrypt DEK with KEK → decrypt content → return to client

**Why this approach:**
- Supabase Vault is native to Supabase projects (no extra vendor)
- Envelope encryption means the master key never leaves the secure environment
- Per-drop DEK limits blast radius if a single record is compromised

**Supabase columns (drop record):**
- `lockedContentEncrypted`: base64-encoded ciphertext
- `lockedContentDekEncrypted`: base64-encoded encrypted DEK
- `lockedContentIv`: initialization vector for AES-GCM

**Simplified alternative (acceptable for MVP):** If Supabase Vault adds too much complexity for initial launch, use a single **server-side encryption key** stored as a backend environment variable (`LOCKED_CONTENT_ENCRYPTION_KEY`). This is less secure but acceptable for MVP if locked content is low-risk text.

