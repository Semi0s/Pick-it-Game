"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAdminPlayerHealthRows, type AdminPlayerHealthRow } from "@/lib/admin-player-health";
import { canScoreGroupMatch, scoreGroupStagePrediction } from "@/lib/group-scoring";
import { getSiteUrl } from "@/lib/site-url";
import type { UserRole } from "@/lib/types";

type MatchRow = {
  id: string;
  stage: "group" | "round_of_32" | "round_of_16" | "quarterfinal" | "semifinal" | "final";
  group_name?: string | null;
  status: "scheduled" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  updated_at?: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_is_draw: boolean;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
};

type LeaderboardTotal = {
  user_id: string;
  total_points: number;
};

type InviteLookupRow = {
  email: string;
  display_name: string;
  role: UserRole;
  accepted_at?: string | null;
  status?: "pending" | "accepted" | "revoked" | "expired" | "failed" | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
};

type EmailJobKind = "access_email" | "password_recovery";

type EmailJobPayload = {
  displayName?: string;
  role?: UserRole;
  source?: "admin_invites" | "admin_players";
};

type AuthUserSummary = {
  id: string;
  email?: string | null;
};

type EnqueueEmailJobResult =
  | { ok: true; alreadyQueued: boolean }
  | { ok: false; message: string };

export type ScoreMatchResult =
  | {
      ok: true;
      scored: boolean;
      predictionsScored: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type UpdateMatchResultInput = {
  id: string;
  status: MatchRow["status"];
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string | null;
};

export type UpdateMatchResult =
  | {
      ok: true;
      match: ReturnType<typeof mapMatchRow>;
    }
    | {
      ok: false;
      message: string;
    };

export type CreateInviteInput = {
  email: string;
  displayName: string;
  role: UserRole;
};

export type CreateInviteResult =
  | {
      ok: true;
      created: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ResetUserAccessInput = {
  userId: string;
  email: string;
};

export type ResetUserAccessResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type FetchAdminPlayerHealthResult =
  | {
      ok: true;
      players: AdminPlayerHealthRow[];
    }
  | {
      ok: false;
      message: string;
    };

export async function createAdminInviteAction(input: CreateInviteInput): Promise<CreateInviteResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedDisplayName = input.displayName.trim();

  if (!normalizedEmail || !trimmedDisplayName) {
    return { ok: false, message: "Email and display name are required." };
  }

  const [{ data: existingInvite, error: inviteLookupError }, { data: existingUser, error: userLookupError }, authUser] =
    await Promise.all([
      fetchInviteLookup(adminSupabase, normalizedEmail),
      adminSupabase.from("users").select("id").eq("email", normalizedEmail).maybeSingle(),
      findAuthUserByEmail(adminSupabase, normalizedEmail)
    ]);

  if (inviteLookupError) {
    return { ok: false, message: inviteLookupError.message };
  }

  if (userLookupError) {
    return { ok: false, message: userLookupError.message };
  }

  const rateLimitResult = await enforceEmailRateLimits(adminSupabase, adminCheck.userId, normalizedEmail);
  if (!rateLimitResult.ok) {
    return { ok: false, message: rateLimitResult.message };
  }

  const sendKind: EmailJobKind = authUser && existingUser ? "password_recovery" : "access_email";
  const supportsEmailJobs = await hasEmailJobsTable(adminSupabase);
  const inviteUpsertResult = await upsertInviteRow(adminSupabase, {
    email: normalizedEmail,
    displayName: trimmedDisplayName,
    role: input.role,
    status: (existingInvite as InviteLookupRow | null)?.accepted_at ? "accepted" : "pending",
    lastError: null,
    preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
  });

  if (!inviteUpsertResult.ok) {
    return { ok: false, message: inviteUpsertResult.message };
  }

  if (!supportsEmailJobs) {
    const sendResult = await sendAdminEmailInline(adminSupabase, {
      kind: sendKind,
      email: normalizedEmail
    });

    if (!sendResult.ok) {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        role: input.role,
        status: "failed",
        lastError: sendResult.message,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
      });
      return { ok: false, message: sendResult.message };
    }

    if (sendKind === "access_email") {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        role: input.role,
        status: (existingInvite as InviteLookupRow | null)?.accepted_at ? "accepted" : "pending",
        lastError: null,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at,
        incrementAttempts: true,
        setLastSentAt: true
      });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    return {
      ok: true,
      created: true,
      message:
        sendKind === "password_recovery"
          ? "Account already exists. Password reset email sent instead."
          : (existingInvite as InviteLookupRow | null)
            ? "Invite email sent again."
            : "Invite email sent."
    };
  }

  const enqueueResult = await enqueueEmailJob(adminSupabase, {
    kind: sendKind,
    email: normalizedEmail,
    requestedByAdminId: adminCheck.userId,
    payload: {
      displayName: trimmedDisplayName,
      role: input.role,
      source: "admin_invites"
    }
  });

  if (!enqueueResult.ok && isMissingEmailJobsError(enqueueResult.message)) {
    const sendResult = await sendAdminEmailInline(adminSupabase, {
      kind: sendKind,
      email: normalizedEmail
    });

    if (!sendResult.ok) {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        role: input.role,
        status: "failed",
        lastError: sendResult.message,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
      });
      return { ok: false, message: sendResult.message };
    }

    if (sendKind === "access_email") {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        role: input.role,
        status: (existingInvite as InviteLookupRow | null)?.accepted_at ? "accepted" : "pending",
        lastError: null,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at,
        incrementAttempts: true,
        setLastSentAt: true
      });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    return {
      ok: true,
      created: true,
      message:
        sendKind === "password_recovery"
          ? "Account already exists. Password reset email sent instead."
          : (existingInvite as InviteLookupRow | null)
            ? "Invite email sent again."
            : "Invite email sent."
    };
  }

  if (!enqueueResult.ok) {
    await upsertInviteRow(adminSupabase, {
      email: normalizedEmail,
      displayName: trimmedDisplayName,
      role: input.role,
      status: "failed",
      lastError: enqueueResult.message,
      preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
    });
    return { ok: false, message: enqueueResult.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invites");

  return {
    ok: true,
    created: true,
    message:
      enqueueResult.alreadyQueued
        ? "A matching access email is already queued."
        : sendKind === "password_recovery"
          ? "Account already exists. Password recovery email queued instead."
          : (existingInvite as InviteLookupRow | null)
            ? "Access email queued again."
            : "Invite queued and ready to send."
  };
}

export async function resetUserAccess(input: ResetUserAccessInput): Promise<ResetUserAccessResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const userId = input.userId?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!userId || !email) {
    return { ok: false, message: "A valid user and email are required to reset access." };
  }

  const authUser = await findAuthUserByEmail(adminSupabase, email);
  if (!authUser || authUser.id !== userId) {
    return {
      ok: false,
      message: "This user has not activated their account yet. Resend invite instead."
    };
  }

  const { error: signOutError } = await adminSupabase.auth.admin.signOut(userId);
  if (signOutError) {
    return { ok: false, message: "Could not revoke active sessions for this user right now." };
  }

  const sendResult = await sendAdminEmailInline(adminSupabase, {
    kind: "password_recovery",
    email
  });

  if (!sendResult.ok) {
    return { ok: false, message: sendResult.message };
  }

  revalidatePath("/admin/players");
  return {
    ok: true,
    message: `User access reset. A password reset email was sent to ${email}.`
  };
}

