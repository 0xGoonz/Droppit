import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "@/components/docs/DocsArticle";
import { buildDocsMetadata, getDocsPageBySlug, getDocsStaticSlugs } from "@/lib/docs";

export function generateStaticParams() {
  return getDocsStaticSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocsPageBySlug(slug);

  if (!page) {
    return {};
  }

  return buildDocsMetadata(page);
}

export default async function DocsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getDocsPageBySlug(slug);

  if (!page) {
    notFound();
  }

  return <DocsArticle page={page} />;
}