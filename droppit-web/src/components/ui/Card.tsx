import React, { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'highlight' | 'warning';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className = '', variant = 'default', children, ...props }, ref) => {
        let variantClasses = '';
        if (variant === 'default') {
            variantClasses = 'border-white/[0.08] bg-white/[0.02]';
        } else if (variant === 'highlight') {
            variantClasses = 'border-[#7C3AED]/15 bg-gradient-to-b from-[#7C3AED]/[0.06] to-transparent';
        } else if (variant === 'warning') {
            variantClasses = 'border-[#0052FF]/15 bg-gradient-to-b from-[#0052FF]/[0.05] to-transparent';
        }

        return (
            <div
                ref={ref}
                className={`rounded-2xl border ${variantClasses} p-4 sm:p-6 ${className}`}
                {...props}
            >
                {children}
            </div>
        );
    }
);
Card.displayName = 'Card';
