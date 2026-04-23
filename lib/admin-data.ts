"use client";

import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import type { MatchStage, MatchStatus, UserRole, UserStatus } from "@/lib/types";

export type AdminInvite = {
  email: string;
  displayName: string;
  role: UserRole;
  acceptedAt?: string;
  status: "pending" | "accepted" | "revoked" | "expired" | "failed";
  lastSentAt?: string;
  sendAttempts: number;
  lastError?: string;
  createdAt: string;
};

export type AdminPlayer = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  totalPoints: number;
  createdAt: string;
  acceptedInvite: boolean;
};

export type AdminTeam = {
  id: string;
  name: string;
  shortName: string;
  flagEmoji: string;
};

export type AdminMatch = {
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
  updatedAt?: string;
  homeTeam?: AdminTeam;
  awayTeam?: AdminTeam;
};

export type AdminCounts = {
  pendingInvites: number;
  acceptedInvites: number;
  totalPlayers: number;
  matchesByStatus: Record<MatchStatus, number>;
};

type InviteRow = {
  email: string;
  display_name: string;
  role: UserRole;
  accepted_at?: string | null;
  status?: AdminInvite["status"] | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
  created_at: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus | null;
  total_points: number;
  created_at: string;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  flag_emoji: string;
};

type MatchRow = {
  id: string;
  stage: MatchStage;
  group_name?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time: string;
  status: MatchStatus;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  updated_at?: string | null;
  home_team?: TeamRow | TeamRow[] | null;
  away_team?: TeamRow | TeamRow[] | null;
};

const ADMIN_MATCH_SELECT = `
  id,
  stage,
  group_name,
  home_team_id,
  away_team_id,
  home_source,
  away_source,
  kickoff_time,
  status,
  home_score,
  away_score,
  winner_team_id,
  updated_at,
  home_team:teams!matches_home_team_id_fkey(id,name,short_name,flag_emoji),
  away_team:teams!matches_away_team_id_fkey(id,name,short_name,flag_emoji)
`;

const ADMIN_MATCH_BASE_SELECT = `
  id,
  stage,
  group_name,
  home_team_id,
  away_team_id,
  home_source,
  away_source,
  kickoff_time,
  status,
  home_score,
  away_score,
  winner_team_id,
  updated_at
`;

export async function fetchAdminCounts(): Promise<AdminCounts> {
  ensureSupabaseConfigured();
  const [invites, players, matches] = await Promise.all([fetchAdminInvites(), fetchAdminPlayers(), fetchAdminMatches()]);

  return {
    pendingInvites: invites.filter((invite) => invite.status === "pending").length,
    acceptedInvites: invites.filter((invite) => invite.status === "accepted").length,
    totalPlayers: players.length,
    matchesByStatus: {
      scheduled: matches.filter((match) => match.status === "scheduled").length,
      live: matches.filter((match) => match.status === "live").length,
      final: matches.filter((match) => match.status === "final").length
    }
  };
}

export async function fetchAdminInvites(): Promise<AdminInvite[]> {
  ensureSupabaseConfigured();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invites")
    .select("email,display_name,role,accepted_at,status,last_sent_at,send_attempts,last_error,created_at")
    .order("created_at", { ascending: false });

  if (!error) {
    return (data as InviteRow[]).map(mapInviteRow);
  }

  if (!isMissingInviteColumnError(error.message)) {
    throw new Error(error.message);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("invites")
    .select("email,display_name,role,accepted_at,status,created_at")
    .order("created_at", { ascending: false });

  if (!fallbackError) {
    return (fallbackData as InviteRow[]).map(mapInviteRow);
  }

  const { data: minimalData, error: minimalError } = await supabase
    .from("invites")
    .select("email,display_name,role,accepted_at,created_at")
    .order("created_at", { ascending: false });

  if (minimalError) {
    throw new Error(minimalError.message);
  }

  return (minimalData as InviteRow[]).map(mapInviteRow);
}

export async function fetchAdminPlayers(): Promise<AdminPlayer[]> {
  ensureSupabaseConfigured();
  const supabase = createClient();
  const [{ data: users, error: usersError }, { data: invites, error: invitesError }] = await Promise.all([
    fetchAdminPlayerRows(supabase),
    fetchInviteAcceptanceRows(supabase)
  ]);

  if (usersError) {
    throw new Error(usersError.message);
  }

  if (invitesError) {
    throw new Error(invitesError.message);
  }

  const acceptedInviteEmails = new Set(
    (invites as InviteRow[])
      .filter((invite) => getInviteLifecycleStatus(invite) === "accepted")
      .map((invite) => invite.email.toLowerCase())
  );

  return (users as UserRow[]).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status ?? "active",
    totalPoints: user.total_points,
    createdAt: user.created_at,
    acceptedInvite: acceptedInviteEmails.has(user.email.toLowerCase())
  }));
}

