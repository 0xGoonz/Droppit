## Repo-vs-Spec Evaluation Backlog (MVP Focus)

### Summary
- Core MVP foundations are in place: clone-based contracts, protocol fee forwarding, create flow, mint page, frame endpoints, identity link, locked-content unlock, OG/receipt generation, attribution, and creator stats.
- Validation signals:
1. `droppit-web` tests: `55/55` passing.
2. `droppit-contracts` tests: `12/12` passing.
3. Schema conformance check: passing.
- Biggest gaps are around draft/auth security, spec completeness for post-mint/analytics/receipt UX, and environment/network consistency.

### Suggested Tasks (Prioritized, as many as possible)

1. Protect draft read API with creator auth and signature challenge (`/api/drops/[id]`) to stop secret leakage from public draft IDs.
2. Never return `locked_content_draft` from public API responses.
3. Require Neynar-validated frame payload before accepting/staging `inputText` secret in frame deploy endpoints.
4. Block unauthenticated writes to draft state from frame routes.
5. In publish finalize, verify `DropCreated` event fields against draft (`creator`, `editionSize`, `mintPrice`, `payoutRecipient`, `tokenUri`) instead of only matching contract address.
6. Bind Farcaster-created drops to creator wallet at finalize (persist `creator_address`) so creator-only stats and ownership checks work.
7. Add immutable mapping from draft -> deploy tx hash to prevent draft hijacking via arbitrary tx hash submission.
8. Add DB-level unique guard for deploy tx hash (`tx_hash_deploy`) where appropriate.
9. Encrypt staged frame secret at rest (or avoid plaintext staging entirely).
10. Add explicit scrub/no-log policy for all secret-bearing request fields across deploy routes.
11. Add `<http...>`/HTML-link pattern blocking in locked-content validator to match spec.
12. Add explicit plain-text rendering guard for unlocked content (no auto-link, no markdown render) at component level tests.
13. Implement post-mint action panel on mint page: share receipt, share to Warpcast/X, view tx.
14. Use `receiptHref` in mint UI (currently computed but unused).
15. Make receipt image endpoint default to 1080x1080 (spec default), keep card variant as optional.
16. Expand receipt image content to include qty, fee, total, minter, date, tx, network.
17. Add “pending” receipt copy and variant aligned to spec wording.
18. Add OG/frame image fields for editions remaining/supply.
19. Add deploy gas estimate + total cost estimate in create flow step 4.
20. Add deploy-frame gas estimate and draft-state summary fields in rendered frame image/content.
21. Add share-card preview step in create flow before deploy confirmation.
22. Implement full analytics funnel events from spec (creator, collector link, collector frame, receipts, identity adoption, referral usage, high-res usage).
23. Add frame performance analytics events (impression/CTR/mint conversion).
24. Add “mint as gift” analytics dimensions in both web and frame fallback flows.
25. Implement referral code generation API with collision retry and immutability rules.
26. Add creator UX for generating referral links/codes per drop.
27. Preserve `ref` + UTM consistently across all redirect routes and receipt/share paths.
28. Add optional frame “Gift” button to open mint page with recipient prefill.
29. Align stats API contract with spec (`GET /api/stats/[contractAddress]`) or update spec to `POST` signed challenge flow.
30. Add global chain toggle UX on mint/stats pages (not only create flow).
31. Support `NEXT_PUBLIC_CHAIN_ID` defaulting behavior from spec (currently environment-based default only).
32. Make frame read/mint/deploy chain handling environment-aware for testnet workflows (or document strict mainnet-only frame policy clearly).
33. Ensure webhook path uses shared draft-creation API contract (or centralize shared validation logic to remove divergence).
34. Extend webhook idempotency key to include cast hash + event type.
35. Add webhook event-type filtering and explicit unsupported-event handling.
36. Harden OG media URL handling against SSRF (allowlist gateway/schemes, reject private/internal targets).
37. Tighten CSP and `connect-src`/`img-src` policy (currently very permissive).
38. Remove `ignoreBuildErrors` and `ignoreDuringBuilds` in Next config for production safety.
39. Add explicit `Content-Type: text/html` headers for frame HTML responses.
40. Add robust invalid-contract handling on mint page route (graceful not-found state).
41. Add commitment verification badge in mint UI (“Commitment onchain ✅”) when non-zero commitment exists.
42. Show explicit “Created via Droppit” trust indicator in first trust block viewport.
43. Add integration tests for webhook -> frame deploy tx -> publish finalize path.
44. Add security tests for unauthorized draft read/write and staged secret tampering.
45. Add publish-route tests for event mismatch (creator/price/supply/tokenUri/payout mismatch).
46. Add receipt endpoint tests for cache semantics (`immutable` confirmed, short-cache pending).
47. Add end-to-end tests for create -> deploy -> mint -> unlock -> stats -> receipt share flow.
48. Add migration checks/constraints for normalized lowercased addresses across all tables.
49. Add periodic cleanup policy for nonces/rate_limit rows and stale webhook idempotency records.
50. Resolve spec/doc mismatch on homepage protocol fee text (`0.00005` vs `0.0001`) and make docs single-source-of-truth.
51. Align env example with chain-specific factory/implementation variables used by runtime.
52. Add operational monitoring: frame validation failures, publish conflicts, unlock failure rates, OG error rates.
53. Add abuse detection metrics for rate-limit bypass patterns on unlock and webhook endpoints.
54. Add creator-only route hardening for `/api/creator/drops` if privacy is intended.
55. Add health check/boot-time validation for required secrets (Pinata, Supabase service role, Neynar, encryption key).

### High-Impact File Areas
- Web API/security: `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-web/src/app/api`
- Mint/create UX: `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-web/src/app/create/page.tsx`, `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-web/src/app/drop/base/[contractAddress]/page.tsx`
- Frame deploy/mint internals: `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-web/src/lib/frame-deploy.ts`, `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-web/src/lib/frame-deploy-frame.ts`
- Contracts: `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-contracts/src/Drop1155.sol`, `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-contracts/src/DropFactory.sol`
- Schema: `/C:/Users/Admin/Downloads/AG-Droppitv2/droppit-web/supabase/schema.sql`

