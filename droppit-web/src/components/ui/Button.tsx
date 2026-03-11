import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'gradient' | 'secondary' | 'accent';
    size?: 'default' | 'sm' | 'md' | 'full';
    isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'primary', size = 'default', isLoading, children, disabled, ...props }, ref) => {
        // Base classes
        const baseClasses = "inline-flex items-center justify-center font-bold transition-all disabled:pointer-events-none disabled:opacity-50";

        // Variant classes
        const variants = {
            primary: "bg-white text-[#05070f] hover:scale-[1.03] active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)] rounded-full",
            gradient: "bg-gradient-to-r from-[#0052FF] to-[#22D3EE] text-white hover:scale-[1.03] active:scale-95 shadow-[0_0_30px_rgba(0,82,255,0.4)] rounded-full",
            secondary: "border border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-white rounded-full font-medium",
            accent: "border border-[#0052FF]/25 bg-[#0052FF]/10 text-[#22D3EE] hover:bg-[#0052FF]/20 hover:border-[#0052FF]/40 rounded-xl"
        };

        // Size classes
        const sizes = {
            default: "px-8 py-2.5 w-full sm:w-auto",
            sm: "px-4 py-2 text-sm",
            md: "px-6 py-2.5 w-full sm:w-auto",
            full: "w-full px-8 py-3"
        };

        const classes = [
            baseClasses,
            variants[variant],
            sizes[size],
            className
        ].filter(Boolean).join(' ');

        return (
            <button
                ref={ref}
                disabled={disabled || isLoading}
                className={classes}
                {...props}
            >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {children}
                    </span>
                ) : (
                    children
                )}
            </button>
        );
    }
);

Button.displayName = 'Button';
