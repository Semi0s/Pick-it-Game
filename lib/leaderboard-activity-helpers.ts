export function getLeaderboardActivityTimestamp(
  event: Pick<{ created_at: string }, "created_at">,
  match?: {
    finalized_at?: string | null;
    last_synced_at?: string | null;
    kickoff_at?: string | null;
    updated_at?: string | null;
  } | null
) {
  return (
    match?.finalized_at ??
    match?.last_synced_at ??
    match?.kickoff_at ??
    match?.updated_at ??
    event.created_at
  );
}
