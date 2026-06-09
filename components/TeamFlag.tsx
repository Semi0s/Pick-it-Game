"use client";

type TeamFlagProps = {
  flagEmoji?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  shortName?: string | null;
  className?: string;
  emojiClassName?: string;
};

export function TeamFlag({
  flagEmoji,
  teamId,
  teamName,
  shortName,
  className = "",
  emojiClassName = ""
}: TeamFlagProps) {
  const label = teamName ?? shortName ?? undefined;

  if (isEnglandTeam({ teamId, teamName, shortName })) {
    return (
      <span
        aria-label={label ?? "England"}
        title={label ?? "England"}
        className={`inline-flex h-[1em] w-[1.45em] shrink-0 items-center justify-center overflow-hidden rounded-[0.12em] border border-gray-300 bg-white align-[-0.12em] leading-none ${className}`}
      >
        <svg aria-hidden viewBox="0 0 60 36" className="h-full w-full">
          <rect width="60" height="36" fill="#fff" />
          <rect x="25" width="10" height="36" fill="#CE1126" />
          <rect y="13" width="60" height="10" fill="#CE1126" />
        </svg>
      </span>
    );
  }

  if (!flagEmoji) {
    return null;
  }

  return (
    <span
      aria-label={label}
      title={label}
      className={`native-flag-emoji inline-flex shrink-0 items-center justify-center overflow-hidden align-[-0.12em] leading-none ${className}`}
    >
      <span aria-hidden className={`block leading-none ${emojiClassName}`}>
        {flagEmoji}
      </span>
    </span>
  );
}

export function isEnglandTeam({
  teamId,
  teamName,
  shortName
}: {
  teamId?: string | null;
  teamName?: string | null;
  shortName?: string | null;
}) {
  return (
    normalizeTeamKey(teamId) === "eng" ||
    normalizeTeamKey(shortName) === "eng" ||
    normalizeTeamKey(teamName) === "england"
  );
}

function normalizeTeamKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}
