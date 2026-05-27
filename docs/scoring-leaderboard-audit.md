# Scoring And Leaderboard Audit

This audit inventories where scoring, score persistence, leaderboard totals, and leaderboard messaging are currently calculated or displayed.

## Files Audited

- `lib/scoring-engine.ts`
- `lib/group-phase-scoring.ts`
- `lib/group-scoring.ts`
- `lib/bracket-scoring.ts`
- `lib/bracket-predictions.ts`
- `lib/canonical-scoring.ts`
- `lib/group-phase-ladder-recompute.ts`
- `lib/group-phase-data.ts`
- `lib/leaderboard-data.ts`
- `lib/scoped-scoring.ts`
- `lib/leaderboard-activity.ts`
- `lib/leaderboard-highlights.ts`
- `app/admin/actions.ts`
- `supabase/schema.sql`
- `tests/group-phase-scoring.test.ts`
- `tests/scoring-engine.test.ts`

## Calculation Inventory

### Group Phase Ladder

`lib/group-phase-scoring.ts` contains the pure ladder scoring rules for Group Phase ranking picks. `lib/group-phase-ladder-recompute.ts` provides the server-safe recompute helper used by app fetchers, cache rebuilds, and audit scripts. `lib/group-phase-data.ts` loads user group rankings, third-place rankings, actual standings, and calls the recompute helper.

Visible leaderboard rows in `lib/leaderboard-data.ts` use `fetchGroupPhaseSummaries(...)` for Group Phase points.

### Legacy Full-Score Group Predictions

`lib/group-scoring.ts` contains the pure full-score group match scorer. `app/admin/actions.ts` uses it while finalizing/scoring individual group matches and persists results into:

- `predictions.points_awarded`
- `prediction_scores`

This path remains for compatibility and auditability, but the visible Group Phase leaderboard currently uses the newer Group Phase ladder summary source.

### Knockout Predictions

`lib/bracket-scoring.ts` contains the pure knockout scorer. `lib/bracket-predictions.ts` enforces server-side knockout lock behavior and persists finalized score rows through `bracket_scores`.

### Canonical Aggregation

`lib/canonical-scoring.ts` composes the current canonical totals:

- Group Phase ladder points
- knockout points
- standard side-pick points
- group-local custom bonus/side-pick points only inside group scope

Every canonical score has a line-item breakdown, and totals are expected to equal the sum of line items.

### Cached Leaderboard State

`lib/scoped-scoring.ts` rebuilds:

- `users.total_points`
- `leaderboard_entries`
- `leaderboard_snapshots`

The rebuild path now uses:

- Group Phase ladder summaries from the canonical recompute path
- `bracket_scores`
- standard `side_pick_scores`
- group-local custom bonus/side-pick totals for group scope only

### Visible Leaderboards

`lib/leaderboard-data.ts` fetches global and group leaderboard rows. Global and group leaderboard display now share deterministic rank helpers from `lib/scoring-engine.ts`.

Tie-breaker:

1. total points descending
2. `user_id` ascending

### Activity And Highlights

`lib/leaderboard-activity.ts` and `lib/leaderboard-highlights.ts` derive visible activity/highlight summaries from persisted leaderboard events, snapshots, scores, and users. Activity messages are still partly stored as final display strings in older event rows; this is a localization cleanup concern, but scoring deltas should continue to come from persisted scoring data.

## Storage And Cache Inventory

- Source picks: `predictions`, `user_group_seed_rankings`, `user_best_third_rankings`, `bracket_predictions`, `projected_bracket_predictions`
- Source results: `matches`
- Score rows: `prediction_scores`, `bracket_scores`, `side_pick_scores`, `group_bonus_scores`
- Cached totals: `users.total_points`, `leaderboard_entries`
- Movement snapshots: `leaderboard_snapshots`
- Activity events: `leaderboard_events`

## Revalidation/Refresh Points

Known recalculation triggers run through admin result flows in `app/admin/actions.ts` and score final knockout matches through `lib/bracket-predictions.ts`.

When these data change, affected leaderboard state should be recalculated or invalidated:

- match result/status
- actual group standings derived from final group match results
- user group seed rankings
- user best-third rankings
- user pick
- bracket score
- side-pick score
- group membership
- group-local ruleset/bonus score

## Known Risks

- Some legacy activity event messages are stored as already-rendered English strings. This does not change scores, but it is not ideal for multilingual UI.
- The legacy full-score group prediction path still exists beside the newer Group Phase ladder path. It is compatibility/audit-only for current visible totals.
- The audit script now recomputes canonical totals from source data before comparing `users.total_points` and `leaderboard_entries`. It still repairs legacy score rows for auditability.
- The FIFA 2026 Round of 32 third-place permutation issue was fixed in `lib/fifa-2026-knockout-seeding.ts`; if that code is changed, knockout scoring/visualization must continue to share the same canonical seeding builder.

## Database Constraints Confirmed

- `predictions`: unique `(user_id, match_id)`
- `prediction_scores`: primary key `(prediction_id, match_id)`
- `bracket_predictions`: unique `(user_id, match_id)`
- `projected_bracket_predictions`: unique `(user_id, match_id)`
- `bracket_scores`: unique `(user_id, match_id)`
- `group_members`: unique `(group_id, user_id)`

These constraints protect the most likely double-counting paths.
