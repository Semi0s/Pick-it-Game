"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { HorizontalChoiceRail, InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import type { GroupBracketComparisonView, BracketHealthStatus } from "@/lib/bracket-predictions";
import { t } from "@/lib/strings";
const KNOCKOUT_GROUP_COMPARISON_STORAGE_KEY = "knockout-group-comparison";
const KNOCKOUT_GROUP_DETAIL_STORAGE_KEY = "knockout-group-detail";

type KnockoutGroupComparisonProps = {
  view: GroupBracketComparisonView;
  language?: string | null;
};

export function KnockoutGroupComparison({ view, language }: KnockoutGroupComparisonProps) {
  const [isExpanded, setIsExpanded] = useSessionDisclosureState(KNOCKOUT_GROUP_COMPARISON_STORAGE_KEY, false);
  const [isDetailOpen, setIsDetailOpen] = useSessionDisclosureState(KNOCKOUT_GROUP_DETAIL_STORAGE_KEY, false);

  useEffect(() => {
    setIsDetailOpen(false);
  }, [setIsDetailOpen, view.selectedGroupId, view.selectedPlayerId]);

  if (view.groups.length === 0) {
    return (
      <section className="ui-card p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "knockout.groupStandings")}</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">{t(language, "knockout.noGroupBracketView")}</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          {t(language, "knockout.joinGroupToCompare")}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="ui-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "knockout.groupBracketComparison")}</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">{view.selectedGroupName ?? t(language, "knockout.chooseGroup")}</h2>
            {view.mostPickedChampion ? (
              <p className="mt-3 text-sm font-semibold text-gray-700">
                {t(language, "knockout.mostPickedChampion")} <span className="font-black text-gray-950">{view.mostPickedChampion.name}</span>{" "}
                <span className="text-gray-500">({t(language, "knockout.championPickCount", { count: view.mostPickedChampion.count })})</span>
              </p>
            ) : (
              <p className="mt-3 text-sm font-semibold text-gray-700">
                {view.selectedGroupId ? t(language, "knockout.noChampionPicksGroup") : t(language, "knockout.chooseGroupToCompare")}
              </p>
            )}
            <HorizontalChoiceRail className="mt-4" showControls={view.groups.length > 1}>
              {view.groups.map((group) => {
                const isActive = group.id === view.selectedGroupId;
                return (
                  <Link
                    key={group.id}
                    href={`/knockout?group=${encodeURIComponent(group.id)}`}
                    className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm font-bold ${
                      isActive ? "border-accent bg-accent-light text-accent-dark" : "border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    {group.name}
                  </Link>
                );
              })}
            </HorizontalChoiceRail>
          </div>
          <InlineDisclosureButton isOpen={isExpanded} onClick={() => setIsExpanded((current) => !current)} />
        </div>
      </div>

      {isExpanded ? (
        <>
          {view.selectedGroupId ? (
            <>
              <div className="space-y-3">
                {view.members.map((member) => {
                  const badge = getStatusBadge(member.status, language);
                  const finalistsLabel = member.finalistNames.length > 0 ? member.finalistNames.join(` ${t(language, "knockout.vs")} `) : t(language, "knockout.noFinalistsYet");
                  const isActive = member.userId === view.selectedPlayerId;
                  return (
                    <Link
                      key={member.userId}
                      href={`/knockout?group=${encodeURIComponent(view.selectedGroupId ?? "")}&player=${encodeURIComponent(member.userId)}`}
                      className={`block rounded-lg border p-4 transition ${
                        isActive
                          ? "border-accent bg-accent-light/40"
                          : "border-gray-200 bg-white hover:border-accent-light hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-black text-gray-950">{member.name}</h3>
                          <p className="mt-1 text-sm font-semibold text-gray-700">
                            {t(language, "knockout.championLabel")} <span className="font-black text-gray-950">{member.championPickName ?? t(language, "knockout.notPickedYet")}</span>
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-600">{t(language, "knockout.finalistsLabel")} {finalistsLabel}</p>
                          {member.championPickName ? (
                            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                              {member.isUniqueChampionPick ? t(language, "knockout.uniquePick") : t(language, "knockout.playersPickedChampion", { count: member.championPickCount, teamName: member.championPickName })}
                            </p>
                          ) : null}
                          {isActive ? (
                            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-accent-dark">{t(language, "knockout.bracketDetailSelected")}</p>
                          ) : null}
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-black ${badge.className}`}>
                          <span aria-hidden>{badge.icon}</span>
                          {badge.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {view.selectedPlayerBracket ? (
                <SelectedBracketDetail
                  selectedPlayerBracket={view.selectedPlayerBracket}
                  isOpen={isDetailOpen}
                  onToggle={() => setIsDetailOpen((current) => !current)}
                  language={language}
                />
              ) : (
                <section className="ui-card p-4">
                  <p className="text-sm font-semibold text-gray-600">{t(language, "knockout.tapPlayerForBracketDetail")}</p>
                </section>
              )}
            </>
          ) : (
            <section className="ui-card p-4">
              <p className="text-sm font-semibold text-gray-600">{t(language, "knockout.chooseGroupAbove")}</p>
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}

function SelectedBracketDetail({
  selectedPlayerBracket,
  isOpen,
  onToggle,
  language
}: {
  selectedPlayerBracket: NonNullable<GroupBracketComparisonView["selectedPlayerBracket"]>;
  isOpen: boolean;
  onToggle: () => void;
  language?: string | null;
}) {
  const badge = getStatusBadge(selectedPlayerBracket.status, language);
  const meaningfulMatches = useMemo(
    () =>
      selectedPlayerBracket.matches.filter(
        (match) =>
          match.predictedWinnerName ||
          match.actualWinnerName ||
          match.status !== "scheduled" ||
          match.homeTeamName !== "TBD" ||
          match.awayTeamName !== "TBD"
      ),
    [selectedPlayerBracket.matches]
  );

  return (
    <section className="ui-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "knockout.bracketDetail")}</p>
          <h3 className="mt-1 text-2xl font-black leading-tight text-gray-950">{selectedPlayerBracket.name}</h3>
          <p className="mt-2 text-sm font-semibold text-gray-700">
            {t(language, "knockout.championLabel")}{" "}
            <span className="font-black text-gray-950">
              {selectedPlayerBracket.championPickName ?? t(language, "knockout.noChampionPickYet")}
            </span>
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            {t(language, "knockout.finalistsLabel")} {selectedPlayerBracket.finalistNames.length > 0 ? selectedPlayerBracket.finalistNames.join(` ${t(language, "knockout.vs")} `) : t(language, "knockout.noFinalistsYet")}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-black ${badge.className}`}>
          <span aria-hidden>{badge.icon}</span>
          {badge.label}
        </span>
      </div>

      <div className="ui-card-soft mt-4 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-gray-700">{t(language, "knockout.roundByRoundPicks")}</p>
            <p className="mt-1 text-sm font-semibold text-gray-600">
              {t(language, "knockout.meaningfulMatchesShown", { count: meaningfulMatches.length })}
            </p>
          </div>
          <InlineDisclosureButton isOpen={isOpen} onClick={onToggle} />
        </div>

        {isOpen ? (
          <div className="mt-3 space-y-3">
            {meaningfulMatches.length > 0 ? (
              meaningfulMatches.map((match) => (
                <div key={match.matchId} className="rounded-md border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{match.stageLabel}</p>
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {match.status === "scheduled" ? t(language, "common.open") : match.status === "final" ? t(language, "common.final") : t(language, "common.locked")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {match.homeTeamName} {t(language, "knockout.vs")} {match.awayTeamName}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {t(language, "knockout.pickedWinner")} <span className="font-black text-gray-950">{match.predictedWinnerName ?? t(language, "knockout.noPick")}</span>
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-600">
                    {t(language, "knockout.actualWinner")} {match.actualWinnerName ?? t(language, "knockout.notDecidedYet")}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-gray-600">{t(language, "knockout.noMeaningfulPicks")}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getStatusBadge(status: BracketHealthStatus, language?: string | null) {
  if (status === "alive") {
    return {
      icon: "🔥",
      label: t(language, "knockout.alive"),
      className: "bg-emerald-100 text-emerald-900"
    };
  }

  if (status === "eliminated") {
    return {
      icon: "❌",
      label: t(language, "knockout.eliminated"),
      className: "bg-rose-100 text-rose-900"
    };
  }

  return {
    icon: "⚠️",
    label: t(language, "knockout.atRisk"),
    className: "bg-amber-100 text-amber-900"
  };
}
