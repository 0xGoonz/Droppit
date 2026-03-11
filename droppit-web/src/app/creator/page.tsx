'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
    WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
    Avatar,
    Name,
} from "@coinbase/onchainkit/identity";
import { CreatorDropCardSkeleton } from "@/components/Skeleton";
import { normalizeIpfsToHttp } from "@/lib/og-utils";
import { AppShell } from "@/components/layout/AppShell";
import { AppNav } from "@/components/layout/AppNav";

type CreatorDrop = {
    id: string;
    title: string;
    status: "DRAFT" | "LIVE" | string;
    contract_address: string | null;
    created_at: string;
    edition_size: number;
    mint_price: string;
    image_url: string | null;
};

export default function CreatorHubPage() {
    const { address, isConnecting } = useAccount();
    const [drops, setDrops] = useState<CreatorDrop[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isConnecting) return;

        if (!address) {
            setLoading(false);
            setError(null);
            setDrops([]);
            return;
        }

        const fetchDrops = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/creator/drops?wallet=${address}`, {
                    headers: { "x-creator-address": address },
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setError(payload?.error || "Failed to load your drops.");
                    setLoading(false);
                    return;
                }
                setDrops(payload?.drops || []);
            } catch (e) {
                console.error("Failed to load creator drops:", e);
                setError("Failed to load your drops.");
            } finally {
                setLoading(false);
            }
        };

        fetchDrops();
    }, [address, isConnecting]);

    return (
        <AppShell>
            <AppNav 
                actionButton={
                    <Link
                        href="/create"
                        className="lift-hover rounded-full border border-[#22D3EE]/40 bg-[#0052FF]/20 px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-[#0052FF]/35"
                    >
                        Start a Drop
                    </Link>
                }
            />

            <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-28">
                <div className="mb-10">
                    <div className="mb-3 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/70">
                        Creator Hub
                    </div>
                    <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Your Drops</h1>
                    <p className="text-slate-400 mt-2">Manage your drops, track performance, and jump straight to stats.</p>
                </div>

                {!address && !isConnecting && (
                    <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#0052FF]/25 bg-[#0052FF]/10 mb-2">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h2 className="font-display text-2xl font-bold">Connect your Wallet</h2>
                        <p className="text-slate-400 max-w-md">Sign in to view your drops and creator stats.</p>
                        <Wallet>
                            <ConnectWallet className="bg-gradient-to-r from-[#0052FF] to-[#22D3EE] text-white font-bold hover:scale-[1.03] active:scale-95 transition-all shadow-[0_0_30px_rgba(0,82,255,0.35)] px-8 py-3 rounded-full !min-w-[200px]">
                                <Avatar className="h-6 w-6" />
                                <Name />
                            </ConnectWallet>
                        </Wallet>
                    </div>
                )}

                {(loading || isConnecting) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <CreatorDropCardSkeleton key={i} />
                        ))}
                    </div>
                )}

                {error && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6 text-red-200">
                        {error}
                    </div>
                )}

                {!loading && !error && address && drops.length === 0 && (
                    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-10 text-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#0052FF]/20 bg-[#0052FF]/8 text-[#22D3EE] mx-auto mb-4 animate-float shadow-[0_0_30px_rgba(0,82,255,0.15)]">
                            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 5v14M5 12h14" /></svg>
                        </div>
                        <h2 className="font-display text-xl font-bold mb-2">No drops yet</h2>
                        <p className="text-slate-400 mb-6">Create your first drop to start tracking stats.</p>
                        <Link
                            href="/create"
                            className="inline-block rounded-full bg-gradient-to-r from-[#0052FF] to-[#22D3EE] px-6 py-2.5 font-bold text-white transition-all hover:scale-[1.03] active:scale-95 shadow-[0_0_25px_rgba(0,82,255,0.3)]"
                        >
                            Create New Drop
                        </Link>
                    </div>
                )}

                {!loading && !error && drops.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {drops.map((drop) => {
                            const isLive = drop.status === "LIVE" && !!drop.contract_address;
                            return (
                                <div
                                    key={drop.id}
                                    className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-5 transition-all hover:border-white/[0.1] hover:shadow-[0_0_30px_rgba(0,82,255,0.08)]"
                                >
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        {/* Artwork thumbnail */}
                                        {drop.image_url ? (
                                            <img
                                                src={normalizeIpfsToHttp(drop.image_url) || undefined}
                                                alt={drop.title}
                                                className="h-14 w-14 rounded-xl object-cover shrink-0 border border-white/[0.06]"
                                            />
                                        ) : (
                                            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[#0052FF]/20 to-[#22D3EE]/20 border border-white/[0.06] flex items-center justify-center shrink-0">
                                                <span className="text-lg font-bold text-[#22D3EE]/60">{(drop.title || "D")[0].toUpperCase()}</span>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                    <h3 className="font-display font-bold text-lg truncate">{drop.title || `Drop ${drop.id.slice(0, 8)}`}</h3>
                                        </div>
                                        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium ${drop.status === "LIVE"
                                            ? "border-green-500/30 text-green-300 bg-green-500/10"
                                            : "border-yellow-500/30 text-yellow-300 bg-yellow-500/10"
                                            }`}>
                                            {drop.status}
                                        </span>
                                    </div>

                                    <div className="text-sm text-slate-500 space-y-1 mb-4">
                                        <p>Supply: <span className="text-slate-300">{drop.edition_size}</span></p>
                                        <p>Price: <span className={Number(formatEther(BigInt(drop.mint_price || "0"))) === 0 ? "text-[#22D3EE] font-medium" : "text-slate-300"}>{Number(formatEther(BigInt(drop.mint_price || "0"))) === 0 ? "Free mint" : `${formatEther(BigInt(drop.mint_price || "0"))} ETH`}</span></p>
                                        <p>Created: <span className="text-slate-300">{new Date(drop.created_at).toLocaleString()}</span></p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {drop.status === "DRAFT" && (
                                            <Link href={`/create?draftId=${drop.id}`} className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm transition-all hover:bg-white/[0.08] hover:border-white/15">
                                                Continue Draft
                                            </Link>
                                        )}
                                        {isLive && (
                                            <>
                                                <Link href={`/drop/base/${drop.contract_address}`} className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm transition-all hover:bg-white/[0.08] hover:border-white/15">
                                                    View Mint
                                                </Link>
                                                <Link href={`/drop/base/${drop.contract_address}/stats`} className="rounded-lg border border-[#0052FF]/25 bg-[#0052FF]/10 px-3 py-1.5 text-sm font-medium text-[#22D3EE] transition-all hover:bg-[#0052FF]/20">
                                                    View Stats
                                                </Link>
                                            </>
                                        )}
                                        {!isLive && drop.status !== "DRAFT" && (
                                            <span className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm text-slate-500">No actions available</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </AppShell>
    );
}
