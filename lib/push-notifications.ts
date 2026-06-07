import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicWebPushVapidKey } from "@/lib/push-config";
import { isMissingColumnError } from "@/lib/schema-safety";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export type PushPlatform = "ios" | "android" | "web";
export type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied" | "unknown";

type PushTokenRow = {
  id: string;
  user_id: string;
  platform: PushPlatform;
  token: string;
  created_at: string;
  updated_at?: string | null;
  last_seen_at?: string | null;
  permission_state?: PushPermissionState | null;
};

type WebPushRegistrationPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type WebPushErrorLike = Error & {
  statusCode?: number;
  body?: string;
};

let vapidConfigured = false;

export async function registerCurrentUserPushToken(input: {
  token: string;
  platform: PushPlatform;
  permissionState?: PushPermissionState;
}) {
  const userResult = await getCurrentPushUserId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  return registerPushTokenForUser(createAdminClient(), {
    userId: userResult.userId,
    token: input.token,
    platform: input.platform,
    permissionState: input.permissionState
  });
}

export async function registerPushTokenForUser(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    userId: string;
    token: string;
    platform: PushPlatform;
    permissionState?: PushPermissionState;
  }
) {
  if (!isPushPlatform(input.platform)) {
    return { ok: false as const, message: "A valid push platform is required." };
  }

  const normalizedToken = normalizePushToken(input.platform, input.token);
  if (!normalizedToken) {
    return { ok: false as const, message: "A valid push token is required." };
  }

  const now = new Date().toISOString();
  const tokenPayload = {
    user_id: input.userId,
    platform: input.platform,
    token: normalizedToken,
    permission_state: normalizePushPermissionState(input.permissionState),
    last_seen_at: now,
    updated_at: now
  };
  const { error } = await adminSupabase.from("push_tokens").upsert(tokenPayload, { onConflict: "user_id,token" });

  if (error && isMissingPushTokenMetadataColumnError(error.message)) {
    const fallbackResult = await adminSupabase.from("push_tokens").upsert(
      {
        user_id: input.userId,
        platform: input.platform,
        token: normalizedToken
      },
      { onConflict: "user_id,token" }
    );

    if (!fallbackResult.error) {
      return { ok: true as const, message: "This device is ready for push notifications." };
    }

    if (isMissingPushTokensTableError(fallbackResult.error.message)) {
      return {
        ok: false as const,
        message: "Push notifications are not available yet. Apply the push_tokens migration first."
      };
    }

    return { ok: false as const, message: fallbackResult.error.message };
  }

  if (error) {
    if (isMissingPushTokensTableError(error.message)) {
      return {
        ok: false as const,
        message: "Push notifications are not available yet. Apply the push_tokens migration first."
      };
    }

    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, message: "This device is ready for push notifications." };
}

export async function updateCurrentUserPushPermissionState(permissionState: PushPermissionState) {
  const userResult = await getCurrentPushUserId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  const now = new Date().toISOString();
  const { error } = await createAdminClient().from("user_settings").upsert(
    {
      user_id: userResult.userId,
      push_permission_state: normalizePushPermissionState(permissionState),
      push_permission_updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingUserSettingsPushColumnError(error.message)) {
      return { ok: true as const, message: "Notification permission preference saved." };
    }

    if (isMissingUserSettingsTableError(error.message)) {
      return {
        ok: false as const,
        message: "Notification preferences are not available yet. Apply the user notifications migration first."
      };
    }

    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, message: "Notification permission preference saved." };
}

export async function fetchHasPushTokenForUser(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data, error } = await adminSupabase
    .from("push_tokens")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingPushTokensTableError(error.message)) {
      return false;
    }

    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function sendPushNotification(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const tokensResult = await adminSupabase
    .from("push_tokens")
    .select("id,user_id,platform,token,created_at,updated_at,last_seen_at,permission_state")
    .eq("user_id", userId);
  const fallbackTokensResult =
    tokensResult.error && isMissingPushTokenMetadataColumnError(tokensResult.error.message)
      ? await adminSupabase
          .from("push_tokens")
          .select("id,user_id,platform,token,created_at")
          .eq("user_id", userId)
      : null;
  const tokens = fallbackTokensResult?.data ?? tokensResult.data;
  const error = fallbackTokensResult?.error ?? tokensResult.error;

  if (error) {
    if (isMissingPushTokensTableError(error.message)) {
      return;
    }

    console.error("Failed to load push tokens.", error);
    return;
  }

  const rows = (tokens as PushTokenRow[] | null) ?? [];
  const payload: PushPayload = { title, body, data };
  for (const tokenRow of rows) {
    try {
      await sendPushViaProvider(adminSupabase, tokenRow, payload);
    } catch (pushError) {
      console.error("Failed to send push notification.", {
        userId,
        tokenId: tokenRow.id,
        platform: tokenRow.platform,
        error: pushError
      });

      try {
        await sendPushViaProvider(adminSupabase, tokenRow, payload);
      } catch (retryError) {
        console.error("Retry failed for push notification.", {
          userId,
          tokenId: tokenRow.id,
          platform: tokenRow.platform,
          error: retryError
        });
      }
    }
  }
}

