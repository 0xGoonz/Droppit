import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { BRAND, BRAND_LINKS } from "@/lib/brand";
import { PROTOCOL_FEE_PER_MINT_LABEL } from "@/lib/contracts";

const HERO_PARTICLES = [
  { left: "8%", top: "16%", size: 4, opacity: 0.45, duration: "4.4s", delay: "0s" },
  { left: "18%", top: "34%", size: 3, opacity: 0.3, duration: "5.2s", delay: "0.8s" },
  { left: "41%", top: "12%", size: 3, opacity: 0.34, duration: "4.8s", delay: "0.3s" },
  { left: "62%", top: "22%", size: 2, opacity: 0.28, duration: "5.8s", delay: "1.1s" },
  { left: "74%", top: "42%", size: 3, opacity: 0.36, duration: "4.6s", delay: "0.5s" },
  { left: "88%", top: "18%", size: 4, opacity: 0.42, duration: "4.2s", delay: "1.4s" },
  { left: "84%", top: "74%", size: 3, opacity: 0.24, duration: "6.1s", delay: "0.6s" },
  { left: "53%", top: "72%", size: 2, opacity: 0.22, duration: "6s", delay: "1s" },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,82,255,0.28),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(34,211,238,0.2),transparent_36%),radial-gradient(circle_at_75%_75%,rgba(255,77,141,0.18),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(124,58,237,0.2),transparent_42%)]" />

      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#05070f]/85 backdrop-blur reveal-up">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <BrandLockup markSize={32} wordmarkClassName="text-2xl font-bold tracking-tight" />
          <div className="flex items-center gap-3">
            <Link href="#how-it-works" className="text-sm font-medium text-white/75 transition-colors hover:text-white">
              How It Works
            </Link>
            <Link href="/create" className="lift-hover rounded-full border border-[#22D3EE]/40 bg-[#0052FF]/20 px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-[#0052FF]/35">
              Start a Drop
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-24">
          <div className="pointer-events-none absolute inset-0">
            {HERO_PARTICLES.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.top}-${index}`}
                className="absolute rounded-full bg-cyan-200/90 blur-[0.5px] particle-float"
                style={{
                  left: particle.left,
                  top: particle.top,
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  opacity: particle.opacity,
                  animationDuration: particle.duration,
                  animationDelay: particle.delay,
                }}
              />
            ))}
            <div className="absolute -top-14 left-0 h-36 w-36 rounded-full bg-[#22D3EE]/18 blur-3xl parallax-orb-a" />
            <div className="absolute right-10 top-32 h-40 w-40 rounded-full bg-[#FF4D8D]/16 blur-3xl parallax-orb-b" />
            <div className="absolute -bottom-6 left-[44%] h-28 w-28 rounded-full bg-[#7C3AED]/18 blur-3xl parallax-orb-c" />
          </div>

          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center rounded-full border border-blue-300/35 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100 reveal-up reveal-delay-1">
              Built for Base
            </div>

            <h1 className="font-display max-w-4xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-7xl reveal-up reveal-delay-2">
              Launch Drops at Feed Speed.
              <br />
              Share. Mint.
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300 sm:text-xl reveal-up reveal-delay-3">
              {BRAND.description}
            </p>

            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center reveal-up reveal-delay-4">
              <div className="relative group">
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] opacity-80 blur-md transition-opacity group-hover:opacity-100 cta-glow" />
                <Link href="/create" className="relative rounded-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] px-7 py-3 text-base font-bold text-white transition-transform hover:scale-[1.02] hover:-translate-y-0.5">
                  Start a Drop
                </Link>
              </div>
              <a href="#how-it-works" className="lift-hover rounded-full border border-white/20 px-7 py-3 text-base font-semibold text-white/90 transition-colors hover:border-white/40 hover:text-white">
                See How It Works
              </a>
            </div>

            <p className="font-mono-brand mt-5 text-sm font-medium text-slate-300 reveal-up reveal-delay-5">
              {BRAND.tagline}
            </p>
            <p className="mt-2 text-sm text-slate-400 reveal-up reveal-delay-5">
              No code required. Typical deploy gas on Base is often under $0.50, depending on network conditions.
            </p>
            <p className="mt-2 text-sm text-slate-400 reveal-up reveal-delay-5">
              Link-first by design: discovery happens through shared links and Farcaster Frames, not a public homepage feed.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 reveal-up reveal-delay-3">
          <h2 className="font-display mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Feature Highlights</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-2">
            <FeatureCard
              className="md:col-span-3"
              revealClassName="reveal-up reveal-delay-4"
              title="3-Minute Launch"
              description="Upload artwork, set edition size and mint price, and publish without complex dashboards."
              icon={<LaunchGlyph />}
            />
            <FeatureCard
              className="md:col-span-3"
              revealClassName="reveal-up reveal-delay-5"
              title="Feed-Native"
              description="Farcaster Frames and OG cards let collectors mint from the timeline or from your shared link."
              icon={<FeedGlyph />}
            />
            <FeatureCard
              className="md:col-span-2"
              revealClassName="reveal-up reveal-delay-6"
              title="Safety First"
              description="Metadata is frozen at publish. Locked content is text-only for safer MVP handling."
              icon={<ShieldGlyph />}
            />
            <FeatureCard
              className="md:col-span-4"
              revealClassName="reveal-up reveal-delay-7"
              title="Mint Receipt"
              description="Collectors get a shareable receipt link after mint so provenance and proof of mint are easy to pass along."
              icon={<ReceiptGlyph />}
            >
              <ReceiptPreview />
            </FeatureCard>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 reveal-up reveal-delay-4">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">How It Works</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <StepCard
              revealClassName="reveal-up reveal-delay-5"
              step="Step 1"
              title="Upload Your Art"
              description="Use a PNG, JPG, or WebP image. Droppit validates media types before publishing."
              icon={<UploadGlyph />}
            />
            <StepCard
              revealClassName="reveal-up reveal-delay-6"
              step="Step 2"
              title="Set Price and Supply"
              description="Choose fixed editions and mint price with transparent protocol fee details shown up front."
              icon={<PriceGlyph />}
            />
            <StepCard
              revealClassName="reveal-up reveal-delay-7"
              step="Step 3"
              title="Share the Link"
              description="Droppit generates an OG card and Farcaster frame route so discovery is link-first from day one."
              icon={<ShareGlyph />}
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8 reveal-up reveal-delay-5">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Transparent Pricing</h2>
          <p className="mt-4 max-w-3xl text-slate-300">
            Costs are explicit before deployment. Network gas varies over time; the ranges below are MVP guidance, not fixed quotes.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <PriceCard
              revealClassName="reveal-up reveal-delay-6"
              title="Deploy Cost (Creator)"
              value="~$0.50 gas on Base"
              detail="One deployment transaction, paid by the creator wallet at publish time."
            />
            <PriceCard
              revealClassName="reveal-up reveal-delay-7"
              title="Protocol Fee (Per Mint)"
              value={PROTOCOL_FEE_PER_MINT_LABEL}
              detail="Flat protocol fee per mint. Shown transparently in mint context."
            />
            <PriceCard
              revealClassName="reveal-up reveal-delay-8"
              title="Mint Price Revenue (Creator)"
              value="100% to creator"
              detail="Creator keeps full configured mint price. Protocol fee is separate."
            />
            <PriceCard
              revealClassName="reveal-up reveal-delay-9"
              title="Mint Transaction Gas (Collector)"
              value="Network-dependent"
              detail="Collectors pay standard Base gas for their mint transaction."
            />
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[#03050d]/85 reveal-up reveal-delay-6">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-100">Built on Base</p>
            <h3 className="font-display mt-3 text-xl font-bold">Trust and MVP Disclosures</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>Droppit is link-first in MVP. There is no public gallery or discovery feed on the homepage.</li>
              <li>Homepage does not require login or signup to browse product information.</li>
              <li>Droppit does not make identity verification or KYC claims for creators in MVP.</li>
              <li>All costs are estimates and can change with Base network gas conditions.</li>
            </ul>
          </div>

          <div className="lg:pl-8">
            <h3 className="font-display text-lg font-bold">Links</h3>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a href={BRAND_LINKS.docs} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-white/90 hover:border-white/40 hover:text-white">
                Docs
              </a>
              <a href={BRAND_LINKS.github} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-white/90 hover:border-white/40 hover:text-white">
                GitHub
              </a>
              <a href={BRAND_LINKS.warpcast} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-white/90 hover:border-white/40 hover:text-white">
                Warpcast
              </a>
              <a href={BRAND_LINKS.twitter} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-white/90 hover:border-white/40 hover:text-white">
                X / Twitter
              </a>
            </div>
            <p className="mt-6 text-xs text-slate-400">(c) {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
  className = "",
  revealClassName = "",
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
  revealClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`group rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_14px_40px_rgba(2,8,23,0.35)] lift-hover ${className} ${revealClassName}`}>
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#22D3EE]/25 bg-[#0052FF]/18 text-cyan-200 transition-transform duration-300 group-hover:scale-105">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
  icon,
  revealClassName = "",
}: {
  step: string;
  title: string;
  description: string;
  icon: ReactNode;
  revealClassName?: string;
}) {
  return (
    <div className={`rounded-3xl border border-blue-300/20 bg-blue-500/[0.06] p-6 lift-hover ${revealClassName}`}>
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7C3AED]/40 bg-[#7C3AED]/18 text-violet-200">
        {icon}
      </div>
      <div className="font-mono-brand text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">{step}</div>
      <h3 className="font-display mt-2 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
    </div>
  );
}

function PriceCard({
  title,
  value,
  detail,
  revealClassName = "",
}: {
  title: string;
  value: string;
  detail: string;
  revealClassName?: string;
}) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.03] p-6 lift-hover ${revealClassName}`}>
      <h3 className="font-mono-brand text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">{title}</h3>
      <p className="font-display mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{detail}</p>
    </div>
  );
}

