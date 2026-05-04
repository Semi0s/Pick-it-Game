type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

const TEAM_NAME_ALIASES: Record<string, string> = {
  usa: "united states",
  usmnt: "united states",
  mexico: "mexico",
  ecu: "ecuador"
};

export function resolveTeamIdByName(name: string, teams: TeamRow[]) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }

  const exactNameMatch = teams.find(
    (team) => team.name.trim().toLowerCase() === trimmedName.toLowerCase() || (team.short_name ?? "").trim().toLowerCase() === trimmedName.toLowerCase()
  );

  if (exactNameMatch) {
    return exactNameMatch.id;
  }

  const normalizedSearch = normalizeTeamName(trimmedName);
  const aliasedSearch = TEAM_NAME_ALIASES[normalizedSearch] ?? normalizedSearch;

  const normalizedMatch = teams.find((team) => {
    const normalizedName = normalizeTeamName(team.name);
    const normalizedShortName = normalizeTeamName(team.short_name ?? "");

    return (
      normalizedName === aliasedSearch ||
      normalizedShortName === aliasedSearch ||
      TEAM_NAME_ALIASES[normalizedName] === aliasedSearch ||
      TEAM_NAME_ALIASES[normalizedShortName] === aliasedSearch
    );
  });

  return normalizedMatch?.id ?? null;
}

function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
