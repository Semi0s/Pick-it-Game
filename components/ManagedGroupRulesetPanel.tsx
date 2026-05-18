"use client";

import { useEffect, useState } from "react";
import { saveManagedGroupRulesetAction } from "@/app/my-groups/actions";
import {
  MANAGED_GROUP_RULESET_PRESETS,
  summarizeManagedGroupRuleset,
  type ManagedGroupRulesetPresetKey,
  type ManagedGroupRulesetSummary,
  type SidePickPackageOption
} from "@/lib/scoped-scoring";
import { showAppToast } from "@/lib/app-toast";
import { ActionButton, InlineDisclosureButton, ManagementBadge } from "@/components/player-management/Shared";

type Props = {
  groupId: string;
  canManageRuleset: boolean;
  activeRuleset: ManagedGroupRulesetSummary | null;
  sidePickPackages: SidePickPackageOption[];
  onSaved: () => Promise<void>;
};

type FormState = {
  presetKey: ManagedGroupRulesetPresetKey;
  status: "draft" | "active";
};

export function ManagedGroupRulesetPanel({
  groupId,
  canManageRuleset,
  activeRuleset,
  sidePickPackages,
  onSaved
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    presetKey: activeRuleset?.presetKey ?? "classic",
    status: activeRuleset?.status === "draft" ? "draft" : "active"
  });

  useEffect(() => {
    setFormState({
      presetKey: activeRuleset?.presetKey ?? "classic",
      status: activeRuleset?.status === "draft" ? "draft" : "active"
    });
  }, [activeRuleset]);

  if (!canManageRuleset) {
    return null;
  }

  const selectedPreset =
    MANAGED_GROUP_RULESET_PRESETS.find((preset) => preset.key === formState.presetKey) ??
    MANAGED_GROUP_RULESET_PRESETS[0];
  const selectedPackage =
    sidePickPackages.find((pkg) => pkg.key === selectedPreset.ruleset.sidePickPackageKey) ?? null;
  const currentSummary = activeRuleset
    ? summarizeManagedGroupRuleset(activeRuleset)
    : {
        statusLabel: "no active ruleset",
        summary: "Classic ruleset with no custom bonuses enabled."
      };
  const isLocked = activeRuleset?.status === "locked" || Boolean(activeRuleset?.scoringSettingsLockedAt);

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Scoring Rules</h4>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            Applies to this group only. Affects the group leaderboard only. Does not affect the global leaderboard or average group standings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManagementBadge label={`v${activeRuleset?.version ?? 0}`} tone="neutral" />
          <ManagementBadge label={currentSummary.statusLabel} tone={isLocked ? "warning" : "neutral"} />
          <InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />
        </div>
      </div>

      {isOpen ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Current ruleset</p>
            <p className="mt-2 text-sm font-black text-gray-900">
              {activeRuleset?.presetKey
                ? MANAGED_GROUP_RULESET_PRESETS.find((preset) => preset.key === activeRuleset.presetKey)?.label ?? "Custom"
                : "Classic"}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-600">{currentSummary.summary}</p>
          </div>

          {isLocked ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
              This group’s scoring settings are locked. They stay visible here for reference, but normal manager edits are closed.
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setIsSaving(true);
                void saveManagedGroupRulesetAction({
                  groupId,
                  presetKey: formState.presetKey,
                  status: formState.status
                })
                  .then(async (result) => {
                    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
                    if (result.ok) {
                      await onSaved();
                    }
                  })
                  .finally(() => setIsSaving(false));
              }}
            >
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Preset</span>
                <select
                  value={formState.presetKey}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      presetKey: event.target.value as ManagedGroupRulesetPresetKey
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  {MANAGED_GROUP_RULESET_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-sm font-black text-gray-900">{selectedPreset.label}</p>
                <p className="mt-1 text-sm font-semibold text-gray-600">{selectedPreset.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-gray-600">
                  <span className="rounded-md bg-white px-2 py-1">
                    Early completion +{selectedPreset.ruleset.earlyGroupStageCompletionBonus}
                  </span>
                  <span className="rounded-md bg-white px-2 py-1">
                    Knockout completion +{selectedPreset.ruleset.knockoutCompletionBonus}
                  </span>
                  <span className="rounded-md bg-white px-2 py-1">
                    Final matchup +{selectedPreset.ruleset.finalMatchupBonus}
                  </span>
                  <span className="rounded-md bg-white px-2 py-1">
                    Exact final score +{selectedPreset.ruleset.exactFinalScoreBonus}
                  </span>
                  <span className="rounded-md bg-white px-2 py-1">
                    Side picks {selectedPackage ? `${selectedPackage.name}` : "off"}
                  </span>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Save as</span>
                <select
                  value={formState.status}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      status: event.target.value as "draft" | "active"
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </label>

              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-600">
                Applies to this group only.
                <br />
                Affects the group leaderboard only.
                <br />
                Does not affect the global leaderboard or average group standings.
                <br />
                Player prediction data is currently shared across leagues.
                <br />
                Players complete one shared Seed Builder, then can optionally add exact Group Stage match scores for more upside.
                <br />
                Changing this group’s scoring rules recalculates the group leaderboard from existing picks. Global leaderboard points are not changed.
              </div>

              <ActionButton type="submit" disabled={isSaving} fullWidth>
                {isSaving ? "Saving rules..." : `Save ${selectedPreset.label}`}
              </ActionButton>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
