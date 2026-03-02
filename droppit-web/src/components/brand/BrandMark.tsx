type BrandMarkProps = {
    className?: string;
    size?: number;
};

export function BrandMark({ className = "", size = 28 }: BrandMarkProps) {
    return (
        <span
            aria-hidden
            className={`relative inline-flex items-center justify-center ${className}`}
            style={{ width: size, height: size }}
        >
            <span className="absolute inset-0 rounded-[22%] bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.4),transparent_55%),radial-gradient(circle_at_80%_75%,rgba(255,77,141,0.28),transparent_60%)] opacity-80 blur-[2px]" />
            <svg className="relative h-full w-full" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="64" height="64" rx="16" fill="#0B1020" />
                <rect x="24" y="16" width="16" height="16" rx="4" fill="#7C3AED" />
                <rect x="16" y="32" width="16" height="16" rx="4" fill="#22D3EE" />
                <rect x="32" y="32" width="16" height="16" rx="4" fill="#FF4D8D" />
                <rect x="24" y="48" width="16" height="16" rx="4" fill="#0052FF" />
            </svg>
        </span>
    );
}
