import type { SupportedLanguage } from "@/lib/i18n";

export type UserRole = "player" | "admin";
export type UserStatus = "active" | "inactive" | "suspended";
export type AccessLevel = "player" | "manager" | "super_admin";

export type MatchNextSlot = "home" | "away";
export type KnockoutMatchStage =
  | "round_of_32"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "third"
  | "final"
  | "r32"
  | "r16"
  | "qf"
  | "sf";
export type MatchStage = "group" | KnockoutMatchStage;

export type MatchStatus = "scheduled" | "live" | "final";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  homeTeamId?: string | null;
  preferredLanguage?: SupportedLanguage;
  trophies?: UserTrophy[];
  role: UserRole;
  accessLevel?: AccessLevel;
  username?: string | null;
  usernameSetAt?: string | null;
  needsProfileSetup?: boolean;
  notificationsEnabled?: boolean;
  pushNotificationsEnabled?: boolean;
  needsLegalAcceptance?: boolean;
  requiredEulaVersion?: string | null;
  acceptedEulaVersion?: string | null;
  acceptedEulaAt?: string | null;
  currentEulaLanguage?: SupportedLanguage | null;
  currentEulaTitle?: string | null;
  currentEulaBody?: string | null;
  managerLimits?: {
    maxGroups: number;
    maxMembersPerGroup: number;
  } | null;
  status?: UserStatus;
  totalPoints: number;
};

export type UserTrophy = {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  tier?: "bronze" | "silver" | "gold" | "special" | null;
  awardedAt: string;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  groupName: string;
  fifaRank: number;
  fifaPoints?: number | null;
  flagEmoji: string;
};

export type Match = {
  id: string;
  stage: MatchStage;
  groupName?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeSource?: string;
  awaySource?: string;
  kickoffTime: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string;
  nextMatchId?: string | null;
  nextMatchSlot?: MatchNextSlot | null;
};

export type Prediction = {
  id: string;
  userId: string;
  matchId: string;
  predictedWinnerTeamId?: string;
  predictedIsDraw: boolean;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  pointsAwarded: number;
  updatedAt?: string;
};

export type BracketPrediction = {
  id: string;
  userId: string;
  matchId: string;
  predictedWinnerTeamId: string;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BracketScore = {
  id: string;
  userId: string;
  matchId: string;
  stage: MatchStage;
  predictedWinnerTeamId: string;
  actualWinnerTeamId: string;
  roundPoints: number;
  exactScorePoints: number;
  points: number | null;
  isCorrect: boolean;
  scoredAt: string;
};

export type Invite = {
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string;
};

export type MatchWithTeams = Match & {
  homeTeam?: Team;
  awayTeam?: Team;
};

export type MatchProbabilitySnapshotSource = "manual" | "polymarket" | "ranking" | "neutral";

export type MatchProbabilitySnapshot = {
  id: string;
  matchId: string;
  source: MatchProbabilitySnapshotSource;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  over25Probability?: number | null;
  confidence?: number | null;
  sourceUrl?: string | null;
  fetchedAt: string;
};

export type AutoPickOutcome = "home" | "draw" | "away";
export type AutoPickTotalTier = "low" | "medium" | "high";

export type AutoPickResult = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  outcome: AutoPickOutcome;
  totalTier: AutoPickTotalTier;
  source: string;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
};

export type AutoPickDraft = AutoPickResult & {
  token: string;
};

export type AppUpdateType = "info" | "feature" | "warning" | "tournament" | "maintenance";
export type AppUpdateImportance = "normal" | "important";
export type AppUpdateCardTone = "neutral" | "sky" | "green" | "amber" | "rose";

export type AppUpdate = {
  id: string;
  title: string;
  body: string;
  updateType: AppUpdateType;
  importance: AppUpdateImportance;
  cardTone: AppUpdateCardTone;
  linkLabel?: string | null;
  linkUrl?: string | null;
  publishedAt: string;
  expiresAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppUpdateWithReadState = AppUpdate & {
  isRead: boolean;
  readAt?: string | null;
};
