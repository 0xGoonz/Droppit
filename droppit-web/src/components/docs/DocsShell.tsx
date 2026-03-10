"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DOCS_APP_URL, DOCS_BASE_URL, DOCS_NAV_ITEMS } from "@/lib/docs";

function normalizeActivePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "") || "/";

  if (trimmed === "/docs") {
    return "/";
  }

  if (trimmed.startsWith("/docs/")) {
    return trimmed.slice("/docs".length);
  }

  return trimmed;
}

function toDocsUrl(path: string): string {
  return new URL(path, DOCS_BASE_URL).toString();
}

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activePath = normalizeActivePath(pathname);

  return (
    <div className="min-h-screen bg-[#05070f] text-slate-100 selection:bg-[#0052FF]/40 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_15%_15%,rgba(0,82,255,0.24),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_68%_76%,rgba(255,77,141,0.12),transparent_40%),linear-gradient(180deg,rgba(5,7,15,0.92),rgba(5,7,15,1))]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-5 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <a href={DOCS_BASE_URL} className="inline-flex items-center gap-3 text-sm text-slate-300 transition-colors hover:text-white">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 font-display text-base font-semibold text-cyan-200">
                D
              </span>
              <span>
                <span className="block font-display text-lg font-semibold text-white">Droppit Docs</span>
                <span className="block text-xs uppercase tracking-[0.22em] text-slate-500">docs.droppitonbase.xyz</span>
              </span>
            </a>
            <p className="max-w-2xl text-sm leading-6 text-slate-400">
              Product guides for launch, mint, and Farcaster-first drop flows on Base.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={DOCS_APP_URL}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-white/20 hover:text-white"
            >
              Main site
            </a>
            <a
              href={`${DOCS_APP_URL}/create`}
              className="rounded-full bg-[#0052FF] px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Start a drop
            </a>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur">
              <div className="border-b border-white/8 px-5 py-4">
                <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-white/70">Guides</p>
              </div>
              <div className="flex gap-3 overflow-x-auto px-3 py-3 lg:block lg:space-y-2 lg:overflow-visible">
                {DOCS_NAV_ITEMS.map((item) => {
                  const isActive = activePath === item.path;

                  return (
                    <a
                      key={item.path}
                      href={toDocsUrl(item.path)}
                      className={`group min-w-[220px] rounded-2xl border px-4 py-3 transition-colors lg:block lg:min-w-0 ${
                        isActive
                          ? "border-cyan-400/30 bg-cyan-400/10 text-white"
                          : "border-transparent bg-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.03] hover:text-slate-100"
                      }`}
                    >
                      <span className="block font-medium">{item.title}</span>
                      <span className={`mt-1 block text-xs leading-5 ${isActive ? "text-slate-200" : "text-slate-500 group-hover:text-slate-300"}`}>
                        {item.description}
                      </span>
                    </a>
                  );
                })}
              </div>
            </nav>

            <div className="mt-4 rounded-[28px] border border-white/10 bg-[#081120]/80 p-5 text-sm text-slate-300 backdrop-blur">
              <p className="font-display text-sm font-semibold text-white">Canonical docs host</p>
              <p className="mt-2 leading-6 text-slate-400">
                The docs content is routed through the current Next.js app, but the public entrypoint stays on the dedicated docs subdomain.
              </p>
            </div>
          </aside>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
