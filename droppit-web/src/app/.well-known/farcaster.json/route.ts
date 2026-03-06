import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json({}, {
        headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
    });
}