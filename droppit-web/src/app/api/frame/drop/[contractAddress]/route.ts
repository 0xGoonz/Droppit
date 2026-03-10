import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAddress } from "viem";
import { getDropFrameSpec } from "@/lib/drop-frame";
import { getFrameHtmlResponse } from "@/lib/frame-builder";

export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ contractAddress: string }> }
) {
    try {
        const resolvedParams = await params;
        const contractAddress = resolvedParams.contractAddress;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";
        const frame = getDropFrameSpec(baseUrl, contractAddress);

        if (!contractAddress || !isAddress(contractAddress, { strict: false })) {
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: "link", label: "View Drop", target: frame.dropUrl }],
                    image: { src: frame.shareImageUrl },
                    postUrl: frame.postUrl,
                })
            );
        }

        fetch(`${baseUrl}/api/attribution/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contractAddress: contractAddress.toLowerCase(),
                wallet: null,
                ref: "farcaster_frame",
            }),
        }).catch((error) => console.warn("Frame view attribution failed:", error));

        try {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            const { data: drop, error } = await supabase
                .from("drops")
                .select("status")
                .ilike("contract_address", contractAddress)
                .maybeSingle();

            if (error || !drop || (drop.status !== "LIVE" && drop.status !== "PUBLISHED")) {
                throw new Error("Drop not found or not LIVE/PUBLISHED in database");
            }
        } catch (error) {
            console.error("Failed to verify contract for GET frame via DB:", error);
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: "link", label: "View Drop to Mint", target: frame.dropUrl }],
                    image: { src: frame.shareImageUrl },
                    postUrl: frame.postUrl,
                })
            );
        }

        return new NextResponse(
            getFrameHtmlResponse({
                buttons: frame.buttons,
                image: { src: frame.shareImageUrl },
                postUrl: frame.postUrl,
            })
        );
    } catch (error) {
        console.error(error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
