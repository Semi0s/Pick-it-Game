export type NormalizedGroupJoinInput = {
  value: string;
  kind: "group_invite_token" | "access_code_or_token";
};

const URL_LIKE_PATTERN = /^([a-z][a-z\d+.-]*:\/\/|\/|\?|.*[?&]invite=)/i;

export function normalizeGroupJoinInput(value: string): NormalizedGroupJoinInput | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  if (URL_LIKE_PATTERN.test(trimmedValue)) {
    const inviteToken = extractInviteTokenFromUrlLikeValue(trimmedValue);
    return inviteToken ? { kind: "group_invite_token", value: inviteToken } : null;
  }

  return {
    kind: "access_code_or_token",
    value: trimmedValue
  };
}

export function normalizeInviteTokenInput(value: string) {
  return normalizeGroupJoinInput(value)?.value ?? null;
}

function extractInviteTokenFromUrlLikeValue(value: string) {
  try {
    const parsedUrl = new URL(value, "https://pickit.local");
    const directInviteToken = parsedUrl.searchParams.get("invite")?.trim();
    if (directInviteToken) {
      return directInviteToken;
    }

    const nestedNextPath = parsedUrl.searchParams.get("next")?.trim();
    if (!nestedNextPath) {
      return null;
    }

    const nestedUrl = new URL(nestedNextPath, parsedUrl.origin);
    return nestedUrl.searchParams.get("invite")?.trim() || null;
  } catch {
    return null;
  }
}
