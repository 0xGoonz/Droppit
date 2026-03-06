export interface PublishDropDraftInput {
    draftId: string;
    txHash: string;
    contractAddress: string;
    tokenUri: string;
    imageUrl: string;
    lockedContent: string;
    salt: string;
    commitment: string;
}

type FetchLike = typeof fetch;

export async function publishDropDraft(
    input: PublishDropDraftInput,
    fetchImpl: FetchLike = fetch
) {
    const response = await fetchImpl(`/api/drops/${input.draftId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            txHash: input.txHash,
            contractAddress: input.contractAddress,
            tokenUri: input.tokenUri,
            imageUrl: input.imageUrl,
            lockedContent: input.lockedContent,
            salt: input.salt,
            commitment: input.commitment,
        }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = payload && typeof payload.error === "string"
            ? payload.error
            : `Publish failed (${response.status})`;
        throw new Error(message);
    }

    return payload;
}
