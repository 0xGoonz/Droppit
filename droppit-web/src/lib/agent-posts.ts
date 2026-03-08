import NeynarClient from "neynar-next/server";
import { formatEther } from "viem";
import { ipfsToGateway } from "@/lib/pinata";

export type AgentPostType = "deploy_reply" | "remediation_reply";

export type AgentPostRequestPayload = {
    text: string;
    parent: string;
    embeds?: { url: string }[];
};

export type AgentPostOutboxRow = {
    id: string;
    post_type: AgentPostType;
    source_cast_hash: string;
    drop_id: string | null;
    status: string;
    published_cast_hash: string | null;
    error: string | null;
    request_payload: AgentPostRequestPayload | null;
    response_payload: Record<string, unknown> | null;
};

type SupabaseAdminClient = { from: (table: string) => any };

const NEYNAR_PLACEHOLDER_APP_FID = BigInt(0);
const NEYNAR_PLACEHOLDER_MNEMONIC = "";
const DEPLOY_REPLY_TEXT_LIMIT = 280;
const REMEDIATION_REPLY_TEXT_LIMIT = 280;

function clampText(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function normalizeReplyText(text: string, limit: number): string {
    return clampText(text.replace(/\s+/g, " ").trim(), limit);
}

function parseRequestPayload(raw: unknown): AgentPostRequestPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.text !== "string" || typeof value.parent !== "string") return null;

    const embeds = Array.isArray(value.embeds)
        ? value.embeds
            .filter((embed): embed is { url: string } => {
                return !!embed && typeof embed === "object" && typeof (embed as { url?: unknown }).url === "string";
            })
            .map((embed) => ({ url: embed.url }))
        : undefined;

    return {
        text: value.text,
        parent: value.parent,
        embeds: embeds && embeds.length > 0 ? embeds : undefined,
    };
}

export function isAgentAutoReplyEnabled(): boolean {
    const raw = (process.env.AGENT_AUTO_REPLY_ENABLED || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function normalizeAgentSourceAssetUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("ipfs://")) {
        return ipfsToGateway(trimmed);
    }

    try {
        const url = new URL(trimmed);
        if (url.protocol === "http:" || url.protocol === "https:") {
            return url.toString();
        }
    } catch {
        return null;
    }

    return null;
}

export function buildDeployReplyText(params: {
    title: string;
    editionSize: number;
    mintPriceWei: string;
}): string {
    const title = params.title.trim() || "Untitled Drop";
    const priceLabel = params.mintPriceWei === "0"
        ? "Free mint"
        : `${formatEther(BigInt(params.mintPriceWei))} ETH`;

    return normalizeReplyText(
        `Draft ready: ${title} | ${params.editionSize} editions | ${priceLabel}. Open the deploy frame below.`,
        DEPLOY_REPLY_TEXT_LIMIT
    );
}

export function buildRemediationReplyText(params: {
    remediation: string;
    createUrl: string;
}): string {
    return normalizeReplyText(
        `Need a title, edition size, and price before I can draft the drop. ${params.remediation} Fix it here: ${params.createUrl}`,
        REMEDIATION_REPLY_TEXT_LIMIT
    );
}

