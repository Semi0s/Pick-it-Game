import { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

export type MatchEventType = "sync" | "finalize" | "override" | "reopen" | "lock" | "batch_test_finalize";

export async function appendMatchEvent(
  adminSupabase: AdminSupabaseClient,
  input: {
    matchId: string;
    eventType: MatchEventType;
    payload?: Record<string, unknown>;
  }
) {
  const { error } = await adminSupabase.from("match_events").insert({
    match_id: input.matchId,
    event_type: input.eventType,
    payload: input.payload ?? {}
  });

  if (error) {
    console.warn("[match-events] Could not append match event.", {
      matchId: input.matchId,
      eventType: input.eventType,
      message: error.message
    });
  }
}