async function sendPushViaProvider(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tokenRow: PushTokenRow,
  payload: PushPayload
) {
  if (tokenRow.platform === "web") {
    const subscription = parseWebPushToken(tokenRow.token);
    if (!subscription) {
      console.error("Stored web push token is not a valid PushSubscription JSON payload.", {
        tokenId: tokenRow.id
      });
      await deletePushToken(adminSupabase, tokenRow.id);
      return;
    }

    const config = getWebPushConfig();
    if (!config) {
      console.info("Web push is not configured yet. Add VAPID env vars to enable delivery.");
      return;
    }

    if (!vapidConfigured) {
      webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
      vapidConfigured = true;
    }

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          data: {
            href: "/leaderboard",
            ...(payload.data ?? {})
          }
        })
      );
    } catch (error) {
      const pushError = error as WebPushErrorLike;
      if (isPermanentWebPushError(pushError.statusCode)) {
        await deletePushToken(adminSupabase, tokenRow.id);
      }

      throw error;
    }

    return;
  }

  if (isExpoPushToken(tokenRow.token)) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        to: tokenRow.token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {}
      })
    });

    if (!response.ok) {
      throw new Error(`Expo push send failed with status ${response.status}.`);
    }

    return;
  }

  console.info("Push token registered without a live provider adapter yet.", {
    tokenId: tokenRow.id,
    platform: tokenRow.platform
  });
}

async function deletePushToken(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tokenId: string
) {
  const { error } = await adminSupabase.from("push_tokens").delete().eq("id", tokenId);
  if (error) {
    console.error("Failed to delete invalid push token.", { tokenId, error });
  }
}

function getWebPushConfig() {
  const publicKey = getPublicWebPushVapidKey();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? "";

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

function normalizePushToken(platform: PushPlatform, token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return "";
  }

  if (platform !== "web") {
    return trimmed;
  }

  const subscription = parseWebPushToken(trimmed);
  return subscription ? JSON.stringify(subscription) : "";
}

function normalizePushPermissionState(permissionState: PushPermissionState | undefined): PushPermissionState {
  if (
    permissionState === "prompt" ||
    permissionState === "prompt-with-rationale" ||
    permissionState === "granted" ||
    permissionState === "denied"
  ) {
    return permissionState;
  }

  return "unknown";
}

function isPushPlatform(platform: string): platform is PushPlatform {
  return platform === "ios" || platform === "android" || platform === "web";
}

function parseWebPushToken(token: string): WebPushRegistrationPayload | null {
  try {
    const parsed = JSON.parse(token) as Partial<WebPushRegistrationPayload> & {
      keys?: Partial<WebPushRegistrationPayload["keys"]>;
    };
    if (!parsed?.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) {
      return null;
    }

    return {
      endpoint: parsed.endpoint,
      expirationTime: parsed.expirationTime ?? null,
      keys: {
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth
      }
    };
  } catch {
    return null;
  }
}

function isPermanentWebPushError(statusCode?: number) {
  return statusCode === 404 || statusCode === 410;
}

async function getCurrentPushUserId(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in." };
  }

  return { ok: true, userId: user.id };
}

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

export function isMissingPushTokensTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.push_tokens'") ||
    normalized.includes("relation \"public.push_tokens\" does not exist") ||
    normalized.includes("relation \"push_tokens\" does not exist") ||
    (normalized.includes("push_tokens") && normalized.includes("schema cache"))
  );
}

function isMissingPushTokenMetadataColumnError(message: string) {
  return (
    isMissingColumnError(message, "push_tokens", "updated_at") ||
    isMissingColumnError(message, "push_tokens", "last_seen_at") ||
    isMissingColumnError(message, "push_tokens", "permission_state")
  );
}

function isMissingUserSettingsTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.user_settings'") ||
    normalized.includes("relation \"public.user_settings\" does not exist") ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    (normalized.includes("user_settings") && normalized.includes("schema cache"))
  );
}

function isMissingUserSettingsPushColumnError(message: string) {
  return (
    isMissingColumnError(message, "user_settings", "push_permission_state") ||
    isMissingColumnError(message, "user_settings", "push_permission_updated_at")
  );
}
