# Scoring Rules

This document captures the scoring rules currently implemented in code. It is intentionally descriptive, not a proposal for new rules.

## Canonical Code Paths

- Shared wrapper and deterministic ranking helpers: `lib/scoring-engine.ts`
- Canonical leaderboard aggregation: `lib/canonical-scoring.ts`
- Server-safe Group Phase ladder recompute: `lib/group-phase-ladder-recompute.ts`
- Group Phase ladder scoring: `lib/group-phase-scoring.ts`
- Legacy full-score group match scoring: `lib/group-scoring.ts`
- Knockout match scoring: `lib/bracket-scoring.ts`
- Visible leaderboard composition: `lib/leaderboard-data.ts`
- Cached leaderboard/user total rebuild: `lib/scoped-scoring.ts`
- Knockout score persistence: `lib/bracket-predictions.ts`
- Admin result finalization/recalculation triggers: `app/admin/actions.ts`

Scoring must not depend on translated labels, visible text, localization colors, home-team visual theme, or browser/client language.

## Group Phase Ladder

The current primary Group Phase game scores each user snapshot against final group standings.

Per group maximum: 14 points.

- Correct winner: 5 points
- Correct runner-up: 3 points
- Correct third-place team: 2 points
- Correct top two teams in any order: 1 point
- Correct third-place qualification status: 1 point
- Complete top-four ladder in exact order: 2 points

Group Phase ladder points are calculated by `scoreGroupPhaseSnapshot(...)`. A user with no saved snapshot scores 0. Group Phase ladder scoring stays 0 until actual group standings are fully scorable.

The server-safe recompute path is `recomputeGroupPhaseLadderScores(...)` in `lib/group-phase-ladder-recompute.ts`. It is used by visible leaderboards, cached total rebuilds, and the scoring audit command.

## Legacy Full-Score Group Match Scoring

The older full-score group prediction path remains implemented and persisted for compatibility and audit rows only. It is not the current visible/canonical Group Phase leaderboard source.

Per final group match:

- Correct outcome: 3 points
- Exact goal-difference bonus: 1 point
- Exact score bonus: 5 points

Exact-score predictions receive correct outcome plus exact score bonus, for 8 total. Correct outcome with exact goal difference but wrong exact score receives 4 total. Wrong outcome receives 0.

Only final group matches with both actual scores are scorable. Scheduled, locked, and live matches score 0.

## Knockout Scoring

Knockout scoring is calculated by `scoreBracketPrediction(...)`. A match is scorable only when it is a knockout stage match, has status `final`, and has an actual winner.

Knockout scoring uses stable match IDs and team IDs. The official FIFA 2026 knockout skeleton is:

- Round of 32: `M73`-`M88`
- Round of 16: `M89`-`M96`
- Quarterfinals: `M97`-`M100`
- Semifinals: `M101`-`M102`
- Third-place match: `M103`, if supported
- Final: `M104`

Round of 32 third-place teams are assigned through the FIFA 2026 Annexe C permutation table in `lib/fifa-2026-third-place-permutations.ts` and the canonical builder in `lib/fifa-2026-knockout-seeding.ts`. Scoring consumes the resulting match ID, source slot, and team ID; it must not consume translated labels, localized source text, rendered bracket position, or country/theme state.

Winner points by round:

- Round of 32: 3
- Round of 16: 5
- Quarterfinal: 8
- Semifinal: 10
- Third-place match: 5
- Final: 15

Exact-score bonus by round:

- Round of 32: 5
- Round of 16: 5
- Quarterfinal: 5
- Semifinal: 5
- Third-place match: 5
- Final: 10

The exact-score bonus is awarded only when the predicted winner is correct and both predicted scores exactly match the final scores.

## Lock Rules

Knockout match edits are locked server-side when:

- match status is `live`, `locked`, or `final`
- kickoff time is at or before the server-side current time

Boundary behavior:

- one second before kickoff: editable
- exactly at kickoff: locked
- one second after kickoff: locked

The pure boundary helper is `isMatchLockedAt(...)` in `lib/scoring-engine.ts`; the production save path uses it through `lib/bracket-predictions.ts`.

## Leaderboards

Visible leaderboard rows use the same deterministic ordering:

1. total points descending
2. stable `user_id` ascending

Ranks use competition ranking. Tied players share the same rank, and the next rank skips by the number of tied players.

Example:

- user-a 10 points: rank 1
- user-b 10 points: rank 1
- user-c 5 points: rank 3

Group leaderboards include only users who belong to the selected group. Group-local custom points are applied only in the applicable group scope.

The total/global leaderboard view uses canonical standard totals: Group Phase ladder + knockout + standard side picks. Phase-specific views show the selected phase component only.

## Cached Totals

`rebuildScopedLeaderboardState(...)` refreshes cached `users.total_points`, `leaderboard_entries`, and snapshots. Its standard totals currently come from:

- canonical Group Phase ladder summaries
- persisted knockout bracket scores
- standard side-pick scores when present

Group-local bonus and group-local side-pick scores are not included in global standard totals.

Group snapshots add group-local bonus and group-local side-pick scores only inside that group scope. The standard/global total remains Group Phase ladder + knockout + standard side picks.

Legacy `predictions.points_awarded` and `prediction_scores` rows may still be repaired by the audit tool, but they do not feed current canonical leaderboard totals.

Knockout score persistence flows through `scoreFinalizedKnockoutMatchWithClient(...)`, which recalculates `bracket_scores` from current `bracket_predictions` for the finalized match. Admin/manual and sync paths then rebuild canonical leaderboard state so `users.total_points`, `leaderboard_entries`, snapshots, visible leaderboard rows, and dashboard totals use the same knockout points.

## Result Status Rules

- Scheduled/not started: not scorable
- Locked before result: not scorable
- Live: not scorable as final
- Final: scorable if required actual result fields exist
- Corrected final result: recalculation should overwrite persisted score rows and rebuild leaderboard caches

The current schema does not define postponed/cancelled/abandoned statuses. If those statuses are added later, scoring should explicitly treat them as non-final unless product rules say otherwise.

## Data Constraints

The schema currently protects the most important duplicate paths:

- one group match prediction per user/match: `predictions(user_id, match_id)`
- one knockout prediction per user/match: `bracket_predictions(user_id, match_id)`
- one projected knockout prediction per user/match: `projected_bracket_predictions(user_id, match_id)`
- one group score row per prediction/match: `prediction_scores(prediction_id, match_id)`
- one knockout score row per user/match: `bracket_scores(user_id, match_id)`
- one group membership row per group/user: `group_members(group_id, user_id)`

## Out Of Scope For This Pass

- Changing point values
- Changing warning/accent/localization behavior
- Translating Super Admin tools
- Adding cancelled/postponed result semantics before the app has those statuses
