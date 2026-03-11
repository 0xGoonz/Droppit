"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export function StatsStrip() {
    const [stats, setStats] = useState<{ dropsLaunched: number; nftsMinted: number; creators: number } | null>(null);

    useEffect(() => {
        // Fetch public stats on mount
        let active = true;
        fetch("/api/stats/public", { cache: "no-store" })
            .then(res => res.json())
            .then(data => {
                if (active && !data.error) setStats(data);
            })
            .catch(err => {
                console.warn("Failed to fetch public stats:", err);
            });
        
        return () => { active = false; };
    }, []);

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);
    };

    if (!stats) {
        return <div className="h-14 w-full sm:h-16" />; // Skeleton space reservation
    }

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.2, 0.75, 0.2, 1] }}
            className="w-full border-y border-white/[0.04] bg-white/[0.01] backdrop-blur-md relative z-10"
        >
            <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-4 px-4 py-4 text-[13px] font-medium text-slate-400 sm:gap-8 sm:py-5 sm:text-base">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-white drop-shadow-md">{formatNumber(stats.dropsLaunched)}</span>
                    <span>Drops</span>
                </div>
                <div className="h-1 w-1 shrink-0 rounded-full bg-[#0052FF]/50" />
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[#22D3EE] drop-shadow-md">{formatNumber(stats.nftsMinted)}</span>
                    <span className="text-slate-300">Minted</span>
                </div>
                <div className="h-1 w-1 shrink-0 rounded-full bg-[#FF4D8D]/50" />
                <div className="flex items-center gap-2">
                    <span className="font-bold text-white drop-shadow-md">{formatNumber(stats.creators)}</span>
                    <span>Creators</span>
                </div>
            </div>
        </motion.div>
    );
}
