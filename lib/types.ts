export type UserRole = "player" | "admin";
export type UserStatus = "active" | "inactive" | "suspended";
export type AccessLevel = "player" | "manager" | "super_admin";

export type MatchStage = "group" | "round_of_32" | "round_of_16" | "quarterfinal" | "semifinal" | "final";

export type MatchStatus = "scheduled" | "live" | "final";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  accessLevel?: AccessLevel;
  managerLimits?: {
    maxGroups: number;
    maxMembersPerGroup: number;
  } | null;
  status?: UserStatus;
  totalPoints: number;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  groupName: string;
  fifaRank: number;
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