function ReceiptPreview() {
  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-[#0B1020]/80 p-3 shadow-[0_8px_26px_rgba(2,8,23,0.38)] lift-hover">
      <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>Mint Receipt</span>
        <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-green-300">Success</span>
      </div>
      <div className="grid grid-cols-[56px_1fr] gap-3">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[#0052FF] via-[#7C3AED] to-[#FF4D8D]" />
        <div className="space-y-1.5">
          <div className="h-2.5 w-40 rounded-full bg-white/20" />
          <div className="h-2.5 w-28 rounded-full bg-white/15" />
          <div className="font-mono-brand text-[10px] text-slate-400">Tx: 0x4f2a...91bd</div>
        </div>
      </div>
    </div>
  );
}

function LaunchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 4l6 6-6 1-3 3-1 6-2-5-5-2 6-1 3-3 2-5z" />
    </svg>
  );
}

function FeedGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="14" rx="4" />
      <path d="M7 9h10M7 13h6" />
    </svg>
  );
}

function ShieldGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ReceiptGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 012-2z" />
      <path d="M9 9h6M9 13h6" />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V7" />
      <path d="M8.5 10.5L12 7l3.5 3.5" />
      <rect x="4" y="16" width="16" height="4" rx="1.5" />
    </svg>
  );
}

function PriceGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 10.5c0-1 1-1.8 2.5-1.8s2.5.7 2.5 1.8-1 1.8-2.5 1.8-2.5.8-2.5 1.8 1 1.8 2.5 1.8 2.5-.8 2.5-1.8" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.7 10.8l6.5-4M8.7 13.2l6.5 4" />
    </svg>
  );
}
