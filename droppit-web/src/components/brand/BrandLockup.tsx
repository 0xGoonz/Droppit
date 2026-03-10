import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { Wordmark } from "@/components/brand/Wordmark";

type BrandLockupProps = {
    href?: string;
    className?: string;
    markSize?: number;
    wordmarkClassName?: string;
};

export function BrandLockup({
    href = "/",
    className = "",
    markSize = 28,
    wordmarkClassName = "text-xl font-bold tracking-tight",
}: BrandLockupProps) {
    const content = (
        <>
            <BrandMark
                size={markSize}
                className="transition-transform duration-200 group-hover:scale-105"
            />
            <Wordmark className={wordmarkClassName} />
        </>
    );

    if (!href) {
        return <div className={`group inline-flex items-center gap-3 ${className}`}>{content}</div>;
    }

    return (
        <Link href={href} className={`group inline-flex items-center gap-3 ${className}`}>
            {content}
        </Link>
    );
}