export async function fetchAdminPlayerHealthAction(): Promise<FetchAdminPlayerHealthResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const players = await fetchAdminPlayerHealthRows();
    return { ok: true, players };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load admin player health right now."
    };
  }
}

export async function updateAdminMatchResultAction(input: UpdateMatchResultInput): Promise<UpdateMatchResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: previousMatch, error: previousMatchError } = await adminSupabase
    .from("matches")
    .select("id,status,stage")
    .eq("id", input.id)
    .single();

  if (previousMatchError) {
    return { ok: false, message: previousMatchError.message };
  }

  const { data, error } = await adminSupabase
    .from("matches")
    .update({
      status: input.status,
      home_score: input.homeScore ?? null,
      away_score: input.awayScore ?? null,
      winner_team_id: input.winnerTeamId ?? null
    })
    .eq("id", input.id)
    .select(
      "id,stage,group_name,status,home_team_id,away_team_id,home_source,away_source,kickoff_time,home_score,away_score,winner_team_id,updated_at"
    )
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((previousMatch as MatchRow).status === "final" && input.status !== "final") {
    const resetResult = await resetGroupMatchScoring(adminSupabase, input.id);
    if (!resetResult.ok) {
      return resetResult;
    }
  }

  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/admin/matches");
  return { ok: true, match: mapMatchRow(data as MatchRow) };
}

