import { BRAND } from "@/lib/brand";

type WordmarkProps = {
    className?: string;
};

export function Wordmark({ className = "" }: WordmarkProps) {
    return (
        <span
            className={`bg-gradient-to-r from-[#22D3EE] via-[#7C3AED] to-[#0052FF] bg-clip-text font-display text-transparent ${className}`}
        >
            {BRAND.name}
        </span>
    );
}
