export function shouldIncludeLeaderboardComments(input: {
  globalCommentsEnabled: boolean;
  scopeType: "global" | "group";
  groupCommentsEnabled?: boolean | null;
}) {
  return Boolean(input.globalCommentsEnabled && input.scopeType === "group" && input.groupCommentsEnabled);
}
