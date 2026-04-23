import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import type { UserRole } from "@/lib/types";

type EmailJobKind = "access_email" | "password_recovery";
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

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.rpc("claim_email_jobs", { job_limit: 10 });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const jobs = (data ?? []) as EmailJobRow[];
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
    let accessResult: AccessEmailResult | null = null;

    if (job.kind === "access_email") {
      accessResult = await sendAccessEmail(adminSupabase, job);
    } else {
      await sendPasswordRecovery(adminSupabase, job.email);
    }

    emailSent = true;
    await markJobSent(adminSupabase, job.id);
    if (job.kind === "access_email" && accessResult === "invite_sent") {
      await markInviteSent(adminSupabase, job.email);
    } else if (job.kind === "access_email") {
      await clearInviteQueueState(adminSupabase, job.email);
    }

    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email processing error.";

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
    redirectTo: `${getSiteUrl()}/admin/invites`
  });

  if (error) {
    throw new Error(error.message);
  }

  return "invite_sent";
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

function isAuthorized(request: NextRequest) {
  const secret = process.env.EMAIL_JOB_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");

  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}
