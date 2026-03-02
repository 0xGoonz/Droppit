import { NextResponse } from "next/server";
import { pinata } from "@/lib/pinata";
import { validateLockedContent } from "@/lib/validation/drops";
import { extractImageDimensions, validateImageMedia } from "@/lib/media-validation";
import {
    MAX_IMAGE_HEIGHT,
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_WIDTH,
    MAX_UPLOAD_SIZE_BYTES,
    MAX_UPLOAD_SIZE_LABEL,
} from "@/lib/constants/upload";

function validationError(message: string, status = 400) {
    return NextResponse.json(
        {
            error: message,
            code: "UPLOAD_VALIDATION_ERROR",
        },
        { status }
    );
}

export async function POST(request: Request) {
    try {
        const data = await request.formData();
        const file = data.get("file") as File | null;
        const title = data.get("title") as string;
        const description = data.get("description") as string;
        const lockedContent = data.get("lockedContent") as string;

        if (!file || !(file instanceof File)) {
            return validationError("No file provided.");
        }

        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
            return validationError(`File size exceeds ${MAX_UPLOAD_SIZE_LABEL} limit.`);
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const mediaValidation = validateImageMedia(bytes, file.type);
        if (!mediaValidation.ok) {
            return validationError(mediaValidation.error);
        }

        const dimensions = extractImageDimensions(mediaValidation.normalizedMime, bytes);
        if (!dimensions) {
            return validationError("Could not read image dimensions from uploaded file.");
        }

        if (dimensions.width > MAX_IMAGE_WIDTH || dimensions.height > MAX_IMAGE_HEIGHT) {
            return validationError(
                `Image dimensions exceed limit (${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} max).`
            );
        }

        const totalPixels = dimensions.width * dimensions.height;
        if (totalPixels > MAX_IMAGE_PIXELS) {
            return validationError("Image is too large to process safely.");
        }

        if (lockedContent) {
            const check = validateLockedContent(lockedContent);
            if (!check.valid) {
                return validationError(check.error);
            }
        }

        const safeFile = new File([buffer], file.name || "upload", { type: mediaValidation.normalizedMime });

        const uploadImage = await pinata.upload.public.file(safeFile);
        const imageUri = `ipfs://${uploadImage.cid}`;

        const metadata = {
            name: title || "Untitled Drop",
            description: description || "Created via Droppit AI",
            image: imageUri,
            properties: {
                generator: "Droppit AI AgentKit",
            },
        };

        const uploadJson = await pinata.upload.public.json(metadata);
        const tokenUri = `ipfs://${uploadJson.cid}`;

        return NextResponse.json({ tokenUri, imageUri });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            {
                error: "Failed to upload asset.",
                code: "UPLOAD_INTERNAL_ERROR",
            },
            { status: 500 }
        );
    }
}
