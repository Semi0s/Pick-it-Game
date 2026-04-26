"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { acceptLegalDocument, DEFAULT_LEGAL_DOCUMENT_TYPE } from "@/lib/legal";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export type AcceptCurrentLegalDocumentResult =
  | {
      ok: true;
      message: string;
      nextPath: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function acceptCurrentLegalDocumentAction(
  input?: {
    documentType?: string;
    nextPath?: string;
  }
): Promise<AcceptCurrentLegalDocumentResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to accept the current terms." };
  }

  const headerStore = await headers();
  const acceptedIp = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const acceptedUserAgent = headerStore.get("user-agent");

  try {
    await acceptLegalDocument(user.id, input?.documentType ?? DEFAULT_LEGAL_DOCUMENT_TYPE, {
      acceptedIp,
      acceptedUserAgent
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save your legal acceptance right now."
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/my-groups");
  revalidatePath("/leaderboard");
  revalidatePath("/profile");
  revalidatePath("/profile-setup");
  revalidatePath("/legal/accept");

  return {
    ok: true,
    message: "Thanks. You're all set.",
    nextPath: getSafeNextPath(input?.nextPath)
  };
}

function getSafeNextPath(nextPath?: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/dashboard";
  }

  if (nextPath === "/legal/accept") {
    return "/dashboard";
  }

  return nextPath;
}
