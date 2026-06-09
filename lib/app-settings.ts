import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumnError, isMissingRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";

export const PUBLIC_PLAYER_SIGNUP_ENABLED_KEY = "public_player_signup_enabled";
export const PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY = "public_signup_default_group_id";
export const PUBLIC_SIGNUP_DEFAULT_TIER_KEY = "public_signup_default_tier";

export const LEADERBOARD_FEATURE_SETTING_KEYS = [
  "daily_winner_enabled",
  "perfect_pick_enabled",
  "leaderboard_activity_enabled",
  "leaderboard_comments_enabled"
] as const;

export type LeaderboardFeatureSettingKey = (typeof LEADERBOARD_FEATURE_SETTING_KEYS)[number];

type AppSettingRow = {
  key: string;
  boolean_value: boolean | null;
  integer_value?: number | null;
  text_value?: string | null;
};

export type LeaderboardFeatureSettings = Record<LeaderboardFeatureSettingKey, boolean>;

export const DEFAULT_LEADERBOARD_FEATURE_SETTINGS: LeaderboardFeatureSettings = {
  daily_winner_enabled: false,
  perfect_pick_enabled: false,
  leaderboard_activity_enabled: false,
  leaderboard_comments_enabled: false
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

export async function updateBooleanAppSetting(
  key: string,
  enabled: boolean
): Promise<boolean> {
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
      throw new Error(`App setting ${key} is not available yet. Apply the app_settings migration first.`);
    }

    throw new Error(error.message);
  }

  return fetchBooleanAppSetting(key, enabled);
}

export async function fetchTextAppSetting(
  key: string,
  defaultValue: string | null = null
): Promise<string | null> {
  const adminSupabase = createAdminClient();
  const result = await adminSupabase
    .from("app_settings")
    .select("key,text_value")
    .eq("key", key)
    .maybeSingle();

  if (!result.error) {
    const row = result.data as AppSettingRow | null;
    return row?.text_value ?? defaultValue;
  }

  if (isMissingColumnError(result.error.message, "app_settings", "text_value")) {
    warnOptionalFeatureOnce(
      `app-settings-missing-text:${key}`,
      `App setting ${key} is loading without text_value support; defaulting to ${defaultValue ?? "null"}.`,
      result.error.message
    );
    return defaultValue;
  }

  if (isMissingAppSettingsTableError(result.error.message)) {
    warnOptionalFeatureOnce(
      `app-settings-missing:${key}:text`,
      `App setting ${key} is unavailable; defaulting to ${defaultValue ?? "null"}.`,
      result.error.message
    );
    return defaultValue;
  }

  throw new Error(result.error.message);
}

export async function fetchIntegerAppSetting(
  key: string,
  defaultValue: number
): Promise<number> {
  const adminSupabase = createAdminClient();
  const fullQuery = await adminSupabase
    .from("app_settings")
    .select("key,integer_value")
    .eq("key", key)
    .maybeSingle();

  if (!fullQuery.error) {
    const row = fullQuery.data as AppSettingRow | null;
    return row?.integer_value ?? defaultValue;
  }

  if (isMissingColumnError(fullQuery.error.message, "app_settings", "integer_value")) {
    warnOptionalFeatureOnce(
      `app-settings-missing-integer:${key}`,
      `App setting ${key} is loading without integer_value support; defaulting to ${defaultValue}.`,
      fullQuery.error.message
    );
    return defaultValue;
  }

  if (isMissingAppSettingsTableError(fullQuery.error.message)) {
    warnOptionalFeatureOnce(
      `app-settings-missing:${key}:integer`,
      `App setting ${key} is unavailable; defaulting to ${defaultValue}.`,
      fullQuery.error.message
    );
    return defaultValue;
  }

  throw new Error(fullQuery.error.message);
}

export async function updateIntegerAppSetting(
  key: string,
  value: number
): Promise<number> {
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("app_settings").upsert(
    {
      key,
      integer_value: value
    },
    { onConflict: "key" }
  );

  if (error) {
    if (isMissingAppSettingsTableError(error.message)) {
      throw new Error(`App setting ${key} is not available yet. Apply the app_settings migration first.`);
    }

    if (isMissingColumnError(error.message, "app_settings", "integer_value")) {
      throw new Error(`App setting ${key} needs integer_value support before it can be updated.`);
    }

    throw new Error(error.message);
  }

  return fetchIntegerAppSetting(key, value);
}

function isMissingAppSettingsTableError(message: string) {
  return isMissingRelationError(message, "app_settings");
}