export async function scoreFinalizedGroupMatch(matchId: string): Promise<ScoreMatchResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_team_id,away_team_id,home_score,away_score,winner_team_id")
    .eq("id", matchId)
    .single();

  if (matchError) {
    return { ok: false, message: matchError.message };
  }

  const mappedMatch = mapMatchRow(match as MatchRow);
  if (!canScoreGroupMatch(mappedMatch)) {
    return {
      ok: true,
      scored: false,
      predictionsScored: 0,
      message: "Match saved. Scoring skipped because this is not a finalized group-stage match with scores."
    };
  }

  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("predictions")
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score"
    )
    .eq("match_id", matchId);

  if (predictionsError) {
    return { ok: false, message: predictionsError.message };
  }

  const predictionRows = (predictions ?? []) as PredictionRow[];
  const predictionUpdates = predictionRows.map((prediction) =>
    adminSupabase
      .from("predictions")
      .update({
        points_awarded: scoreGroupStagePrediction(
          {
            predictedWinnerTeamId: prediction.predicted_winner_team_id,
            predictedIsDraw: prediction.predicted_is_draw,
            predictedHomeScore: prediction.predicted_home_score,
            predictedAwayScore: prediction.predicted_away_score
          },
          mappedMatch
        )
      })
      .eq("id", prediction.id)
  );

  const updateResults = await Promise.all(predictionUpdates);
  const failedPredictionUpdate = updateResults.find((result) => result.error);
  if (failedPredictionUpdate?.error) {
    return { ok: false, message: failedPredictionUpdate.error.message };
  }

  const leaderboardResult = await recalculateLeaderboard(adminSupabase);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/predictions");
  revalidatePath("/admin/matches");

  return {
    ok: true,
    scored: true,
    predictionsScored: predictionRows.length,
    message:
      predictionRows.length === 0
        ? `Match saved as final, but no Supabase prediction rows were found for match ${matchId}.`
        : `Match saved and ${predictionRows.length} predictions scored.`
  };
}

async function assertCurrentUserIsAdmin(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as an admin to score matches." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, message: "Only admins can score matches." };
  }

  return { ok: true, userId: user.id };
}

async function recalculateLeaderboard(
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: predictionPoints, error: predictionPointsError } = await adminSupabase
    .from("predictions")
    .select("user_id,points_awarded");

  if (predictionPointsError) {
    return { ok: false, message: predictionPointsError.message };
  }

  const totalsByUser = new Map<string, number>();
  for (const row of predictionPoints as { user_id: string; points_awarded: number | null }[]) {
    totalsByUser.set(row.user_id, (totalsByUser.get(row.user_id) ?? 0) + (row.points_awarded ?? 0));
  }

  const { data: users, error: usersError } = await adminSupabase.from("users").select("id");
  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const totals = (users as { id: string }[])
    .map((user) => ({ user_id: user.id, total_points: totalsByUser.get(user.id) ?? 0 }))
    .sort((a, b) => b.total_points - a.total_points || a.user_id.localeCompare(b.user_id));

  const rankedEntries = assignRanks(totals).map((entry) => ({
    ...entry,
    updated_at: new Date().toISOString()
  }));

  if (rankedEntries.length > 0) {
    const { error: leaderboardError } = await adminSupabase
      .from("leaderboard_entries")
      .upsert(rankedEntries, { onConflict: "user_id" });

    if (leaderboardError) {
      return { ok: false, message: leaderboardError.message };
    }
  }

  const userTotalUpdates = (users as { id: string }[]).map((user) =>
    adminSupabase
      .from("users")
      .update({ total_points: totalsByUser.get(user.id) ?? 0 })
      .eq("id", user.id)
  );

  const userUpdateResults = await Promise.all(userTotalUpdates);
  const failedUserUpdate = userUpdateResults.find((result) => result.error);
  if (failedUserUpdate?.error) {
    return { ok: false, message: failedUserUpdate.error.message };
  }

  return { ok: true };
}

