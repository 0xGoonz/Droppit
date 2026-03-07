function normalizeHandle(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
    return cleaned || null;
}

function parseEditionSize(raw: bigint | number | string | null | undefined): bigint | null {
    if (typeof raw === "bigint") return raw > BigInt(0) ? raw : null;
    if (typeof raw === "number") {
        if (!Number.isFinite(raw) || raw <= 0) return null;
        return BigInt(Math.floor(raw));
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed || !/^[0-9]+$/.test(trimmed)) return null;
        const parsed = BigInt(trimmed);
        return parsed > BigInt(0) ? parsed : null;
    }
    return null;
}

export function formatEditionSizeLabel(raw: bigint | number | string | null | undefined): string | null {
    const parsed = parseEditionSize(raw);
    if (!parsed) return null;
    if (parsed === BigInt(1)) return "1/1";
    return `${parsed.toString()} editions`;
}

export function buildWarpcastComposeHref(params: { text: string; embedUrl: string }): string {
    const url = new URL("https://warpcast.com/~/compose");
    url.searchParams.set("text", params.text);
    url.searchParams.append("embeds[]", params.embedUrl);
    return url.toString();
}

export function buildDropShareCaption(params: {
    title: string;
    priceLabel?: string | null;
    chainLabel?: string | null;
    creatorHandle?: string | null;
    intro: string;
    cta: string;
}): string {
    const title = params.title.trim() || "Untitled Drop";
    const intro = params.intro.trim() || `"${title}" is live on @droppit.`;
    const lines: string[] = [intro];
    const details = [
        params.priceLabel?.trim() || null,
        params.chainLabel?.trim() || null,
    ].filter((value): value is string => Boolean(value));
    const normalizedHandle = normalizeHandle(params.creatorHandle);

    if (details.length > 0) {
        lines.push("", details.join(" | "));
    }

    if (normalizedHandle) {
        lines.push(`by @${normalizedHandle}`);
    }

    lines.push("", params.cta.trim());
    return lines.join("\n");
}



