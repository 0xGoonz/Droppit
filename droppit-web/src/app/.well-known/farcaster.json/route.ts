import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { isProductionEnvironment } from "@/lib/chains";

export const dynamic = "force-dynamic";

type AccountAssociation = {
    header: string;
    payload: string;
    signature: string;
};

function getBaseUrl() {
    return (process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai").replace(/\/+$/, "");
}

function getAccountAssociation(): AccountAssociation | null {
    const header = process.env.FARCASTER_HEADER?.trim();
    const payload = process.env.FARCASTER_PAYLOAD?.trim();
    const signature = process.env.FARCASTER_SIGNATURE?.trim();

    if (!header || !payload || !signature) {
        return null;
    }

    return { header, payload, signature };
}

export function GET() {
    const baseUrl = getBaseUrl();
    const canonicalDomain = new URL(baseUrl).host;
    const association = getAccountAssociation();

    const manifest: Record<string, unknown> = {
        miniapp: {
            version: "1",
            name: BRAND.name,
            subtitle: BRAND.tagline,
            description: BRAND.description,
            iconUrl: new URL("/apple-touch-icon.png", baseUrl).toString(),
            homeUrl: baseUrl,
            imageUrl: new URL("/og-image.png", baseUrl).toString(),
            buttonTitle: "Open Droppit",
            splashImageUrl: new URL("/apple-touch-icon.png", baseUrl).toString(),
            splashBackgroundColor: BRAND.palette.bg0,
            canonicalDomain,
            tags: ["nft", "mint", "base"],
            requiredChains: [isProductionEnvironment() ? "eip155:8453" : "eip155:84532"],
            requiredCapabilities: ["actions.ready"],
        },
    };

    if (association) {
        manifest.accountAssociation = association;
    }

    return NextResponse.json(manifest, {
        headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
    });
}