async function resetGroupMatchScoring(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await adminSupabase
    .from("predictions")
    .update({ points_awarded: 0 })
    .eq("match_id", matchId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return recalculateLeaderboard(adminSupabase);
}

function assignRanks(totals: LeaderboardTotal[]) {
  let previousPoints: number | null = null;
  let previousRank = 0;

  return totals.map((entry, index) => {
    const rank = previousPoints === entry.total_points ? previousRank : index + 1;
    previousPoints = entry.total_points;
    previousRank = rank;
    return { ...entry, rank };
  });
}

function mapMatchRow(row: MatchRow) {
  return {
    id: row.id,
    stage: row.stage,
    groupName: row.group_name ?? undefined,
    status: row.status,
    homeTeamId: row.home_team_id ?? undefined,
    awayTeamId: row.away_team_id ?? undefined,
    homeSource: row.home_source ?? undefined,
    awaySource: row.away_source ?? undefined,
    kickoffTime: row.kickoff_time ?? "",
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    winnerTeamId: row.winner_team_id ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

async function findAuthUserByEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmail: string
): Promise<AuthUserSummary | null> {
  let page = 1;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    const matchedUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );

    if (matchedUser) {
      return {
        id: matchedUser.id,
        email: matchedUser.email
      };
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function enforceEmailRateLimits(
  adminSupabase: ReturnType<typeof createAdminClient>,
  adminUserId: string,
  normalizedEmail: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await hasEmailJobsTable(adminSupabase))) {
    return { ok: true };
  }

  const now = Date.now();
  const adminWindowStart = new Date(now - 60_000).toISOString();
  const emailWindowStart = new Date(now - 10 * 60_000).toISOString();
  const globalWindowStart = new Date(now - 60 * 60_000).toISOString();

  const [
    { count: adminCount, error: adminRateError },
    { count: emailCount, error: emailRateError },
    { count: globalCount, error: globalRateError }
  ] = await Promise.all([
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("requested_by_admin_id", adminUserId)
      .gte("created_at", adminWindowStart),
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("email", normalizedEmail)
      .gte("created_at", emailWindowStart),
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", globalWindowStart)
  ]);

  if (adminRateError || emailRateError || globalRateError) {
    return {
      ok: false,
      message: adminRateError?.message ?? emailRateError?.message ?? globalRateError?.message ?? "Rate limit lookup failed."
    };
  }

  if ((adminCount ?? 0) >= 10) {
    return { ok: false, message: "You have reached the limit of 10 access emails per minute. Please wait a minute and try again." };
  }

  if ((emailCount ?? 0) >= 1) {
    return { ok: false, message: "That email was sent recently. Please wait 10 minutes before sending again." };
  }

  if ((globalCount ?? 0) >= 100) {
    return { ok: false, message: "Email sending is temporarily capped for the app. Please try again shortly." };
  }

  return { ok: true };
}

async function upsertInviteRow(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    email: string;
    displayName: string;
    role: UserRole;
    status: "pending" | "accepted" | "revoked" | "expired" | "failed";
    lastError: string | null;
    preserveAcceptedAt?: string | null;
    incrementAttempts?: boolean;
    setLastSentAt?: boolean;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  let nextSendAttempts: number | undefined;

  if (input.incrementAttempts) {
    const { data: currentInvite, error: currentInviteError } = await adminSupabase
      .from("invites")
      .select("send_attempts")
      .eq("email", input.email)
      .maybeSingle();

    if (currentInviteError) {
      return { ok: false, message: currentInviteError.message };
    }

    nextSendAttempts = (currentInvite?.send_attempts ?? 0) + 1;
  }

  const fullPayload = {
    email: input.email,
    display_name: input.displayName,
    role: input.role,
    accepted_at: input.preserveAcceptedAt ?? null,
    status: input.status,
    last_error: input.lastError,
    ...(nextSendAttempts !== undefined ? { send_attempts: nextSendAttempts } : {}),
    ...(input.setLastSentAt ? { last_sent_at: new Date().toISOString() } : {})
  };

  const { error } = await adminSupabase.from("invites").upsert(fullPayload, { onConflict: "email" });

  if (error) {
    if (!isMissingInviteLifecycleColumnError(error.message)) {
      return { ok: false, message: error.message };
    }

    const minimalPayload = {
      email: input.email,
      display_name: input.displayName,
      role: input.role,
      accepted_at: input.preserveAcceptedAt ?? null
    };

    const { error: fallbackError } = await adminSupabase.from("invites").upsert(minimalPayload, { onConflict: "email" });
    if (fallbackError) {
      return { ok: false, message: fallbackError.message };
    }
  }

  return { ok: true };
}

async function enqueueEmailJob(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    kind: EmailJobKind;
    email: string;
    requestedByAdminId: string;
    payload: EmailJobPayload;
  }
): Promise<EnqueueEmailJobResult> {
  const { error } = await adminSupabase.from("email_jobs").insert({
    kind: input.kind,
    email: input.email,
    dedupe_key: `${input.kind}:${input.email}`,
    payload: input.payload,
    requested_by_admin_id: input.requestedByAdminId
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyQueued: true };
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, alreadyQueued: false };
}

