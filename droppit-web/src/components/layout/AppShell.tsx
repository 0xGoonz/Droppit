import React, { ReactNode } from 'react';
import { BackgroundOrbs } from './BackgroundOrbs';

interface AppShellProps {
    children: ReactNode;
    className?: string;
}

export function AppShell({ children, className = '' }: AppShellProps) {
    return (
        <div className={`relative min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white overflow-x-hidden ${className}`}>
            <BackgroundOrbs />
            {children}
        </div>
    );
}
