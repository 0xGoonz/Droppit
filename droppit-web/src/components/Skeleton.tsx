'use client';

/**
 * Reusable skeleton loading placeholder.
 * Matches the Droppit dark glassmorphism aesthetic.
 */
export function Skeleton({
    className = '',
    width,
    height,
}: {
    className?: string;
    width?: string | number;
    height?: string | number;
}) {
    return (
        <div
            className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
            style={{
                width: typeof width === 'number' ? `${width}px` : width,
                height: typeof height === 'number' ? `${height}px` : height,
            }}
        />
    );
}

/**
 * Pre-composed skeleton layout for the mint page.
 * Mirrors the 2-column artwork + info layout.
 */
export function MintPageSkeleton() {
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Artwork skeleton */}
            <div className="w-full max-w-lg mx-auto lg:mx-0 rounded-3xl overflow-hidden border border-white/[0.06] bg-white/[0.02] aspect-square">
                <Skeleton className="w-full h-full rounded-3xl" />
            </div>

            {/* Info skeleton */}
            <div className="flex flex-col justify-center space-y-6">
                {/* Title */}
                <div className="space-y-3">
                    <Skeleton className="h-10 w-3/4" />
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                </div>

                {/* Stats card */}
                <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-8 w-24" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-8 w-20" />
                        </div>
                    </div>
                    {/* Progress bar skeleton */}
                    <Skeleton className="h-2 w-full rounded-full" />
                    {/* CTA button skeleton */}
                    <Skeleton className="h-14 w-full rounded-full" />
                </div>
            </div>
        </div>
    );
}

/**
 * Pre-composed skeleton for creator dashboard drop cards.
 */
export function CreatorDropCardSkeleton() {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            </div>
            <div className="flex gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
            </div>
        </div>
    );
}
