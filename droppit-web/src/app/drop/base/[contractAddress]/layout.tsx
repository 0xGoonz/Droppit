import { Metadata } from "next";

type Props = {
    params: Promise<{ contractAddress: string }>;
};

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const resolvedParams = await params;
    const contractAddress = resolvedParams.contractAddress;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://droppit.ai';

    // Construct URLs based on our existing routes
    const dropUrl = `${baseUrl}/drop/base/${contractAddress}`;
    const ogImageUrl = `${baseUrl}/api/og/drop/${contractAddress}`;
    const framePostUrl = `${baseUrl}/api/frame/drop/${contractAddress}`;
    const frameMintUrl = `${baseUrl}/api/frame/drop/${contractAddress}/mint`;

    return {
        // Standard Open Graph tags
        metadataBase: new URL(baseUrl),
        title: "Droppit Mint", // Will be replaced by client or we can fetch true title here if we want, but OG image has it
        description: "Mint this drop on Base via Droppit.",
        openGraph: {
            title: "Droppit Mint",
            description: "Mint this drop on Base via Droppit.",
            url: dropUrl,
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: "Drop Preview",
                },
            ],
            type: "website",
        },
        twitter: {
            card: "summary_large_image",
            title: "Droppit Mint",
            description: "Mint this drop on Base via Droppit.",
            images: [ogImageUrl],
        },
        // Farcaster Frame Tags
        other: {
            "fc:frame": "vNext",
            "fc:frame:image": ogImageUrl,
            "fc:frame:post_url": framePostUrl,
            "fc:frame:button:1": "Mint 1",
            "fc:frame:button:1:action": "tx",
            "fc:frame:button:1:target": frameMintUrl,
            "fc:frame:button:2": "Open mint page",
            "fc:frame:button:2:action": "link",
            "fc:frame:button:2:target": dropUrl,
        },
    };
}

export default function DropLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // This layout simply wraps the client-side page and injects the server-side metadata above.
    return <>{children}</>;
}
