"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { acceptCurrentLegalDocumentAction } from "@/app/legal/actions";
import { showAppToast } from "@/lib/app-toast";
import { getLanguageLabel, getStrings } from "@/lib/strings";
import type { SupportedLanguage } from "@/lib/i18n";

type LegalAcceptanceDocument = {
  language: SupportedLanguage;
  title: string;
  body: string;
};

export function LegalAcceptanceForm({
  documentType,
  documentLanguage,
  currentVersion,
  title,
  documents,
  uiLanguage,
  nextPath,
  alreadyAccepted
}: {
  documentType: string;
  documentLanguage: SupportedLanguage;
  currentVersion: string;
  title: string;
  documents: LegalAcceptanceDocument[];
  uiLanguage: SupportedLanguage;
  nextPath?: string;
  alreadyAccepted?: boolean;
}) {
  const router = useRouter();
  const copy = getStrings(uiLanguage);
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openLanguages, setOpenLanguages] = useState<Partial<Record<SupportedLanguage, boolean>>>({});
  const [openedLanguages, setOpenedLanguages] = useState<Partial<Record<SupportedLanguage, boolean>>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    alreadyAccepted ? { tone: "success", text: "You already accepted the current version." } : null
  );
  const hasOpenedAtLeastOneVersion = Object.values(openedLanguages).some(Boolean);
  const orderedDocuments = useMemo(() => {
    const preferred = documents.find((document) => document.language === documentLanguage);
    const remaining = documents.filter((document) => document.language !== documentLanguage);
    return preferred ? [preferred, ...remaining] : documents;
  }, [documentLanguage, documents]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  return (
    <section className="space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{copy.termsOfUse}</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">{title}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          Version {currentVersion}. We need your agreement before you can keep using PICK-IT!
        </p>
      </div>

      {orderedDocuments.map((document) => (
        <LegalDisclosureCard
          key={document.language}
          title={document.title}
          subtitle={getLanguageLabel(document.language, uiLanguage)}
          open={Boolean(openLanguages[document.language])}
          onToggle={() => {
            setOpenLanguages((current) => ({
              ...current,
              [document.language]: !current[document.language]
            }));
            setOpenedLanguages((current) => ({
              ...current,
              [document.language]: true
            }));
          }}
          body={document.body}
        />
      ))}

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            message.tone === "success"
              ? "border-accent-light bg-accent-light text-accent-dark"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {alreadyAccepted ? (
        <button
          type="button"
          onClick={() => router.replace(nextPath?.startsWith("/") ? nextPath : "/dashboard")}
          className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft"
        >
          {copy.continue}
        </button>
      ) : (
        <form
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!hasOpenedAtLeastOneVersion) {
              setMessage({ tone: "error", text: "Open at least one language card before continuing." });
              return;
            }
            setIsSubmitting(true);
            setMessage(null);
            const result = await acceptCurrentLegalDocumentAction({
              documentType,
              language: documentLanguage,
              nextPath
            });
            setIsSubmitting(false);
            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
            if (result.ok) {
              router.replace(result.nextPath);
              router.refresh();
            }
          }}
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span className="text-sm font-semibold leading-6 text-gray-800">{copy.agreeToTerms}</span>
          </label>

          {!hasOpenedAtLeastOneVersion ? (
            <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
              Open at least one language card before accepting.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!checked || !hasOpenedAtLeastOneVersion || isSubmitting}
            className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting ? "Saving..." : copy.acceptAndContinue}
          </button>
        </form>
      )}
    </section>
  );
}

function LegalDisclosureCard({
  title,
  subtitle,
  open,
  onToggle,
  body
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  body: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-gray-50"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-base font-black text-gray-950">{title}</span>
          <span className="mt-1 block text-sm font-semibold text-gray-500">{subtitle}</span>
        </span>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600">
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </button>

      {open ? (
        <div className="border-t border-gray-200 px-5 py-5">
          <div className="space-y-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">{body}</div>
        </div>
      ) : null}
    </section>
  );
}
