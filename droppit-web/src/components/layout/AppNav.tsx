import React, { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLockup } from '@/components/brand/BrandLockup';
import {
    Wallet,
    ConnectWallet,
    WalletDropdown,
    WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
    Identity,
    Avatar,
    Name,
    Address,
    EthBalance,
} from '@coinbase/onchainkit/identity';

interface AppNavProps {
    /** Optional elements (like the chain pill) to display before the wallet button */
    rightContent?: ReactNode;
    /** The action button (e.g. "My Drops" or "Start a Drop") */
    actionButton?: ReactNode;
    /** Custom disconnect handler if needed. If not provided, it uses the default WalletDropdownDisconnect */
    onDisconnect?: () => void;
}

export function AppNav({ rightContent, actionButton, onDisconnect }: AppNavProps) {
    return (
        <nav className="relative z-30 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <BrandLockup markSize={28} wordmarkClassName="text-lg font-bold tracking-tight sm:text-xl" />

            <div className="relative z-30 flex items-center gap-2 sm:gap-3">
                {actionButton}
                
                {rightContent}

                <Wallet>
                    <ConnectWallet className="relative z-10 shrink-0 rounded-full border border-[#0052FF]/25 bg-gradient-to-r from-[#0052FF]/15 to-[#22D3EE]/10 px-3 py-2 text-white !min-w-0 font-medium transition-all hover:from-[#0052FF]/25 hover:to-[#22D3EE]/20 hover:border-[#0052FF]/40 hover:shadow-[0_0_20px_rgba(0,82,255,0.15)]">
                        <Avatar className="h-7 w-7 ring-2 ring-[#0052FF]/30" />
                    </ConnectWallet>
                    <WalletDropdown className="border border-white/[0.08] bg-[#0B1020] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                        <Identity className="px-4 pt-4 pb-2 text-white hover:bg-white/[0.03] transition-colors" hasCopyAddressOnClick>
                            <Avatar className="h-10 w-10 ring-2 ring-[#0052FF]/40" />
                            <Name className="text-white font-bold" />
                            <Address className="text-slate-400 font-mono text-sm" />
                            <EthBalance className="text-[#22D3EE] font-bold" />
                        </Identity>
                        <div className="h-px bg-white/[0.06] w-full" />
                        {onDisconnect ? (
                            <button
                                type="button"
                                onClick={onDisconnect}
                                className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold"
                            >
                                Disconnect
                            </button>
                        ) : (
                            <WalletDropdownDisconnect
                                className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold"
                                text="Disconnect"
                            />
                        )}
                    </WalletDropdown>
                </Wallet>
            </div>
        </nav>
    );
}
