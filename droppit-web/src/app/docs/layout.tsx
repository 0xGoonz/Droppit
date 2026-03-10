import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs/DocsShell";
import { DOCS_BASE_URL } from "@/lib/docs";

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_BASE_URL),
  title: {
    default: "Droppit Docs",
    template: "%s | Droppit Docs",
  },
  description: "Product documentation for Droppit on Base.",
  alternates: {
    canonical: DOCS_BASE_URL,
  },
  openGraph: {
    title: "Droppit Docs",
    description: "Product documentation for Droppit on Base.",
    url: DOCS_BASE_URL,
    siteName: "Droppit Docs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Droppit Docs",
    description: "Product documentation for Droppit on Base.",
  },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
