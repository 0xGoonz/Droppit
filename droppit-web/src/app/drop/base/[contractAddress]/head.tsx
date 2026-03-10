import { getDropFrameSpec } from "@/lib/drop-frame";
import { getDropShareEmbeds } from "@/lib/miniapp-embed";

type Props = {
    params: Promise<{ contractAddress: string }>;
};

export default async function Head({ params }: Props) {
    const { contractAddress } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";
    const frame = getDropFrameSpec(baseUrl, contractAddress);
    const embeds = getDropShareEmbeds(frame);

    return (
        <>
            <meta name="fc:miniapp" content={JSON.stringify(embeds.miniapp)} />
            <meta name="fc:frame" content={JSON.stringify(embeds.frame)} />
        </>
    );
}