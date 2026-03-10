import { DOCS_BASE_URL, type DocsPageDefinition } from "@/lib/docs";

function toDocsUrl(path: string): string {
  return new URL(path, DOCS_BASE_URL).toString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function DocsArticle({ page }: { page: DocsPageDefinition }) {
  return (
    <article className="space-y-6">
      <header className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_24px_80px_rgba(2,8,23,0.28)] backdrop-blur sm:p-8">
        <p className="font-mono-brand text-xs uppercase tracking-[0.26em] text-cyan-300/80">{page.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {page.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
          {page.summary}
        </p>

        {page.quickLinks?.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {page.quickLinks.map((link) => (
              <a
                key={link.path}
                href={toDocsUrl(link.path)}
                className="group rounded-3xl border border-white/10 bg-[#081120]/70 p-5 transition-transform hover:-translate-y-1 hover:border-cyan-400/30"
              >
                <span className="block font-display text-lg font-semibold text-white">{link.title}</span>
                <span className="mt-2 block text-sm leading-6 text-slate-400">{link.description}</span>
                <span className="mt-5 inline-flex text-sm text-cyan-300 transition-colors group-hover:text-cyan-200">
                  Open guide
                </span>
              </a>
            ))}
          </div>
        ) : null}
      </header>

      {page.sections.map((section) => (
        <section
          key={section.title}
          id={slugify(section.title)}
          className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur sm:p-8"
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white">{section.title}</h2>

          <div className="mt-4 space-y-4">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                {paragraph}
              </p>
            ))}
          </div>

          {section.bullets?.length ? (
            <ul className="mt-5 space-y-3">
              {section.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm leading-6 text-slate-300 sm:text-base">
                  <span className="mt-2 h-2 w-2 rounded-full bg-cyan-300" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {section.code?.length ? (
            <pre className="mt-5 overflow-x-auto rounded-3xl border border-cyan-400/20 bg-[#07101e] px-5 py-4 text-sm leading-7 text-cyan-100">
              <code>{section.code.join("\n")}</code>
            </pre>
          ) : null}

          {section.note ? (
            <div className="mt-5 rounded-3xl border border-pink-400/20 bg-pink-400/8 px-5 py-4 text-sm leading-6 text-pink-100">
              {section.note}
            </div>
          ) : null}
        </section>
      ))}

      {page.cta ? (
        <section className="rounded-[30px] border border-cyan-400/20 bg-cyan-400/8 p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white">Next step</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
            Continue into the live Droppit experience when you are ready to create, review, or share a release.
          </p>
          <a
            href={page.cta.href}
            className="mt-5 inline-flex rounded-full bg-[#0052FF] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            {page.cta.label}
          </a>
        </section>
      ) : null}
    </article>
  );
}
