import { getSupabaseClientEnv } from "@/lib/supabase/env";

export function hasSupabaseConfig() {
  try {
    getSupabaseClientEnv();
    return true;
  } catch {
    return false;
  }
}
