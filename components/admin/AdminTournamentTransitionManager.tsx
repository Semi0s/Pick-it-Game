"use client";

import { useEffect, useState } from "react";
import {
  fetchTournamentTransitionSettingsAction,
  updateTournamentTransitionSettingsAction
} from "@/app/dashboard/actions";
import {
  DASHBOARD_TRIPTYCH_VIEW_KEYS,
  TOURNAMENT_MODALITIES,
  resolveTournamentTransitionSettings,
  type DashboardTriptychViewKey,
  type TournamentModality,
  type TournamentTransitionSettings
} from "@/lib/tournament-transition-helpers";

const MODALITY_LABELS: Record<TournamentModality, string> = {
  pre_tournament: "Pre-tournament",
  group_stage_live: "Group Stage live",
  knockout_live: "Knockout live",
  post_tournament: "Post-tournament"
};

const TRIPTYCH_VIEW_LABELS: Record<DashboardTriptychViewKey, string> = {
  group_stage_progress: "Group Stage progress",
  side_picks_progress: "Side Picks progress",
  knockout_progress: "Knockout progress",
  score_movement: "Score movement"
};

export function AdminTournamentTransitionManager() {
  const [settings, setSettings] = useState<TournamentTransitionSettings>(() => resolveTournamentTransitionSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchTournamentTransitionSettingsAction()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (!result.ok) {
          setMessage({ tone: "error", text: result.message });
          setIsLoading(false);
          return;
        }

        setSettings(result.settings);
        setMessage(null);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        if (!isMounted) {
          return;
        }

        setMessage({ tone: "error", text: error.message });
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function patchSettings(patch: Partial<TournamentTransitionSettings>) {
    setSettings((current) =>
      resolveTournamentTransitionSettings({
        ...current,
        ...patch,
        dashboardMessage: {
          ...current.dashboardMessage,
          ...(patch.dashboardMessage ?? {})
        },
        sessionBehavior: {
          ...current.sessionBehavior,
          ...(patch.sessionBehavior ?? {})
        },
        leftTriptych: {
          ...current.leftTriptych,
          ...(patch.leftTriptych ?? {})
        }
      })
    );
  }

  async function handleSave() {
    setIsSaving(true);
    const result = await updateTournamentTransitionSettingsAction(settings);
    setIsSaving(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setMessage({ tone: "success", text: result.message });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-600">
        Control live-mode messaging, dashboard entry behavior, and the left Triptych priority while the tournament changes state.
      </p>

      {message ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            message.tone === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Tournament modality</span>
          <select
            value={settings.modality}
            disabled={isLoading || isSaving}
            onChange={(event) =>
              patchSettings({
                modality: event.target.value as TournamentModality,
                leftTriptych: resolveTournamentTransitionSettings({ modality: event.target.value as TournamentModality }).leftTriptych
              })
            }
            className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
          >
            {TOURNAMENT_MODALITIES.map((modality) => (
              <option key={modality} value={modality}>
                {MODALITY_LABELS[modality]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleField
            label="Show Knockout Outlook"
            checked={settings.showKnockoutOutlook}
            disabled={isLoading || isSaving}
            onChange={(checked) =>
              patchSettings({
                showKnockoutOutlook: checked
              })
            }
          />
          <ToggleField
            label="Start each session on Dashboard"
            checked={settings.sessionBehavior.startEachSessionOnDashboard}
            disabled={isLoading || isSaving}
            onChange={(checked) =>
              patchSettings({
                sessionBehavior: {
                  ...settings.sessionBehavior,
                  startEachSessionOnDashboard: checked
                }
              })
            }
          />
          <ToggleField
            label="Show return-to-dashboard indicator"
            checked={settings.sessionBehavior.showReturnToDashboardIndicator}
            disabled={isLoading || isSaving}
            onChange={(checked) =>
              patchSettings({
                sessionBehavior: {
                  ...settings.sessionBehavior,
                  showReturnToDashboardIndicator: checked
                }
              })
            }
          />
        </div>
      </div>

      <div className="rounded-[1rem] border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Dashboard message</p>
            <p className="mt-1 text-sm font-semibold text-gray-600">This is the short transition explainer players see on the Dashboard.</p>
          </div>
          <ToggleField
            label="Active"
            checked={settings.dashboardMessage.active}
            disabled={isLoading || isSaving}
            compact
            onChange={(checked) =>
              patchSettings({
                dashboardMessage: {
                  ...settings.dashboardMessage,
                  active: checked
                }
              })
            }
          />
        </div>

        <div className="mt-4 grid gap-3">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Title</span>
            <input
              type="text"
              value={settings.dashboardMessage.title}
              disabled={isLoading || isSaving}
              onChange={(event) =>
                patchSettings({
                  dashboardMessage: {
                    ...settings.dashboardMessage,
                    title: event.target.value
                  }
                })
              }
              className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Short body</span>
            <textarea
              value={settings.dashboardMessage.body}
              disabled={isLoading || isSaving}
              onChange={(event) =>
                patchSettings({
                  dashboardMessage: {
                    ...settings.dashboardMessage,
                    body: event.target.value
                  }
                })
              }
              rows={3}
              className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
            />
          </label>
          <ToggleField
            label="Dismissible"
            checked={settings.dashboardMessage.dismissible}
            disabled={isLoading || isSaving}
            onChange={(checked) =>
              patchSettings({
                dashboardMessage: {
                  ...settings.dashboardMessage,
                  dismissible: checked
                }
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Left Triptych primary</span>
          <select
            value={settings.leftTriptych.primaryView}
            disabled={isLoading || isSaving}
            onChange={(event) =>
              patchSettings({
                leftTriptych: {
                  ...settings.leftTriptych,
                  primaryView: event.target.value as DashboardTriptychViewKey
                }
              })
            }
            className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
          >
            {DASHBOARD_TRIPTYCH_VIEW_KEYS.map((view) => (
              <option key={view} value={view}>
                {TRIPTYCH_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Left Triptych secondary</span>
          <select
            value={settings.leftTriptych.secondaryView}
            disabled={isLoading || isSaving}
            onChange={(event) =>
              patchSettings({
                leftTriptych: {
                  ...settings.leftTriptych,
                  secondaryView: event.target.value as DashboardTriptychViewKey
                }
              })
            }
            className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
          >
            {DASHBOARD_TRIPTYCH_VIEW_KEYS.filter((view) => view !== settings.leftTriptych.primaryView).map((view) => (
              <option key={view} value={view}>
                {TRIPTYCH_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isLoading || isSaving}
          className="inline-flex min-h-10 items-center justify-center rounded-[0.95rem] bg-accent px-4 py-2.5 text-sm font-black text-accent-text transition hover:bg-accent/95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save transition settings"}
        </button>
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  disabled,
  onChange,
  compact = false
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-[0.9rem] border border-gray-200 bg-white px-3 py-2.5 ${
        compact ? "min-w-[9rem]" : ""
      }`}
    >
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
      />
    </label>
  );
}
