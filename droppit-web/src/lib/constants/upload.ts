/**
 * Shared Upload Constants for Droppit
 *
 * Single source of truth for file upload limits and MIME types.
 * Used by: create/page.tsx (client), api/upload/route.ts (server)
 */

/** Maximum upload file size in bytes — 20MB (MVP) */
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

/** Human-readable max size string for UI display */
export const MAX_UPLOAD_SIZE_LABEL = "20MB";

/** Allowed MIME types for artwork upload (MVP: images only) */
export const ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
] as const;

/** HTML accept attribute string for file inputs */
export const ALLOWED_MIME_ACCEPT = ALLOWED_MIME_TYPES.join(", ");

/** Human-readable format list for error messages */
export const ALLOWED_FORMATS_LABEL = "PNG, JPG, and WebP";

/** Image safety guard: maximum width in pixels */
export const MAX_IMAGE_WIDTH = 8192;

/** Image safety guard: maximum height in pixels */
export const MAX_IMAGE_HEIGHT = 8192;

/**
 * Image safety guard: maximum decoded pixel count (decompression-bomb protection).
 * 40M pixels ~= 8k * 5k, far above normal OG/source art usage.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;
