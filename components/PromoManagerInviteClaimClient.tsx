"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimPromoManagerInviteCodeAction } from "@/app/invite/[code]/actions";
import type { PromoManagerInviteAvailabilityReason } from "@/lib/promo-manager-invite-codes";
import type { AppLanguage } from "@/lib/i18n";
import { t } from "@/lib/strings";

export function PromoManagerInviteClaimClient({
  code,
  language,
  utm
}: {
  code: string;
  language: AppLanguage;
  utm: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "success"; alreadyClaimed: boolean }
    | { status: "error"; reason: PromoManagerInviteAvailabilityReason | "auth_required" }
  >({ status: "idle" });

  function handleClaim() {
    startTransition(async () => {
      const result = await claimPromoManagerInviteCodeAction({ code, utm });
      if (!result.ok) {
        setState({ status: "error", reason: result.reason });
        return;
      }

      setState({ status: "success", alreadyClaimed: result.alreadyClaimed });
      router.refresh();
    });
  }

  if (state.status === "success") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-accent-light bg-white px-4 py-4 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-accent-dark">
            {state.alreadyClaimed ? t(language, "promoInvite.alreadyClaimedTitle") : t(language, "promoInvite.successTitle")}
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-700">
            {state.alreadyClaimed ? t(language, "promoInvite.alreadyClaimedBody") : t(language, "promoInvite.successBody")}
          </p>
        </div>
        <Link
          href="/my-groups?create=1"
          className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-base font-bold text-accent-text transition hover:bg-accent/95"
        >
          {t(language, "promoInvite.goToManagerArea")}
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <PromoInviteStateMessage language={language} reason={state.reason} />
        {state.reason === "auth_required" ? null : (
          <button
            type="button"
            onClick={() => setState({ status: "idle" })}
            className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            {t(language, "common.tryAgain")}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClaim}
      disabled={isPending}
      className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-base font-bold text-accent-text shadow-soft transition hover:bg-accent/95 disabled:opacity-70"
    >
      {isPending ? t(language, "promoInvite.claiming") : t(language, "promoInvite.claimManagerAccess")}
    </button>
  );
}

export function PromoInviteStateMessage({
  language,
  reason
}: {
  language: AppLanguage;
  reason: PromoManagerInviteAvailabilityReason | "auth_required";
}) {
  const titleKey = getReasonTitleKey(reason);
  const bodyKey = getReasonBodyKey(reason);

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-center">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">{t(language, titleKey)}</p>
      <p className="mt-2 text-sm font-semibold text-gray-700">{t(language, bodyKey)}</p>
    </div>
  );
}

function getReasonTitleKey(reason: PromoManagerInviteAvailabilityReason | "auth_required") {
  switch (reason) {
    case "auth_required":
      return "promoInvite.signInTitle";
    case "full":
      return "promoInvite.fullTitle";
    case "paused":
      return "promoInvite.pausedTitle";
    case "expired":
      return "promoInvite.expiredTitle";
    case "archived":
      return "promoInvite.archivedTitle";
    case "not_started":
      return "promoInvite.notStartedTitle";
    case "ineligible":
      return "promoInvite.ineligibleTitle";
    case "unavailable":
      return "promoInvite.errorTitle";
    case "invalid":
    default:
      return "promoInvite.invalidTitle";
  }
}

function getReasonBodyKey(reason: PromoManagerInviteAvailabilityReason | "auth_required") {
  switch (reason) {
    case "auth_required":
      return "promoInvite.signInBody";
    case "full":
      return "promoInvite.fullBody";
    case "paused":
      return "promoInvite.pausedBody";
    case "expired":
      return "promoInvite.expiredBody";
    case "archived":
      return "promoInvite.archivedBody";
    case "not_started":
      return "promoInvite.notStartedBody";
    case "ineligible":
      return "promoInvite.ineligibleBody";
    case "unavailable":
      return "promoInvite.errorBody";
    case "invalid":
    default:
      return "promoInvite.invalidBody";
  }
}
