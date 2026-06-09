import { GROUP_AVATAR_IMAGE_UPLOAD_POLICY, IMAGE_EXTENSION_BY_MIME_TYPE } from "./image-upload-config.ts";

export const GROUP_ACCESS_MODES = ["open_by_code", "restricted_by_email", "closed"] as const;
export type GroupAccessMode = (typeof GROUP_ACCESS_MODES)[number];

export const GROUP_KINDS = ["standard", "captain_private"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const GROUP_INVITE_SOURCES = ["manager_invite", "captain_pass", "captain_private_invite"] as const;
export type GroupInviteSource = (typeof GROUP_INVITE_SOURCES)[number];

export const GROUP_INVITE_INTENTS = ["member", "captain_pass"] as const;
export type GroupInviteIntent = (typeof GROUP_INVITE_INTENTS)[number];

export const GROUP_JOIN_SOURCES = [
  "direct",
  "public_signup",
  "access_code",
  "invite_link",
  "super_link",
  "manager_code",
  "manager_invite",
  "captain_pass",
  "captain_private_code",
  "captain_private_invite"
] as const;
export type GroupJoinSource = (typeof GROUP_JOIN_SOURCES)[number];

export const CAPTAINS_PASS_STATUSES = [
  "available",
  "pending",
  "claimed",
  "exhausted",
  "expired",
  "cancelled_by_admin"
] as const;
export type CaptainsPassStatus = (typeof CAPTAINS_PASS_STATUSES)[number];

export const MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS = 6;
export const MAX_CAPTAINS_PASS_ALLOWANCE = 6;
export const MAX_GROUP_NAME_LENGTH = 80;
export const GROUP_AVATAR_BUCKET = "group-avatars";
export const MAX_GROUP_AVATAR_FILE_BYTES = GROUP_AVATAR_IMAGE_UPLOAD_POLICY.maxBytes;
export const GROUP_AVATAR_EXTENSION_BY_MIME_TYPE = IMAGE_EXTENSION_BY_MIME_TYPE;

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeGroupAccessMode(value: string | null | undefined): GroupAccessMode {
  return GROUP_ACCESS_MODES.includes(value as GroupAccessMode) ? (value as GroupAccessMode) : "open_by_code";
}

export function normalizeGroupKind(value: string | null | undefined): GroupKind {
  return GROUP_KINDS.includes(value as GroupKind) ? (value as GroupKind) : "standard";
}

export function normalizeGroupInviteSource(value: string | null | undefined): GroupInviteSource {
  return GROUP_INVITE_SOURCES.includes(value as GroupInviteSource) ? (value as GroupInviteSource) : "manager_invite";
}

export function normalizeGroupInviteIntent(value: string | null | undefined): GroupInviteIntent {
  return GROUP_INVITE_INTENTS.includes(value as GroupInviteIntent) ? (value as GroupInviteIntent) : "member";
}

export function normalizeGroupJoinSource(value: string | null | undefined): GroupJoinSource {
  return GROUP_JOIN_SOURCES.includes(value as GroupJoinSource) ? (value as GroupJoinSource) : "direct";
}

export function normalizeCaptainsPassStatus(value: string | null | undefined): CaptainsPassStatus {
  return CAPTAINS_PASS_STATUSES.includes(value as CaptainsPassStatus)
    ? (value as CaptainsPassStatus)
    : "available";
}

export function getGroupAccessModeLabel(mode: GroupAccessMode) {
  switch (mode) {
    case "restricted_by_email":
      return "Restricted by email";
    case "closed":
      return "Closed";
    default:
      return "Open by code";
  }
}

export function getGroupJoinSourceLabel(source: GroupJoinSource) {
  switch (source) {
    case "public_signup":
      return "Public signup";
    case "access_code":
      return "Access code";
    case "invite_link":
      return "Invite link";
    case "super_link":
      return "Super Link";
    case "manager_code":
      return "Manager code";
    case "manager_invite":
      return "Manager invite";
    case "captain_pass":
      return "Captain’s Pass";
    case "captain_private_code":
      return "Captain code";
    case "captain_private_invite":
      return "Captain invite";
    default:
      return "Direct";
  }
}

export function getGroupInviteSourceLabel(source: GroupInviteSource) {
  switch (source) {
    case "captain_pass":
      return "Captain’s Pass";
    case "captain_private_invite":
      return "Captain invite";
    default:
      return "Manager invite";
  }
}

export function getCaptainsPassStatusLabel(status: CaptainsPassStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "claimed":
      return "Claimed";
    case "exhausted":
      return "Exhausted";
    case "expired":
      return "Expired";
    case "cancelled_by_admin":
      return "Cancelled";
    default:
      return "Available";
  }
}

export function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : "";
}

export function isValidEmailAddress(value: string) {
  return BASIC_EMAIL_PATTERN.test(value);
}

export function getGroupAvatarExtension(mimeType: string) {
  return GROUP_AVATAR_EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase() as keyof typeof GROUP_AVATAR_EXTENSION_BY_MIME_TYPE] ?? null;
}

export function parseAllowedEmailInput(text: string) {
  const raw = text.trim();
  if (!raw) {
    return {
      validEmails: [] as string[],
      invalidEntries: [] as string[],
      duplicateEntries: [] as string[]
    };
  }

  const normalizedSeen = new Set<string>();
  const duplicateEntries: string[] = [];
  const invalidEntries: string[] = [];
  const validEmails: string[] = [];
  const nonEmptyLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerColumns = nonEmptyLines[0]?.split(",").map((column) => column.trim().toLowerCase()) ?? [];
  const emailColumnIndex = headerColumns.findIndex((column) => column === "email");
  const looksLikeCsv = emailColumnIndex >= 0;

  if (looksLikeCsv) {
    for (const row of nonEmptyLines.slice(1)) {
      const columns = row.split(",").map((column) => column.trim());
      const normalized = normalizeEmail(columns[emailColumnIndex] ?? "");
      if (!normalized) {
        continue;
      }

      if (!isValidEmailAddress(normalized)) {
        invalidEntries.push(columns[emailColumnIndex] ?? normalized);
        continue;
      }

      if (normalizedSeen.has(normalized)) {
        duplicateEntries.push(normalized);
        continue;
      }

      normalizedSeen.add(normalized);
      validEmails.push(normalized);
    }

    return { validEmails, invalidEntries, duplicateEntries };
  }

  const tokens = raw
    .replace(/[;\t]/g, ",")
    .split(/[\n,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const normalized = normalizeEmail(token);
    if (!isValidEmailAddress(normalized)) {
      invalidEntries.push(token);
      continue;
    }

    if (normalizedSeen.has(normalized)) {
      duplicateEntries.push(normalized);
      continue;
    }

    normalizedSeen.add(normalized);
    validEmails.push(normalized);
  }

  return { validEmails, invalidEntries, duplicateEntries };
}

export function getRemainingCaptainsPassAllowance(input: {
  allowance: number;
  invitesUsed: number;
  remainingSeats: number;
}) {
  return Math.max(0, Math.min(input.allowance - input.invitesUsed, input.remainingSeats));
}
