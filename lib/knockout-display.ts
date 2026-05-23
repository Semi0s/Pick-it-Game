import type { KnockoutBracketEditorView, KnockoutBracketMatchView } from "@/lib/bracket-predictions";

export function shouldShowProjectedComparisonRound(input: {
  currentStage: KnockoutBracketMatchView["stage"];
  mode: KnockoutBracketEditorView["mode"];
  projectedComparisonMatchCount: number;
}) {
  return input.currentStage === "r32" && (input.mode === "projected" || input.projectedComparisonMatchCount > 0);
}
