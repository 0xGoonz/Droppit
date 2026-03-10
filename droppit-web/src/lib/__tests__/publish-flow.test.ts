import { describe, expect, it, vi } from "vitest";
import { publishDropDraft } from "@/lib/publish-drop";

const payload = {
    draftId: "draft-123",
    txHash: `0x${"a".repeat(64)}`,
    contractAddress: "0x1111111111111111111111111111111111111111",
    tokenUri: "ipfs://QmToken",
    imageUrl: "ipfs://QmImage",
    lockedContent: "secret unlockable",
    salt: `0x${"1".repeat(64)}`,
    commitment: `0x${"2".repeat(64)}`,
};

describe("Publish Flow Helper", () => {
    it("waits for a successful publish response before resolving", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, drop: { id: payload.draftId } }),
        });

        const result = await publishDropDraft(payload, fetchMock as typeof fetch);

        expect(fetchMock).toHaveBeenCalledWith(
            `/api/drops/${payload.draftId}/publish`,
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
            })
        );
        const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
        expect(JSON.parse(String(requestInit.body))).not.toHaveProperty("creatorWallet");
        expect(result).toEqual({ success: true, drop: { id: payload.draftId } });
    });

    it("includes creatorWallet when provided", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });

        const creatorWallet = "0x2222222222222222222222222222222222222222";
        await publishDropDraft({ ...payload, creatorWallet }, fetchMock as typeof fetch);

        const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
        expect(JSON.parse(String(requestInit.body))).toMatchObject({
            txHash: payload.txHash,
            contractAddress: payload.contractAddress,
            creatorWallet,
        });
    });

    it("surfaces publish route errors instead of silently redirecting", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 409,
            json: async () => ({ error: "Deployment transaction is pending or unavailable on the configured network. Wait for confirmation before publishing." }),
        });

        await expect(publishDropDraft(payload, fetchMock as typeof fetch)).rejects.toThrow(
            "Deployment transaction is pending or unavailable on the configured network. Wait for confirmation before publishing."
        );
    });
});