export async function ensureAgentPostOutboxRecord(
    supabaseAdmin: SupabaseAdminClient,
    params: {
        postType: AgentPostType;
        sourceCastHash: string;
        dropId?: string | null;
        requestPayload: AgentPostRequestPayload;
    }
): Promise<AgentPostOutboxRow> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("agent_post_outbox")
        .select("id, post_type, source_cast_hash, drop_id, status, published_cast_hash, error, request_payload, response_payload")
        .eq("source_cast_hash", params.sourceCastHash)
        .eq("post_type", params.postType)
        .maybeSingle();

    if (existingError) {
        throw existingError;
    }

    if (existing) {
        return existing as AgentPostOutboxRow;
    }

    const insertPayload = {
        post_type: params.postType,
        source_cast_hash: params.sourceCastHash,
        drop_id: params.dropId || null,
        status: "pending",
        request_payload: params.requestPayload,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
        .from("agent_post_outbox")
        .insert(insertPayload)
        .select("id, post_type, source_cast_hash, drop_id, status, published_cast_hash, error, request_payload, response_payload")
        .single();

    if (!insertError && inserted) {
        return inserted as AgentPostOutboxRow;
    }

    if (insertError && insertError.code === "23505") {
        const { data: retryExisting, error: retryError } = await supabaseAdmin
            .from("agent_post_outbox")
            .select("id, post_type, source_cast_hash, drop_id, status, published_cast_hash, error, request_payload, response_payload")
            .eq("source_cast_hash", params.sourceCastHash)
            .eq("post_type", params.postType)
            .single();

        if (retryError) throw retryError;
        return retryExisting as AgentPostOutboxRow;
    }

    throw insertError;
}

export async function attemptAgentPostPublish(
    supabaseAdmin: SupabaseAdminClient,
    row: AgentPostOutboxRow
): Promise<{ status: "published" | "failed" | "skipped"; castHash?: string; error?: string }> {
    if (row.published_cast_hash) {
        return { status: "published", castHash: row.published_cast_hash };
    }

    const requestPayload = parseRequestPayload(row.request_payload);
    if (!requestPayload) {
        const error = "Outbox request payload is missing required text or parent fields.";
        await markAgentPostStatus(supabaseAdmin, row.id, "failed", { error });
        return { status: "failed", error };
    }

    if (!isAgentAutoReplyEnabled()) {
        const error = "Agent auto reply disabled by AGENT_AUTO_REPLY_ENABLED.";
        await markAgentPostStatus(supabaseAdmin, row.id, "skipped", { error });
        return { status: "skipped", error };
    }

    const apiKey = process.env.NEYNAR_API_KEY;
    const signerUuid = process.env.NEYNAR_BOT_SIGNER_UUID;
    if (!apiKey || !signerUuid) {
        const error = "Missing Neynar API key or bot signer UUID for auto reply publishing.";
        await markAgentPostStatus(supabaseAdmin, row.id, "failed", { error });
        return { status: "failed", error };
    }

    try {
        const client = new NeynarClient(apiKey, NEYNAR_PLACEHOLDER_APP_FID, NEYNAR_PLACEHOLDER_MNEMONIC);
        const response = await client.postCast(signerUuid, requestPayload.text, {
            embeds: requestPayload.embeds,
            parent: requestPayload.parent,
        });

        await markAgentPostStatus(supabaseAdmin, row.id, "published", {
            publishedCastHash: response.cast.hash,
            responsePayload: response as unknown as Record<string, unknown>,
        });

        if (row.drop_id) {
            await supabaseAdmin
                .from("drops")
                .update({ agent_reply_cast_hash: response.cast.hash })
                .eq("id", row.drop_id)
                .eq("agent_reply_cast_hash", null);
        }

        return { status: "published", castHash: response.cast.hash };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Neynar publish error";
        await markAgentPostStatus(supabaseAdmin, row.id, "failed", { error: message });
        return { status: "failed", error: message };
    }
}

async function markAgentPostStatus(
    supabaseAdmin: SupabaseAdminClient,
    outboxId: string,
    status: string,
    params: {
        publishedCastHash?: string;
        error?: string;
        responsePayload?: Record<string, unknown> | null;
    }
) {
    const updatePayload: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
    };

    if (params.publishedCastHash) {
        updatePayload.published_cast_hash = params.publishedCastHash;
        updatePayload.error = null;
    } else if (params.error) {
        updatePayload.error = params.error;
    }

    if (params.responsePayload !== undefined) {
        updatePayload.response_payload = params.responsePayload;
    }

    await supabaseAdmin
        .from("agent_post_outbox")
        .update(updatePayload)
        .eq("id", outboxId);
}



