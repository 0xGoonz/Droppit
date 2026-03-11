import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    description?: string;
    icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className = '', label, description, icon, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>}
                <div className="relative">
                    {icon && <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#0052FF]/50">{icon}</span>}
                    <input
                        ref={ref}
                        className={`w-full rounded-xl border border-white/[0.08] bg-white/[0.02] ${icon ? 'pl-10 pr-4' : 'px-4'} py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all disabled:opacity-50 ${className}`}
                        {...props}
                    />
                </div>
                {description && <p className="text-xs text-slate-600 mt-2">{description}</p>}
            </div>
        );
    }
);
Input.displayName = 'Input';
