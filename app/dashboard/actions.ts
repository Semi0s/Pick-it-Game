"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AppUpdate,
  AppUpdateCardTone,
  AppUpdateImportance,
  AppUpdateType,
  AppUpdateWithReadState
} from "@/lib/types";

type AppUpdateRow = {
  id: string;
  title: string;
  body: string;
  update_type: AppUpdateType;
  importance: AppUpdateImportance;
  card_tone: AppUpdateCardTone;
  link_label?: string | null;
  link_url?: string | null;
  published_at: string;
  expires_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

type UserUpdateReadRow = {
  update_id: string;
  read_at: string;
};

export type FetchLandingUpdatesResult =
  | {
      ok: true;
      updates: AppUpdateWithReadState[];
    }
  | {
      ok: false;
      message: string;
    };

export type FetchManagedUpdatesResult =
  | {
      ok: true;
      updates: AppUpdate[];
    }
  | {
      ok: false;
      message: string;
    };

export type UpsertAppUpdateInput = {
  id?: string;
  title: string;
  body: string;
  updateType: AppUpdateType;
  importance: AppUpdateImportance;
  cardTone: AppUpdateCardTone;
  linkLabel?: string | null;
  linkUrl?: string | null;
  publishedAt: string;
  expiresAt?: string | null;
};

export type UpsertAppUpdateResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ArchiveAppUpdateResult = UpsertAppUpdateResult;
export type MarkAppUpdateReadResult = UpsertAppUpdateResult;

export async function fetchLandingUpdatesAction(): Promise<FetchLandingUpdatesResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in to continue." };
  }

  const nowIso = new Date().toISOString();
  const { data: updates, error: updatesError } = await supabase
    .from("app_updates")
    .select("id,title,body,update_type,importance,card_tone,link_label,link_url,published_at,expires_at,created_by,created_at,updated_at")
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (updatesError) {
    return { ok: false, message: updatesError.message };
  }

  const activeUpdates = (((updates as AppUpdateRow[] | null) ?? []).filter((update) =>
    !update.expires_at || update.expires_at > nowIso
  ));

  if (activeUpdates.length === 0) {
    return { ok: true, updates: [] };
  }

  const { data: readRows, error: readsError } = await supabase
    .from("user_update_reads")
    .select("update_id,read_at")
    .eq("user_id", user.id)
    .in("update_id", activeUpdates.map((update) => update.id));

  if (readsError) {
    return { ok: false, message: readsError.message };
  }

  const readsByUpdateId = new Map(
    (((readRows as UserUpdateReadRow[] | null) ?? []).map((row) => [row.update_id, row.read_at]))
  );

  return {
    ok: true,
    updates: activeUpdates.map((update) => ({
      ...mapAppUpdateRow(update),
      isRead: readsByUpdateId.has(update.id),
      readAt: readsByUpdateId.get(update.id) ?? null
    }))
  };
}

export async function markAppUpdateReadAction(updateId: string): Promise<MarkAppUpdateReadResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in to continue." };
  }

  const { error } = await supabase
    .from("user_update_reads")
    .upsert(
      {
        user_id: user.id,
        update_id: updateId,
        read_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,update_id",
        ignoreDuplicates: true
      }
    );

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Update marked as read." };
}

export async function fetchManagedAppUpdatesAction(): Promise<FetchManagedUpdatesResult> {
  const currentUser = await requireSuperAdmin();
  if (!currentUser.ok) {
    return currentUser;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("app_updates")
    .select("id,title,body,update_type,importance,card_tone,link_label,link_url,published_at,expires_at,created_by,created_at,updated_at")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    updates: (((data as AppUpdateRow[] | null) ?? []).map(mapAppUpdateRow))
  };
}

export async function upsertAppUpdateAction(input: UpsertAppUpdateInput): Promise<UpsertAppUpdateResult> {
  const currentUser = await requireSuperAdmin();
  if (!currentUser.ok) {
    return currentUser;
  }

  const title = input.title.trim();
  const body = input.body.trim();
  const linkLabel = input.linkLabel?.trim() || null;
  const linkUrl = input.linkUrl?.trim() || null;

  if (!title) {
    return { ok: false, message: "Title is required." };
  }

  if (!body) {
    return { ok: false, message: "Body is required." };
  }

  const validatedLinkUrl = validateAppUpdateLink(linkUrl);
  if (linkUrl && !validatedLinkUrl) {
    return { ok: false, message: "Use a valid link URL." };
  }

  if (!input.publishedAt) {
    return { ok: false, message: "Publish date is required." };
  }

  const publishedAt = normalizeDateTimeInput(input.publishedAt);
  if (!publishedAt) {
    return { ok: false, message: "Use a valid publish date." };
  }

  const expiresAt = input.expiresAt ? normalizeDateTimeInput(input.expiresAt) : null;
  if (input.expiresAt && !expiresAt) {
    return { ok: false, message: "Use a valid expiration date." };
  }

  const adminSupabase = createAdminClient();
  const payload = {
    title,
    body,
    update_type: input.updateType,
    importance: input.importance,
    card_tone: input.cardTone,
    link_label: linkLabel,
    link_url: validatedLinkUrl,
    published_at: publishedAt,
    expires_at: expiresAt,
    created_by: currentUser.userId
  };

  const query = input.id
    ? adminSupabase.from("app_updates").update(payload).eq("id", input.id).select("id").single()
    : adminSupabase.from("app_updates").insert(payload).select("id").single();

  const { error } = await query;
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAppUpdatePaths();
  return { ok: true, message: input.id ? "Update saved." : "Update published." };
}

export async function archiveAppUpdateAction(updateId: string): Promise<ArchiveAppUpdateResult> {
  const currentUser = await requireSuperAdmin();
  if (!currentUser.ok) {
    return currentUser;
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("app_updates")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", updateId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAppUpdatePaths();
  return { ok: true, message: "Update archived." };
}

function mapAppUpdateRow(row: AppUpdateRow): AppUpdate {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    updateType: row.update_type,
    importance: row.importance,
    cardTone: row.card_tone ?? "neutral",
    linkLabel: row.link_label ?? null,
    linkUrl: row.link_url ?? null,
    publishedAt: row.published_at,
    expiresAt: row.expires_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateAppUpdateLink(linkUrl?: string | null) {
  if (!linkUrl) {
    return null;
  }

  if (linkUrl.startsWith("/")) {
    return linkUrl;
  }

  try {
    const url = new URL(linkUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeDateTimeInput(value: string) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function revalidateAppUpdatePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/");
}

async function requireAuthenticatedUser(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in to continue." };
  }

  return { ok: true, userId: user.id };
}

async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const currentUser = await requireAuthenticatedUser();
  if (!currentUser.ok) {
    return currentUser;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", currentUser.userId)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((data as { role?: string } | null)?.role !== "admin") {
    return { ok: false, message: "Only super admins can manage updates." };
  }

  return currentUser;
}
