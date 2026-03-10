type NonceBurnResult = {
    data: { id: string } | null;
    error: unknown;
};

type NonceBurnQuery = {
    eq: (column: string, value: string | boolean) => NonceBurnQuery;
    gt: (column: string, value: string) => NonceBurnQuery;
    select: (columns: string) => {
        maybeSingle: () => PromiseLike<NonceBurnResult>;
    };
};

type NonceConsumeClient = {
    from: (table: "nonces") => {
        update: (values: { used: boolean }) => NonceBurnQuery;
    };
};

export type ConsumeNonceInput = {
    id: string;
    nonce: string;
    wallet: string;
    action: string;
    chainId: string;
    dropId?: string | null;
    dropContract?: string | null;
    nowIso?: string;
};

export async function consumeNonceOnce(
    supabaseAdmin: NonceConsumeClient,
    input: ConsumeNonceInput
): Promise<{ id: string } | null> {
    let burnQuery = supabaseAdmin
        .from("nonces")
        .update({ used: true })
        .eq("id", input.id)
        .eq("nonce", input.nonce)
        .eq("wallet", input.wallet)
        .eq("action", input.action)
        .eq("chain_id", input.chainId)
        .eq("used", false)
        .gt("expires_at", input.nowIso || new Date().toISOString());

    if (typeof input.dropId === "string" && input.dropId.length > 0) {
        burnQuery = burnQuery.eq("drop_id", input.dropId);
    }

    if (typeof input.dropContract === "string" && input.dropContract.length > 0) {
        burnQuery = burnQuery.eq("drop_contract", input.dropContract);
    }

    const { data: burnedNonce, error: burnError } = await burnQuery.select("id").maybeSingle();
    if (burnError || !burnedNonce) {
        return null;
    }

    return burnedNonce;
}
