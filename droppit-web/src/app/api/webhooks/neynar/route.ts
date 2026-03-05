import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { parseDeployIntent } from "@/lib/intent-parser";
import { pinata } from "@/lib/pinata";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateImageMedia } from "@/lib/media-validation";
import { createDraftRecord } from "@/lib/draft";

/** Only process these Neynar webhook event types. */
const SUPPORTED_EVENT_TYPES = new Set(["cast.created"]);

export async function POST(req: NextRequest) {
    try {
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://droppit.ai').replace(/\/+$/, '');

        // 0. Rate limit: webhook preset (60 reqs / 5 min per IP)
        const limited = await checkRateLimit(req, "webhook", "[Webhook]");
        if (limited) return limited;

        // 1. Read Raw Body for Signature Verification
        const rawBody = await req.text();
        const signature = req.headers.get("x-neynar-signature");

        if (!signature || !process.env.NEYNAR_WEBHOOK_SECRET) {
            console.warn(`[Webhook] Rejected: Missing signature or webhook secret env var.`);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Validate signature format before any crypto operations.
        //    SHA-512 HMAC produces a 128-character lowercase hex digest.
        //    Reject malformed inputs immediately to prevent timingSafeEqual
        //    from throwing RangeError on length mismatch (which would leak as 500).
        if (!/^[a-f0-9]{128}$/.test(signature)) {
            console.warn(`[Webhook] Rejected: Signature is not valid 128-char hex (got ${signature.length} chars).`);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 3. Compute HMAC SHA-512
        const hmac = crypto.createHmac('sha512', process.env.NEYNAR_WEBHOOK_SECRET);
        const computedSignature = hmac.update(rawBody).digest('hex');

        // 4. Timing-Safe Comparison
        //    Both buffers are guaranteed to be 128 hex chars (64 bytes) at this point.
        const computedBuf = Buffer.from(computedSignature, 'hex');
        const receivedBuf = Buffer.from(signature, 'hex');

        if (computedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(computedBuf, receivedBuf)) {
            console.warn(`[Webhook] Rejected: Invalid cryptographic signature.`);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 5. Parse Body safely now that it is authenticated
        let body;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        // Item 35: Event-type filtering — only process supported types
        const eventType: string | undefined = body?.type;
        if (!eventType || !SUPPORTED_EVENT_TYPES.has(eventType)) {
            return NextResponse.json(
                { message: `Event type '${eventType || "unknown"}' not supported` },
                { status: 200 }
            );
        }

        const castText = body?.data?.text;
        const authorFid = body?.data?.author?.fid;
        const castHash = body?.data?.hash;

        if (!castText || !authorFid || !castHash) {
            return NextResponse.json({ error: "Invalid cast payload" }, { status: 400 });
        }

        // 6. Idempotency Check (Replay Protection)
        const supabaseAdmin = getServiceRoleClient();
        // Item 34: Extended idempotency key — castHash + eventType
        const idempotencyKey = `${castHash}:${eventType}`;
        const { error: idempotencyError } = await supabaseAdmin
            .from('webhook_events')
            .insert({ event_id: idempotencyKey, event_type: eventType });

        if (idempotencyError) {
            if (idempotencyError.code === '23505') { // Postgres Unique Violation
                console.log(`[Webhook] Duplicate event ${idempotencyKey} safely ignored.`);
                // Short-circuit safely with 200 OK
                return NextResponse.json({ message: "Duplicate" }, { status: 200 });
            }
            console.error("[Webhook] DB Warning, proceeding but tracking failed:", idempotencyError);
        }

        console.log(`[Webhook] Accepted new cast ${castHash} from FID ${authorFid}.`);

        console.log(`Received trigger from FID ${authorFid}: "${castText}"`);

        // Only process if it tags the bot or uses a specific phrase
        if (!castText.toLowerCase().includes("@droppit")) {
            return NextResponse.json({ message: "Ignored, not mentioned" });
        }

        console.log(`[Webhook] Processing Farcaster mention. Extracting drop intents...`);

        const parsed = await parseDeployIntent(castText);

        if (!parsed.success) {
            console.log(`[Webhook] Invalid intent: ${parsed.error}`);

            // Map parser errors to user-friendly remediation guidance
            const remediation = getRemediationText(parsed.error);

            const errorMessage = encodeURIComponent(parsed.error || 'Could not parse drop details');

            return NextResponse.json({
                success: false,
                message: parsed.error,
                remediation,
                frame: {
                    version: "vNext",
                    image: `${baseUrl}/api/og/drop/fallback?error=${errorMessage}`,
                    buttons: [
                        {
                            label: "📝 Fix & Retry on Droppit",
                            action: "link",
                            target: `${baseUrl}/create`
                        }
                    ]
                }
            });
        }

        // 6. Media Extraction Pipeline
        let imageUrl: string | null = null;
        let tokenUri: string | null = null;
        let mediaExtractionSuccess = false;

        const embeds: { url?: string }[] = body?.data?.embeds || [];
        const imageUrlFromEmbed = embeds.find(e => e.url && (e.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || e.url.includes('imagedelivery.net')))?.url;

        const targetMediaUrl = imageUrlFromEmbed || parsed.assetUri;

        if (targetMediaUrl) {
            console.log(`[Webhook] Found media URL: ${targetMediaUrl}, downloading...`);
            try {
                // Download the media
                const mediaResponse = await fetch(targetMediaUrl);
                if (!mediaResponse.ok) throw new Error(`HTTP Error: ${mediaResponse.status}`);

                const arrayBuffer = await mediaResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const bytes = new Uint8Array(arrayBuffer);
                const mediaValidation = validateImageMedia(bytes, mediaResponse.headers.get("content-type"));

                if (!mediaValidation.ok) {
                    console.warn(`[Webhook] Rejected media payload: ${mediaValidation.error}`);
                    return invalidMediaFrame(baseUrl, mediaValidation.error);
                }

                // Convert to a File object as expected by pinata
                const mimeType = mediaValidation.normalizedMime;
                const extension = mimeType.split("/")[1] || "png";
                // Using File web API representation for Pinata SDK
                const file = new File([buffer], `cast-media.${extension}`, { type: mimeType });

                console.log(`[Webhook] Uploading media to Pinata...`);
                // Use public storage matching frontend pattern
                const uploadImage = await pinata.upload.public.file(file);
                imageUrl = `ipfs://${uploadImage.cid}`;

                // Upload paired metadata JSON
                const metadata = {
                    name: parsed.title || "Untitled Drop",
                    description: "Created via Droppit on Farcaster",
                    image: imageUrl,
                    properties: {
                        generator: "Droppit AgentKit (Farcaster Webhook)",
                        castHash: castHash
                    },
                };

                const uploadJson = await pinata.upload.public.json(metadata);
                tokenUri = `ipfs://${uploadJson.cid}`;

                mediaExtractionSuccess = true;
                console.log(`[Webhook] Successfully pinned media to IPFS: ${imageUrl}`);
            } catch (mediaError) {
                console.error("[Webhook] Media extraction & pinning failed. Proceeding with text draft.", mediaError);
                mediaExtractionSuccess = false;
            }
        } else {
            console.log("[Webhook] No media found in cast or parsed intents.");
        }

        // Item 33: Use shared draft-creation helper (same validation as web flow)
        const draftResult = await createDraftRecord({
            creatorFid: authorFid,
            title: parsed.title || "Untitled Drop",
            editionSize: parsed.editionSize ?? 100,
            mintPrice: parsed.mintPrice ?? "0",
            castHash,
            imageUrl,
            tokenUri,
        });

        if (!draftResult.success) {
            console.error("[Webhook] Draft creation failed:", draftResult.error);
            return NextResponse.json({ error: "Failed to allocate drop" }, { status: 500 });
        }

        const draftId = draftResult.id;
        console.log(`[Webhook] Successfully drafted Drop ID: ${draftId}`);

        // Construct deployment Frame Payload to send directly back to the user
        const primaryLabel = mediaExtractionSuccess ? "Deploy to Base" : "⚠️ Missing Art: Upload High-Res";
        const frameResponse = {
            version: "vNext",
            image: `${baseUrl}/api/og/draft/${draftId}`,
            buttons: [
                {
                    label: primaryLabel,
                    action: "post",
                    target: `${baseUrl}/api/frame/deploy/${castHash}`
                }
            ]
        };

        console.log(`[Webhook] Lifecycle complete. Deploy Frame payload constructed.`);

        return NextResponse.json({
            success: true,
            frame: frameResponse
        });

    } catch (error: unknown) {
        console.error("Neynar Webhook Error:", error);
        const message = error instanceof Error ? error.message : "Unexpected webhook error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Maps parser validation errors to user-friendly remediation guidance
 * for Farcaster webhook consumers (frame responses / cast replies).
 */
function getRemediationText(error: string | undefined): string {
    if (!error) return "Please include a title, edition size (1–10,000), and mint price in your cast.";

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

function invalidMediaFrame(baseUrl: string, detail: string) {
    const remediation = "Upload PNG/JPG/WebP on Droppit and try again.";
    const errorMessage = encodeURIComponent("Upload PNG/JPG/WebP on Droppit");

    return NextResponse.json({
        success: false,
        message: detail,
        remediation,
        frame: {
            version: "vNext",
            image: `${baseUrl}/api/og/drop/fallback?error=${errorMessage}`,
            buttons: [
                {
                    label: "Upload PNG/JPG/WebP on Droppit",
                    action: "link",
                    target: `${baseUrl}/create`
                }
            ]
        }
    });
}
