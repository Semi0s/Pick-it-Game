"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Globe, SquareCheckBig } from "lucide-react";
import type { ExplainerLanguage } from "@/lib/i18n";

const EXPLAINER_LANGUAGE_LABELS: Record<ExplainerLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  de: "Deutsch"
};

type DashboardHeroProps = {
  name: string;
  ctaHref: string;
  ctaLabel: string;
  displayLanguage: ExplainerLanguage;
  dashboardCopy: { hello: string; help: string };
  onSelectLanguage: (language: ExplainerLanguage) => void;
};

export function DashboardHero({
  name,
  ctaHref,
  ctaLabel,
  displayLanguage,
  dashboardCopy,
  onSelectLanguage
}: DashboardHeroProps) {
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLanguageMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageMenuOpen]);

  return (
    <section className="rounded-lg bg-gray-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-4xl font-black uppercase leading-none tracking-wide text-accent-dark">{dashboardCopy.hello}</p>
        <div className="flex shrink-0 items-center gap-2">
          <div ref={languageMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsLanguageMenuOpen((current) => !current)}
              className="inline-flex h-10 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light sm:px-2.5 sm:py-1.5"
              aria-haspopup="menu"
              aria-expanded={isLanguageMenuOpen}
              aria-label={`Translate helper copy. Current language: ${EXPLAINER_LANGUAGE_LABELS[displayLanguage]}`}
            >
              <Globe aria-hidden className="h-3.5 w-3.5 text-accent-dark" />
              <span>{displayLanguage.toUpperCase()}</span>
              <ChevronDown aria-hidden className="h-3.5 w-3.5 text-gray-500" />
            </button>
            {isLanguageMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 min-w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {(Object.keys(EXPLAINER_LANGUAGE_LABELS) as ExplainerLanguage[]).map((language) => (
                  <button
                    key={language}
                    type="button"
                    onClick={() => {
                      onSelectLanguage(language);
                      setIsLanguageMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                      language === displayLanguage ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
                    }`}
                    role="menuitem"
                  >
                    <span>{EXPLAINER_LANGUAGE_LABELS[language]}</span>
                    <span className="text-xs font-black uppercase">{language}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href="/help"
            className="inline-flex h-10 items-center gap-2 px-2 py-2 text-sm font-bold text-gray-800 transition hover:text-accent-dark"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-accent-dark">
              <CircleHelp aria-hidden className="h-4 w-4" />
            </span>
            {dashboardCopy.help}
          </Link>
        </div>
      </div>
      <div className="mt-2">
        <h2 className="mt-2 text-4xl font-black leading-tight text-gray-950 sm:text-5xl">{name}</h2>
        <div className="mt-5 mx-auto max-w-xl">
          <Link
            href={ctaHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark"
          >
            <SquareCheckBig aria-hidden className="h-4 w-4 shrink-0 text-white" />
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
