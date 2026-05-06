import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseClientEnv } from "@/lib/supabase/env";

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseClientEnv();

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      detectSessionInUrl: false
    }
  });
}
