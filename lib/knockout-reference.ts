import type { KnockoutBracketEditorView } from "@/lib/bracket-predictions";

export function getKnockoutReferenceBracketView(input: {
  projectedChallengeView?: KnockoutBracketEditorView | null;
  projectedComparisonView?: KnockoutBracketEditorView | null;
}): KnockoutBracketEditorView | null {
  return input.projectedComparisonView ?? input.projectedChallengeView ?? null;
}
