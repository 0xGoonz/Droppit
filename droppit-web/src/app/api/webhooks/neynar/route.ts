import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { parseDeployIntent } from "@/lib/intent-parser";
import { pinata } from "@/lib/pinata";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateImageMedia } from "@/lib/media-validation";
import { createDraftRecord } from "@/lib/draft";
import { getDraftShareSpec } from "@/lib/draft-share";
import { hasReusableDraftMedia } from "@/lib/draft-load";
import {
    attemptAgentPostPublish,
    buildDeployReplyText,
    buildRemediationReplyText,
    ensureAgentPostOutboxRecord,
    normalizeAgentSourceAssetUrl,
    type AgentPostRequestPayload,
    type AgentPostType,
} from "@/lib/agent-posts";

/** Only process these Neynar webhook event types. */
const SUPPORTED_EVENT_TYPES = new Set(["cast.created"]);

type PublishAgentReplyResult = {
    status: "published" | "failed" | "skipped";
    castHash?: string;
    error?: string;
};

export async function POST(req: NextRequest) {
    try {
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz").replace(/\/+$/, "");

        // 0. Rate limit: webhook preset (60 reqs / 5 min per IP)
        const limited = await checkRateLimit(req, "webhook", "[Webhook]");
        if (limited) return limited;

        // 1. Read Raw Body for Signature Verification
        const rawBody = await req.text();
        const signature = req.headers.get("x-neynar-signature");

        if (!signature || !process.env.NEYNAR_WEBHOOK_SECRET) {
            console.warn("[Webhook] Rejected: Missing signature or webhook secret env var.");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Validate signature format before any crypto operations.
        if (!/^[a-f0-9]{128}$/.test(signature)) {
            console.warn(`[Webhook] Rejected: Signature is not valid 128-char hex (got ${signature.length} chars).`);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 3. Compute HMAC SHA-512
        const hmac = crypto.createHmac("sha512", process.env.NEYNAR_WEBHOOK_SECRET);
        const computedSignature = hmac.update(rawBody).digest("hex");

        // 4. Timing-Safe Comparison
        const computedBuf = Buffer.from(computedSignature, "hex");
        const receivedBuf = Buffer.from(signature, "hex");

        if (computedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(computedBuf, receivedBuf)) {
            console.warn("[Webhook] Rejected: Invalid cryptographic signature.");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 5. Parse Body safely now that it is authenticated
        let body: Record<string, any>;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const eventType: string | undefined = body?.type;
        if (!eventType || !SUPPORTED_EVENT_TYPES.has(eventType)) {
            return NextResponse.json(
                { message: `Event type '${eventType || "unknown"}' not supported` },
                { status: 200 }
            );
        }

        const castText = body?.data?.text;
        const authorFid = body?.data?.author?.fid;
        const authorUsername = typeof body?.data?.author?.username === "string"
            ? body.data.author.username.trim().replace(/^@+/, "").toLowerCase()
            : null;
        const castHash = body?.data?.hash;

        if (!castText || !authorFid || !castHash) {
            return NextResponse.json({ error: "Invalid cast payload" }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();
        const idempotencyKey = `${castHash}:${eventType}`;
        const { error: idempotencyError } = await supabaseAdmin
            .from("webhook_events")
            .insert({ event_id: idempotencyKey, event_type: eventType });

        if (idempotencyError) {
            if (idempotencyError.code === "23505") {
                console.log(`[Webhook] Duplicate event ${idempotencyKey} safely ignored.`);
                return NextResponse.json({ message: "Duplicate" }, { status: 200 });
            }
            console.error("[Webhook] DB Warning, proceeding but tracking failed:", idempotencyError);
        }

        console.log(`[Webhook] Accepted new cast ${castHash} from FID ${authorFid}.`);
        console.log(`Received trigger from FID ${authorFid}: "${castText}"`);

        if (!castText.toLowerCase().includes("@droppit")) {
            return NextResponse.json({ message: "Ignored, not mentioned" });
        }

        console.log("[Webhook] Processing Farcaster mention. Extracting drop intents...");

        const parsed = await parseDeployIntent(castText);
        const imageUrlFromEmbed = extractImageUrlFromEmbeds(body?.data?.embeds || []);
        const sourceAssetUri = parsed.success ? (parsed.assetUri || imageUrlFromEmbed || null) : null;

        if (!parsed.success) {
            console.log(`[Webhook] Invalid intent: ${parsed.error}`);

            const remediation = getRemediationText(parsed.error);
            const errorMessage = encodeURIComponent(parsed.error || "Could not parse drop details");
            const reply = await publishAgentReplySafely(supabaseAdmin, {
                postType: "remediation_reply",
                sourceCastHash: castHash,
                requestPayload: {
                    text: buildRemediationReplyText({ remediation, createUrl: `${baseUrl}/create` }),
                    parent: castHash,
                },
            });

            return NextResponse.json({
                success: false,
                message: parsed.error,
                remediation,
                reply,
                frame: {
                    version: "vNext",
                    image: `${baseUrl}/api/og/drop/fallback?error=${errorMessage}`,
                    buttons: [
                        {
                            label: "Fix & Retry on Droppit",
                            action: "link",
                            target: `${baseUrl}/create`,
                        },
                    ],
                },
            });
        }

        let imageUrl: string | null = null;
        let tokenUri: string | null = null;
        const normalizedSourceAssetUrl = normalizeAgentSourceAssetUrl(sourceAssetUri);

        if (normalizedSourceAssetUrl) {
            console.log(`[Webhook] Found media URL: ${normalizedSourceAssetUrl}, downloading...`);
            try {
                const mediaResponse = await fetch(normalizedSourceAssetUrl);
                if (!mediaResponse.ok) throw new Error(`HTTP Error: ${mediaResponse.status}`);

                const arrayBuffer = await mediaResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const bytes = new Uint8Array(arrayBuffer);
                const mediaValidation = validateImageMedia(bytes, mediaResponse.headers.get("content-type"));

                if (!mediaValidation.ok) {
                    console.warn(`[Webhook] Rejected media payload: ${mediaValidation.error}`);
                } else {
                    const mimeType = mediaValidation.normalizedMime;
                    const extension = mimeType.split("/")[1] || "png";
                    const file = new File([buffer], `cast-media.${extension}`, { type: mimeType });

                    console.log("[Webhook] Uploading media to Pinata...");
                    const uploadImage = await pinata.upload.public.file(file);
                    imageUrl = `ipfs://${uploadImage.cid}`;

                    const metadata = {
                        name: parsed.title || "Untitled Drop",
                        description: "Created via Droppit on Farcaster",
                        image: imageUrl,
                        properties: {
                            generator: "Droppit AgentKit (Farcaster Webhook)",
                            castHash,
                        },
                    };

                    const uploadJson = await pinata.upload.public.json(metadata);
                    tokenUri = `ipfs://${uploadJson.cid}`;
                    console.log(`[Webhook] Successfully pinned media to IPFS: ${imageUrl}`);
                }
            } catch (mediaError) {
                console.error("[Webhook] Media extraction & pinning failed. Proceeding with text draft.", mediaError);
            }
        } else if (sourceAssetUri) {
            console.warn(`[Webhook] Unsupported source asset URI: ${sourceAssetUri}`);
        } else {
            console.log("[Webhook] No media found in cast or parsed intents.");
        }

        const draftResult = await createDraftRecord({
            creatorFid: authorFid,
            title: parsed.title || "Untitled Drop",
            editionSize: parsed.editionSize ?? 100,
            mintPrice: parsed.mintPrice ?? "0",
            castHash,
            imageUrl,
            tokenUri,
            creationSource: "farcaster_agent",
            agentParse: {
                success: true,
                title: parsed.title || null,
                editionSize: parsed.editionSize ?? null,
                mintPrice: parsed.mintPrice ?? null,
                assetUri: parsed.assetUri || null,
                authorHandle: authorUsername,
            },
            sourceAssetUri,
        });

        if (!draftResult.success) {
            console.error("[Webhook] Draft creation failed:", draftResult.error);
            return NextResponse.json({ error: "Failed to allocate drop" }, { status: 500 });
        }

        const draftId = draftResult.id;
        const hasReusableMedia = hasReusableDraftMedia(tokenUri, imageUrl);
        console.log(`[Webhook] Successfully drafted Drop ID: ${draftId}`);

        const draftShare = getDraftShareSpec(baseUrl, draftId, { hasReusableMedia });
        const reply = await publishAgentReplySafely(supabaseAdmin, {
            postType: "deploy_reply",
            sourceCastHash: castHash,
            dropId: draftId,
            requestPayload: {
                text: buildDeployReplyText({
                    title: parsed.title || "Untitled Drop",
                    editionSize: parsed.editionSize ?? 100,
                    mintPriceWei: parsed.mintPrice ?? "0",
                    hasReusableMedia,
                    authorUsername,
                }),
                parent: castHash,
                embeds: [{ url: draftShare.shareUrl }],
            },
        });

        const primaryLabel = draftShare.buttonTitle;
        const frameResponse = {
            version: "vNext",
            image: draftShare.shareImageUrl,
            buttons: [
                {
                    label: primaryLabel,
                    action: "post",
                    target: draftShare.shareUrl,
                },
            ],
        };

        console.log("[Webhook] Lifecycle complete. Deploy Frame payload constructed.");

        return NextResponse.json({
            success: true,
            reply,
            frame: frameResponse,
        });
    } catch (error: unknown) {
        console.error("Neynar Webhook Error:", error);
        const message = error instanceof Error ? error.message : "Unexpected webhook error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function publishAgentReplySafely(
    supabaseAdmin: ReturnType<typeof getServiceRoleClient>,
    params: {
        postType: AgentPostType;
        sourceCastHash: string;
        dropId?: string | null;
        requestPayload: AgentPostRequestPayload;
    }
): Promise<PublishAgentReplyResult> {
    try {
        const outbox = await ensureAgentPostOutboxRecord(supabaseAdmin, params);
        return await attemptAgentPostPublish(supabaseAdmin, outbox);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to enqueue agent reply";
        console.error("[Webhook] Agent reply enqueue/publish failed:", message);
        return { status: "failed", error: message };
    }
}

function extractImageUrlFromEmbeds(embeds: { url?: string }[]): string | null {
    const imageEmbed = embeds.find((embed) => {
        if (!embed.url) return false;
        return embed.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || embed.url.includes("imagedelivery.net");
    });
    return imageEmbed?.url || null;
}

function getRemediationText(error: string | undefined): string {
    if (!error) return "Please include a title, edition size (1-10,000), and mint price in your cast.";

    if (error.includes("editionSize")) {
        return "Edition size must be a whole number between 1 and 10,000. Example: \"100 editions\".";
    }
    if (error.includes("mintPrice")) {
        return "Mint price must be a non-negative number. Example: \"0.001 ETH\" or \"free\".";
    }
    if (error.includes("title")) {
        return "A drop title is required (200 chars max). Example: \"My Genesis Drop\".";
    }
    if (error.includes("enough context")) {
        return "Your cast needs a title, edition size, and price. Try: \"@droppit My Drop, 100 editions, 0.001 ETH\".";
    }

    return `Please fix and retry: ${error}`;
}



