import { getDropFrameSpec } from "@/lib/drop-frame";

type Props = {
    params: Promise<{ contractAddress: string }>;
};

export default async function Head({ params }: Props) {
    const { contractAddress } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";
    const frame = getDropFrameSpec(baseUrl, contractAddress);

    return (
        <>
            <meta property="fc:frame" content="vNext" />
            <meta property="fc:frame:image" content={frame.ogImageUrl} />
            <meta property="fc:frame:post_url" content={frame.postUrl} />
            {frame.buttons.map((button, index) => (
                <meta
                    key={`${button.label}-${index}`}
                    property={`fc:frame:button:${index + 1}`}
                    content={button.label}
                />
            ))}
            {frame.buttons.map((button, index) => (
                <meta
                    key={`${button.label}-${button.action}-${index}`}
                    property={`fc:frame:button:${index + 1}:action`}
                    content={button.action}
                />
            ))}
            {frame.buttons.map((button, index) => (
                <meta
                    key={`${button.label}-${button.target}-${index}`}
                    property={`fc:frame:button:${index + 1}:target`}
                    content={button.target}
                />
            ))}
        </>
    );
}
