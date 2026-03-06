"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { BRAND } from "@/lib/brand";
import { AgentTerminal } from "./AgentTerminal";

/* ── Cycling use-case words ── */
const CYCLE_WORDS = [
    "Farcaster Mini Apps",
    "IRL Events",
    "Digital Souvenirs",
    "Web3 Creators",
];

const CYCLE_COLORS = [
    "from-[#0052FF] to-[#22D3EE]",   // Base blue -> cyan
    "from-[#FF4D8D] to-[#FFBD2E]",   // Pink -> gold
    "from-[#7C3AED] to-[#FF4D8D]",   // Violet -> pink
    "from-[#22D3EE] to-[#28C840]",   // Cyan -> green
];

/* ── Particles ── */
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

/* ── Animation variants ── */
const containerVariants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.15,
        },
    },
};

const fadeUpVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.7, ease: [0.2, 0.75, 0.2, 1] as const },
    },
};

/* ── Cycling Text Component ── */
function CyclingText() {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % CYCLE_WORDS.length);
        }, 2800);
        return () => clearInterval(interval);
    }, []);

    return (
        <span className="relative inline-flex h-[1.15em] min-w-[160px] overflow-hidden align-bottom sm:min-w-[280px] lg:min-w-[340px]">
            {CYCLE_WORDS.map((word, i) => (
                <motion.span
                    key={word}
                    className={`absolute inset-0 bg-gradient-to-r ${CYCLE_COLORS[i]} bg-clip-text text-transparent`}
                    initial={{ y: "100%", opacity: 0, filter: "blur(4px)" }}
                    animate={
                        i === index
                            ? { y: "0%", opacity: 1, filter: "blur(0px)" }
                            : i === (index - 1 + CYCLE_WORDS.length) % CYCLE_WORDS.length
                                ? { y: "-100%", opacity: 0, filter: "blur(4px)" }
                                : { y: "100%", opacity: 0, filter: "blur(4px)" }
                    }
                    transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                >
                    {word}
                </motion.span>
            ))}
        </span>
    );
}

/* ── Main Hero Section ── */
export function HeroSection() {
    return (
        <>
            {/* ── Hero Section — nav is inside so there's no seam ── */}
            <section className="relative">
                {/* ── Nav ── */}
                <motion.nav
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.2, 0.75, 0.2, 1] }}
                    className="relative z-40"
                >
                    <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
                        <BrandLockup markSize={28} wordmarkClassName="text-lg font-bold tracking-tight sm:text-2xl" />
                        <div className="flex items-center gap-2 sm:gap-3">
                            <Link
                                href="#how-it-works"
                                className="text-xs font-medium text-white/75 transition-colors hover:text-white sm:text-sm"
                            >
                                How It Works
                            </Link>
                            <Link
                                href="/create"
                                className="lift-hover inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[#22D3EE]/40 bg-[#0052FF]/20 px-3.5 py-2 text-xs font-semibold text-blue-100 transition-colors hover:bg-[#0052FF]/35 sm:px-4 sm:text-sm"
                            >
                                Start a Drop
                            </Link>
                        </div>
                    </div>
                </motion.nav>
                {/* Background effects — full-width so orbs bleed naturally */}
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
                    <div className="absolute -top-14 left-[10%] h-36 w-36 rounded-full bg-[#22D3EE]/18 blur-3xl parallax-orb-a" />
                    <div className="absolute right-[10%] top-32 h-40 w-40 rounded-full bg-[#FF4D8D]/16 blur-3xl parallax-orb-b" />
                    <div className="absolute -bottom-6 left-[44%] h-28 w-28 rounded-full bg-[#7C3AED]/18 blur-3xl parallax-orb-c" />
                </div>

                {/* Content — constrained width, no overflow-hidden */}
                <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pt-24">
                    <div className="grid grid-cols-1 items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
                        {/* ── Left: Value Proposition ── */}
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <motion.div
                                variants={fadeUpVariants}
                                className="mb-5 inline-flex items-center rounded-full border border-blue-300/35 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100 sm:mb-6"
                            >
                                <span className="relative flex h-2 w-2 mr-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0052FF] opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0052FF]" />
                                </span>
                                Built for Base
                            </motion.div>

                            <motion.h1
                                variants={fadeUpVariants}
                                className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl xl:text-[3.5rem]"
                            >
                                Launch Drops for{" "}
                                <br className="hidden sm:block" />
                                <CyclingText />
                            </motion.h1>

                            <motion.p
                                variants={fadeUpVariants}
                                className="mt-5 max-w-lg text-base leading-relaxed text-slate-300 sm:mt-6 sm:text-xl"
                            >
                                {BRAND.description}
                            </motion.p>

                            <motion.div
                                variants={fadeUpVariants}
                                className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-9 sm:max-w-none sm:flex-row sm:items-center sm:gap-4"
                            >
                                <div className="relative group">
                                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] opacity-80 blur-md transition-opacity group-hover:opacity-100 cta-glow" />
                                    <Link
                                        href="/create"
                                        className="relative inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02] hover:-translate-y-0.5 sm:w-auto sm:px-7 sm:text-base"
                                    >
                                        Start a Drop
                                    </Link>
                                </div>
                                <a
                                    href="#how-it-works"
                                    className="lift-hover inline-flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/90 transition-colors hover:border-white/40 hover:text-white sm:w-auto sm:px-7 sm:text-base"
                                >
                                    See How It Works
                                </a>
                            </motion.div>

                            <motion.div variants={fadeUpVariants} className="mt-5 space-y-2 sm:mt-6">
                                <p className="font-mono-brand text-sm font-medium text-slate-300">
                                    {BRAND.tagline}
                                </p>
                                <p className="text-sm text-slate-400">
                                    No code required. Typical deploy gas on Base is often under $0.50.
                                </p>
                            </motion.div>
                        </motion.div>

                        {/* ── Right: Agent Visual ── */}
                        <div className="flex justify-center lg:justify-end">
                            <AgentTerminal />
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
