import type { Metadata } from "next";

const MAIN_SITE_FALLBACK_URL = "https://droppitonbase.xyz";

export const DOCS_BASE_URL = "https://docs.droppitonbase.xyz";
export const DOCS_HOSTNAME = new URL(DOCS_BASE_URL).hostname;
export const DOCS_APP_URL = (process.env.NEXT_PUBLIC_BASE_URL || MAIN_SITE_FALLBACK_URL).replace(/\/+$/, "");

export type DocsSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  code?: string[];
  note?: string;
};

export type DocsQuickLink = {
  title: string;
  description: string;
  path: string;
};

export type DocsPageDefinition = {
  slug: string;
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  summary: string;
  sections: DocsSection[];
  quickLinks?: DocsQuickLink[];
  cta?: {
    label: string;
    href: string;
  };
};

export const DOCS_NAV_ITEMS: DocsQuickLink[] = [
  {
    title: "Overview",
    description: "What Droppit handles and where to start.",
    path: "/",
  },
  {
    title: "Getting Started",
    description: "Launch checklist for creators and collectors.",
    path: "/getting-started",
  },
  {
    title: "Create a Drop",
    description: "Web flow from artwork to publish.",
    path: "/create-a-drop",
  },
  {
    title: "Minting",
    description: "Collector flow, pricing, and locked unlocks.",
    path: "/minting",
  },
  {
    title: "Farcaster",
    description: "AI-assisted draft creation through casts.",
    path: "/farcaster",
  },
  {
    title: "FAQ",
    description: "Trust model, limits, and common questions.",
    path: "/faq",
  },
];

