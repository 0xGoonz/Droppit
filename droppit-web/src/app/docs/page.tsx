import type { Metadata } from "next";
import { DocsArticle } from "@/components/docs/DocsArticle";
import { buildDocsMetadata, getDocsHomePage } from "@/lib/docs";

const page = getDocsHomePage();

export const metadata: Metadata = buildDocsMetadata(page);

export default function DocsHomePage() {
  return <DocsArticle page={page} />;
}
