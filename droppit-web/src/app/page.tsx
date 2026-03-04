import { HeroSection } from "@/components/landing/HeroSection";
import { BelowTheFold } from "@/components/landing/BelowTheFold";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white">
      {/* Ambient background gradient */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,82,255,0.28),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(34,211,238,0.2),transparent_36%),radial-gradient(circle_at_75%_75%,rgba(255,77,141,0.18),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(124,58,237,0.2),transparent_42%)]" />

      <main className="relative z-10">
        <HeroSection />
        <BelowTheFold />
      </main>
    </div>
  );
}