export async function fetchAdminMatches(): Promise<AdminMatch[]> {
  ensureSupabaseConfigured();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("matches")
    .select(ADMIN_MATCH_SELECT)
    .order("kickoff_time", { ascending: true });

  if (!error) {
    return fillMissingTeams(supabase, (data as MatchRow[]).map(mapMatchRow));
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("matches")
    .select(ADMIN_MATCH_BASE_SELECT)
    .order("kickoff_time", { ascending: true });

  if (fallbackError) {
    throw new Error(`${error.message}; fallback read failed: ${fallbackError.message}`);
  }

  return fillMissingTeams(supabase, (fallbackData as MatchRow[]).map(mapMatchRow));
}

export async function updateAdminMatchResult(input: {
  id: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string;
}): Promise<AdminMatch> {
  ensureSupabaseConfigured();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("matches")
    .update({
      status: input.status,
      home_score: input.homeScore ?? null,
      away_score: input.awayScore ?? null,
      winner_team_id: input.winnerTeamId || null
    })
    .eq("id", input.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const [match] = await fillMissingTeams(supabase, [mapMatchRow(data as MatchRow)]);
  return match;
}

function ensureSupabaseConfigured() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase env vars are missing. Admin tools require a configured Supabase project.");
  }
}

function mapInviteRow(row: InviteRow): AdminInvite {
  return {
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    acceptedAt: row.accepted_at ?? undefined,
    status: getInviteLifecycleStatus(row),
    lastSentAt: row.last_sent_at ?? undefined,
    sendAttempts: row.send_attempts ?? 0,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at
  };
}

function getInviteLifecycleStatus(row: Pick<InviteRow, "accepted_at" | "status">): AdminInvite["status"] {
  if (row.accepted_at) {
    return "accepted";
  }

  if (row.status === "accepted" || row.status === "revoked" || row.status === "expired" || row.status === "failed") {
    return row.status;
  }

  return "pending";
}

async function fetchAdminPlayerRows(supabase: ReturnType<typeof createClient>) {
  const withStatus = await supabase
    .from("users")
    .select("id,name,email,role,status,total_points,created_at")
    .order("created_at", { ascending: false });

  if (!withStatus.error) {
    return withStatus;
  }

  if (!isMissingColumnError(withStatus.error.message, "status")) {
    return withStatus;
  }

  const fallback = await supabase
    .from("users")
    .select("id,name,email,role,total_points,created_at")
    .order("created_at", { ascending: false });

  return {
    data: (fallback.data ?? []).map((user) => ({ ...user, status: "active" })) as UserRow[],
    error: fallback.error
  };
}

async function fetchInviteAcceptanceRows(supabase: ReturnType<typeof createClient>) {
  const withStatus = await supabase.from("invites").select("email,status,accepted_at");

  if (!withStatus.error) {
    return withStatus;
  }

  if (!isMissingInviteColumnError(withStatus.error.message)) {
    return withStatus;
  }

  return supabase.from("invites").select("email,accepted_at");
}

function isMissingInviteColumnError(message: string) {
  return (
    isMissingColumnError(message, "status") ||
    isMissingColumnError(message, "last_sent_at") ||
    isMissingColumnError(message, "send_attempts") ||
    isMissingColumnError(message, "last_error")
  );
}

function isMissingColumnError(message: string, column: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(column.toLowerCase()) &&
    (
      (normalized.includes("column") && normalized.includes("does not exist")) ||
      normalized.includes("schema cache")
    )
  );
}

function mapMatchRow(row: MatchRow): AdminMatch {
  return {
    id: row.id,
    stage: row.stage,
    groupName: row.group_name ?? undefined,
    homeTeamId: row.home_team_id ?? undefined,
    awayTeamId: row.away_team_id ?? undefined,
    homeSource: row.home_source ?? undefined,
    awaySource: row.away_source ?? undefined,
    kickoffTime: row.kickoff_time,
    status: row.status,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    winnerTeamId: row.winner_team_id ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    homeTeam: mapTeamJoin(row.home_team),
    awayTeam: mapTeamJoin(row.away_team)
  };
}

function mapTeamJoin(value: TeamRow | TeamRow[] | null | undefined): AdminTeam | undefined {
  const row = normalizeTeamRow(value);
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    flagEmoji: row.flag_emoji
  };
}

function normalizeTeamRow(value: TeamRow | TeamRow[] | null | undefined): TeamRow | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

async function fillMissingTeams(
  supabase: ReturnType<typeof createClient>,
  matches: AdminMatch[]
): Promise<AdminMatch[]> {
  const missingTeamIds = Array.from(
    new Set(
      matches.flatMap((match) => [
        !match.homeTeam && match.homeTeamId ? match.homeTeamId : undefined,
        !match.awayTeam && match.awayTeamId ? match.awayTeamId : undefined
      ])
    )
  ).filter(Boolean) as string[];

  if (missingTeamIds.length === 0) {
    return matches;
  }

  const { data, error } = await supabase
    .from("teams")
    .select("id,name,short_name,flag_emoji")
    .in("id", missingTeamIds);

  if (error) {
    return matches;
  }

  const teamMap = new Map((data as TeamRow[]).map((team) => [team.id, mapTeamJoin(team)]));

  return matches.map((match) => ({
    ...match,
    homeTeam: match.homeTeam ?? (match.homeTeamId ? teamMap.get(match.homeTeamId) : undefined),
    awayTeam: match.awayTeam ?? (match.awayTeamId ? teamMap.get(match.awayTeamId) : undefined)
  }));
}
