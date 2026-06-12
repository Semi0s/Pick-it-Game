type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

const TEAM_NAME_ALIASES: Record<string, string> = {
  usa: "united states",
  usmnt: "united states",
  mexico: "mexico",
  ecu: "ecuador",
  "south korea": "korea republic",
  "korea south": "korea republic",
  "republic of korea": "korea republic",
  "czech republic": "czechia",
  iran: "ir iran",
  "iran ir": "ir iran",
  "cape verde": "cabo verde",
  "cape verde islands": "cabo verde",
  "saudi arabia": "saudi arabia",
  "bosnia and herzegovina": "bosnia herzegovina",
  "cote d ivoire": "cote d ivoire",
  turkey: "turkiye",
  "dr congo": "congo dr",
  "south africa": "south africa"
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
