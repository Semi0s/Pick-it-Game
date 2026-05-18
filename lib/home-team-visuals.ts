import { getTeam } from "@/lib/mock-data";

type HomeTeamVisualSpec = {
  gradient: string;
  watermark: string;
  surface: string;
  border: string;
};

export type HomeTeamVisual = {
  teamId: string;
  teamName: string;
  teamCode: string;
  flagEmoji: string;
  gradient: string;
  watermark: string;
  surface: string;
  border: string;
};

const DEFAULT_VISUAL: HomeTeamVisualSpec = {
  gradient:
    "linear-gradient(135deg, rgba(55,65,81,0.08) 0%, rgba(148,163,184,0.05) 48%, rgba(255,255,255,0.01) 100%)",
  watermark: "rgba(71,85,105,0.75)",
  surface: "rgba(255,255,255,0.96)",
  border: "rgba(148,163,184,0.7)"
};

const TEAM_VISUALS: Record<string, HomeTeamVisualSpec> = {
  bra: {
    gradient:
      "linear-gradient(135deg, rgba(22,101,52,0.12) 0%, rgba(250,204,21,0.08) 52%, rgba(21,128,61,0.03) 100%)",
    watermark: "rgba(21,128,61,0.78)",
    surface: "rgba(240,253,244,0.96)",
    border: "rgba(21,128,61,0.6)"
  },
  arg: {
    gradient:
      "linear-gradient(135deg, rgba(59,130,246,0.11) 0%, rgba(191,219,254,0.08) 52%, rgba(250,204,21,0.03) 100%)",
    watermark: "rgba(96,165,250,0.72)",
    surface: "rgba(239,246,255,0.96)",
    border: "rgba(96,165,250,0.58)"
  },
  mex: {
    gradient:
      "linear-gradient(135deg, rgba(22,101,52,0.10) 0%, rgba(255,255,255,0.05) 48%, rgba(153,27,27,0.10) 100%)",
    watermark: "rgba(21,128,61,0.74)",
    surface: "rgba(248,250,252,0.96)",
    border: "rgba(21,128,61,0.58)"
  },
  ecu: {
    gradient:
      "linear-gradient(135deg, rgba(234,179,8,0.11) 0%, rgba(37,99,235,0.06) 54%, rgba(185,28,28,0.05) 100%)",
    watermark: "rgba(37,99,235,0.78)",
    surface: "rgba(254,252,232,0.96)",
    border: "rgba(234,179,8,0.64)"
  },
  esp: {
    gradient:
      "linear-gradient(135deg, rgba(153,27,27,0.11) 0%, rgba(250,204,21,0.08) 58%, rgba(127,29,29,0.03) 100%)",
    watermark: "rgba(180,83,9,0.76)",
    surface: "rgba(255,251,235,0.96)",
    border: "rgba(180,83,9,0.6)"
  },
  jpn: {
    gradient:
      "linear-gradient(135deg, rgba(15,23,42,0.11) 0%, rgba(226,232,240,0.07) 54%, rgba(190,24,93,0.05) 100%)",
    watermark: "rgba(190,24,93,0.72)",
    surface: "rgba(255,241,242,0.96)",
    border: "rgba(190,24,93,0.54)"
  },
  fra: {
    gradient:
      "linear-gradient(135deg, rgba(30,58,138,0.11) 0%, rgba(96,165,250,0.07) 48%, rgba(239,68,68,0.05) 100%)",
    watermark: "rgba(37,99,235,0.75)",
    surface: "rgba(239,246,255,0.96)",
    border: "rgba(37,99,235,0.58)"
  },
  ger: {
    gradient:
      "linear-gradient(135deg, rgba(17,24,39,0.12) 0%, rgba(185,28,28,0.06) 50%, rgba(202,138,4,0.07) 100%)",
    watermark: "rgba(202,138,4,0.70)",
    surface: "rgba(250,250,249,0.96)",
    border: "rgba(202,138,4,0.58)"
  },
  ita: {
    gradient:
      "linear-gradient(135deg, rgba(29,78,216,0.11) 0%, rgba(255,255,255,0.05) 48%, rgba(22,101,52,0.08) 100%)",
    watermark: "rgba(37,99,235,0.72)",
    surface: "rgba(248,250,252,0.96)",
    border: "rgba(37,99,235,0.56)"
  },
  usa: {
    gradient:
      "linear-gradient(135deg, rgba(30,58,138,0.11) 0%, rgba(255,255,255,0.06) 45%, rgba(185,28,28,0.07) 100%)",
    watermark: "rgba(37,99,235,0.72)",
    surface: "rgba(248,250,252,0.96)",
    border: "rgba(37,99,235,0.56)"
  }
};

export function getHomeTeamVisual(teamId?: string | null): HomeTeamVisual | null {
  if (!teamId) {
    return null;
  }

  const team = getTeam(teamId);
  if (!team) {
    return null;
  }

  const visual = TEAM_VISUALS[team.id] ?? DEFAULT_VISUAL;

  return {
    teamId: team.id,
    teamName: team.name,
    teamCode: team.shortName,
    flagEmoji: team.flagEmoji,
    gradient: visual.gradient,
    watermark: visual.watermark,
    surface: visual.surface,
    border: visual.border
  };
}
