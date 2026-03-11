'use client';

import { useEffect, useState } from 'react';

/**
 * Lightweight CSS-only confetti burst overlay.
 * Renders ~30 falling particles with randomised colors, sizes, and delays.
 * Auto-removes after animation completes (~3s).
 */
export function ConfettiOverlay() {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(false), 3200);
        return () => clearTimeout(timer);
    }, []);

    if (!visible) return null;

    const colors = ['#0052FF', '#22D3EE', '#7C3AED', '#EC4899', '#F59E0B', '#10B981'];
    const particles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        color: colors[i % colors.length],
        left: `${Math.random() * 100}%`,
        size: 6 + Math.random() * 6,
        delay: Math.random() * 0.8,
        duration: 2 + Math.random() * 1.2,
        rotation: Math.random() * 360,
    }));

    return (
        <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden>
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="absolute confetti-particle"
                    style={{
                        left: p.left,
                        top: '-10px',
                        width: `${p.size}px`,
                        height: `${p.size * (0.6 + Math.random() * 0.8)}px`,
                        backgroundColor: p.color,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        transform: `rotate(${p.rotation}deg)`,
                    }}
                />
            ))}
        </div>
    );
}
