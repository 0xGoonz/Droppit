# Roadmap

## Summary
This document is the official execution roadmap for Droppit. It tracks current priorities based on the shipped state of the app and near-term launch needs. [product-spec.md](product-spec.md) remains the source of truth for product scope, MVP and V1 requirements, and long-term product decisions.

## Current shipped / working
- Canonical minting flow exists at `/drop/base/[contractAddress]`.
- Farcaster mint frames exist at `/api/frame/drop/[contractAddress]` and `/api/frame/drop/[contractAddress]/mint`.
- `@droppit` agentic creation is wired through Neynar webhook ingestion, Gemini-based deploy-intent parsing, draft creation, and deploy-assist replies.
- Locked content flow exists for mint-to-unlock secrets.
- Creator stats exist behind a signature-gated route.
- Current AI baseline is assistive, not autonomous: failed parses get remediation replies, and successful parses get deploy-assist replies with canonical Droppit links and embeds.

## Now
- Improve parser reliability and draft quality for mention-driven deploy requests.
- Harden the draft-to-deploy path across webhook ingestion, draft creation, publish, and deploy frame flows.
- Polish the high-res media override path before final deploy.
- Tighten share and receipt quality across OG cards, receipt images, and post-publish sharing.
- Complete analytics coverage for the main creator and collector funnels.
- Harden abuse controls and rate limits around draft creation, publish attempts, and public render endpoints.
- Prepare the genesis launch flow and supporting assets for the mint-to-unlock demo drop.

## Next
- Add rich media support beyond static images.
- Add an ERC-721 path alongside the current ERC-1155 edition flow.
- Add timed or open-edition supply mechanics.
- Improve creator UX and conversion, especially around setup defaults, preview quality, and draft-to-publish clarity.

## Later
- Add onchain affiliate payouts beyond attribution-only tracking.
- Add royalty support.
- Expand verifiable secret immutability UX around the onchain commitment model.
- Add smarter agent behavior and richer persona controls, including a possible `soul.md` layer.
- Add theme or event modes for creator-facing drop presentation.

## Risks / dependencies
- Farcaster and Neynar delivery quality directly affect mention-driven creation reliability.
- Gemini parse quality affects draft accuracy, fallback behavior, and remediation volume.
- IPFS and Pinata handling affect media durability, preview quality, and deploy readiness.
- Base wallet and transaction UX affect deploy completion and mint conversion.
- The roadmap must stay aligned with shipped behavior; this file should be updated when implementation meaningfully changes.