const DOCS_PAGES: DocsPageDefinition[] = [
  {
    slug: "",
    path: "/",
    title: "Documentation",
    description: "Product guides for launching and minting Droppit drops on Base.",
    eyebrow: "Droppit Docs",
    summary: "Everything needed to create, share, and mint a Droppit release without leaving the current product stack.",
    quickLinks: DOCS_NAV_ITEMS.filter((item) => item.path !== "/"),
    sections: [
      {
        title: "What Droppit does",
        paragraphs: [
          "Droppit is a link-first ERC-1155 drop platform for Base. Creators can launch from the web flow or start from a Farcaster cast, then send collectors to a direct mint page or Mini App.",
          "The current MVP stays intentionally narrow: one artwork per drop, no public discovery feed, no allowlists, and no token-gated mint access.",
        ],
        bullets: [
          "Creator flow: draft metadata, set economics, confirm wallet, publish on Base.",
          "Collector flow: open the drop page or frame, mint, then unlock any gated content if the drop includes it.",
          "Distribution flow: share one canonical link across the web, Warpcast, and Base-aware surfaces.",
        ],
      },
      {
        title: "Fastest path",
        paragraphs: [
          "If you are launching for the first time, open the getting started guide, prepare your artwork and payout wallet, then continue into the web-based create flow.",
        ],
        bullets: [
          "New creators: start with Getting Started, then Create a Drop.",
          "Collectors: skip to Minting if you only need the holder experience.",
          "Farcaster-first creators: read the Farcaster guide before tagging @droppit in a cast.",
        ],
        note: "Docs are product-focused in v1. API and contract reference material can be added later without changing the subdomain setup.",
      },
    ],
    cta: {
      label: "Open Droppit App",
      href: `${DOCS_APP_URL}/create`,
    },
  },
  {
    slug: "getting-started",
    path: "/getting-started",
    title: "Getting Started",
    description: "Launch checklist for first-time Droppit creators and collectors.",
    eyebrow: "Launch Basics",
    summary: "Prepare the minimum assets and expectations before you publish a drop on Base.",
    sections: [
      {
        title: "Before you publish",
        paragraphs: [
          "Keep the setup lean. You need a wallet on the correct Base network, artwork ready for upload, a clear title, and the edition size plus mint price you want collectors to see.",
        ],
        bullets: [
          "Use a creator wallet you control and can reconnect later for edits, stats, and deployment review.",
          "Have a payout recipient address ready before the final publish step.",
          "Decide upfront whether the mint is free, fixed-price, or includes locked content for holders.",
        ],
      },
      {
        title: "Core product assumptions",
        paragraphs: [
          "Droppit is optimized for shareable, single-drop campaigns rather than storefront-style collections. The product prioritizes direct links and Mini App compatibility over a full gallery experience.",
        ],
        bullets: [
          "No public drop index in the MVP.",
          "No login required to browse public drop information.",
          "No KYC or identity guarantee beyond wallet-linked details shown in the app.",
        ],
      },
      {
        title: "Launch checklist",
        paragraphs: [
          "Run through this checklist once before you spend gas on publishing.",
        ],
        bullets: [
          "Artwork uploaded and visibly correct in the draft preview.",
          "Edition size and mint price match the intended release.",
          "Payout wallet is correct and controlled by the creator or team.",
          "Any locked content text is final and safe to reveal to minters only.",
        ],
      },
    ],
    cta: {
      label: "Start a Drop",
      href: `${DOCS_APP_URL}/create`,
    },
  },
  {
    slug: "create-a-drop",
    path: "/create-a-drop",
    title: "Create a Drop",
    description: "Guide to the Droppit web flow from draft creation to publish.",
    eyebrow: "Creator Flow",
    summary: "Use the web wizard to build a drop draft, review the economics, and publish a Base deployment with the current app flow.",
    sections: [
      {
        title: "Step 1: Draft the release",
        paragraphs: [
          "Open the create flow and fill in the artwork, title, description, edition size, and pricing details. The draft remains editable until the deployment is finalized.",
        ],
        bullets: [
          "Upload the strongest version of the artwork you intend to ship.",
          "Keep the title short enough to read clearly on share cards and Mini App previews.",
          "Confirm whether the mint should be free or paid before you move on.",
        ],
      },
      {
        title: "Step 2: Review deployment inputs",
        paragraphs: [
          "The app estimates deployment cost and checks chain-specific settings before publish. This is the last point where you should catch pricing mistakes, wrong recipients, or missing assets.",
        ],
        bullets: [
          "Stay on the selected Base network for the current environment.",
          "Reconnect the same creator wallet used to prepare the draft if you loaded it from a share flow.",
          "Treat the final review state as your publish approval step.",
        ],
      },
      {
        title: "Step 3: Publish on Base",
        paragraphs: [
          "Publishing deploys the drop contract, verifies the deployment receipt against the configured factory, and finalizes the drop as live once the app can prove the deployment matches the draft.",
        ],
        bullets: [
          "Deployment and publish are intentionally bound together so a mismatched transaction cannot silently go live.",
          "Once the drop is live, the canonical collector page becomes the main artifact to share.",
        ],
        note: "The live flow is designed to prevent a DRAFT to LIVE transition from using the wrong deployment transaction or altered drop parameters.",
      },
    ],
    cta: {
      label: "Open Create Flow",
      href: `${DOCS_APP_URL}/create`,
    },
  },
  {
    slug: "minting",
    path: "/minting",
    title: "Minting",
    description: "Collector-facing mint flow, holder unlocks, and share behavior.",
    eyebrow: "Collector Flow",
    summary: "Collectors mint from a canonical drop page or embedded frame, with the same contract-backed release underneath.",
    sections: [
      {
        title: "How collectors mint",
        paragraphs: [
          "A collector opens the drop link, reviews the artwork and terms, then confirms the mint from a Base-compatible wallet. The drop page is meant to work as the direct public entrypoint.",
        ],
        bullets: [
          "Mint links stay focused on one drop instead of routing through a public marketplace profile.",
          "Share cards and Mini App embeds point back to the same underlying release.",
          "Pricing, edition size, and creator details should already be visible before confirmation.",
        ],
      },
      {
        title: "Locked content",
        paragraphs: [
          "Some drops include content that unlocks only after a successful mint. The app treats that content as a holder-only reveal rather than a public description field.",
        ],
        bullets: [
          "Creators should keep locked content concise and intentional.",
          "Collectors should expect the unlock experience only after mint completion is recognized.",
        ],
      },
      {
        title: "What stays out of scope",
        paragraphs: [
          "Droppit does not currently try to become a general storefront or curation layer. The collector experience is intentionally narrow so the mint page stays fast and predictable.",
        ],
        bullets: [
          "No public browse feed in v1.",
          "No built-in allowlists or presales.",
          "No external token gating requirement to mint.",
        ],
      },
    ],
    cta: {
      label: "View Main Site",
      href: DOCS_APP_URL,
    },
  },
  {
    slug: "farcaster",
    path: "/farcaster",
    title: "Farcaster",
    description: "Use Droppit from Farcaster with the AI-assisted draft and deploy flow.",
    eyebrow: "Farcaster Workflow",
    summary: "Creators can start with a cast, let the parser build a draft, then finish deployment through a reviewable Mini App path.",
    sections: [
      {
        title: "Cast format",
        paragraphs: [
          "Tag @droppit with your artwork and plain-language release instructions. The intent parser extracts the title, edition size, mint price, and related fields into a draft.",
        ],
        code: [
          "@droppit deploy this",
          "Midnight Run",
          "100 editions",
          "0.001 ETH",
        ],
        note: "The parser helps with structured intent, but the creator still needs to review the draft before final deployment.",
      },
      {
        title: "Draft review",
        paragraphs: [
          "Once the webhook accepts a valid cast, Droppit replies with a review link or deploy Mini App path. The creator should treat this as an editable draft rather than final onchain state.",
        ],
        bullets: [
          "Use the review step to catch missing artwork, wrong pricing, or incomplete payout information.",
          "If high-resolution artwork is still needed, the flow pushes the creator back into Droppit before deployment.",
        ],
      },
      {
        title: "Why this flow exists",
        paragraphs: [
          "The Farcaster path reduces context switching for creators already launching through social distribution. It keeps the shareable entrypoint close to the actual creation step without skipping the review and publish safeguards.",
        ],
      },
    ],
    cta: {
      label: "Open Farcaster-ready Create Flow",
      href: `${DOCS_APP_URL}/create`,
    },
  },
  {
    slug: "faq",
    path: "/faq",
    title: "FAQ / Trust / Limitations",
    description: "Common questions about Droppit's trust model, scope, and known limits.",
    eyebrow: "FAQ",
    summary: "Short answers to the most important product questions for the current Droppit MVP.",
    sections: [
      {
        title: "Trust and safety",
        paragraphs: [
          "Droppit shows creator-linked wallet data and deployment provenance, but it does not guarantee creator identity beyond the information currently attached to the release flow.",
        ],
        bullets: [
          "Check the displayed wallet and contract details before minting.",
          "Treat social profiles as signals, not perfect guarantees.",
          "Remember that gas and network conditions on Base can still vary at mint time.",
        ],
      },
      {
        title: "Why is there no public gallery?",
        paragraphs: [
          "The MVP is built around direct distribution. Creators send collectors a single link or frame instead of relying on a browse-and-discover homepage.",
        ],
      },
      {
        title: "Can Droppit host API docs yet?",
        paragraphs: [
          "Not in this first docs launch. The current docs focus on product workflows so the team can ship the subdomain quickly without introducing a separate documentation framework.",
        ],
      },
      {
        title: "What should I do if something looks wrong?",
        paragraphs: [
          "Do not publish if the draft preview, payout address, or price looks incorrect. Fix the draft first, then continue only after the review state matches the exact release you intend to ship.",
        ],
      },
    ],
    cta: {
      label: "Back to Docs Home",
      href: DOCS_BASE_URL,
    },
  },
];

