import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";

export const LEADERBOARD_FEATURE_SETTING_KEYS = [
  "daily_winner_enabled",
  "perfect_pick_enabled",
  "leaderboard_activity_enabled"
] as const;

export type LeaderboardFeatureSettingKey = (typeof LEADERBOARD_FEATURE_SETTING_KEYS)[number];

type AppSettingRow = {
  key: string;
  boolean_value: boolean | null;
};

export type LeaderboardFeatureSettings = Record<LeaderboardFeatureSettingKey, boolean>;

export const DEFAULT_LEADERBOARD_FEATURE_SETTINGS: LeaderboardFeatureSettings = {
  daily_winner_enabled: false,
  perfect_pick_enabled: false,
  leaderboard_activity_enabled: false
};

export async function fetchLeaderboardFeatureSettings(): Promise<LeaderboardFeatureSettings> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("app_settings")
    .select("key,boolean_value")
    .in("key", [...LEADERBOARD_FEATURE_SETTING_KEYS]);

  if (error) {
    if (isMissingAppSettingsTableError(error.message)) {
      warnOptionalFeatureOnce(
        "app-settings-missing",
        "Leaderboard feature settings are unavailable; defaulting all leaderboard highlights off.",
        error.message
      );
      return { ...DEFAULT_LEADERBOARD_FEATURE_SETTINGS };
    }

    throw new Error(error.message);
  }

  const rows = (data as AppSettingRow[] | null) ?? [];
  return LEADERBOARD_FEATURE_SETTING_KEYS.reduce<LeaderboardFeatureSettings>((settings, key) => {
    const row = rows.find((candidate) => candidate.key === key);
    settings[key] = row?.boolean_value ?? DEFAULT_LEADERBOARD_FEATURE_SETTINGS[key];
    return settings;
  }, { ...DEFAULT_LEADERBOARD_FEATURE_SETTINGS });
}

export async function updateLeaderboardFeatureSetting(
  key: LeaderboardFeatureSettingKey,
  enabled: boolean
): Promise<LeaderboardFeatureSettings> {
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("app_settings").upsert(
    {
      key,
      boolean_value: enabled
    },
    { onConflict: "key" }
  );

  if (error) {
    if (isMissingAppSettingsTableError(error.message)) {
      throw new Error("Leaderboard feature settings are not available yet. Apply the app_settings migration first.");
    }

    throw new Error(error.message);
  }

  return fetchLeaderboardFeatureSettings();
}

export async function fetchBooleanAppSetting(
  key: string,
  defaultValue = false
): Promise<boolean> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("app_settings")
    .select("key,boolean_value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    if (isMissingAppSettingsTableError(error.message)) {
      warnOptionalFeatureOnce(
        `app-settings-missing:${key}`,
        `App setting ${key} is unavailable; defaulting to ${defaultValue ? "on" : "off"}.`,
        error.message
      );
      return defaultValue;
    }

    throw new Error(error.message);
  }

  const row = data as AppSettingRow | null;
  return row?.boolean_value ?? defaultValue;
}

function isMissingAppSettingsTableError(message: string) {
  return isMissingRelationError(message, "app_settings");
}
