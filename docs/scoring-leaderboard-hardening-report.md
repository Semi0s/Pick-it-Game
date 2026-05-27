# Scoring And Leaderboard Hardening Report

## Summary

This pass added a small canonical scoring/ranking facade, aligned cached leaderboard rebuilds with the visible Group Phase leaderboard source, added golden scoring tests, and added a dry-run/apply audit script that recomputes canonical totals from source data.

No point values, visual themes, warning colors, or localization behavior were changed.

## Source Of Truth

Canonical pure helpers now live in `lib/scoring-engine.ts` and `lib/canonical-scoring.ts`.

They wrap the existing scoring formulas instead of replacing them:

- `calculateGroupMatchScoreLineItem(...)`
- `calculateGroupPhaseScoreBreakdown(...)`
- `calculateKnockoutMatchScoreLineItem(...)`
- `calculateUserScoreBreakdown(...)`
- `assertScoreBreakdownInvariant(...)`
- `assignDeterministicRanks(...)`
- `compareLeaderboardEntries(...)`
- `isMatchLockedAt(...)`

`lib/canonical-scoring.ts` composes user totals from:

- `group_phase_ladder`
- `knockout`
- `side_pick`
- `group_bonus` only for group-local scope

The underlying point rules remain in:

- `lib/group-phase-scoring.ts`
- `lib/group-scoring.ts`
- `lib/bracket-scoring.ts`

The server-safe Group Phase ladder recompute helper lives in:

- `lib/group-phase-ladder-recompute.ts`

## Behavior Hardened

- Global and group leaderboard displays now use the same deterministic rank helper.
- Cached leaderboard rebuilds now rank through the same deterministic rank helper and canonical total aggregator.
- `users.total_points`, `leaderboard_entries`, and leaderboard snapshots now rebuild from visible Group Phase ladder points instead of legacy full-score group prediction rows.
- Knockout match lock checks now use a pure helper that is tested at the one-second boundary.
- `leaderboard_entries` rank ordering is now stable and documented.

## Audit/Recompute Command

New command:

```bash
npm run scoring:audit
```

Default mode is dry-run. It reports:

- users checked
- groups checked
- matches checked
- group predictions checked
- knockout predictions checked
- duplicate group prediction keys
- duplicate knockout prediction keys
- missing match references
- persisted score mismatches
- `users.total_points` mismatches against canonical recomputed totals
- `leaderboard_entries` total/rank mismatches against canonical recomputed totals

Optional apply mode:

```bash
npm run scoring:audit -- --apply
```

Apply mode repairs:

- `predictions.points_awarded`
- `prediction_scores`
- `bracket_scores`
- `users.total_points`
- `leaderboard_entries`

Important: apply mode uses canonical Group Phase ladder points, recomputed knockout points, and standard side-pick totals for standard/global totals. Legacy full-score group rows are repaired only for compatibility/auditability.

Optional report file:

```bash
npm run scoring:audit -- --report=tmp/scoring-audit-report.json
```

## Tests Added

`tests/scoring-engine.test.ts` adds golden tests for:

- exact full-score group match points
- goal-difference full-score group match points
- wrong group match picks
- non-final group matches scoring 0
- knockout final exact score
- Round of 32 exact score
- scheduled knockout matches scoring 0
- score breakdown sum invariant
- canonical Group Phase ladder totals do not include legacy full-score rows
- group-custom points apply only inside group scope
- canonical score breakdown sum invariant
- deterministic tie ranks
- group leaderboard member filtering
- lock-time boundary behavior one second before, exactly at, and one second after kickoff

Existing Group Phase ladder tests remain in `tests/group-phase-scoring.test.ts`.

## Cache And Concurrency Notes

Current database constraints prevent duplicate pick rows and duplicate score rows for the key scoring paths. Upserts use those constraints for idempotent score persistence.

Concurrent score recalculation still depends on the current Supabase/Postgres write ordering and upsert constraints. There is no broad locking refactor in this pass. The safest launch operation is to rerun the audit in dry-run after any batch result correction and use the app rebuild path after large repairs.

## Remaining Risks

- Activity/event messages can still contain historical final English strings. This is a localization debt, not a score-calculation dependency.
- Result statuses are limited to `scheduled`, `locked`, `live`, and `final`. If postponed/cancelled statuses are added, scoring rules must be extended explicitly.
- There is no automated browser smoke test asserting dashboard/profile totals against leaderboard totals yet.
- The audit command can only derive Group Phase ladder scores once group standings are fully actual/scorable; before then canonical Group Phase points are 0 by design.
- FIFA 2026 third-place seeding is now implemented in `lib/fifa-2026-knockout-seeding.ts`, but it remains a launch-critical dependency: visualization and scoring must continue to share that canonical builder.

## Manual QA Checklist

- Submit Group Phase picks.
- Verify scores before final results remain 0/pending.
- Enter or update final Group Phase results.
- Verify Global leaderboard totals.
- Verify group leaderboard membership and totals.
- Verify dashboard score card.
- Verify activity/highlight copy after score changes.
- Verify tied users share a rank and next rank skips.
- Verify late knockout pick is blocked at kickoff.
- Verify knockout scoring after a final result.
- Verify result correction recalculates persisted score rows.
- Verify mobile leaderboard renders same score values.
- Switch language and confirm scores/ranks do not change.
- Switch visual/home-team theme and confirm scores/ranks do not change.

## Verification Commands

Run during this pass:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Additional commands to run before launch:

```bash
npm run scoring:audit -- --report=tmp/scoring-audit-report.json
```
