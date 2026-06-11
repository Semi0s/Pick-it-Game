export const TOURNAMENT_MODALITIES = [
  "pre_tournament",
  "group_stage_live",
  "knockout_live",
  "post_tournament"
] as const;

export const DASHBOARD_TRIPTYCH_VIEW_KEYS = [
  "group_stage_progress",
  "side_picks_progress",
  "knockout_progress",
  "score_movement"
] as const;

export type TournamentModality = (typeof TOURNAMENT_MODALITIES)[number];
export type DashboardTriptychViewKey = (typeof DASHBOARD_TRIPTYCH_VIEW_KEYS)[number];

export type TournamentTransitionSettings = {
  modality: TournamentModality;
  dashboardMessage: {
    active: boolean;
    title: string;
    body: string;
    dismissible: boolean;
  };
  sessionBehavior: {
    startEachSessionOnDashboard: boolean;
    showReturnToDashboardIndicator: boolean;
  };
  leftTriptych: {
    primaryView: DashboardTriptychViewKey;
    secondaryView: DashboardTriptychViewKey;
  };
};

export const DEFAULT_TOURNAMENT_MODALITY: TournamentModality = "pre_tournament";

export function normalizeTournamentModality(value: string | null | undefined): TournamentModality {
  if (value && TOURNAMENT_MODALITIES.includes(value as TournamentModality)) {
    return value as TournamentModality;
  }

  return DEFAULT_TOURNAMENT_MODALITY;
}

export function normalizeDashboardTriptychViewKey(value: string | null | undefined): DashboardTriptychViewKey | null {
  if (value && DASHBOARD_TRIPTYCH_VIEW_KEYS.includes(value as DashboardTriptychViewKey)) {
    return value as DashboardTriptychViewKey;
  }

  return null;
}

export function isLiveTournamentModality(modality: TournamentModality): boolean {
  return modality === "group_stage_live" || modality === "knockout_live";
}

export function shouldSkipLegacyLaunchOnboarding(modality: TournamentModality): boolean {
  return modality !== "pre_tournament";
}

export function getDefaultTournamentTransitionMessage(modality: TournamentModality): {
  title: string;
  body: string;
} {
  switch (modality) {
    case "group_stage_live":
      return {
        title: "Tournament mode is live",
        body: "Group picks are now locked. Follow your points, rank movement, and live match updates from the Dashboard."
      };
    case "knockout_live":
      return {
        title: "Knockout mode is live",
        body: "Follow your points, rank movement, and live match updates from the Dashboard."
      };
    case "post_tournament":
      return {
        title: "Tournament complete",
        body: "See your final points, rank movement, and recap from the Dashboard."
      };
    case "pre_tournament":
    default:
      return {
        title: "Predictions are open",
        body: "Start with the Dashboard, then fill your Group Stage and Knockout picks."
      };
  }
}

export function getDefaultTriptychViews(modality: TournamentModality): {
  primaryView: DashboardTriptychViewKey;
  secondaryView: DashboardTriptychViewKey;
} {
  switch (modality) {
    case "group_stage_live":
      return {
        primaryView: "score_movement",
        secondaryView: "group_stage_progress"
      };
    case "knockout_live":
      return {
        primaryView: "score_movement",
        secondaryView: "knockout_progress"
      };
    case "post_tournament":
      return {
        primaryView: "score_movement",
        secondaryView: "side_picks_progress"
      };
    case "pre_tournament":
    default:
      return {
        primaryView: "group_stage_progress",
        secondaryView: "score_movement"
      };
  }
}

export function resolveTournamentTransitionSettings(input?: {
  modality?: string | null;
  dashboardMessage?: {
    active?: boolean;
    title?: string | null;
    body?: string | null;
    dismissible?: boolean;
  };
  sessionBehavior?: {
    startEachSessionOnDashboard?: boolean;
    showReturnToDashboardIndicator?: boolean;
  };
  leftTriptych?: {
    primaryView?: string | null;
    secondaryView?: string | null;
  };
}): TournamentTransitionSettings {
  const modality = normalizeTournamentModality(input?.modality);
  const defaultMessage = getDefaultTournamentTransitionMessage(modality);
  const defaultViews = getDefaultTriptychViews(modality);
  const primaryView =
    normalizeDashboardTriptychViewKey(input?.leftTriptych?.primaryView) ?? defaultViews.primaryView;
  const fallbackSecondary =
    defaultViews.secondaryView === primaryView
      ? DASHBOARD_TRIPTYCH_VIEW_KEYS.find((candidate) => candidate !== primaryView) ?? "group_stage_progress"
      : defaultViews.secondaryView;
  const requestedSecondary = normalizeDashboardTriptychViewKey(input?.leftTriptych?.secondaryView);
  const secondaryView =
    requestedSecondary && requestedSecondary !== primaryView ? requestedSecondary : fallbackSecondary;

  return {
    modality,
    dashboardMessage: {
      active: input?.dashboardMessage?.active ?? false,
      title: input?.dashboardMessage?.title?.trim() || defaultMessage.title,
      body: input?.dashboardMessage?.body?.trim() || defaultMessage.body,
      dismissible: input?.dashboardMessage?.dismissible ?? true
    },
    sessionBehavior: {
      startEachSessionOnDashboard: input?.sessionBehavior?.startEachSessionOnDashboard ?? false,
      showReturnToDashboardIndicator:
        input?.sessionBehavior?.showReturnToDashboardIndicator ?? modality !== "pre_tournament"
    },
    leftTriptych: {
      primaryView,
      secondaryView
    }
  };
}

export function buildTournamentTransitionMessageId(settings: TournamentTransitionSettings): string {
  const titlePart = slugifyMessageSegment(settings.dashboardMessage.title);
  const bodyPart = slugifyMessageSegment(settings.dashboardMessage.body);
  return `tournament-transition:${settings.modality}:${titlePart}:${bodyPart}`;
}

export function shouldForceDashboardStartThisSession(input: {
  pathname: string;
  hasSeenSessionLanding: boolean;
  settings: TournamentTransitionSettings | null | undefined;
}): boolean {
  if (!input.settings?.sessionBehavior.startEachSessionOnDashboard || input.hasSeenSessionLanding) {
    return false;
  }

  if (input.pathname === "/dashboard") {
    return false;
  }

  return !isTournamentTransitionExcludedPath(input.pathname);
}

export function shouldShowReturnToDashboardIndicator(input: {
  pathname: string;
  settings: TournamentTransitionSettings | null | undefined;
}): boolean {
  if (!input.settings?.dashboardMessage.active || !input.settings.sessionBehavior.showReturnToDashboardIndicator) {
    return false;
  }

  if (input.pathname === "/dashboard") {
    return false;
  }

  return !isTournamentTransitionExcludedPath(input.pathname, { allowSettingsPages: true });
}

function slugifyMessageSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isTournamentTransitionExcludedPath(
  pathname: string,
  options?: {
    allowSettingsPages?: boolean;
  }
) {
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/profile-setup") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/start-playing")
  ) {
    return true;
  }

  if (!options?.allowSettingsPages) {
    return pathname.startsWith("/privacy") || pathname.startsWith("/terms") || pathname.startsWith("/support");
  }

  return false;
}
