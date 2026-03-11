import React, { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    description?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className = '', label, description, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>}
                <textarea
                    ref={ref}
                    className={`w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all disabled:opacity-50 resize-none ${className}`}
                    {...props}
                />
                {description && <p className="text-xs text-slate-600 mt-2">{description}</p>}
            </div>
        );
    }
);
Textarea.displayName = 'Textarea';
