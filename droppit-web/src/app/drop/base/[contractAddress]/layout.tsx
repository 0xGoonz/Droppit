import { Metadata } from "next";
import { getDropFrameSpec } from "@/lib/drop-frame";

type Props = {
    params: Promise<{ contractAddress: string }>;
};

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const resolvedParams = await params;
    const contractAddress = resolvedParams.contractAddress;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz";
    const frame = getDropFrameSpec(baseUrl, contractAddress);

    return {
        metadataBase: new URL(baseUrl),
        title: "Droppit Mint",
        description: "Mint this drop on Base via Droppit.",
        openGraph: {
            title: "Droppit Mint",
            description: "Mint this drop on Base via Droppit.",
            url: frame.dropUrl,
            images: [
                {
                    url: frame.ogImageUrl,
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
            images: [frame.ogImageUrl],
        },
    };
}

export default function DropLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
