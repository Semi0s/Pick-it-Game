"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveLegacyGroupScoringSetupAction } from "@/app/my-groups/actions";
import { ActionButton, ManagementBadge } from "@/components/player-management/Shared";

type LegacyGroupScoringSetupItem = {
  groupId: string;
  groupName: string;
  latestVersion: number;
};

type Props = {
  groups: LegacyGroupScoringSetupItem[];
  nextPath: string;
  availableGroupStageDates: Array<{ value: string; label: string }>;
  availableKnockoutDates: Array<{ value: string; label: string }>;
};

type FormState = {
  groupStagePredictionDepth: "simple_results" | "full_match_scores";
  fullMatchScoringVariant: "classic" | "goal_difference_bonus";
  groupBonusMode: "classic" | "early_bird" | "high_stakes" | "all_in";
  groupStagePicksDueAt: string;
  knockoutPicksDueAt: string;
};

export function GroupScoringSetupClient({
  groups,
  nextPath,
  availableGroupStageDates,
  availableKnockoutDates
}: Props) {
  const router = useRouter();
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.groupId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const defaultGroupStageDate = availableGroupStageDates[0]?.value ?? "";
  const defaultKnockoutDate =
    availableKnockoutDates.find((option) => option.value > defaultGroupStageDate)?.value ??
    availableKnockoutDates[0]?.value ??
    "";
  const [formState, setFormState] = useState<FormState>({
    groupStagePredictionDepth: "simple_results",
    fullMatchScoringVariant: "classic",
    groupBonusMode: "classic",
    groupStagePicksDueAt: defaultGroupStageDate,
    knockoutPicksDueAt: defaultKnockoutDate
  });

  const filteredKnockoutDates = useMemo(
    () => availableKnockoutDates.filter((option) => option.value > formState.groupStagePicksDueAt),
    [availableKnockoutDates, formState.groupStagePicksDueAt]
  );

  const activeGroup = useMemo(
    () => groups.find((group) => group.groupId === activeGroupId) ?? groups[0] ?? null,
    [activeGroupId, groups]
  );

  if (!activeGroup) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-950">
        Finish this one-time scoring setup for each legacy group before returning to the app.
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Groups requiring setup</p>
          <div className="mt-3 space-y-2">
            {groups.map((group) => (
              <button
                key={group.groupId}
                type="button"
                onClick={() => setActiveGroupId(group.groupId)}
                className={`w-full rounded-lg border px-3 py-3 text-left ${
                  group.groupId === activeGroup.groupId
                    ? "border-accent bg-accent-light/20"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-gray-900">{group.groupName}</span>
                  <ManagementBadge label={`v${group.latestVersion}`} tone="neutral" />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <form
          className="rounded-xl border border-gray-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!activeGroup) {
              return;
            }

            setIsSaving(true);
            setMessage(null);
            void saveLegacyGroupScoringSetupAction({
              groupId: activeGroup.groupId,
              groupStagePredictionDepth: formState.groupStagePredictionDepth,
              fullMatchScoringVariant: formState.fullMatchScoringVariant,
              groupBonusMode: formState.groupBonusMode,
              groupStagePicksDueAt: formState.groupStagePicksDueAt,
              knockoutPicksDueAt: formState.knockoutPicksDueAt
            })
              .then((result) => {
                setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                if (result.ok) {
                  router.replace(`/groups/scoring-setup?next=${encodeURIComponent(nextPath)}`);
                  router.refresh();
                }
              })
              .finally(() => setIsSaving(false));
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Legacy scoring setup</p>
              <h2 className="mt-1 text-xl font-black text-gray-950">{activeGroup.groupName}</h2>
              <p className="mt-1 text-sm font-semibold text-gray-600">
                This controls how this group scores existing shared player picks. Global leaderboard points are not changed.
              </p>
            </div>
            <ManagementBadge label="Required" tone="warning" />
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Scoring Format</span>
              <select
                value={formState.groupStagePredictionDepth}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    groupStagePredictionDepth: event.target.value as FormState["groupStagePredictionDepth"]
                  }))
                }
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="simple_results">Simple Results</option>
                <option value="full_match_scores">Full Match Scores</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Match Score Grading</span>
              <select
                value={formState.fullMatchScoringVariant}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    fullMatchScoringVariant: event.target.value as FormState["fullMatchScoringVariant"]
                  }))
                }
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                disabled={formState.groupStagePredictionDepth !== "full_match_scores"}
              >
                <option value="classic">Classic</option>
                <option value="goal_difference_bonus">Goal Difference Bonus</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Group Bonus Mode</span>
              <select
                value={formState.groupBonusMode}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    groupBonusMode: event.target.value as FormState["groupBonusMode"]
                  }))
                }
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="classic">Classic</option>
                <option value="early_bird">Early Bird</option>
                <option value="high_stakes">High Stakes</option>
                <option value="all_in">All In</option>
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Group Stage Picks Due</span>
                <select
                  value={formState.groupStagePicksDueAt}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      groupStagePicksDueAt: event.target.value,
                      knockoutPicksDueAt:
                        current.knockoutPicksDueAt > event.target.value
                          ? current.knockoutPicksDueAt
                          : (availableKnockoutDates.find((option) => option.value > event.target.value)?.value ?? "")
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  {availableGroupStageDates.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cutoff: 00:00 GMT</p>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Knockout Picks Due</span>
                <select
                  value={formState.knockoutPicksDueAt}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      knockoutPicksDueAt: event.target.value
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  {filteredKnockoutDates.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Cutoff: 00:00 GMT on the selected day, no later than knockout phase start
                </p>
              </label>
            </div>

            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-600">
              Players complete one shared Seed Builder for projected qualifiers and yellow knockout cards.
              <br />
              Exact Group Stage match scores remain an optional player-level upgrade for extra points.
              <br />
              Changing this group’s scoring rules will recalculate the group leaderboard from existing picks. Global leaderboard points are not changed.
            </div>

            {message ? (
              <div
                className={`rounded-lg px-3 py-3 text-sm font-semibold ${
                  message.tone === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                }`}
              >
                {message.text}
              </div>
            ) : null}

            <ActionButton type="submit" disabled={isSaving} fullWidth>
              {isSaving ? "Saving scoring setup..." : "Save and lock scoring settings"}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
