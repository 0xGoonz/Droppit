"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BRAND, BRAND_LINKS } from "@/lib/brand";
import { PROTOCOL_FEE_PER_MINT_LABEL } from "@/lib/contracts";

/* ═══════════════════════════════════════════════
   Animation Variants
   ═══════════════════════════════════════════════ */
const sectionVariants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.09, delayChildren: 0.12 },
    },
};

const cardVariants = {
    hidden: { opacity: 0, y: 32, scale: 0.97 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.65, ease: [0.2, 0.75, 0.2, 1] as const },
    },
};

const fadeUp = {
    hidden: { opacity: 0, y: 22 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.2, 0.75, 0.2, 1] as const },
    },
};

const scaleIn = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: 0.7, ease: [0.2, 0.75, 0.2, 1] as const },
    },
};

/* ═══════════════════════════════════════════════
   Section Wrapper — keeps max-w + padding DRY
   ═══════════════════════════════════════════════ */
function Section({
    children,
    id,
    className = "",
}: {
    children: ReactNode;
    id?: string;
    className?: string;
}) {
    return (
        <motion.section
            id={id}
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}
        >
            {children}
        </motion.section>
    );
}

/* ═══════════════════════════════════════════════
   Sub-heading badge
   ═══════════════════════════════════════════════ */
function SectionBadge({ children }: { children: ReactNode }) {
    return (
        <motion.div
            variants={fadeUp}
            className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/80"
        >
            {children}
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════
   SVG Glyphs
   ═══════════════════════════════════════════════ */
function GlyphArt() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M14 4l6 6-6 1-3 3-1 6-2-5-5-2 6-1 3-3 2-5z" />
        </svg>
    );
}
function GlyphEvent() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4" width="18" height="18" rx="3" />
            <path d="M3 10h18M8 2v4M16 2v4" />
            <circle cx="12" cy="16" r="2" />
        </svg>
    );
}
function GlyphCollector() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}
function GlyphUpload() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 16V7" />
            <path d="M8.5 10.5L12 7l3.5 3.5" />
            <rect x="4" y="16" width="16" height="4" rx="1.5" />
        </svg>
    );
}
function GlyphPrice() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="8" />
            <path d="M9.5 10.5c0-1 1-1.8 2.5-1.8s2.5.7 2.5 1.8-1 1.8-2.5 1.8-2.5.8-2.5 1.8 1 1.8 2.5 1.8 2.5-.8 2.5-1.8" />
        </svg>
    );
}
function GlyphShare() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.7 10.8l6.5-4M8.7 13.2l6.5 4" />
        </svg>
    );
}
function GlyphShield() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
}
function GlyphLock() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
    );
}
function GlyphBot() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="8" width="18" height="12" rx="3" />
            <circle cx="9" cy="14" r="1.5" fill="currentColor" />
            <circle cx="15" cy="14" r="1.5" fill="currentColor" />
            <path d="M12 2v6M7 5h10" />
        </svg>
    );
}
function GlyphReceipt() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 012-2z" />
            <path d="M9 9h6M9 13h6" />
        </svg>
    );
}
function GlyphFeed() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4" width="18" height="14" rx="4" />
            <path d="M7 9h10M7 13h6" />
        </svg>
    );
}

/* ═══════════════════════════════════════════════
   1  ·  USE CASES — Persona Cards
   ═══════════════════════════════════════════════ */
