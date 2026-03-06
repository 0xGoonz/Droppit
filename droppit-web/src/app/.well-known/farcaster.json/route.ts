import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { isProductionEnvironment } from "@/lib/chains";

export const dynamic = "force-dynamic";

const MANIFEST_SUBTITLE = "Create, mint, share on Base";
const MANIFEST_OG_TITLE = "Droppit on Base";

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
    const heroImageUrl = new URL("/miniapp/metadata/hero-1200x630.png", baseUrl).toString();

    const manifest: Record<string, unknown> = {
        miniapp: {
            version: "1",
            name: BRAND.name,
            subtitle: MANIFEST_SUBTITLE,
            description: BRAND.description,
            tagline: BRAND.tagline,
            primaryCategory: "art-creativity",
            iconUrl: new URL("/apple-touch-icon.png", baseUrl).toString(),
            homeUrl: baseUrl,
            imageUrl: heroImageUrl,
            heroImageUrl,
            ogTitle: MANIFEST_OG_TITLE,
            ogDescription: BRAND.description,
            ogImageUrl: heroImageUrl,
            screenshotUrls: [
                new URL("/miniapp/metadata/screenshot-create.png", baseUrl).toString(),
                new URL("/miniapp/metadata/screenshot-drop.png", baseUrl).toString(),
                new URL("/miniapp/metadata/screenshot-success.png", baseUrl).toString(),
            ],
            noindex: false,
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
