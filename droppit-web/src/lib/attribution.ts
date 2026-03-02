import { isAddress } from "viem";

export type RefType = "none" | "address" | "code" | "invalid";

export type ReferralPayload = {
    ref: string | null;
    utm: Record<string, string>;
};

const REF_CODE_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const ADDRESS_LIKE_REGEX = /^(0x)?[a-fA-F0-9]{40}$/;

function normalizeString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeUtmObject(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const utm: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.trim().toLowerCase();
        if (!key.startsWith("utm_")) continue;
        const normalizedValue = normalizeString(rawValue);
        if (!normalizedValue) continue;
        utm[key] = normalizedValue;
    }
    return utm;
}

export function normalizeReferralPayload(input: Record<string, unknown>): ReferralPayload {
    const ref = normalizeString(input.ref);
    const utm = normalizeUtmObject(input.utm);

    for (const [rawKey, rawValue] of Object.entries(input)) {
        const key = rawKey.trim().toLowerCase();
        if (!key.startsWith("utm_") || utm[key]) continue;
        const normalizedValue = normalizeString(rawValue);
        if (!normalizedValue) continue;
        utm[key] = normalizedValue;
    }

    return { ref, utm };
}

export function extractReferralPayloadFromBody(body: Record<string, unknown>): ReferralPayload {
    const nestedReferral =
        body.referral && typeof body.referral === "object" && !Array.isArray(body.referral)
            ? (body.referral as Record<string, unknown>)
            : {};

    return normalizeReferralPayload({
        ...body,
        ...nestedReferral,
    });
}

export function normalizeReferralPayloadFromSearchParams(searchParams: URLSearchParams): ReferralPayload {
    let ref: string | null = null;
    const utm: Record<string, string> = {};

    for (const [rawKey, rawValue] of searchParams.entries()) {
        const key = rawKey.trim().toLowerCase();
        const value = normalizeString(rawValue);
        if (!value) continue;

        if (key === "ref") {
            if (!ref) ref = value;
            continue;
        }

        if (key.startsWith("utm_")) {
            utm[key] = value;
        }
    }

    return { ref, utm };
}

export function classifyRef(ref: string | null): { refType: RefType; refNormalized: string | null } {
    if (!ref) {
        return { refType: "none", refNormalized: null };
    }

    if (isAddress(ref)) {
        return { refType: "address", refNormalized: ref.toLowerCase() };
    }

    // Avoid classifying malformed address-like refs as referral codes.
    if (ref.toLowerCase().startsWith("0x") || ADDRESS_LIKE_REGEX.test(ref)) {
        return { refType: "invalid", refNormalized: null };
    }

    if (REF_CODE_REGEX.test(ref)) {
        return { refType: "code", refNormalized: ref.toLowerCase() };
    }

    return { refType: "invalid", refNormalized: null };
}

export function serializeUtm(utm: Record<string, string>): string {
    const sortedEntries = Object.entries(utm).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    if (sortedEntries.length === 0) return "none";
    return sortedEntries.map(([key, value]) => `${key}:${value.toLowerCase()}`).join("|");
}

export function normalizeOptionalString(value: unknown): string | null {
    return normalizeString(value);
}
