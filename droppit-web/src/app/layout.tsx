import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "@coinbase/onchainkit/styles.css";
import { BRAND } from "@/lib/brand";
import { Providers } from "@/providers/OnchainKitProvider";

const displayFont = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";
const baseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID?.trim();
const promoImagePath = "/miniapp/metadata/hero-1200x630.png";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: BRAND.name,
    template: `%s | ${BRAND.shortName}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: BRAND.name,
    description: BRAND.description,
    siteName: BRAND.name,
    type: "website",
    url: baseUrl,
    images: [{ url: promoImagePath, width: 1200, height: 630, alt: `${BRAND.name} hero image` }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.name,
    description: BRAND.description,
    images: [promoImagePath],
  },
  other: baseAppId ? {
    "base:app_id": baseAppId,
  } : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
