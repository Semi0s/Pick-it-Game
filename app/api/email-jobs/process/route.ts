import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendTransactionalEmail } from "@/lib/email-sender";
import { getSiteUrl } from "@/lib/site-url";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailJobKind = "access_email" | "password_recovery" | "group_invite_email";
type EmailJobStatus = "pending" | "processing" | "retrying" | "sent" | "failed";
type AccessEmailResult = "invite_sent" | "recovery_sent" | "no_op";

type EmailJobRow = {
  id: string;
  kind: EmailJobKind;
  email: string;
  payload: {
    displayName?: string;
    role?: UserRole;
    source?: string;
    groupInviteId?: string;
    groupId?: string;
    groupName?: string;
    inviterName?: string;
    inviterEmail?: string;
    suggestedDisplayName?: string | null;
    claimUrl?: string;
  } | null;
  status: EmailJobStatus;
  attempts: number;
  max_attempts: number;
  available_at: string;
  last_error?: string | null;
};

type InviteRow = {
  email: string;
  display_name: string;
  role: UserRole;
  accepted_at?: string | null;
  send_attempts?: number | null;
};

type GroupInviteDeliveryRow = {
  id: string;
  send_attempts?: number | null;
};

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  const auth = getAuthorizationState(request);
  console.info("[email-jobs] Worker invoked.", {
    method: request.method,
    path: request.nextUrl.pathname,
    source: auth.source
  });

  if (!auth.authorized) {
    console.warn("[email-jobs] Unauthorized worker request rejected.", {
      method: request.method,
      path: request.nextUrl.pathname,
      source: auth.source
    });
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.rpc("claim_email_jobs", { job_limit: 10 });

  if (error) {
    console.error("[email-jobs] Failed to claim jobs.", { message: error.message });
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const jobs = (data ?? []) as EmailJobRow[];
  console.info("[email-jobs] Claimed jobs.", {
    claimed: jobs.length,
    jobIds: jobs.map((job) => job.id),
    jobKinds: jobs.map((job) => job.kind)
  });
  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const job of jobs) {
    const result = await processJob(adminSupabase, job);
    if (result === "sent") {
      sent += 1;
    } else if (result === "retrying") {
      retried += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    claimed: jobs.length,
    sent,
    retried,
    failed
  });
}

async function processJob(adminSupabase: ReturnType<typeof createAdminClient>, job: EmailJobRow) {
  let emailSent = false;

  try {
    console.info("[email-jobs] Processing job.", {
      jobId: job.id,
      kind: job.kind,
      email: job.email,
      attempts: job.attempts,
      maxAttempts: job.max_attempts
    });
    let accessResult: AccessEmailResult | null = null;

    if (job.kind === "access_email") {
      accessResult = await sendAccessEmail(adminSupabase, job);
    } else if (job.kind === "group_invite_email") {
      await sendGroupInviteEmail(job);
    } else {
      await sendPasswordRecovery(adminSupabase, job.email);
    }

    emailSent = true;
    await markJobSent(adminSupabase, job.id);
    if (job.kind === "access_email" && accessResult === "invite_sent") {
      await markInviteSent(adminSupabase, job.email);
    } else if (job.kind === "access_email") {
      await clearInviteQueueState(adminSupabase, job.email);
    } else if (job.kind === "group_invite_email") {
      await markGroupInviteSent(adminSupabase, job);
    }

    console.info("[email-jobs] Job sent successfully.", {
      jobId: job.id,
      kind: job.kind,
      email: job.email,
      accessResult
    });
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email processing error.";
    console.error("[email-jobs] Job processing failed.", {
      jobId: job.id,
      kind: job.kind,
      email: job.email,
      message,
      attempts: job.attempts,
      maxAttempts: job.max_attempts
    });

    if (emailSent) {
      const postSendMessage = `Email send completed, but post-send bookkeeping failed: ${message}`;

      try {
        await markJobFailed(adminSupabase, job.id, postSendMessage);
      } catch {
        // Leave the job in processing state rather than risk a duplicate resend.
      }

      return "failed";
    }

    const shouldRetry = isTransientEmailError(message) && job.attempts < job.max_attempts;

    if (job.kind === "access_email") {
      await markInviteFailed(adminSupabase, job.email, message);
    } else if (job.kind === "group_invite_email") {
      await markGroupInviteFailed(adminSupabase, job, message);
    }

    if (shouldRetry) {
      await markJobRetrying(adminSupabase, job.id, job.attempts, message);
      return "retrying";
    }

    await markJobFailed(adminSupabase, job.id, message);
    return "failed";
  }
}

