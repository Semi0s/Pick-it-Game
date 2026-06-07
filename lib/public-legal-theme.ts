import type { CSSProperties } from "react";
import { getAppAccentCssVars, getLocalizedCardThemeForUserSurface } from "@/lib/localized-card-themes";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type LegalAccentProfile = {
  home_team_id?: string | null;
  preferred_language?: string | null;
};

export async function getPublicLegalAccentStyle(): Promise<CSSProperties> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return {};
    }

    const { data, error } = await supabase
      .from("users")
      .select("home_team_id,preferred_language")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) {
      return {};
    }

    const profile = data as LegalAccentProfile;
    const theme = getLocalizedCardThemeForUserSurface({
      homeTeamId: profile.home_team_id ?? null,
      preferredLanguage: profile.preferred_language ?? null
    });

    return getAppAccentCssVars(theme);
  } catch {
    return {};
  }
}
