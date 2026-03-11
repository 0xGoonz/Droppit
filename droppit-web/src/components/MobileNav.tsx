'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileNav() {
    const pathname = usePathname();

    // Only show on these specific authenticated/creator routes
    const isVisible =
        pathname === '/create' ||
        pathname === '/creator' ||
        pathname?.includes('/stats');

    if (!isVisible) return null;

    const navItems = [
        {
            label: 'Hub',
            href: '/creator',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
            ),
        },
        {
            label: 'Create',
            href: '/create',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
            ),
        },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] md:hidden">
            <div className="absolute inset-0 bg-[#0B1020]/80 backdrop-blur-xl border-t border-white/[0.08]" />
            <div className="relative flex items-center justify-around px-2 pb-safe pt-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center justify-center w-full py-2 gap-1 transition-colors ${isActive ? 'text-[#22D3EE]' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <div className={`${isActive ? 'bg-[#0052FF]/20 text-[#22D3EE]' : ''} p-1.5 rounded-xl transition-colors`}>
                                {item.icon}
                            </div>
                            <span className="text-[10px] font-semibold">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
            {/* Safe area padding for iOS home indicator */}
            <div className="h-safe-bottom" />
        </div>
    );
}
