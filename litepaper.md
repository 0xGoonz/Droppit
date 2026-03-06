# Droppit Litepaper

## Abstract
Droppit is the native Drop-in-Feed infrastructure for the Base ecosystem. Positioned as the "Clanker for NFTs" on Farcaster, Droppit is an agentic platform allowing creators to launch single-artwork digital assets instantly. Offering a Web Wizard and a zero-UI AI Agent, Droppit changes the friction of launching an onchain collection from hours to seconds. It provides collectors with a trust-minimized, one-tap minting flow seamlessly embedded within their social feeds.

## The Problem
Launching digital collectibles today requires navigating heavy smart contract platforms, managing IPFS pinning, and sharing awkward links that disrupt the social feed. Meanwhile, collectors face phishing risks, unclear provenance, and complex minting interfaces. The barrier to entry remains too high for everyday creators—from prominent crypto artists to regular users seeking to immortalize an IRL event with a digital souvenir.

## The Solution
Droppit abstracts away the deployment complexity by acting as an intelligent orchestration layer. It provides two creation paths:
1. **The Web Wizard:** A guided four-step flow—Metadata, Economics, Identity, Deploy—that distills the traditional drop process into its simplest form.
2. **The Farcaster AI Agent:** A completely frictionless path. An author casts an image on Warpcast and tags `@droppit` with instructions (e.g., *"@droppit deploy this, 100 editions, 0.001 ETH"*). The AI parses the intent, pins the media, and responds with a seamless Deploy Mini App.

Every drop generates a canonical mint page, robust Open Graph cards, and a fully interactive Farcaster Mini App, ensuring discovery and minting happen natively.

## Core Mechanics

### Sovereign Contracts
Unlike platforms that pool assets into a shared contract, every Droppit launch is sovereign. Each drop receives an exclusive ERC-1155 contract address on Base, ensuring clear provenance and unbroken creator ownership.

### Encrypted Mint-to-Unlock
Droppit pioneers secure, onchain-verified token-gated text. Drop creators can attach secret messages (like event codes or private links). These secrets are envelope-encrypted (AES-256) offchain and exclusively decrypted when the platform verifies an active onchain ownership proof from a collector’s wallet. The message policy is permanently frozen upon contract deployment.

### Trust-First UX
The platform prioritizes authenticity. Mint pages clearly display the creator’s wallet-linked identity (Farcaster handles or ENS), the specific per-drop contract address, Factory provenance, and the immutable status of the verified metadata.

## Onchain Architecture & Economics
Droppit leverages extreme gas efficiency:
- **Minimal Proxy Clones:** Utilizing EIP-1167, the platform deploys lightweight ERC-1155 clones from a single master implementation, cutting creator setup fees to the absolute minimum.
- **Gas Dynamics:** Creators pay the network gas to deploy, while collectors pay the gas to mint.
- **Protocol Fee:** A flat fee per mint (e.g., 0.0001 ETH) funds the agentic infrastructure (AI overhead, IPFS pinning). This fee is trustlessly routed onchain during the mint execution, avoiding offchain settlement delays.

## The Agentic Future
Droppit utilizes CDP AgentKit and Google Gemini to power an autonomous persona. The `@droppit` agent actively listens for deployments and automatically publishes milestone celebrations to drive organic discovery. Ultimately, Droppit builds the frictionless layer for value transfer, making drops as easy as a tweet.
