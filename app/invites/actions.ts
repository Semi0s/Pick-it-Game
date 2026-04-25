"use server";

import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export type InviteAutocompleteOption = {
  email: string;
  label: string;
};

export async function fetchInviteAutocompleteAction(query: string): Promise<InviteAutocompleteOption[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const [{ data: profile }, { data: managerLimits }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("manager_limits").select("user_id").eq("user_id", user.id).maybeSingle()
  ]);

  const canUseAutocomplete = profile?.role === "admin" || Boolean(managerLimits);
  if (!canUseAutocomplete) {
    return [];
  }

  const [usersResult, invitesResult] = await Promise.all([
    supabase
      .from("users")
      .select("email,name")
      .or(`email.ilike.%${escapeLike(normalizedQuery)}%,name.ilike.%${escapeLike(normalizedQuery)}%`)
      .limit(8),
    supabase
      .from("invites")
      .select("email,display_name")
      .ilike("email", `%${escapeLike(normalizedQuery)}%`)
      .limit(8)
  ]);

  const suggestions = new Map<string, InviteAutocompleteOption>();

  for (const row of usersResult.data ?? []) {
    const email = row.email?.trim().toLowerCase();
    if (!email || suggestions.has(email)) {
      continue;
    }

    suggestions.set(email, {
      email,
      label: row.name ? `${row.name} · ${email}` : email
    });
  }

  for (const row of invitesResult.data ?? []) {
    const email = row.email?.trim().toLowerCase();
    if (!email || suggestions.has(email)) {
      continue;
    }

    suggestions.set(email, {
      email,
      label: row.display_name ? `${row.display_name} · ${email}` : email
    });
  }

  return Array.from(suggestions.values()).slice(0, 8);
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "");
}
