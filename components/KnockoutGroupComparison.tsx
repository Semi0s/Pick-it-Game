"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { HorizontalChoiceRail, InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import type { GroupBracketComparisonView, BracketHealthStatus } from "@/lib/bracket-predictions";
const KNOCKOUT_GROUP_COMPARISON_STORAGE_KEY = "knockout-group-comparison";
const KNOCKOUT_GROUP_DETAIL_STORAGE_KEY = "knockout-group-detail";

type KnockoutGroupComparisonProps = {
  view: GroupBracketComparisonView;
};

export function KnockoutGroupComparison({ view }: KnockoutGroupComparisonProps) {
  const [isExpanded, setIsExpanded] = useSessionDisclosureState(KNOCKOUT_GROUP_COMPARISON_STORAGE_KEY, false);
  const [isDetailOpen, setIsDetailOpen] = useSessionDisclosureState(KNOCKOUT_GROUP_DETAIL_STORAGE_KEY, false);

  useEffect(() => {
    setIsDetailOpen(false);
  }, [setIsDetailOpen, view.selectedGroupId, view.selectedPlayerId]);

  if (view.groups.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Group Standings</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">No group bracket view yet.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Join a group to compare knockout picks with other players once bracket selections are available.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Group Bracket Comparison</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">{view.selectedGroupName ?? "Choose a group"}</h2>
            {view.mostPickedChampion ? (
              <p className="mt-3 text-sm font-semibold text-gray-700">
                Most-picked champion: <span className="font-black text-gray-950">{view.mostPickedChampion.name}</span>{" "}
                <span className="text-gray-500">({view.mostPickedChampion.count} picks)</span>
              </p>
            ) : (
              <p className="mt-3 text-sm font-semibold text-gray-700">
                {view.selectedGroupId ? "No champion picks have been saved for this group yet." : "Choose a group to compare bracket picks."}
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
                  const badge = getStatusBadge(member.status);
                  const finalistsLabel = member.finalistNames.length > 0 ? member.finalistNames.join(" vs ") : "No finalists yet";
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
                            Champion: <span className="font-black text-gray-950">{member.championPickName ?? "Not picked yet"}</span>
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-600">Finalists: {finalistsLabel}</p>
                          {member.championPickName ? (
                            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                              {member.isUniqueChampionPick ? "Unique pick" : `${member.championPickCount} players picked this champion`}
                            </p>
                          ) : null}
                          {isActive ? (
                            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-accent-dark">Bracket detail selected</p>
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
                />
              ) : (
                <section className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-600">Tap a player to open that bracket detail.</p>
                </section>
              )}
            </>
          ) : (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-600">Choose a group above to open its bracket comparison.</p>
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
  onToggle
}: {
  selectedPlayerBracket: NonNullable<GroupBracketComparisonView["selectedPlayerBracket"]>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const badge = getStatusBadge(selectedPlayerBracket.status);
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
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Bracket Detail</p>
          <h3 className="mt-1 text-2xl font-black leading-tight text-gray-950">{selectedPlayerBracket.name}</h3>
          <p className="mt-2 text-sm font-semibold text-gray-700">
            Champion:{" "}
            <span className="font-black text-gray-950">
              {selectedPlayerBracket.championPickName ?? "No champion pick yet"}
            </span>
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            Finalists: {selectedPlayerBracket.finalistNames.length > 0 ? selectedPlayerBracket.finalistNames.join(" vs ") : "No finalists yet"}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-black ${badge.className}`}>
          <span aria-hidden>{badge.icon}</span>
          {badge.label}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-gray-700">Round-by-round picks</p>
            <p className="mt-1 text-sm font-semibold text-gray-600">
              {meaningfulMatches.length} meaningful match{meaningfulMatches.length === 1 ? "" : "es"} shown
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
                      {match.status === "scheduled" ? "Open" : match.status === "final" ? "Final" : "Locked"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {match.homeTeamName} vs {match.awayTeamName}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    Picked winner: <span className="font-black text-gray-950">{match.predictedWinnerName ?? "No pick yet"}</span>
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-600">
                    Actual winner: {match.actualWinnerName ?? "Not decided yet"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-gray-600">No meaningful bracket picks to show yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getStatusBadge(status: BracketHealthStatus) {
  if (status === "alive") {
    return {
      icon: "🔥",
      label: "Alive",
      className: "bg-emerald-100 text-emerald-900"
    };
  }

  if (status === "eliminated") {
    return {
      icon: "❌",
      label: "Eliminated",
      className: "bg-rose-100 text-rose-900"
    };
  }

  return {
    icon: "⚠️",
    label: "At Risk",
    className: "bg-amber-100 text-amber-900"
  };
}
