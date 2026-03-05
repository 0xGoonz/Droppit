import { NextResponse } from "next/server";
import { pinata } from "@/lib/pinata";

export async function POST() {
    try {
        // Create a scoped/temporary key with 2 max uses:
        // 1 for the image upload, 1 for the metadata JSON upload.
        const keyData = await pinata.keys.create({
            keyName: `Droppit_Temp_Upload_${Date.now()}`,
            maxUses: 2,
            permissions: {
                endpoints: {
                    pinning: {
                        pinFileToIPFS: true,
                        pinJSONToIPFS: true,
                    },
                },
            },
        });

        return NextResponse.json(keyData);
    } catch (error) {
        console.error("Error generating temporary Pinata key:", error);
        return NextResponse.json(
            { error: "Failed to generate temporary upload token." },
            { status: 500 }
        );
    }
}
