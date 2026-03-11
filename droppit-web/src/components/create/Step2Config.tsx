import React, { Dispatch, SetStateAction } from 'react';
import { validateLockedContent } from "@/lib/validation/drops";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { DropFormData } from "./types";

interface Step2ConfigProps {
    formData: DropFormData;
    setFormData: Dispatch<SetStateAction<DropFormData>>;
    setFormError: Dispatch<SetStateAction<string | null>>;
    address?: string;
}

export function Step2Config({
    formData,
    setFormData,
    setFormError,
    address
}: Step2ConfigProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-2">
                <h3 className="font-display text-lg font-bold text-white">Pricing & Config</h3>
                <p className="text-sm text-slate-500">Set your edition size, mint price, and optional locked content.</p>
            </div>
            
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Input
                    label="Edition Size"
                    description="Between 1 and 10,000"
                    type="number"
                    min="1" max="10000"
                    value={formData.editionSize}
                    onChange={(e) => {
                        let val = e.target.value;
                        if (val !== "" && parseInt(val, 10) > 10000) {
                            val = "10000";
                        }
                        setFormData({ ...formData, editionSize: val });
                    }}
                />
                
                <Input
                    label="Mint Price (ETH)"
                    description="Set to 0 for Free Mints"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={formData.mintPrice}
                    onChange={(e) => setFormData({ ...formData, mintPrice: e.target.value })}
                />
            </div>

            <Input
                label="Payout Recipient"
                description="Defaults to your connected wallet."
                type="text"
                value={formData.payoutRecipient}
                onChange={(e) => setFormData({ ...formData, payoutRecipient: e.target.value })}
                className="font-mono"
                placeholder={address ? address : "0x..."}
            />

            <Card variant="highlight" className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#7C3AED]" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                    <h4 className="font-semibold text-[#7C3AED] text-sm">Locked Content (Mint-to-Unlock)</h4>
                </div>
                <p className="text-xs text-slate-500 mb-4">Secret message only visible to wallets that own the NFT. Text only - no URLs.</p>
                <textarea
                    value={formData.lockedContent}
                    onChange={(e) => {
                        const val = e.target.value;
                        const check = validateLockedContent(val);
                        if (!check.valid) {
                            setFormError(check.error);
                        } else {
                            setFormError(null);
                        }
                        setFormData({ ...formData, lockedContent: val });
                    }}
                    maxLength={1000}
                    className="w-full rounded-xl border border-[#7C3AED]/20 bg-[#0B1020]/80 px-4 py-3 text-[#22D3EE] font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-[#7C3AED]/40 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] transition-all h-32 resize-none"
                    placeholder="e.g. The secret password for the event is 'BASE'"
                />
            </Card>
        </div>
    );
}
