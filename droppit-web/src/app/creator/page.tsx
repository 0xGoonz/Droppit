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
    Identity,
    Address,
    EthBalance,
} from "@coinbase/onchainkit/identity";
import { BrandLockup } from "@/components/brand/BrandLockup";

type CreatorDrop = {
    id: string;
    title: string;
    status: "DRAFT" | "LIVE" | string;
    contract_address: string | null;
    created_at: string;
    edition_size: number;
    mint_price: string;
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
                const res = await fetch(`/api/creator/drops?wallet=${address}`);
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
        <div className="min-h-screen bg-[#05070f] text-white">
            <nav className="p-6 flex justify-between items-center max-w-6xl mx-auto">
                <BrandLockup markSize={24} wordmarkClassName="text-xl font-bold tracking-tight" />
                <div className="flex items-center gap-3">
                    <Link href="/create" className="px-4 py-2 text-sm rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity">
                        Create New Drop
                    </Link>
                    <Wallet>
                        <ConnectWallet className="bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded-full !min-w-[140px] text-sm font-medium transition-all">
                            <Avatar className="h-5 w-5" />
                            <Name />
                        </ConnectWallet>
                        <WalletDropdown className="bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                            <Identity className="px-4 pt-4 pb-2 text-white hover:bg-white/5 transition-colors" hasCopyAddressOnClick>
                                <Avatar className="h-10 w-10 ring-2 ring-purple-500/50" />
                                <Name className="text-white font-bold" />
                                <Address className="text-gray-400 font-mono text-sm" />
                                <EthBalance className="text-purple-400 font-bold" />
                            </Identity>
                            <div className="h-px bg-white/10 w-full" />
                            <WalletDropdownDisconnect className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold" text="Disconnect" />
                        </WalletDropdown>
                    </Wallet>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-20">
                <div className="mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold">Creator Hub</h1>
                    <p className="text-gray-400 mt-2">Manage your drops and jump straight to stats.</p>
                </div>

                {!address && !isConnecting && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                        <h2 className="text-xl font-semibold mb-2">Connect your wallet</h2>
                        <p className="text-gray-400 mb-4">Sign in to view your drops and creator stats.</p>
                    </div>
                )}

                {(loading || isConnecting) && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                        <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto mb-3"></div>
                        <p className="text-gray-400">Loading your drops...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-red-200">
                        {error}
                    </div>
                )}

                {!loading && !error && address && drops.length === 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                        <h2 className="text-xl font-semibold mb-2">No drops yet</h2>
                        <p className="text-gray-400 mb-6">Create your first drop to start tracking stats.</p>
                        <Link href="/create" className="px-5 py-2 rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity">
                            Create New Drop
                        </Link>
                    </div>
                )}

                {!loading && !error && drops.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {drops.map((drop) => {
                            const isLive = drop.status === "LIVE" && !!drop.contract_address;
                            return (
                                <div key={drop.id} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        <h3 className="font-semibold text-lg truncate">{drop.title || `Drop ${drop.id.slice(0, 8)}`}</h3>
                                        <span className={`text-xs px-2 py-1 rounded-full border ${drop.status === "LIVE" ? "border-green-500/40 text-green-300 bg-green-500/10" : "border-yellow-500/40 text-yellow-300 bg-yellow-500/10"}`}>
                                            {drop.status}
                                        </span>
                                    </div>

                                    <div className="text-sm text-gray-400 space-y-1 mb-4">
                                        <p>Supply: <span className="text-gray-200">{drop.edition_size}</span></p>
                                        <p>Price: <span className="text-gray-200">{formatEther(BigInt(drop.mint_price || "0"))} ETH</span></p>
                                        <p>Created: <span className="text-gray-200">{new Date(drop.created_at).toLocaleString()}</span></p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {drop.status === "DRAFT" && (
                                            <Link href={`/create?draftId=${drop.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                                Continue Draft
                                            </Link>
                                        )}
                                        {isLive && (
                                            <>
                                                <Link href={`/drop/base/${drop.contract_address}`} className="px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                                    View Mint
                                                </Link>
                                                <Link href={`/drop/base/${drop.contract_address}/stats`} className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors">
                                                    View Stats
                                                </Link>
                                            </>
                                        )}
                                        {!isLive && drop.status !== "DRAFT" && (
                                            <span className="px-3 py-1.5 text-sm rounded-lg bg-white/10 text-gray-400">No actions available</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
