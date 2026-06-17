export const LEGACY_GROUP_STAGE_MAX_DUE_DATE = "2026-06-13T00:00:00.000Z";
export const LEGACY_KNOCKOUT_DEFAULT_DUE_DATE = "2026-06-28T00:00:00.000Z";

export type ScoringSetupDateOption = {
  value: string;
  label: string;
};

export type ResolveLegacyScoringSetupDueDatesResult =
  | {
      ok: true;
      groupStageDueAt: Date;
      knockoutDueAt: Date;
    }
  | {
      ok: false;
      message: string;
    };

export function buildScoringSetupDateOptions(
  deadlineIso: string | null,
  now = new Date()
): ScoringSetupDateOption[] {
  if (!deadlineIso) {
    return [];
  }

  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) {
    return [];
  }

  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const endUtc = new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate()));
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });

  if (startUtc.getTime() > endUtc.getTime()) {
    const value = endUtc.toISOString().slice(0, 10);
    return [{ value, label: formatter.format(endUtc) }];
  }

  const options: ScoringSetupDateOption[] = [];
  for (let cursor = startUtc.getTime(); cursor <= endUtc.getTime(); cursor += 24 * 60 * 60 * 1000) {
    const date = new Date(cursor);
    options.push({
      value: date.toISOString().slice(0, 10),
      label: formatter.format(date)
    });
  }

  return options;
}

export function resolveLegacyScoringSetupDueDates(input: {
  groupStagePicksDueAt: string;
  knockoutPicksDueAt: string;
  now?: Date;
  groupStageDeadlineIso?: string | null;
  knockoutDeadlineIso?: string | null;
}): ResolveLegacyScoringSetupDueDatesResult {
  const groupStageDeadline = parseDeadlineIso(input.groupStageDeadlineIso ?? LEGACY_GROUP_STAGE_MAX_DUE_DATE);
  const knockoutDeadline = parseDeadlineIso(input.knockoutDeadlineIso ?? LEGACY_KNOCKOUT_DEFAULT_DUE_DATE);
  const now = input.now ?? new Date();
  const parsedGroupStageDueAt =
    parseMidnightGmtDateKey(input.groupStagePicksDueAt) ??
    (groupStageDeadline && now.getTime() > groupStageDeadline.getTime() ? groupStageDeadline : null);
  const parsedKnockoutDueAt =
    parseMidnightGmtDateKey(input.knockoutPicksDueAt) ??
    knockoutDeadline;

  if (!parsedGroupStageDueAt || !parsedKnockoutDueAt) {
    return { ok: false, message: "Choose valid due dates for both group and knockout picks." };
  }

  const resolvedGroupStageDueAt = resolvePhaseDueAt({
    requestedDueAt: parsedGroupStageDueAt,
    phaseDeadline: groupStageDeadline,
    now,
    phaseLabel: "Group-stage picks"
  });
  if (!resolvedGroupStageDueAt.ok) {
    return resolvedGroupStageDueAt;
  }

  const resolvedKnockoutDueAt = resolvePhaseDueAt({
    requestedDueAt: parsedKnockoutDueAt,
    phaseDeadline: knockoutDeadline,
    now,
    phaseLabel: "Knockout picks"
  });
  if (!resolvedKnockoutDueAt.ok) {
    return resolvedKnockoutDueAt;
  }

  if (resolvedKnockoutDueAt.dueAt.getTime() <= resolvedGroupStageDueAt.dueAt.getTime()) {
    return { ok: false, message: "Knockout picks due date must be after the group-stage due date." };
  }

  return {
    ok: true,
    groupStageDueAt: resolvedGroupStageDueAt.dueAt,
    knockoutDueAt: resolvedKnockoutDueAt.dueAt
  };
}

export function parseMidnightGmtDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function parseDeadlineIso(deadlineIso?: string | null) {
  if (!deadlineIso) {
    return null;
  }

  const parsed = new Date(deadlineIso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolvePhaseDueAt(input: {
  requestedDueAt: Date;
  phaseDeadline: Date | null;
  now: Date;
  phaseLabel: string;
}):
  | { ok: true; dueAt: Date }
  | { ok: false; message: string } {
  const { requestedDueAt, phaseDeadline, now, phaseLabel } = input;

  if (!phaseDeadline) {
    if (requestedDueAt.getTime() <= now.getTime()) {
      return { ok: false, message: `${phaseLabel} due date must be in the future.` };
    }

    return { ok: true, dueAt: requestedDueAt };
  }

  if (now.getTime() > phaseDeadline.getTime()) {
    return { ok: true, dueAt: phaseDeadline };
  }

  if (requestedDueAt.getTime() <= now.getTime()) {
    return { ok: false, message: `${phaseLabel} due date must be in the future.` };
  }

  if (requestedDueAt.getTime() > phaseDeadline.getTime()) {
    return {
      ok: false,
      message:
        phaseLabel === "Group-stage picks"
          ? "Group-stage picks due date must be on or before June 13."
          : "Knockout picks due date must be on or before the start of the knockout phase."
    };
  }

  return { ok: true, dueAt: requestedDueAt };
}
