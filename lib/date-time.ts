type DateTimeWithZoneOptions = {
  includeYear?: boolean;
  includeWeekday?: boolean;
};

export function formatDateTimeWithZone(value: string, options: DateTimeWithZoneOptions = {}) {
  const { includeYear = false, includeWeekday = false } = options;

  return new Intl.DateTimeFormat("en-US", {
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

export function formatDateOnly(value: string, options: { includeYear?: boolean } = {}) {
  const { includeYear = true } = options;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {})
  }).format(new Date(value));
}
