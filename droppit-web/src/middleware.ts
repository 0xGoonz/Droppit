import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDocsRewritePath, isDocsHost } from "@/lib/docs";

export function middleware(request: NextRequest) {
  const requestHost = request.headers.get("host") || request.nextUrl.host;

  if (!isDocsHost(requestHost)) {
    return NextResponse.next();
  }

  const rewritePath = getDocsRewritePath(request.nextUrl.pathname);

  if (!rewritePath) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = rewritePath;

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ["/:path*"],
};
