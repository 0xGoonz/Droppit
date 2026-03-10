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
            {/* Outer glow */}
            <span className="absolute inset-[-3px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.35),transparent_70%)] blur-[4px]" />
            <svg
                className="relative h-full w-full drop-shadow-[0_0_6px_rgba(0,82,255,0.5)]"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Main gradient: blue → cyan */}
                    <linearGradient id="dropGrad" x1="32" y1="8" x2="32" y2="58" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#0052FF" />
                        <stop offset="50%" stopColor="#1A6FFF" />
                        <stop offset="100%" stopColor="#22D3EE" />
                    </linearGradient>
                    {/* Glass highlight */}
                    <linearGradient id="dropShine" x1="24" y1="14" x2="36" y2="40" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="white" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                    {/* Inner shadow for depth */}
                    <radialGradient id="dropDepth" cx="32" cy="44" r="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#003BB5" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="transparent" />
                    </radialGradient>
                </defs>
                {/* Drop shape — teardrop pointing down */}
                <path
                    d="M32 6 C32 6 12 30 12 40 C12 51.046 20.954 60 32 60 C43.046 60 52 51.046 52 40 C52 30 32 6 32 6Z"
                    fill="url(#dropGrad)"
                />
                {/* Inner depth shadow */}
                <path
                    d="M32 6 C32 6 12 30 12 40 C12 51.046 20.954 60 32 60 C43.046 60 52 51.046 52 40 C52 30 32 6 32 6Z"
                    fill="url(#dropDepth)"
                />
                {/* Glass shine/refraction highlight */}
                <ellipse cx="26" cy="30" rx="8" ry="12" fill="url(#dropShine)" transform="rotate(-15 26 30)" />
                {/* Small specular dot */}
                <circle cx="24" cy="24" r="2.5" fill="white" opacity="0.7" />
            </svg>
        </span>
    );
}
