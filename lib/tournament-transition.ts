import { createAdminClient } from "./supabase/admin.ts";
import { isMissingRelationError, warnOptionalFeatureOnce } from "./schema-safety.ts";
export {
  buildTournamentTransitionMessageId,
  DASHBOARD_TRIPTYCH_VIEW_KEYS,
  DEFAULT_TOURNAMENT_MODALITY,
  getDefaultTournamentTransitionMessage,
  getDefaultTriptychViews,
  isLiveTournamentModality,
  normalizeDashboardTriptychViewKey,
  normalizeTournamentModality,
  resolveTournamentTransitionSettings,
  shouldForceDashboardStartThisSession,
  shouldShowReturnToDashboardIndicator,
  shouldSkipLegacyLaunchOnboarding,
  TOURNAMENT_MODALITIES,
  type DashboardTriptychViewKey,
  type TournamentModality,
  type TournamentTransitionSettings
} from "./tournament-transition-helpers.ts";
import {
  resolveTournamentTransitionSettings,
  type TournamentTransitionSettings
} from "./tournament-transition-helpers.ts";

export const TOURNAMENT_MODALITY_KEY = "tournament_modality";
export const DASHBOARD_SHOW_KNOCKOUT_OUTLOOK_KEY = "dashboard_show_knockout_outlook";
export const DASHBOARD_TRANSITION_MESSAGE_ACTIVE_KEY = "dashboard_transition_message_active";
export const DASHBOARD_TRANSITION_MESSAGE_TITLE_KEY = "dashboard_transition_message_title";
export const DASHBOARD_TRANSITION_MESSAGE_BODY_KEY = "dashboard_transition_message_body";
export const DASHBOARD_TRANSITION_MESSAGE_DISMISSIBLE_KEY = "dashboard_transition_message_dismissible";
export const DASHBOARD_TRANSITION_FORCE_DASHBOARD_START_KEY = "dashboard_transition_force_dashboard_start";
export const DASHBOARD_TRANSITION_RETURN_INDICATOR_KEY = "dashboard_transition_return_indicator";
export const DASHBOARD_TRIPTYCH_PRIMARY_VIEW_KEY = "dashboard_triptych_left_primary_view";
export const DASHBOARD_TRIPTYCH_SECONDARY_VIEW_KEY = "dashboard_triptych_left_secondary_view";

type AppSettingRow = {
  key: string;
  boolean_value?: boolean | null;
  text_value?: string | null;
};

const SETTINGS_KEYS = [
  TOURNAMENT_MODALITY_KEY,
  DASHBOARD_SHOW_KNOCKOUT_OUTLOOK_KEY,
  DASHBOARD_TRANSITION_MESSAGE_ACTIVE_KEY,
  DASHBOARD_TRANSITION_MESSAGE_TITLE_KEY,
  DASHBOARD_TRANSITION_MESSAGE_BODY_KEY,
  DASHBOARD_TRANSITION_MESSAGE_DISMISSIBLE_KEY,
  DASHBOARD_TRANSITION_FORCE_DASHBOARD_START_KEY,
  DASHBOARD_TRANSITION_RETURN_INDICATOR_KEY,
  DASHBOARD_TRIPTYCH_PRIMARY_VIEW_KEY,
  DASHBOARD_TRIPTYCH_SECONDARY_VIEW_KEY
] as const;


