import {
  ORANJEKOORTS_VISUAL_THEME_ID,
  isSpecialVisualThemeId,
  specialVisualThemeOptions
} from "./localized-card-themes.ts";
import type { Team } from "./types.ts";

export type VisualThemeSelectOption = {
  value: string;
  id: string;
  label: string;
  icon: string;
  kind: "team" | "visual";
};

export type VisualThemeSelection = {
  homeTeamId: string | null;
  visualThemeId: string | null;
};

const TEAM_SELECTION_PREFIX = "team:";
const VISUAL_SELECTION_PREFIX = "visual:";

export function getVisualThemeSelectOptions(teams: Team[]): VisualThemeSelectOption[] {
  const teamOptions = teams.map((team) => ({
    value: `${TEAM_SELECTION_PREFIX}${team.id}`,
    id: team.id,
    label: team.name,
    icon: team.flagEmoji,
    kind: "team" as const
  }));
  const oranjekoortsOption = specialVisualThemeOptions.find((option) => option.id === ORANJEKOORTS_VISUAL_THEME_ID);

  if (!oranjekoortsOption) {
    return sortVisualThemeOptionsByLabel(teamOptions);
  }

  const visualOption = {
    value: `${VISUAL_SELECTION_PREFIX}${oranjekoortsOption.id}`,
    id: oranjekoortsOption.id,
    label: oranjekoortsOption.label,
    icon: oranjekoortsOption.icon,
    kind: "visual" as const
  };

  return sortVisualThemeOptionsByLabel([...teamOptions, visualOption]);
}

export function getVisualThemeSelectValue(input: VisualThemeSelection): string {
  if (isSpecialVisualThemeId(input.visualThemeId)) {
    return `${VISUAL_SELECTION_PREFIX}${input.visualThemeId}`;
  }

  return input.homeTeamId ? `${TEAM_SELECTION_PREFIX}${input.homeTeamId}` : "";
}

export function parseVisualThemeSelectValue(value: string): VisualThemeSelection {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return { homeTeamId: null, visualThemeId: null };
  }

  if (normalizedValue.startsWith(VISUAL_SELECTION_PREFIX)) {
    const visualThemeId = normalizedValue.slice(VISUAL_SELECTION_PREFIX.length);
    return {
      homeTeamId: null,
      visualThemeId: isSpecialVisualThemeId(visualThemeId) ? visualThemeId : null
    };
  }

  if (normalizedValue.startsWith(TEAM_SELECTION_PREFIX)) {
    return {
      homeTeamId: normalizedValue.slice(TEAM_SELECTION_PREFIX.length) || null,
      visualThemeId: null
    };
  }

  return {
    homeTeamId: normalizedValue,
    visualThemeId: null
  };
}

function sortVisualThemeOptionsByLabel(options: VisualThemeSelectOption[]) {
  return [...options].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}
