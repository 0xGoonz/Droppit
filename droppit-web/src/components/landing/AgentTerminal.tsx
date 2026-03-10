"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const AGENT_LINES = [
    { text: "LFG! 🔥 Drop your masterpiece on Base. No code required.", delay: 40 },
    { text: "Setting up a wedding souvenir drop? Easy. 🥂", delay: 45 },
    { text: "Your Farcaster feed is about to go crazy. 🚀", delay: 38 },
    { text: "Free mints? Paid editions? I got you, fam. 💎", delay: 42 },
    { text: "200 guests, 200 NFTs. One QR code. Let's gooo! 🎉", delay: 36 },
];

export function AgentTerminal() {
    const [currentLineIndex, setCurrentLineIndex] = useState(0);
    const [displayedText, setDisplayedText] = useState("");
    const [isTyping, setIsTyping] = useState(true);
    const [showCursor, setShowCursor] = useState(true);
    const [history, setHistory] = useState<string[]>([]);

    // Cursor blink
    useEffect(() => {
        const cursorInterval = setInterval(() => {
            setShowCursor((prev) => !prev);
        }, 530);
        return () => clearInterval(cursorInterval);
    }, []);

    // Typing effect
    const typeNextLine = useCallback(() => {
        const line = AGENT_LINES[currentLineIndex];
        let charIndex = 0;
        setIsTyping(true);
        setDisplayedText("");

        const typeInterval = setInterval(() => {
            if (charIndex < line.text.length) {
                setDisplayedText(line.text.slice(0, charIndex + 1));
                charIndex++;
            } else {
                clearInterval(typeInterval);
                setIsTyping(false);

                // Pause, then move to next line
                setTimeout(() => {
                    setHistory((prev) => [...prev.slice(-2), line.text]);
                    setCurrentLineIndex((prev) => (prev + 1) % AGENT_LINES.length);
                }, 2400);
            }
        }, line.delay);

        return () => clearInterval(typeInterval);
    }, [currentLineIndex]);

    useEffect(() => {
        const cleanup = typeNextLine();
        return cleanup;
    }, [typeNextLine]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.2, 0.75, 0.2, 1] }}
            className="relative w-full max-w-md"
        >
            {/* Outer glow */}
            <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-[#0052FF]/30 via-[#7C3AED]/20 to-[#22D3EE]/25 opacity-60 blur-2xl" />

            {/* Terminal container */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080c1a]/90 shadow-[0_0_60px_rgba(0,82,255,0.15),0_0_120px_rgba(124,58,237,0.08)] backdrop-blur-xl">
                {/* Title bar */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#28C840] opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#28C840]" />
                        </span>
                        <span className="font-mono text-[11px] font-medium tracking-wider text-white/50 uppercase">
                            Droppit Agent
                        </span>
                    </div>
                </div>

                {/* Terminal body */}
                <div className="px-4 py-4 min-h-[180px] flex flex-col justify-end">
                    {/* History lines */}
                    <AnimatePresence mode="popLayout">
                        {history.map((line, index) => (
                            <motion.div
                                key={`${line}-${index}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 0.4, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.3 }}
                                className="mb-2"
                            >
                                <div className="flex items-start gap-2">
                                    <span className="font-mono text-[11px] text-[#7C3AED]/60 mt-0.5 shrink-0">{'>'}</span>
                                    <p className="font-mono text-[13px] leading-relaxed text-white/30 line-through decoration-white/10">
                                        {line}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Current typing line */}
                    <motion.div
                        key={currentLineIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-start gap-2"
                    >
                        <span className="font-mono text-[11px] text-[#22D3EE] mt-0.5 shrink-0">{'>'}</span>
                        <div className="flex-1">
                            <p className="font-mono text-[13px] leading-relaxed text-white/90">
                                {displayedText}
                                <span
                                    className={`inline-block w-[2px] h-[14px] ml-0.5 align-middle bg-[#22D3EE] transition-opacity duration-100 ${showCursor ? "opacity-100" : "opacity-0"
                                        }`}
                                />
                            </p>
                        </div>
                    </motion.div>

                    {/* Status indicator */}
                    <div className="mt-4 flex items-center gap-2 border-t border-white/[0.04] pt-3">
                        <div className={`h-1.5 w-1.5 rounded-full ${isTyping ? "bg-[#22D3EE] animate-pulse" : "bg-[#28C840]"}`} />
                        <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
                            {isTyping ? "thinking..." : "ready"}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
