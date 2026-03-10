import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  DOCS_BASE_URL,
  buildDocsMetadata,
  getDocsPageBySlug,
  getDocsRewritePath,
  isDocsHost,
  shouldBypassDocsRewrite,
} from "@/lib/docs";

describe("docs routing", () => {
  it("rewrites docs host root requests to the internal docs index", () => {
    const request = new NextRequest("https://docs.droppitonbase.xyz/");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://docs.droppitonbase.xyz/docs");
  });

  it("rewrites docs host child routes to the docs route tree", () => {
    const request = new NextRequest("https://docs.droppitonbase.xyz/getting-started");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://docs.droppitonbase.xyz/docs/getting-started");
  });

  it("leaves the main site host untouched", () => {
    const request = new NextRequest("https://droppitonbase.xyz/getting-started");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not rewrite docs host API or static asset requests", () => {
    const apiRequest = new NextRequest("https://docs.droppitonbase.xyz/api/frame/drop/123");
    const staticRequest = new NextRequest("https://docs.droppitonbase.xyz/apple-touch-icon.png");

    expect(middleware(apiRequest).headers.get("x-middleware-rewrite")).toBeNull();
    expect(middleware(staticRequest).headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("docs helpers", () => {
  it("builds canonical metadata for docs pages on the docs host", () => {
    const page = getDocsPageBySlug("minting");
    const metadata = buildDocsMetadata(page!);

    expect(metadata.alternates?.canonical).toBe(`${DOCS_BASE_URL}/minting`);
    expect(metadata.openGraph?.url).toBe(`${DOCS_BASE_URL}/minting`);
  });

  it("exposes host and rewrite helpers for docs routing", () => {
    expect(isDocsHost("docs.droppitonbase.xyz")).toBe(true);
    expect(isDocsHost("droppitonbase.xyz")).toBe(false);
    expect(shouldBypassDocsRewrite("/_next/static/chunk.js")).toBe(true);
    expect(getDocsRewritePath("/faq")).toBe("/docs/faq");
  });
});
