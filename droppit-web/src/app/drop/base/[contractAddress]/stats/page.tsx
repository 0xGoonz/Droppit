'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import Link from 'next/link';
import { useChainPreference } from '@/providers/OnchainKitProvider';
import { BrandLockup } from '@/components/brand/BrandLockup';

interface StatsResponse {
    drop: {
        id: string;
        status: string;
        contractAddress: string | null;
        editionSize: number;
        mintPriceEth: string;
    };
    traffic: {
        totalViews: number;
        uniqueVisitors: number;
        uniqueConnectedWallets: number;
        conversionRate: number;
    };
    supply: {
        totalMinted: number;
        remaining: number;
        editionSize: number;
    };
    revenue: {
        creatorRevenueEth: string;
        protocolRevenueEth: string;
    };
    referrers: { ref: string; count: number }[];
}

export default function DropStatsPage({ params }: { params: Promise<{ contractAddress: string }> }) {
    const resolvedParams = use(params);
    const contractAddress = resolvedParams.contractAddress;
    const { address, isConnecting } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { selectedChain, selectedChainId, setSelectedChainId, hasSelectedChainContractConfig } = useChainPreference();

    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (isConnecting) return;

        if (!address) {
            setLoading(false);
            setError("Wallet not connected");
            return;
        }

        const fetchStats = async () => {
            if (isFetchingRef.current) return;
            isFetchingRef.current = true;
            setLoading(true);
            setError(null);
            try {
                const nonceRes = await fetch('/api/stats/auth/nonce', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet: address, contractAddress }),
                });

                const noncePayload = await nonceRes.json();
                if (!nonceRes.ok || !noncePayload?.nonce) {
                    setError(noncePayload?.error || 'Failed to allocate stats challenge.');
                    setLoading(false);
                    return;
                }

                const nonce = noncePayload.nonce as string;
                const signature = await signMessageAsync({ message: nonce });

                const res = await fetch(`/api/stats/${contractAddress}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: address,
                        signature,
                        nonce,
                    }),
                });

                if (!res.ok) {
                    const errPayload = await res.json().catch(() => ({}));
                    if (res.status === 403) {
                        setError(errPayload?.error || "Not authorized: You are not the drop creator.");
                    } else if (res.status === 401) {
                        setError(errPayload?.error || "Stats access requires a signed wallet challenge.");
                    } else if (res.status === 404) {
                        setError("Drop not found.");
                    } else {
                        setError(errPayload?.error || "Failed to load stats.");
                    }
                    setLoading(false);
                    return;
                }
                const data = await res.json();
                setStats(data);
            } catch (err) {
                console.error("Error fetching stats:", err);
                setError("An error occurred while fetching stats.");
            } finally {
                isFetchingRef.current = false;
                setLoading(false);
            }
        };

        fetchStats();
    }, [contractAddress, address, isConnecting, signMessageAsync]);

    if (loading || isConnecting) {
        return (
            <div className="min-h-screen bg-[#05070f] text-white flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-400">Loading Drop Stats...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#05070f] text-white flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="font-display text-2xl font-bold mb-2">Access Denied</h1>
                <p className="text-slate-400 mb-8 max-w-md text-center">{error}</p>
                <Link href={`/drop/base/${contractAddress}`} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors">
                    Back to Mint Page
                </Link>
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className="min-h-screen bg-[#05070f] text-white p-4 sm:p-8">
            <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,82,255,0.16),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.14),transparent_32%),radial-gradient(circle_at_65%_85%,rgba(124,58,237,0.12),transparent_36%)]" />
            <div className="relative z-10 max-w-4xl mx-auto mt-10 sm:mt-14">
                <div className="mb-8 flex items-center justify-between gap-4">
                    <BrandLockup markSize={24} wordmarkClassName="text-xl font-bold tracking-tight" />
                    <Link
                        href={`/drop/base/${contractAddress}`}
                        className="px-4 py-2 rounded-full border border-[#22D3EE]/40 bg-[#0052FF]/20 hover:bg-[#0052FF]/35 text-sm font-semibold transition-colors inline-block text-center"
                    >
                        View Mint Page
                    </Link>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="font-display text-3xl font-bold mb-2">Creator Insights</h1>
                        <p className="text-slate-400">Analytics for Drop {stats.drop.id.slice(0, 8)}... &middot; <span className="text-cyan-300 font-medium">{stats.drop.status}</span> &middot; {selectedChain.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono-brand">
                            <span>Chain</span>
                            <select
                                value={selectedChainId}
                                onChange={(event) => setSelectedChainId(Number(event.target.value) as 8453 | 84532)}
                                className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                            >
                                <option value="8453">Base</option>
                                <option value="84532">Base Sepolia</option>
                            </select>
                        </label>
                    </div>
                </div>

                {!hasSelectedChainContractConfig && (
                    <div className="mb-6 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs font-mono-brand">
                        {selectedChain.name} contract config is missing. Deploy and mint actions are disabled on this chain.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_14px_38px_rgba(2,8,23,0.32)]">
                        <h3 className="text-slate-400 text-sm font-medium mb-1">Views</h3>
                        <div className="text-3xl font-bold mb-4">{stats.traffic.totalViews}</div>
                        <div className="flex justify-between items-end border-t border-white/10 pt-4 mt-4 text-sm">
                            <span className="text-slate-500">Unique visitors</span>
                            <span className="font-mono-brand">{stats.traffic.uniqueVisitors}</span>
                        </div>
                        <div className="flex justify-between items-end mt-2 text-sm">
                            <span className="text-slate-500">Conv. Rate</span>
                            <span className="text-green-400 font-medium">{stats.traffic.conversionRate.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_14px_38px_rgba(2,8,23,0.32)]">
                        <h3 className="text-slate-400 text-sm font-medium mb-1">Minted</h3>
                        <div className="text-3xl font-bold mb-1">{stats.supply.totalMinted}</div>
                        <p className="text-sm text-slate-500 mb-4">/ {stats.supply.editionSize} editions</p>

                        <div className="w-full bg-black/50 rounded-full h-2 mt-4">
                            <div
                                className="h-2 rounded-full bg-gradient-to-r from-[#0052FF] via-[#22D3EE] to-[#7C3AED]"
                                style={{ width: `${(stats.supply.totalMinted / stats.supply.editionSize) * 100}%` }}
                            ></div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 text-right">{stats.supply.remaining} remaining</div>
                    </div>

                    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_14px_38px_rgba(2,8,23,0.32)]">
                        <h3 className="text-slate-400 text-sm font-medium mb-1">Creator Revenue</h3>
                        <div className="text-3xl font-bold mb-4">{Number(stats.revenue.creatorRevenueEth).toFixed(4)} <span className="text-sm font-normal text-slate-500">ETH</span></div>
                        <div className="flex justify-between items-end border-t border-white/10 pt-4 mt-4 text-sm">
                            <span className="text-slate-500">Asset Price</span>
                            <span className={Number(stats.drop.mintPriceEth) === 0 ? "text-green-400 font-bold font-mono-brand" : "font-mono-brand"}>{Number(stats.drop.mintPriceEth) === 0 ? "Free mint" : `${stats.drop.mintPriceEth} ETH`}</span>
                        </div>
                    </div>

                </div>

                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 overflow-hidden shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_14px_38px_rgba(2,8,23,0.32)]">
                    <h2 className="font-display text-xl font-bold mb-4">Top Referrers</h2>
                    {stats.referrers.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr>
                                        <th className="border-b border-white/10 py-3 text-sm font-medium text-slate-400 w-12">Rank</th>
                                        <th className="border-b border-white/10 py-3 text-sm font-medium text-slate-400">Referrer Identifier (Code or Address)</th>
                                        <th className="border-b border-white/10 py-3 text-sm font-medium text-slate-400 text-right">Mints Driven</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.referrers.map((referrer, idx) => (
                                        <tr key={referrer.ref} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="border-b border-white/5 py-4 text-slate-500 font-mono-brand text-sm">#{idx + 1}</td>
                                            <td className="border-b border-white/5 py-4 font-mono-brand text-sm truncate max-w-[200px] sm:max-w-none">{referrer.ref}</td>
                                            <td className="border-b border-white/5 py-4 font-bold text-right">{referrer.count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-500">
                            No external referrers found for this drop yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
