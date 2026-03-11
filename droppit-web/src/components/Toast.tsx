'use client';

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from 'react';

/* ── Types ── */
type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
    id: number;
    message: string;
    variant: ToastVariant;
};

type ToastContextValue = {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
};

/* ── Context ── */
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
    return ctx;
}

/* ── Variant styles ── */
const VARIANT_STYLES: Record<ToastVariant, string> = {
    success:
        'border-green-500/40 bg-green-500/15 text-green-300 shadow-[0_8px_32px_rgba(34,197,94,0.15)]',
    error:
        'border-red-500/40 bg-red-500/15 text-red-300 shadow-[0_8px_32px_rgba(239,68,68,0.15)]',
    info:
        'border-[#0052FF]/40 bg-[#0052FF]/15 text-blue-200 shadow-[0_8px_32px_rgba(0,82,255,0.15)]',
};

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
    success: (
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-green-400" aria-hidden>
            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.72a.75.75 0 00-1.06.02L7.4 8.78 5.84 7.22a.75.75 0 00-1.08 1.04l2.1 2.1a.75.75 0 001.07-.01l3.3-3.55a.75.75 0 00-.01-1.08z" />
        </svg>
    ),
    error: (
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-red-400" aria-hidden>
            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm-.75 3v5h1.5V4h-1.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
        </svg>
    ),
    info: (
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-blue-300" aria-hidden>
            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm-.75 3v1.5h1.5V4h-1.5zm0 3v5h1.5V7h-1.5z" />
        </svg>
    ),
};

const AUTO_DISMISS_MS = 4000;

/* ── Single Toast ── */
function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsExiting(true), AUTO_DISMISS_MS - 300);
        const removeTimer = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
        return () => {
            clearTimeout(timer);
            clearTimeout(removeTimer);
        };
    }, [item.id, onDismiss]);

    return (
        <div
            role="alert"
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium backdrop-blur-xl transition-all duration-300 ${
                isExiting
                    ? 'translate-x-full opacity-0'
                    : 'translate-x-0 opacity-100 animate-in slide-in-from-right-5 fade-in'
            } ${VARIANT_STYLES[item.variant]}`}
        >
            {VARIANT_ICON[item.variant]}
            <span className="line-clamp-3 break-words">{item.message}</span>
            <button
                type="button"
                onClick={() => {
                    setIsExiting(true);
                    setTimeout(() => onDismiss(item.id), 300);
                }}
                className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                aria-label="Dismiss"
            >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                    <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 01-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                </svg>
            </button>
        </div>
    );
}

/* ── Provider ── */
let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const push = useCallback((message: string, variant: ToastVariant) => {
        const id = ++toastIdCounter;
        setToasts((prev) => [...prev.slice(-4), { id, message, variant }]); // cap at 5
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const api = useCallback(
        (): ToastContextValue => ({
            success: (msg) => push(msg, 'success'),
            error: (msg) => push(msg, 'error'),
            info: (msg) => push(msg, 'info'),
        }),
        [push],
    );

    return (
        <ToastContext.Provider value={api()}>
            {children}
            {/* Toast container — bottom-right on desktop, bottom-center on mobile */}
            <div
                className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 sm:bottom-6 sm:right-6"
                aria-live="polite"
            >
                {toasts.map((t) => (
                    <ToastMessage key={t.id} item={t} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}