async function fetchInviteLookup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmail: string
) {
  const fullResult = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at,status,last_sent_at,send_attempts,last_error")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!fullResult.error || !isMissingInviteLifecycleColumnError(fullResult.error.message)) {
    return fullResult;
  }

  const fallbackResult = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at,status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!fallbackResult.error) {
    return {
      data: {
        ...fallbackResult.data,
        last_sent_at: null,
        send_attempts: 0,
        last_error: null
      },
      error: null
    };
  }

  if (!isMissingInviteLifecycleColumnError(fallbackResult.error.message)) {
    return fallbackResult;
  }

  const minimalResult = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  return {
    data: minimalResult.data
      ? {
          ...minimalResult.data,
          status: minimalResult.data.accepted_at ? "accepted" : "pending",
          last_sent_at: null,
          send_attempts: 0,
          last_error: null
        }
      : null,
    error: minimalResult.error
  };
}

async function hasEmailJobsTable(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { error } = await adminSupabase.from("email_jobs").select("id", { head: true, count: "exact" });
  if (!error) {
    return true;
  }

  if (isMissingEmailJobsError(error.message)) {
    return false;
  }

  return false;
}

async function sendAdminEmailInline(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: { kind: EmailJobKind; email: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.kind === "access_email") {
    const { error } = await adminSupabase.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${getSiteUrl()}/admin/invites`
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  }

  const { error } = await adminSupabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

function isMissingInviteLifecycleColumnError(message: string) {
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

function isMissingRelationError(message: string, relation: string) {
  const normalized = message.toLowerCase();
  return normalized.includes(relation.toLowerCase()) && normalized.includes("schema cache");
}

function isMissingEmailJobsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("email_jobs") && normalized.includes("schema cache")) ||
    (normalized.includes("email_jobs") && normalized.includes("does not exist")) ||
    isMissingRelationError(message, "public.email_jobs")
  );
}
