import { describe, expect, it } from "vitest";
import { extractTxHashFromPayload, resolveFinalizeTxHash } from "@/lib/frame-deploy";

const TX_HASH_A = `0x${"a".repeat(64)}`;
const TX_HASH_B = `0x${"b".repeat(64)}`;

describe("extractTxHashFromPayload", () => {
    it("prefers the earliest valid tx hash candidate in payload order", () => {
        const result = extractTxHashFromPayload({
            untrustedData: {
                transactionId: TX_HASH_A,
                transactionHash: TX_HASH_B,
            },
        });

        expect(result).toBe(TX_HASH_A);
    });

    it("extracts a tx hash embedded inside a larger string", () => {
        const result = extractTxHashFromPayload({
            transactionHash: `confirmed tx: ${TX_HASH_B}`,
        });

        expect(result).toBe(TX_HASH_B);
    });

    it("returns null when no valid transaction hash is present", () => {
        const result = extractTxHashFromPayload({
            untrustedData: { transactionHash: "not-a-hash" },
        });

        expect(result).toBeNull();
    });
});

describe("resolveFinalizeTxHash", () => {
    it("uses Neynar-validated tx hash first when both are present and match", () => {
        const result = resolveFinalizeTxHash(TX_HASH_A.toUpperCase(), TX_HASH_A);

        expect(result.kind).toBe("selected");
        if (result.kind === "selected") {
            expect(result.txHash).toBe(TX_HASH_A.toUpperCase());
        }
    });

    it("falls back to callback tx hash only when validated hash is missing", () => {
        const result = resolveFinalizeTxHash(null, TX_HASH_B);

        expect(result).toEqual({ kind: "selected", txHash: TX_HASH_B });
    });

    it("rejects finalize when validated and callback hashes differ", () => {
        const result = resolveFinalizeTxHash(TX_HASH_A, TX_HASH_B);

        expect(result.kind).toBe("mismatch");
        if (result.kind === "mismatch") {
            expect(result.error).toContain("Possible tampering");
        }
    });
});