const DOCS_PAGE_BY_SLUG = new Map(DOCS_PAGES.map((page) => [page.slug, page]));

export function getDocsHomePage(): DocsPageDefinition {
  return DOCS_PAGE_BY_SLUG.get("")!;
}

export function getDocsPageBySlug(slug: string): DocsPageDefinition | undefined {
  return DOCS_PAGE_BY_SLUG.get(slug);
}

export function getDocsStaticSlugs(): string[] {
  return DOCS_PAGES.filter((page) => page.slug).map((page) => page.slug);
}

export function buildDocsMetadata(page: DocsPageDefinition): Metadata {
  const canonical = new URL(page.path, DOCS_BASE_URL).toString();

  return {
    title: page.title,
    description: page.description,
    metadataBase: new URL(DOCS_BASE_URL),
    alternates: {
      canonical,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: "Droppit Docs",
      type: page.path === "/" ? "website" : "article",
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
  };
}

export function isDocsHost(host: string | null): boolean {
  if (!host) return false;
  return host.split(":")[0].toLowerCase() === DOCS_HOSTNAME;
}

export function shouldBypassDocsRewrite(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/miniapp") ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

export function getDocsRewritePath(pathname: string): string | null {
  if (shouldBypassDocsRewrite(pathname)) {
    return null;
  }

  if (pathname === "/") {
    return "/docs";
  }

  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    return null;
  }

  return `/docs${pathname}`;
}
