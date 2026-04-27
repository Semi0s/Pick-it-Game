import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingAnyRelationError,
  isMissingColumnError,
  isMissingRelationError,
  isMissingStorageBucketError
} from "@/lib/schema-safety";

export type SystemReadinessIssue = {
  key: string;
  label: string;
  detail: string;
};

export type SystemReadinessItem = {
  key: string;
  label: string;
  status: "ready" | "degraded" | "missing";
  detail: string;
};

export type SystemReadinessReport = {
  checkedAt: string;
  missingSchema: SystemReadinessIssue[];
  storageConfigIssues: SystemReadinessIssue[];
  featureReadiness: SystemReadinessItem[];
};

export type StartupReadinessSummary = {
  hasCriticalIssues: boolean;
  message: string | null;
};

export async function getSystemReadinessReport(): Promise<SystemReadinessReport> {
  const checkedAt = new Date().toISOString();

  if (!hasSupabaseConfig()) {
    return {
      checkedAt,
      missingSchema: [],
      storageConfigIssues: [
        {
          key: "supabase-config",
          label: "Supabase configuration",
          detail: "Supabase environment variables are missing, so storage-backed features stay off."
        }
      ],
      featureReadiness: [
        {
          key: "leaderboard-social",
          label: "Leaderboard social layer",
          status: "missing",
          detail: "Requires a configured Supabase project."
        },
        {
          key: "avatar-system",
          label: "Avatar system",
          status: "missing",
          detail: "Requires a configured Supabase project."
        },
        {
          key: "trophy-system",
          label: "Trophy system",
          status: "missing",
          detail: "Requires a configured Supabase project."
        }
      ]
    };
  }

  const adminSupabase = createAdminClient();
  const [appSettingsCheck, leaderboardEventsCheck, trophiesCheck, userTrophiesCheck, usersCheck, avatarBucketCheck] =
    await Promise.all([
      checkTable(adminSupabase, "app_settings", ["key"]),
      checkTable(adminSupabase, "leaderboard_events", ["id", "event_type"]),
      checkTable(adminSupabase, "trophies", ["id", "award_source", "tier"]),
      checkTable(adminSupabase, "user_trophies", ["id", "user_id", "trophy_id"]),
      checkTable(adminSupabase, "users", ["id", "avatar_url", "home_team_id"]),
      checkAvatarBucket(adminSupabase)
    ]);

  const missingSchema: SystemReadinessIssue[] = [];
  const storageConfigIssues: SystemReadinessIssue[] = [];

  for (const check of [appSettingsCheck, leaderboardEventsCheck, trophiesCheck, userTrophiesCheck, usersCheck]) {
    if (!check.ok) {
      missingSchema.push({
        key: check.key,
        label: check.label,
        detail: check.detail
      });
    }
  }

  if (!avatarBucketCheck.ok) {
    storageConfigIssues.push({
      key: avatarBucketCheck.key,
      label: avatarBucketCheck.label,
      detail: avatarBucketCheck.detail
    });
  }

  const featureReadiness: SystemReadinessItem[] = [
    {
      key: "leaderboard-social",
      label: "Leaderboard social layer",
      status: appSettingsCheck.ok && leaderboardEventsCheck.ok ? "ready" : "missing",
      detail:
        appSettingsCheck.ok && leaderboardEventsCheck.ok
          ? "Feature toggles and activity events are available."
          : "Needs app_settings and leaderboard_events."
    },
    {
      key: "avatar-system",
      label: "Avatar system",
      status: usersCheck.ok && avatarBucketCheck.ok ? "ready" : usersCheck.ok || avatarBucketCheck.ok ? "degraded" : "missing",
      detail:
        usersCheck.ok && avatarBucketCheck.ok
          ? "Profile avatars can upload and render."
          : "Needs users.avatar_url and the avatars storage bucket."
    },
    {
      key: "trophy-system",
      label: "Trophy system",
      status: trophiesCheck.ok && userTrophiesCheck.ok ? "ready" : "missing",
      detail:
        trophiesCheck.ok && userTrophiesCheck.ok
          ? "Trophies can be awarded and displayed."
          : "Needs trophies, trophy metadata columns, and user_trophies."
    }
  ];

  return {
    checkedAt,
    missingSchema,
    storageConfigIssues,
    featureReadiness
  };
}

async function checkTable(
  adminSupabase: ReturnType<typeof createAdminClient>,
  table: string,
  columns: string[]
):
  Promise<
    | { ok: true; key: string; label: string }
    | { ok: false; key: string; label: string; detail: string }
  > {
  const { error } = await adminSupabase
    .from(table)
    .select(columns.join(","))
    .limit(1);

  const label = formatRelationLabel(table);
  if (!error) {
    return { ok: true, key: table, label };
  }

  if (isMissingRelationError(error.message, table)) {
    return {
      ok: false,
      key: table,
      label,
      detail: `Missing table: public.${table}`
    };
  }

  const missingColumn = columns.find((column) => isMissingColumnError(error.message, table, column));
  if (missingColumn) {
    return {
      ok: false,
      key: `${table}.${missingColumn}`,
      label,
      detail: `Missing column: public.${table}.${missingColumn}`
    };
  }

  if (isMissingAnyRelationError(error.message, [table])) {
    return {
      ok: false,
      key: table,
      label,
      detail: `Missing schema dependency in public.${table}`
    };
  }

  return {
    ok: false,
    key: table,
    label,
    detail: `Could not verify ${table}: ${error.message}`
  };
}

async function checkAvatarBucket(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { error } = await adminSupabase.storage.from("avatars").list("", { limit: 1 });

  if (!error) {
    return { ok: true as const, key: "avatars-bucket", label: "Avatar storage bucket" };
  }

  if (isMissingStorageBucketError(error.message, "avatars")) {
    return {
      ok: false as const,
      key: "avatars-bucket",
      label: "Avatar storage bucket",
      detail: "Missing storage bucket: avatars"
    };
  }

  return {
    ok: false as const,
    key: "avatars-bucket",
    label: "Avatar storage bucket",
    detail: `Could not verify the avatars bucket: ${error.message}`
  };
}

function formatRelationLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getStartupReadinessSummary(report: SystemReadinessReport): StartupReadinessSummary {
  const missingFeatureCount = report.featureReadiness.filter((item) => item.status === "missing").length;
  const degradedFeatureCount = report.featureReadiness.filter((item) => item.status === "degraded").length;
  const schemaCount = report.missingSchema.length;
  const storageCount = report.storageConfigIssues.length;

  if (schemaCount === 0 && storageCount === 0 && missingFeatureCount === 0 && degradedFeatureCount === 0) {
    return {
      hasCriticalIssues: false,
      message: null
    };
  }

  if (schemaCount > 0) {
    return {
      hasCriticalIssues: true,
      message: `Some app features are limited right now because ${schemaCount} required schema item${schemaCount === 1 ? " is" : "s are"} missing.`
    };
  }

  if (storageCount > 0) {
    return {
      hasCriticalIssues: true,
      message: `Some app features are limited right now because storage or configuration is incomplete.`
    };
  }

  if (missingFeatureCount > 0 || degradedFeatureCount > 0) {
    return {
      hasCriticalIssues: true,
      message: `Some app features are limited right now while setup finishes.`
    };
  }

  return {
    hasCriticalIssues: false,
    message: null
  };
}