function UseCaseCard({
    icon,
    gradient,
    title,
    tag,
    points,
}: {
    icon: ReactNode;
    gradient: string;
    title: string;
    tag: string;
    points: string[];
}) {
    return (
        <motion.div
            variants={cardVariants}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02] transition-all duration-400 hover:border-white/15 hover:shadow-[0_0_40px_rgba(0,82,255,0.08)]"
        >
            {/* Top gradient line */}
            <div className={`h-[2px] w-full bg-gradient-to-r ${gradient}`} />
            <div className="flex flex-1 flex-col p-7">
                <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                    {icon}
                </div>
                <span className="font-mono-brand mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    {tag}
                </span>
                <h3 className="font-display text-xl font-bold tracking-tight text-white">{title}</h3>
                <ul className="mt-4 flex-1 space-y-2.5">
                    {points.map((p) => (
                        <li key={p} className="flex items-start gap-2 text-sm leading-relaxed text-slate-300">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400/60" />
                            {p}
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
}

function UseCasesSection() {
    return (
        <Section className="pb-24 pt-4">
            <SectionBadge>Who It&apos;s For</SectionBadge>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem]">
                One Platform. Three Superpowers.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 max-w-2xl text-lg text-slate-400">
                Whether you&apos;re a crypto-native artist, an event organizer throwing a party, or a collector hunting mints — Droppit is built for you.
            </motion.p>
            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
                <UseCaseCard
                    icon={<GlyphArt />}
                    gradient="from-[#0052FF] to-[#22D3EE]"
                    tag="Creators"
                    title="Launch Drops in Minutes"
                    points={[
                        "Upload art → set price & supply → publish on Base",
                        "Farcaster Frames for in-feed minting",
                        "Or tag @droppit on Warpcast — the AI does the rest",
                    ]}
                />
                <UseCaseCard
                    icon={<GlyphEvent />}
                    gradient="from-[#FF4D8D] to-[#FFBD2E]"
                    tag="Event Organizers"
                    title="Immortalize Any Moment"
                    points={[
                        "Free-mint drops for weddings, birthdays, meetups",
                        "QR code — guests scan & claim a Digital Souvenir",
                        "Mint-to-unlock hidden messages for attendees",
                    ]}
                />
                <UseCaseCard
                    icon={<GlyphCollector />}
                    gradient="from-[#7C3AED] to-[#FF4D8D]"
                    tag="Collectors"
                    title="Mint in 1-2 Taps"
                    points={[
                        "Open a link → connect → mint. That's it.",
                        "Shareable receipt & proof of mint",
                        "Gift mints to any wallet address",
                    ]}
                />
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   2  ·  FEATURES BENTO GRID
   ═══════════════════════════════════════════════ */
function BentoCard({
    icon,
    title,
    description,
    className = "",
    children,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <motion.div
            variants={cardVariants}
            className={`group relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-white/15 hover:shadow-[0_0_40px_rgba(0,82,255,0.06)] ${className}`}
        >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#22D3EE]/20 bg-[#0052FF]/15 text-cyan-300 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-[0_0_16px_rgba(34,211,238,0.25)]">
                {icon}
            </div>
            <h3 className="font-display text-lg font-bold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
            {children && <div className="mt-4">{children}</div>}
        </motion.div>
    );
}

function ReceiptMini() {
    return (
        <div className="rounded-2xl border border-cyan-400/15 bg-[#0B1020]/80 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
            <div className="mb-2.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <span>Mint Receipt</span>
                <span className="rounded-full border border-green-400/30 bg-green-500/10 px-2 py-0.5 text-green-400 text-[9px]">
                    Confirmed
                </span>
            </div>
            <div className="grid grid-cols-[48px_1fr] gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] shadow-lg" />
                <div className="space-y-1.5">
                    <div className="h-2 w-32 rounded-full bg-white/15" />
                    <div className="h-2 w-20 rounded-full bg-white/10" />
                    <div className="font-mono-brand text-[9px] text-slate-500">Tx: 0x4f2a...91bd</div>
                </div>
            </div>
        </div>
    );
}

function FeaturesSection() {
    return (
        <Section className="pb-24">
            <SectionBadge>Core Features</SectionBadge>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Everything You Need to Drop
            </motion.h2>
            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-6 md:auto-rows-fr">
                <BentoCard
                    className="md:col-span-4"
                    icon={<GlyphFeed />}
                    title="Feed-Native Distribution"
                    description="Farcaster Frames and OG cards let collectors mint directly from the timeline. Share a link anywhere — it just works."
                />
                <BentoCard
                    className="md:col-span-2"
                    icon={<GlyphShield />}
                    title="Frozen Metadata"
                    description="Artwork & metadata are immutable after publish. No bait-and-switch, ever."
                />
                <BentoCard
                    className="md:col-span-2"
                    icon={<GlyphLock />}
                    title="Mint-to-Unlock"
                    description="Hide secret messages behind a mint wall. Only collectors who own the token can reveal them."
                />
                <BentoCard
                    className="md:col-span-4"
                    icon={<GlyphReceipt />}
                    title="Shareable Mint Receipt"
                    description="Every mint gets a proof-of-mint receipt card — share it on Warpcast or X to flex and drive more mints."
                >
                    <ReceiptMini />
                </BentoCard>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   3  ·  HOW IT WORKS — Connected Steps
   ═══════════════════════════════════════════════ */
function StepItem({
    num,
    title,
    description,
    icon,
    isLast = false,
}: {
    num: number;
    title: string;
    description: string;
    icon: ReactNode;
    isLast?: boolean;
}) {
    return (
        <motion.div variants={cardVariants} className="group relative flex gap-5">
            {/* Connector line + numbered circle */}
            <div className="relative flex flex-col items-center">
                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#0052FF]/40 bg-[#0052FF]/15 text-[#22D3EE] shadow-[0_0_20px_rgba(0,82,255,0.15)] transition-all duration-300 group-hover:scale-110 group-hover:border-[#22D3EE]/50 group-hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                    {icon}
                </div>
                {!isLast && (
                    <div className="mt-2 flex-1">
                        <div className="mx-auto h-full w-[1px] bg-gradient-to-b from-[#0052FF]/40 to-transparent" />
                    </div>
                )}
            </div>
            {/* Text */}
            <div className={`${!isLast ? "pb-10" : ""}`}>
                <span className="font-mono-brand text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0052FF]">
                    Step {num}
                </span>
                <h3 className="font-display mt-1 text-lg font-bold text-white">{title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{description}</p>
            </div>
        </motion.div>
    );
}

function HowItWorksSection() {
    return (
        <Section id="how-it-works" className="pb-24">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
                {/* Left — Copy */}
                <div>
                    <SectionBadge>How It Works</SectionBadge>
                    <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                        From upload to mint link in under 3 minutes.
                    </motion.h2>
                    <motion.p variants={fadeUp} className="mt-4 max-w-lg text-lg text-slate-400">
                        No dashboards. No complexity. Connect your wallet, upload your art, and share. Droppit handles OG cards, Farcaster Frames, and the smart contract.
                    </motion.p>
                    <motion.div variants={fadeUp} className="mt-8">
                        <Link
                            href="/create"
                            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0052FF] to-[#22D3EE] px-6 py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(0,82,255,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,82,255,0.4)]"
                        >
                            Try It Now
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                            </svg>
                        </Link>
                    </motion.div>
                </div>

                {/* Right — Steps */}
                <div className="relative">
                    <StepItem
                        num={1}
                        icon={<GlyphUpload />}
                        title="Upload Your Art"
                        description="Drop a PNG, JPG, or WebP. Droppit validates file type and pins to IPFS automatically."
                    />
                    <StepItem
                        num={2}
                        icon={<GlyphPrice />}
                        title="Set Price & Supply"
                        description="Fixed editions from 1–10,000. Set your price — protocol fees are shown transparently upfront."
                    />
                    <StepItem
                        num={3}
                        icon={<GlyphShare />}
                        title="Share the Link"
                        description="Get a beautiful share link with auto-generated OG cards and Farcaster Frame — ready for every feed."
                        isLast
                    />
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   4  ·  AI-POWERED — Agentic Section
   ═══════════════════════════════════════════════ */
function AgenticSection() {
    return (
        <Section className="pb-24">
            <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.06] bg-gradient-to-br from-[#0052FF]/8 via-[#7C3AED]/5 to-[#FF4D8D]/5">
                {/* Background orb */}
                <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#7C3AED]/10 blur-[80px]" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[#0052FF]/12 blur-[60px]" />

                <div className="relative z-10 grid grid-cols-1 gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:items-center lg:p-16">
                    {/* Left copy */}
                    <div>
                        <motion.div variants={fadeUp} className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
                            <GlyphBot />
                            AI-Powered
                        </motion.div>
                        <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                            Meet Your Sassy Hype-man.
                        </motion.h2>
                        <motion.p variants={fadeUp} className="mt-4 max-w-lg text-lg leading-relaxed text-slate-400">
                            Tag <span className="font-semibold text-violet-300">@droppit</span> on Farcaster with your artwork and deploy instructions. Our AI agent parses your cast, drafts the drop, and returns a deploy frame — all from one cast.
                        </motion.p>
                        <motion.div variants={fadeUp} className="mt-8 space-y-3">
                            {[
                                "Natural-language drop creation from Warpcast",
                                "AI parses title, editions, price — validates everything",
                                "Deploy frame right there in the feed",
                                "Milestone celebration posts when drops take off",
                            ].map((item) => (
                                <div key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                                    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" fill="currentColor">
                                        <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.72a.75.75 0 00-1.06.02L7.4 8.78 5.84 7.22a.75.75 0 00-1.08 1.04l2.1 2.1a.75.75 0 001.07-.01l3.3-3.55a.75.75 0 00-.01-1.08z" />
                                    </svg>
                                    {item}
                                </div>
                            ))}
                        </motion.div>
                    </div>

                    {/* Right — Example cast */}
                    <motion.div variants={scaleIn} className="flex justify-center lg:justify-end">
                        <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0B1020]/80 p-5 shadow-[0_0_40px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                            {/* Fake cast */}
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#FFBD2E]" />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">artist.eth</span>
                                        <span className="text-xs text-slate-500">· just now</span>
                                    </div>
                                    <p className="mt-1.5 text-sm text-slate-300">
                                        <span className="text-violet-400">@droppit</span> deploy this. Midnight Run, 100 editions, 0.001 ETH. 🔥
                                    </p>
                                    {/* Fake image */}
                                    <div className="mt-3 h-36 w-full rounded-xl bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center text-slate-500">
                                        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.2">
                                            <rect x="3" y="3" width="18" height="18" rx="4" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <path d="M21 15l-5-5L5 21" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            {/* AI reply */}
                            <div className="mt-4 ml-[52px] rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/[0.06] p-3">
                                <div className="flex items-center gap-2 text-xs text-violet-300">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
                                    </span>
                                    Droppit Agent
                                </div>
                                <p className="mt-1.5 text-xs text-slate-300">
                                    LFG! 🔥 <strong className="text-white">Midnight Run</strong> — 100 editions at 0.001 ETH. Draft created. Tap Deploy to go live! 🚀
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   5  ·  TRANSPARENT PRICING
   ═══════════════════════════════════════════════ */
function PricingSection() {
    return (
        <Section className="pb-24">
            <SectionBadge>Pricing</SectionBadge>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Transparent. No Surprises.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 max-w-2xl text-lg text-slate-400">
                All costs are shown upfront before you deploy. No hidden fees, no gotchas. Network gas varies with Base conditions.
            </motion.p>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    {
                        label: "Deploy",
                        value: "~$0.50",
                        sub: "gas on Base",
                        detail: "One transaction. Creator pays at publish.",
                        accent: "from-[#0052FF] to-[#22D3EE]",
                    },
                    {
                        label: "Protocol Fee",
                        value: PROTOCOL_FEE_PER_MINT_LABEL,
                        sub: "per mint",
                        detail: "Flat fee per mint. Covers infra & IPFS.",
                        accent: "from-[#7C3AED] to-[#FF4D8D]",
                    },
                    {
                        label: "Creator Revenue",
                        value: "100%",
                        sub: "of mint price",
                        detail: "You keep everything. Fee is separate.",
                        accent: "from-[#22D3EE] to-[#28C840]",
                    },
                    {
                        label: "Collector Gas",
                        value: "Base L2",
                        sub: "network gas",
                        detail: "Collectors pay standard L2 gas to mint.",
                        accent: "from-[#FF4D8D] to-[#FFBD2E]",
                    },
                ].map((card) => (
                    <motion.div
                        key={card.label}
                        variants={cardVariants}
                        className="group relative overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/15"
                    >
                        <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${card.accent}`} />
                        <span className="font-mono-brand text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                            {card.label}
                        </span>
                        <p className="font-display mt-3 text-3xl font-bold text-white">{card.value}</p>
                        <p className="text-sm text-slate-400">{card.sub}</p>
                        <p className="mt-3 text-xs leading-relaxed text-slate-500">{card.detail}</p>
                    </motion.div>
                ))}
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   6  ·  TRUST & SECURITY STRIP
   ═══════════════════════════════════════════════ */
function TrustSection() {
    const signals = [
        { icon: <GlyphShield />, title: "EIP-1167 Clones", desc: "Each drop gets its own contract address on Base" },
        { icon: <GlyphLock />, title: "Metadata Frozen", desc: "Artwork & token URI are immutable after publish" },
        { icon: <GlyphPrice />, title: "Exact Payment", desc: "No overpay/refund — contract rejects wrong amounts" },
        { icon: <GlyphReceipt />, title: "Full Transparency", desc: "Creator, factory & implementation addresses shown" },
    ];

    return (
        <Section className="pb-24">
            <div className="rounded-[2rem] border border-white/[0.06] bg-gradient-to-r from-white/[0.02] to-white/[0.04] p-8 sm:p-12">
                <div className="mb-8 text-center">
                    <SectionBadge>Trust & Security</SectionBadge>
                    <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                        Onchain-First. Trust-Verified.
                    </motion.h2>
                    <motion.p variants={fadeUp} className="mx-auto mt-3 max-w-xl text-slate-400">
                        Every drop is a real smart contract. Every detail is verifiable on Base. No custody, no compromise.
                    </motion.p>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {signals.map((s) => (
                        <motion.div
                            key={s.title}
                            variants={cardVariants}
                            className="group flex flex-col items-center rounded-2xl bg-white/[0.02] p-5 text-center transition-all duration-300 hover:bg-white/[0.05]"
                        >
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#22D3EE]/15 bg-[#22D3EE]/8 text-[#22D3EE] transition-transform duration-300 group-hover:scale-110">
                                {s.icon}
                            </div>
                            <h4 className="font-display text-sm font-bold text-white">{s.title}</h4>
                            <p className="mt-1.5 text-xs text-slate-500">{s.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   7  ·  CTA BANNER
   ═══════════════════════════════════════════════ */
function CtaBanner() {
    return (
        <Section className="pb-24">
            <motion.div
                variants={scaleIn}
                className="relative overflow-hidden rounded-[2rem] border border-white/[0.06]"
            >
                {/* Gradient bg */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0052FF]/20 via-[#7C3AED]/15 to-[#FF4D8D]/10" />
                <div className="pointer-events-none absolute -top-20 right-20 h-60 w-60 rounded-full bg-[#22D3EE]/10 blur-[80px]" />

                <div className="relative z-10 flex flex-col items-center px-8 py-16 text-center sm:py-20">
                    <motion.h2 variants={fadeUp} className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                        Ready to Drop?
                    </motion.h2>
                    <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
                        Join creators, event organizers, and collectors on Base. Launch your first drop in under 3 minutes.
                    </motion.p>
                    <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
                        <div className="relative group">
                            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] opacity-80 blur-md transition-opacity group-hover:opacity-100 cta-glow" />
                            <Link
                                href="/create"
                                className="relative rounded-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] px-8 py-3.5 text-base font-bold text-white transition-transform hover:scale-[1.02]"
                            >
                                Start a Drop
                            </Link>
                        </div>
                        <a
                            href={BRAND_LINKS.warpcast}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-white/40 hover:text-white"
                        >
                            Follow on Warpcast
                        </a>
                    </motion.div>
                </div>
            </motion.div>
        </Section>
    );
}

/* ═══════════════════════════════════════════════
   8  ·  FOOTER
   ═══════════════════════════════════════════════ */
function Footer() {
    return (
        <motion.footer
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="border-t border-white/[0.06] bg-[#03050d]/90"
        >
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[2fr_1fr_1fr] lg:px-8">
                {/* Brand Column */}
                <div>
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center">
                            <svg viewBox="0 0 64 64" fill="none" className="h-6 w-6 drop-shadow-[0_0_4px_rgba(0,82,255,0.5)]">
                                <defs>
                                    <linearGradient id="footerDropGrad" x1="32" y1="8" x2="32" y2="58" gradientUnits="userSpaceOnUse">
                                        <stop offset="0%" stopColor="#0052FF" />
                                        <stop offset="100%" stopColor="#22D3EE" />
                                    </linearGradient>
                                </defs>
                                <path d="M32 6 C32 6 12 30 12 40 C12 51.046 20.954 60 32 60 C43.046 60 52 51.046 52 40 C52 30 32 6 32 6Z" fill="url(#footerDropGrad)" />
                                <ellipse cx="26" cy="30" rx="6" ry="10" fill="white" opacity="0.2" transform="rotate(-15 26 30)" />
                            </svg>
                        </div>
                        <span className="font-display text-lg font-bold tracking-tight">{BRAND.name}</span>
                    </div>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
                        Agentic drop infrastructure on Base. Launch NFT drops via Farcaster AI or the web — no code required.
                    </p>
                    <div className="mt-5 flex items-center gap-3">
                        <a href={BRAND_LINKS.warpcast} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70" aria-label="Warpcast">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M4 3h16l-2 8h2l-2 8H6L4 11h2L4 3z" /></svg>
                        </a>
                        <a href={BRAND_LINKS.twitter} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70" aria-label="X / Twitter">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        </a>
                        <a href={BRAND_LINKS.github} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70" aria-label="GitHub">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                        </a>
                    </div>
                </div>

                {/* Product Column */}
                <div>
                    <h4 className="font-display text-sm font-bold uppercase tracking-wider text-white/70">Product</h4>
                    <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
                        <li><Link href="/create" className="transition-colors hover:text-white/70">Start a Drop</Link></li>
                        <li><a href="#how-it-works" className="transition-colors hover:text-white/70">How It Works</a></li>
                        <li><a href={BRAND_LINKS.docs} target="_blank" rel="noreferrer" className="transition-colors hover:text-white/70">Documentation</a></li>
                    </ul>
                </div>

                {/* Legal Column */}
                <div>
                    <h4 className="font-display text-sm font-bold uppercase tracking-wider text-white/70">Trust</h4>
                    <ul className="mt-4 space-y-2.5 text-xs text-slate-500 leading-relaxed">
                        <li>Link-first. No public feed in MVP.</li>
                        <li>No login required to browse info.</li>
                        <li>No KYC or identity claims.</li>
                        <li>All costs are estimates.</li>
                    </ul>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-white/[0.04]">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
                    <p className="text-xs text-slate-600">
                        © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-600">
                        <span className="rounded-full border border-[#0052FF]/30 bg-[#0052FF]/10 px-2.5 py-0.5 text-[#0052FF] font-medium">
                            Built on Base
                        </span>
                    </div>
                </div>
            </div>
        </motion.footer>
    );
}

/* ═══════════════════════════════════════════════
    EXPORT — Full BelowTheFold
   ═══════════════════════════════════════════════ */
export function BelowTheFold() {
    return (
        <>
            <UseCasesSection />
            <FeaturesSection />
            <HowItWorksSection />
            <AgenticSection />
            <PricingSection />
            <TrustSection />
            <CtaBanner />
            <Footer />
        </>
    );
}
