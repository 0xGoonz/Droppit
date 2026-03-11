import React, { Dispatch, SetStateAction } from 'react';
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DropFormData } from "./types";

interface Step3IdentityProps {
    formData: DropFormData;
    setFormData: Dispatch<SetStateAction<DropFormData>>;
    identityVerified: boolean;
    isLinkingIdentity: boolean;
    handleLinkIdentity: () => void;
    handleNext: () => void;
}

export function Step3Identity({
    formData,
    setFormData,
    identityVerified,
    isLinkingIdentity,
    handleLinkIdentity,
    handleNext
}: Step3IdentityProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#0052FF]/25 bg-[#0052FF]/10">
                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                </div>
                <h3 className="font-display text-xl font-bold mb-2">Creator Identity</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">Link a Farcaster handle via wallet signature. This is optional - not KYC.</p>
            </div>

            <div className="rounded-2xl border border-[#0052FF]/15 bg-gradient-to-b from-[#0052FF]/[0.05] to-transparent p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[#22D3EE]/80 mb-2">Handle / Username</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#0052FF]/50 font-mono">@</span>
                        <input
                            type="text"
                            value={formData.farcasterHandle}
                            onChange={(e) => setFormData({ ...formData, farcasterHandle: e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '') })}
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all font-mono disabled:opacity-50"
                            placeholder="e.g. jesse.base"
                            disabled={identityVerified}
                        />
                    </div>
                </div>

                <div className="pt-2">
                    {identityVerified ? (
                        <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/[0.06] p-4 text-green-400">
                            <svg viewBox="0 0 16 16" className="h-5 w-5 shrink-0" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.72a.75.75 0 00-1.06.02L7.4 8.78 5.84 7.22a.75.75 0 00-1.08 1.04l2.1 2.1a.75.75 0 001.07-.01l3.3-3.55a.75.75 0 00-.01-1.08z" /></svg>
                            <span className="font-semibold text-sm">Linked to @{formData.farcasterHandle}</span>
                        </div>
                    ) : (
                        <Button
                            variant="accent"
                            size="full"
                            onClick={handleLinkIdentity}
                            disabled={!formData.farcasterHandle || isLinkingIdentity}
                            isLoading={isLinkingIdentity}
                        >
                            {isLinkingIdentity ? "Signing..." : "Link handle via signature"}
                        </Button>
                    )}
                </div>

                <p className="text-[11px] text-slate-600 text-center leading-relaxed mt-4">
                    Wallet-signature proof only. Not official Farcaster verification and not KYC.
                </p>
            </div>

            {!identityVerified && (
                <div className="text-center mt-4">
                    <button onClick={handleNext} className="text-sm text-slate-500 hover:text-white underline decoration-white/20 transition-colors">Skip and Continue Anonymously</button>
                </div>
            )}
        </div>
    );
}
