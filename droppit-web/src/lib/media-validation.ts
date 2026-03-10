import { ALLOWED_FORMATS_LABEL, ALLOWED_MIME_TYPES } from "@/lib/constants/upload";

export type ImageDimensions = { width: number; height: number };
export type AllowedImageMime = (typeof ALLOWED_MIME_TYPES)[number];

type MediaValidationSuccess = {
    ok: true;
    normalizedMime: AllowedImageMime;
};

type MediaValidationFailure = {
    ok: false;
    error: string;
};

export type MediaValidationResult = MediaValidationSuccess | MediaValidationFailure;

export function normalizeMime(raw: string | null | undefined): string {
    if (!raw) return "";
    const base = raw.split(";")[0]?.trim().toLowerCase() || "";
    if (base === "image/jpg") return "image/jpeg";
    return base;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
    if (bytes.length < signature.length) return false;
    for (let i = 0; i < signature.length; i += 1) {
        if (bytes[i] !== signature[i]) return false;
    }
    return true;
}

function isRiffWebp(bytes: Uint8Array): boolean {
    if (bytes.length < 12) return false;
    return (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    );
}

export function sniffMime(bytes: Uint8Array): string | null {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (isRiffWebp(bytes)) return "image/webp";
    if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif";

    // MP4 family: ftyp box at offset 4
    if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return "video/mp4";
    }
    // WebM/Matroska
    if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
    // OGG container
    if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return "video/ogg";

    return null;
}

export function validateImageMedia(bytes: Uint8Array, declaredMimeRaw?: string | null): MediaValidationResult {
    const sniffedMime = sniffMime(bytes);
    const declaredMime = normalizeMime(declaredMimeRaw);
    const normalizedSniffed = normalizeMime(sniffedMime);

    if (!normalizedSniffed) {
        return {
            ok: false,
            error: `Unable to verify file format. Only ${ALLOWED_FORMATS_LABEL} are allowed.`,
        };
    }

    if (declaredMime && declaredMime !== normalizedSniffed) {
        return {
            ok: false,
            error: `Declared file type (${declaredMime}) does not match detected content type (${normalizedSniffed}).`,
        };
    }

    if (normalizedSniffed === "image/gif" || normalizedSniffed.startsWith("video/")) {
        return {
            ok: false,
            error: "GIF and video uploads are not supported in MVP. Upload a PNG, JPG, or WebP image.",
        };
    }

    // Policy layer: allowlist check is applied on top of sniffed MIME.
    if (!ALLOWED_MIME_TYPES.includes(normalizedSniffed as AllowedImageMime)) {
        return {
            ok: false,
            error: `Invalid file format. Only ${ALLOWED_FORMATS_LABEL} are allowed.`,
        };
    }

    return {
        ok: true,
        normalizedMime: normalizedSniffed as AllowedImageMime,
    };
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    ) >>> 0;
}

function parsePngDimensions(bytes: Uint8Array): ImageDimensions | null {
    if (bytes.length < 24) return null;
    const width = readUint32BE(bytes, 16);
    const height = readUint32BE(bytes, 20);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    let offset = 2;
    while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }

        const marker = bytes[offset + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker >= 0xd0 && marker <= 0xd7) {
            offset += 2;
            continue;
        }

        if (offset + 3 >= bytes.length) break;
        const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (segmentLength < 2) break;

        const isSof =
            marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
            marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
            marker === 0xc9 || marker === 0xca || marker === 0xcb ||
            marker === 0xcd || marker === 0xce || marker === 0xcf;

        if (isSof) {
            if (offset + 8 >= bytes.length) return null;
            const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
            const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
            if (width <= 0 || height <= 0) return null;
            return { width, height };
        }

        offset += 2 + segmentLength;
    }

    return null;
}

function parseWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
    if (!isRiffWebp(bytes) || bytes.length < 30) return null;

    const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    const chunkOffset = 20;

    if (chunkType === "VP8X") {
        if (bytes.length < 30) return null;
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        if (width <= 0 || height <= 0) return null;
        return { width, height };
    }

    if (chunkType === "VP8 " && bytes.length >= chunkOffset + 10) {
        const startCodeOk =
            bytes[chunkOffset + 3] === 0x9d &&
            bytes[chunkOffset + 4] === 0x01 &&
            bytes[chunkOffset + 5] === 0x2a;
        if (!startCodeOk) return null;
        const widthRaw = bytes[chunkOffset + 6] | (bytes[chunkOffset + 7] << 8);
        const heightRaw = bytes[chunkOffset + 8] | (bytes[chunkOffset + 9] << 8);
        const width = widthRaw & 0x3fff;
        const height = heightRaw & 0x3fff;
        if (width <= 0 || height <= 0) return null;
        return { width, height };
    }

    if (chunkType === "VP8L" && bytes.length >= chunkOffset + 5) {
        if (bytes[chunkOffset] !== 0x2f) return null;
        const b1 = bytes[chunkOffset + 1];
        const b2 = bytes[chunkOffset + 2];
        const b3 = bytes[chunkOffset + 3];
        const b4 = bytes[chunkOffset + 4];
        const width = 1 + (b1 | ((b2 & 0x3f) << 8));
        const height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
        if (width <= 0 || height <= 0) return null;
        return { width, height };
    }

    return null;
}

export function extractImageDimensions(sniffedMime: string, bytes: Uint8Array): ImageDimensions | null {
    if (sniffedMime === "image/png") return parsePngDimensions(bytes);
    if (sniffedMime === "image/jpeg") return parseJpegDimensions(bytes);
    if (sniffedMime === "image/webp") return parseWebpDimensions(bytes);
    return null;
}
