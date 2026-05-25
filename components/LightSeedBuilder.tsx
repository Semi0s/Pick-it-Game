"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { saveLightSeedBuilderAction } from "@/app/groups/actions";
import { ActionButton } from "@/components/player-management/Shared";
import { showAppToast } from "@/lib/app-toast";
import {
  buildDefaultLightSeedBuilderSnapshot,
  type LightSeedBuilderSnapshot
} from "@/lib/group-stage-modes";
import { formatGroupName, normalizeGroupKey } from "@/lib/group-standings";
import type { MatchWithTeams, Team } from "@/lib/types";
import { getLocalGroupMatches } from "@/lib/group-matches";

type LightSeedBuilderProps = {
  initialMatches?: MatchWithTeams[];
  initialKnockoutSeeded?: boolean;
  initialSnapshot?: LightSeedBuilderSnapshot | null;
  requiredThirdPlaceQualifierCount?: number;
};

type RankedTeam = {
  id: string;
  name: string;
  shortName: string;
  groupName: string;
  flagEmoji: string;
};

export function LightSeedBuilder({
  initialMatches,
  initialKnockoutSeeded = false,
  initialSnapshot,
  requiredThirdPlaceQualifierCount = 0
}: LightSeedBuilderProps) {
  const matches = initialMatches ?? getLocalGroupMatches();
  const teams = useMemo(
    () =>
      Array.from(
        new Map(
          matches.flatMap((match) => {
            const entries: Array<[string, Team]> = [];
            if (match.homeTeam?.id) {
              entries.push([match.homeTeam.id, match.homeTeam]);
            }
            if (match.awayTeam?.id) {
              entries.push([match.awayTeam.id, match.awayTeam]);
            }
            return entries;
          })
        ).values()
      ),
    [matches]
  );
  const defaultSnapshot = useMemo(() => buildDefaultLightSeedBuilderSnapshot(teams), [teams]);
  const [groupRankings, setGroupRankings] = useState<LightSeedBuilderSnapshot["groupRankings"]>(
    initialSnapshot?.groupRankings?.length ? initialSnapshot.groupRankings : defaultSnapshot.groupRankings
  );
  const [thirdPlaceRankings, setThirdPlaceRankings] = useState<string[]>(
    initialSnapshot?.thirdPlaceRankings?.length
      ? [...initialSnapshot.thirdPlaceRankings]
          .sort((left, right) => left.rank - right.rank)
          .map((row) => row.teamId)
      : []
  );
  const [isSaving, setIsSaving] = useState(false);

  const teamsById = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.id,
          {
            id: team.id,
            name: team.name,
            shortName: team.shortName,
            groupName: normalizeGroupKey(team.groupName) ?? team.groupName,
            flagEmoji: team.flagEmoji
          } satisfies RankedTeam
        ])
      ),
    [teams]
  );
  const sortedGroupNames = useMemo(
    () =>
      groupRankings
        .map((ranking) => normalizeGroupKey(ranking.groupName) ?? ranking.groupName)
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    [groupRankings]
  );
  const groupRankingsByGroup = useMemo(
    () =>
      new Map(
        groupRankings.map((ranking) => [
          normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
          ranking.rankedTeamIds
        ])
      ),
    [groupRankings]
  );
  const derivedThirdPlacePool = useMemo(
    () =>
      sortedGroupNames
        .map((groupName) => {
          const rankedTeamIds = groupRankingsByGroup.get(groupName) ?? [];
          const thirdPlaceTeamId = rankedTeamIds[2] ?? null;
          return thirdPlaceTeamId ? teamsById.get(thirdPlaceTeamId) ?? null : null;
        })
        .filter((team): team is RankedTeam => Boolean(team)),
    [groupRankingsByGroup, sortedGroupNames, teamsById]
  );
  const normalizedThirdPlaceRankings = useMemo(() => {
    const poolIds = new Set(derivedThirdPlacePool.map((team) => team.id));
    const preserved = thirdPlaceRankings.filter((teamId) => poolIds.has(teamId));
    const missing = derivedThirdPlacePool
      .map((team) => team.id)
      .filter((teamId) => !preserved.includes(teamId));
    return [...preserved, ...missing];
  }, [derivedThirdPlacePool, thirdPlaceRankings]);
  const canSave = groupRankings.every((ranking) => ranking.rankedTeamIds.length === 4) &&
    requiredThirdPlaceQualifierCount > 0 &&
    normalizedThirdPlaceRankings.length >= requiredThirdPlaceQualifierCount;
  const isReadOnly = initialKnockoutSeeded;

  function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) {
      return items;
    }

    const nextItems = [...items];
    [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
    return nextItems;
  }

  function updateGroupRanking(groupName: string, nextRankedTeamIds: string[]) {
    setGroupRankings((current) =>
      current.map((ranking) =>
        (normalizeGroupKey(ranking.groupName) ?? ranking.groupName) === groupName
          ? { ...ranking, rankedTeamIds: nextRankedTeamIds }
          : ranking
      )
    );
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await saveLightSeedBuilderAction({
        groupRankings: groupRankings.map((ranking) => ({
          groupName: normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
          rankedTeamIds: ranking.rankedTeamIds
        })),
        rankedThirdPlaceTeamIds: normalizedThirdPlaceRankings.slice(0, requiredThirdPlaceQualifierCount)
      });

      showAppToast({
        tone: result.ok ? "success" : "error",
        text: result.message
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-dark">Simple Results</p>
        <h2 className="mt-2 text-2xl font-black text-gray-950">Build your projected knockout seeds directly</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
          Rank each group from 1st to 4th. Then rank the qualifying 3rd-place teams above the cutoff. Your saved seed order powers the yellow projected knockout cards.
        </p>
        <p className="mt-2 text-xs font-semibold text-gray-500">
          These projected group seeds are currently shared across leagues and feed one global projected knockout view for your account.
        </p>
        {isReadOnly ? (
          <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
            Projected group seeds are locked now that the official knockout phase has opened.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        {sortedGroupNames.map((groupName) => {
          const rankedTeamIds = groupRankingsByGroup.get(groupName) ?? [];
          const rankedTeams = rankedTeamIds
            .map((teamId) => teamsById.get(teamId) ?? null)
            .filter((team): team is RankedTeam => Boolean(team));

          return (
            <div key={groupName} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-dark">Group</p>
                  <h3 className="text-xl font-black text-gray-950">{formatGroupName(groupName)}</h3>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-700">
                  Seed order
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {rankedTeams.map((team, index) => (
                  <div
                    key={team.id}
                    className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-black text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="text-base">{team.flagEmoji ?? ""}</span>
                        <span className="truncate text-sm font-black text-gray-950">{team.name}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {team.shortName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${team.name} up in ${groupName}`}
                        disabled={isReadOnly || index === 0}
                        onClick={() => updateGroupRanking(groupName, moveItem(rankedTeamIds, index, -1))}
                        className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition hover:border-accent hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${team.name} down in ${groupName}`}
                        disabled={isReadOnly || index === rankedTeams.length - 1}
                        onClick={() => updateGroupRanking(groupName, moveItem(rankedTeamIds, index, 1))}
                        className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition hover:border-accent hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <span className="px-1 text-gray-400">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-dark">Third-Place Bubble</p>
            <h3 className="mt-1 text-xl font-black text-gray-950">Rank your 3rd-place qualifiers</h3>
            <p className="mt-2 text-sm font-semibold text-gray-600">
              Teams above the cutoff qualify into the projected Round of 32. We only save combinations that resolve to a valid bracket.
            </p>
          </div>
          <span className="rounded-full bg-accent-light px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-dark">
            Top {requiredThirdPlaceQualifierCount || "?"} qualify
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {normalizedThirdPlaceRankings.map((teamId, index) => {
            const team = teamsById.get(teamId);
            if (!team) {
              return null;
            }

            return (
              <div key={team.id}>
                {requiredThirdPlaceQualifierCount > 0 && index === requiredThirdPlaceQualifierCount ? (
                  <div className="pb-2 pt-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-rose-600">
                    Cutoff
                  </div>
                ) : null}
                <div className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="text-base">{team.flagEmoji ?? ""}</span>
                      <span className="truncate text-sm font-black text-gray-950">{team.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {team.groupName} 3rd
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move ${team.name} up in third-place qualifiers`}
                      disabled={isReadOnly || index === 0}
                      onClick={() => setThirdPlaceRankings(moveItem(normalizedThirdPlaceRankings, index, -1))}
                      className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition hover:border-accent hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${team.name} down in third-place qualifiers`}
                      disabled={isReadOnly || index === normalizedThirdPlaceRankings.length - 1}
                      onClick={() => setThirdPlaceRankings(moveItem(normalizedThirdPlaceRankings, index, 1))}
                      className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition hover:border-accent hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-dark">Projected Output</p>
            <p className="mt-1 text-sm font-semibold text-gray-600">
              {canSave
                ? "Your ranking is valid and ready to save into the projected knockout flow."
                : `Finish every group and rank exactly ${requiredThirdPlaceQualifierCount || "the required"} third-place qualifiers to continue.`}
            </p>
          </div>
          <ActionButton type="button" disabled={!canSave || isSaving || isReadOnly} onClick={() => void handleSave()}>
            {isSaving ? "Saving..." : "Save Group Seeds"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
