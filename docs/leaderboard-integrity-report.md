# Leaderboard Integrity Report

Date: April 27, 2026

## Scope

This audit reviewed leaderboard scoring integrity across:

- `predictions.points_awarded`
- `prediction_scores`
- `leaderboard_entries`
- `users.total_points`
- `leaderboard_snapshots`
- group leaderboard membership filtering

The review was read-only. No direct database writes were used as part of the audit itself.

## Validated

The following behaviors were verified as correct:

- Scoring rules:
  - correct outcome = `3`
  - exact score = `8`
  - correct goal difference but not exact = `4`
- `prediction_scores.points` matches:
  - `outcome_points + exact_score_points + goal_difference_points`
- current leaderboard rank logic is correct
- group-scoped standings include only actual group members
- no duplicate `prediction_scores` rows were found
- no group snapshot membership leaks were found

## Issue Found

One stale inconsistency was found tied to match `g-04`.

Observed symptoms:

- one prediction row had:
  - `predictions.points_awarded = 0`
  - `prediction_scores.points = 4`
- one affected user total was out of sync:
  - `prediction_scores` total was non-zero
  - `leaderboard_entries.total_points = 0`
  - `users.total_points = 0`
- stored `leaderboard_snapshots` for `g-04` no longer matched current live leaderboard totals

Affected user observed during audit:

- `Andy-C`

## Resolution

The inconsistency cleared after:

1. closing / reopening the match
2. allowing the reset path to run

This confirmed the issue was stale match-scoped scoring state, not incorrect scoring math.

## Conclusion

The live leaderboard problem was caused by residual scoring state around match `g-04`.

It was **not** caused by:

- broken scoring formula logic
- broken rank calculation
- duplicate `prediction_scores` rows

After reset/reopen, the affected state returned to consistency.

## Remaining Structural Risks

Even though the live inconsistency was resolved, two architectural risks remain:

1. Scoring is not transactional
   - `scoreFinalizedGroupMatch()` performs multiple dependent writes in separate steps.
   - A partial failure can leave predictions, breakdown rows, leaderboard totals, snapshots, and events out of sync.

2. Leaderboard totals are derived from `predictions.points_awarded`
   - `prediction_scores` stores the detailed score breakdown
   - but `recalculateLeaderboard()` uses `predictions.points_awarded` as the source for totals
   - if those two diverge, aggregate leaderboard state follows the stale `predictions` values

## Current Status

- operationally healthy again
- scoring math validated
- rank behavior validated
- group membership scoping validated
- worth hardening later at the scoring pipeline level

## Recommended Future Hardening

- wrap match scoring in a transactional flow
- make `prediction_scores` the source of truth for recomputed totals, or ensure there is only one authoritative score store
- keep a reusable read-only integrity audit script for future verification

