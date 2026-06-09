import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { supportedLanguages, type SupportedLanguage } from "@/lib/i18n";
import type { PublicLegalCopy, PublicLegalRouteKey } from "@/lib/public-legal-copy";

export const PUBLIC_PRIVACY_VERSION = "2026-06-07-v1";
export const PUBLIC_PRIVACY_EFFECTIVE_DATE = "June 7, 2026";
export const PUBLIC_TERMS_VERSION = "2026-04-26-v2-en";
export const PUBLIC_TERMS_EFFECTIVE_DATE = "June 7, 2026";
export const DEFAULT_PUBLIC_SUPPORT_EMAIL = "pickit@semiosdesign.com";

export function getPublicSupportEmail() {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || DEFAULT_PUBLIC_SUPPORT_EMAIL;
}

export function getSupportMailtoHref(subject = "PICK-IT! support request") {
  return `mailto:${getPublicSupportEmail()}?subject=${encodeURIComponent(subject)}`;
}

export function PublicLegalShell({
  eyebrow,
  title,
  intro,
  routeKey,
  language,
  copy,
  accentStyle,
  children
}: {
  eyebrow: string;
  title: string;
  intro: string;
  routeKey: PublicLegalRouteKey;
  language: SupportedLanguage;
  copy: PublicLegalCopy["nav"];
  accentStyle?: CSSProperties;
  children: ReactNode;
}) {
  const localizedPath = (path: string) => `${path}?lang=${language}`;

  return (
    <main className="min-h-screen min-h-[100dvh] bg-gray-50 px-4 py-6 text-gray-950 sm:px-6 lg:px-8" style={accentStyle}>
      <div className="mx-auto max-w-4xl">
        <header className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="text-2xl font-black tracking-tight text-gray-950">
              PICK-IT!
              <span className="block text-xs font-black uppercase tracking-[0.24em] text-gray-500">World Cup 2026</span>
            </Link>
            <nav className="flex flex-wrap gap-2 text-sm font-black">
              <Link className="rounded-full border border-gray-200 bg-white px-3 py-2 text-gray-700" href={localizedPath("/privacy")}>
                {copy.privacy}
              </Link>
              <Link className="rounded-full border border-gray-200 bg-white px-3 py-2 text-gray-700" href={localizedPath("/terms")}>
                {copy.terms}
              </Link>
              <Link className="rounded-full border border-gray-200 bg-white px-3 py-2 text-gray-700" href={localizedPath("/support")}>
                {copy.support}
              </Link>
            </nav>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-500">
            {supportedLanguages.map((option) => (
              <Link
                key={option}
                className={`rounded-full border px-2.5 py-1 ${
                  option === language
                    ? "border-accent bg-accent-light text-accent-dark"
                    : "border-gray-200 bg-white text-gray-500"
                }`}
                href={`/${routeKey}?lang=${option}`}
                aria-current={option === language ? "page" : undefined}
              >
                {option.toUpperCase()}
              </Link>
            ))}
          </div>
        </header>

        <section className="mt-5 rounded-[1.5rem] bg-accent px-5 py-6 text-white shadow-sm sm:px-7">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-white/80">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/85 sm:text-base">{intro}</p>
        </section>

        {language !== "en" ? (
          <p className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {copy.languageNote}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </main>
  );
}

export function PolicySection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black text-gray-950">{title}</h2>
      <div className="mt-3 space-y-3 text-sm font-semibold leading-6 text-gray-700">{children}</div>
    </section>
  );
}

export function PolicyBullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function InlineLegalLink({
  href,
  children
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="font-black text-accent underline-offset-4 hover:underline" href={href}>
      {children}
    </Link>
  );
}