export async function fetchTournamentTransitionSettings(): Promise<TournamentTransitionSettings> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("app_settings")
    .select("key,boolean_value,text_value")
    .in("key", [...SETTINGS_KEYS]);

  if (error) {
    if (isMissingAppSettingsError(error.message)) {
      warnOptionalFeatureOnce(
        "tournament-transition-settings-missing",
        "Tournament transition settings are unavailable; defaulting to pre-tournament behavior.",
        error.message
      );
      return resolveTournamentTransitionSettings();
    }

    throw new Error(error.message);
  }

  const rows = ((data as AppSettingRow[] | null) ?? []).reduce<Record<string, AppSettingRow>>((accumulator, row) => {
    accumulator[row.key] = row;
    return accumulator;
  }, {});

  return resolveTournamentTransitionSettings({
    modality: rows[TOURNAMENT_MODALITY_KEY]?.text_value ?? null,
    showKnockoutOutlook: rows[DASHBOARD_SHOW_KNOCKOUT_OUTLOOK_KEY]?.boolean_value ?? false,
    dashboardMessage: {
      active: rows[DASHBOARD_TRANSITION_MESSAGE_ACTIVE_KEY]?.boolean_value ?? false,
      title: rows[DASHBOARD_TRANSITION_MESSAGE_TITLE_KEY]?.text_value ?? null,
      body: rows[DASHBOARD_TRANSITION_MESSAGE_BODY_KEY]?.text_value ?? null,
      dismissible: rows[DASHBOARD_TRANSITION_MESSAGE_DISMISSIBLE_KEY]?.boolean_value ?? true
    },
    sessionBehavior: {
      startEachSessionOnDashboard: rows[DASHBOARD_TRANSITION_FORCE_DASHBOARD_START_KEY]?.boolean_value ?? false,
      showReturnToDashboardIndicator: rows[DASHBOARD_TRANSITION_RETURN_INDICATOR_KEY]?.boolean_value ?? false
    },
    leftTriptych: {
      primaryView: rows[DASHBOARD_TRIPTYCH_PRIMARY_VIEW_KEY]?.text_value ?? null,
      secondaryView: rows[DASHBOARD_TRIPTYCH_SECONDARY_VIEW_KEY]?.text_value ?? null
    }
  });
}

export async function saveTournamentTransitionSettings(
  settings: TournamentTransitionSettings
): Promise<TournamentTransitionSettings> {
  const resolved = resolveTournamentTransitionSettings(settings);
  const adminSupabase = createAdminClient();

  const buildSettingRow = (
    key: string,
    input: {
      booleanValue?: boolean;
      textValue?: string | null;
    }
  ) => ({
    key,
    boolean_value: input.booleanValue ?? false,
    text_value: input.textValue ?? null
  });

  const { error } = await adminSupabase.from("app_settings").upsert(
    [
      buildSettingRow(TOURNAMENT_MODALITY_KEY, { textValue: resolved.modality }),
      buildSettingRow(DASHBOARD_SHOW_KNOCKOUT_OUTLOOK_KEY, {
        booleanValue: resolved.showKnockoutOutlook
      }),
      buildSettingRow(DASHBOARD_TRANSITION_MESSAGE_ACTIVE_KEY, {
        booleanValue: resolved.dashboardMessage.active
      }),
      buildSettingRow(DASHBOARD_TRANSITION_MESSAGE_TITLE_KEY, {
        textValue: resolved.dashboardMessage.title
      }),
      buildSettingRow(DASHBOARD_TRANSITION_MESSAGE_BODY_KEY, {
        textValue: resolved.dashboardMessage.body
      }),
      buildSettingRow(DASHBOARD_TRANSITION_MESSAGE_DISMISSIBLE_KEY, {
        booleanValue: resolved.dashboardMessage.dismissible
      }),
      buildSettingRow(DASHBOARD_TRANSITION_FORCE_DASHBOARD_START_KEY, {
        booleanValue: resolved.sessionBehavior.startEachSessionOnDashboard
      }),
      buildSettingRow(DASHBOARD_TRANSITION_RETURN_INDICATOR_KEY, {
        booleanValue: resolved.sessionBehavior.showReturnToDashboardIndicator
      }),
      buildSettingRow(DASHBOARD_TRIPTYCH_PRIMARY_VIEW_KEY, {
        textValue: resolved.leftTriptych.primaryView
      }),
      buildSettingRow(DASHBOARD_TRIPTYCH_SECONDARY_VIEW_KEY, {
        textValue: resolved.leftTriptych.secondaryView
      })
    ],
    { onConflict: "key" }
  );

  if (error) {
    if (isMissingAppSettingsError(error.message)) {
      throw new Error("Tournament transition settings are not available yet. Apply the app_settings migration first.");
    }

    throw new Error(error.message);
  }

  return resolved;
}

function isMissingAppSettingsError(message: string) {
  return isMissingRelationError(message, "app_settings");
}
