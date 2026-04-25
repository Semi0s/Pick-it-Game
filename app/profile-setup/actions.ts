"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9._ -]{3,24}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._ -]{3,24}$/;

export type CompleteProfileSetupResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function completeProfileSetupAction(input: {
  displayName: string;
  username: string;
}): Promise<CompleteProfileSetupResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to finish profile setup." };
  }

  const normalizedDisplayName = normalizeProfileText(input.displayName);
  const normalizedUsername = normalizeProfileText(input.username);

  if (!DISPLAY_NAME_PATTERN.test(normalizedDisplayName)) {
    return {
      ok: false,
      message: "Display name must be 3-24 characters and can use letters, numbers, spaces, periods, hyphens, and underscores."
    };
  }

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    return {
      ok: false,
      message: "Username must be 3-24 characters and can use letters, numbers, spaces, periods, hyphens, and underscores."
    };
  }

  const { data: existingUsername, error: existingUsernameError } = await supabase
    .from("users")
    .select("id")
    .neq("id", user.id)
    .ilike("username", normalizedUsername)
    .maybeSingle();

  if (existingUsernameError) {
    return { ok: false, message: existingUsernameError.message };
  }

  if (existingUsername) {
    return { ok: false, message: "That username is already taken. Try another one." };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("users")
    .update({
      name: normalizedDisplayName,
      username: normalizedUsername,
      username_set_at: now,
      needs_profile_setup: false,
      updated_at: now
    })
    .eq("id", user.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, message: "That username is already taken. Try another one." };
    }

    return { ok: false, message: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/my-groups");
  revalidatePath("/profile");
  revalidatePath("/profile-setup");

  return {
    ok: true,
    message: "Profile setup complete."
  };
}

function normalizeProfileText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
