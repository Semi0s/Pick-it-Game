"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { InlineDisclosureButton } from "@/components/player-management/Shared";
import { useAppLanguage } from "@/lib/app-language";
import { t } from "@/lib/strings";

export function SidePicksVoidedNotice() {
  const { activeLanguage } = useAppLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-amber-300 bg-[linear-gradient(135deg,rgba(254,243,199,0.95),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_45px_-35px_rgba(120,53,15,0.45)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white/80 text-amber-700">
            <FlaskConical aria-hidden className="h-4 w-4" />
          </span>
          <p className="min-w-0 text-[13px] font-black uppercase tracking-[0.18em] text-amber-900 sm:text-xs sm:tracking-[0.24em]">
            {t(activeLanguage, "predictionLab.notice.title")}
          </p>
        </div>
        <InlineDisclosureButton
          isOpen={isExpanded}
          variant="subtle"
          onClick={() => setIsExpanded((current) => !current)}
          className="self-start text-amber-900 hover:text-amber-700"
        />
      </div>

      {isExpanded ? (
        <div className="mt-4 space-y-4 border-t border-amber-200/80 pt-4">
          <div className="max-w-4xl space-y-3">
            <p className="text-sm font-semibold leading-6 text-amber-950 sm:text-[15px]">
              {t(activeLanguage, "predictionLab.notice.lead")}
            </p>
            <p className="text-sm font-semibold leading-6 text-amber-950 sm:text-[15px]">
              {t(activeLanguage, "predictionLab.notice.body")}
            </p>
            <p className="text-sm font-semibold leading-6 text-amber-900">
              {t(activeLanguage, "predictionLab.notice.thanks")}
            </p>
          </div>

          <div className="grid gap-3 text-sm font-medium leading-6 text-amber-900">
            <p>{t(activeLanguage, "predictionLab.notice.detailInactive")}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
