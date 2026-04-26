"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptCurrentLegalDocumentAction } from "@/app/legal/actions";

export function LegalAcceptanceForm({
  documentType,
  currentVersion,
  title,
  body,
  nextPath,
  alreadyAccepted
}: {
  documentType: string;
  currentVersion: string;
  title: string;
  body: string;
  nextPath?: string;
  alreadyAccepted?: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    alreadyAccepted ? { tone: "success", text: "You already accepted the current version." } : null
  );

  return (
    <section className="space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Terms</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">{title}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          Version {currentVersion}. We need your agreement before you can keep using PICK-IT!
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="space-y-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">
          {body}
        </div>
      </div>

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
          Continue
        </button>
      ) : (
        <form
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true);
            setMessage(null);
            const result = await acceptCurrentLegalDocumentAction({
              documentType,
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
            <span className="text-sm font-semibold leading-6 text-gray-800">
              I have read and agree to the Terms of Use.
            </span>
          </label>

          <button
            type="submit"
            disabled={!checked || isSubmitting}
            className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting ? "Saving..." : "Accept and Continue"}
          </button>
        </form>
      )}
    </section>
  );
}