async function sendAccessEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  job: EmailJobRow
): Promise<AccessEmailResult> {
  const normalizedEmail = job.email.trim().toLowerCase();
  const authUser = await findAuthUserByEmail(adminSupabase, normalizedEmail);
  const { data: existingUser } = await adminSupabase.from("users").select("id").eq("email", normalizedEmail).maybeSingle();

  if (authUser && existingUser) {
    await sendPasswordRecovery(adminSupabase, normalizedEmail);
    return "recovery_sent";
  }

  const payload = job.payload ?? {};
  if (payload.displayName && payload.role) {
    await ensureInviteRow(adminSupabase, {
      email: normalizedEmail,
      displayName: payload.displayName,
      role: payload.role
    });
  }

  const { error } = await adminSupabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent("/login?confirmed=1&flow=invite&mode=signup")}`
  });

  if (error) {
    throw new Error(error.message);
  }

  return "invite_sent";
}

async function sendGroupInviteEmail(job: EmailJobRow) {
  const payload = job.payload ?? {};
  if (!payload.groupInviteId || !payload.groupName || !payload.claimUrl) {
    throw new Error("Group invite email job is missing required payload.");
  }

  const groupName = payload.groupName;
  const invitedEmail = job.email;
  const suggestedDisplayName = payload.suggestedDisplayName?.trim() || null;
  const inviterLabel = payload.inviterName?.trim() || payload.inviterEmail?.trim() || "A group manager";
  const claimUrl = payload.claimUrl;
  const appName = "PICK-IT!";

  const escapedGroupName = escapeHtml(groupName);
  const escapedInvitedEmail = escapeHtml(invitedEmail);
  const escapedInviterLabel = escapeHtml(inviterLabel);
  const escapedSuggestedName = suggestedDisplayName ? escapeHtml(suggestedDisplayName) : null;
  const escapedClaimUrl = escapeHtml(claimUrl);
  const escapedAppName = escapeHtml(appName);

  const introLine = escapedSuggestedName
    ? `${escapedInviterLabel} invited ${escapedSuggestedName} (${escapedInvitedEmail}) to join ${escapedGroupName}.`
    : `${escapedInviterLabel} invited ${escapedInvitedEmail} to join ${escapedGroupName}.`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h1 style="font-size: 24px; margin-bottom: 16px;">Join ${escapedGroupName} on ${escapedAppName}</h1>
      <p style="margin-bottom: 12px;">${introLine}</p>
      <p style="margin-bottom: 12px;">
        Use the secure claim link below to sign in or create your account, then join the group with your global picks.
      </p>
      <p style="margin: 24px 0;">
        <a href="${escapedClaimUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
          Open Group Invite
        </a>
      </p>
      <p style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">
        If the button does not work, paste this link into your browser:<br />
        <span style="word-break: break-all;">${escapedClaimUrl}</span>
      </p>
      <p style="font-size: 14px; color: #6b7280;">If you already have an account, sign in with ${escapedInvitedEmail}. Otherwise create one with that email first.</p>
    </div>
  `;

  const textLines = [
    `Join ${groupName} on ${appName}`,
    "",
    suggestedDisplayName
      ? `${inviterLabel} invited ${suggestedDisplayName} (${invitedEmail}) to join ${groupName}.`
      : `${inviterLabel} invited ${invitedEmail} to join ${groupName}.`,
    "",
    "Use this secure claim link to sign in or create your account, then join the group:",
    claimUrl,
    "",
    `If you already have an account, sign in with ${invitedEmail}. Otherwise create one with that email first.`
  ];

  console.info("[email-jobs] Sending group invite email.", {
    jobId: job.id,
    groupInviteId: payload.groupInviteId,
    groupId: payload.groupId ?? null,
    email: invitedEmail
  });

  try {
    const result = await sendTransactionalEmail({
      to: invitedEmail,
      subject: `You're invited to join ${groupName} on PICK-IT!`,
      html,
      text: textLines.join("\n"),
      replyTo: payload.inviterEmail?.trim() || undefined
    });

    console.info("[email-jobs] Group invite email sent.", {
      jobId: job.id,
      groupInviteId: payload.groupInviteId,
      email: invitedEmail,
      providerResponseId: result.providerResponseId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Resend error.";
    console.error("[email-jobs] Group invite email send failed.", {
      jobId: job.id,
      groupInviteId: payload.groupInviteId,
      email: invitedEmail,
      message
    });
    throw error;
  }
}

async function sendPasswordRecovery(adminSupabase: ReturnType<typeof createAdminClient>, email: string) {
  const { error } = await adminSupabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function findAuthUserByEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmail: string
) {
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
      return matchedUser;
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function ensureInviteRow(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    email: string;
    displayName: string;
    role: UserRole;
  }
) {
  const { error } = await adminSupabase.from("invites").upsert(
    {
      email: input.email,
      display_name: input.displayName,
      role: input.role
    },
    { onConflict: "email" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function markJobSent(adminSupabase: ReturnType<typeof createAdminClient>, jobId: string) {
  const { error } = await adminSupabase
    .from("email_jobs")
    .update({
      status: "sent",
      last_error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markJobRetrying(
  adminSupabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  attempts: number,
  message: string
) {
  const nextDelayMinutes = Math.min(Math.max(attempts, 1) * 2, 30);
  const { error } = await adminSupabase
    .from("email_jobs")
    .update({
      status: "retrying",
      last_error: message,
      available_at: new Date(Date.now() + nextDelayMinutes * 60_000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markJobFailed(adminSupabase: ReturnType<typeof createAdminClient>, jobId: string, message: string) {
  const { error } = await adminSupabase
    .from("email_jobs")
    .update({
      status: "failed",
      last_error: message,
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markInviteSent(adminSupabase: ReturnType<typeof createAdminClient>, email: string) {
  const { data: invite, error: inviteLookupError } = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at,send_attempts")
    .eq("email", email)
    .maybeSingle();

  if (inviteLookupError || !invite) {
    return;
  }

  const inviteRow = invite as InviteRow;
  await upsertInviteWithFallback(adminSupabase, {
    email: inviteRow.email,
    display_name: inviteRow.display_name,
    role: inviteRow.role,
    accepted_at: inviteRow.accepted_at ?? null,
    status: inviteRow.accepted_at ? "accepted" : "pending",
    last_sent_at: new Date().toISOString(),
    send_attempts: (inviteRow.send_attempts ?? 0) + 1,
    last_error: null
  });
}

async function clearInviteQueueState(adminSupabase: ReturnType<typeof createAdminClient>, email: string) {
  const { data: invite, error: inviteLookupError } = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at,send_attempts")
    .eq("email", email)
    .maybeSingle();

  if (inviteLookupError || !invite) {
    return;
  }

  const inviteRow = invite as InviteRow;
  await upsertInviteWithFallback(adminSupabase, {
    email: inviteRow.email,
    display_name: inviteRow.display_name,
    role: inviteRow.role,
    accepted_at: inviteRow.accepted_at ?? null,
    status: inviteRow.accepted_at ? "accepted" : "pending",
    send_attempts: inviteRow.send_attempts ?? 0,
    last_error: null
  });
}

async function markGroupInviteSent(adminSupabase: ReturnType<typeof createAdminClient>, job: EmailJobRow) {
  const groupInviteId = job.payload?.groupInviteId;
  if (!groupInviteId) {
    return;
  }

  const { data: invite, error: inviteLookupError } = await adminSupabase
    .from("group_invites")
    .select("id,send_attempts")
    .eq("id", groupInviteId)
    .maybeSingle();

  if (inviteLookupError || !invite) {
    return;
  }

  const inviteRow = invite as GroupInviteDeliveryRow;
  const { error } = await adminSupabase
    .from("group_invites")
    .update({
      last_sent_at: new Date().toISOString(),
      send_attempts: (inviteRow.send_attempts ?? 0) + 1,
      last_error: null
    })
    .eq("id", groupInviteId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markGroupInviteFailed(
  adminSupabase: ReturnType<typeof createAdminClient>,
  job: EmailJobRow,
  message: string
) {
  const groupInviteId = job.payload?.groupInviteId;
  if (!groupInviteId) {
    return;
  }

  const { data: invite, error: inviteLookupError } = await adminSupabase
    .from("group_invites")
    .select("id,send_attempts")
    .eq("id", groupInviteId)
    .maybeSingle();

  if (inviteLookupError || !invite) {
    return;
  }

  const inviteRow = invite as GroupInviteDeliveryRow;
  const { error } = await adminSupabase
    .from("group_invites")
    .update({
      send_attempts: (inviteRow.send_attempts ?? 0) + 1,
      last_error: message
    })
    .eq("id", groupInviteId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markInviteFailed(adminSupabase: ReturnType<typeof createAdminClient>, email: string, message: string) {
  const { data: invite, error: inviteLookupError } = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at,send_attempts")
    .eq("email", email)
    .maybeSingle();

  if (inviteLookupError || !invite) {
    return;
  }

  const inviteRow = invite as InviteRow;
  await upsertInviteWithFallback(adminSupabase, {
    email: inviteRow.email,
    display_name: inviteRow.display_name,
    role: inviteRow.role,
    accepted_at: inviteRow.accepted_at ?? null,
    status: "failed",
    send_attempts: (inviteRow.send_attempts ?? 0) + 1,
    last_error: message
  });
}

async function upsertInviteWithFallback(
  adminSupabase: ReturnType<typeof createAdminClient>,
  payload: {
    email: string;
    display_name: string;
    role: UserRole;
    accepted_at: string | null;
    status: "pending" | "accepted" | "failed";
    last_sent_at?: string;
    send_attempts?: number;
    last_error: string | null;
  }
) {
  const { error } = await adminSupabase.from("invites").upsert(payload, { onConflict: "email" });

  if (!error) {
    return;
  }

  if (!isMissingInviteDeliveryColumnError(error.message)) {
    throw new Error(error.message);
  }

  const minimalPayload = {
    email: payload.email,
    display_name: payload.display_name,
    role: payload.role,
    accepted_at: payload.accepted_at,
    status: payload.status
  };

  const { error: fallbackError } = await adminSupabase.from("invites").upsert(minimalPayload, { onConflict: "email" });
  if (fallbackError) {
    throw new Error(fallbackError.message);
  }
}

function isMissingInviteDeliveryColumnError(message: string) {
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

function isTransientEmailError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("temporar") ||
    normalized.includes("timeout") ||
    normalized.includes("network") ||
    normalized.includes("try again")
  );
}

function getAuthorizationState(request: NextRequest) {
  const secret = process.env.EMAIL_JOB_SECRET ?? process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  const userAgent = request.headers.get("user-agent");

  if (!secret) {
    return {
      authorized: process.env.NODE_ENV !== "production",
      source:
        vercelCronHeader ? "vercel-cron-header-no-secret"
        : authHeader ? "bearer-no-secret"
        : cronHeader ? "x-cron-secret-no-secret"
        : userAgent?.includes("vercel-cron") ? "vercel-cron-user-agent-no-secret"
        : "no-secret-configured"
    };
  }

  if (authHeader === `Bearer ${secret}`) {
    return { authorized: true, source: "bearer" };
  }

  if (cronHeader === secret) {
    return { authorized: true, source: "x-cron-secret" };
  }

  if (vercelCronHeader && userAgent?.includes("vercel-cron")) {
    return { authorized: false, source: "vercel-cron-header-without-secret-match" };
  }

  return { authorized: false, source: "unauthorized" };
}
