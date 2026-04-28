# Phase 10 Cleanup Brief

Date: April 28, 2026

## Goal

Reduce structural fragility in the scoring, leaderboard, and profile-loading systems before expanding further features.

This phase is focused on:

- reducing duplicate sources of truth
- making failures easier to diagnose
- shrinking oversized code paths
- improving schema fidelity

It is not intended as a feature phase.

## Priority Refactors

### 1. Refactor the scoring pipeline

Primary area:

- `app/admin/actions.ts`

Problem:

- `scoreFinalizedGroupMatch()` currently handles too many responsibilities in one flow.

Current responsibilities include:

- score predictions
- update `predictions.points_awarded`
- upsert `prediction_scores`
- recalculate leaderboard totals
- rebuild snapshots
- rebuild global/group events
- award trophies
- trigger notifications

Recommended direction:

- split into explicit phases/functions:
  - `scoreMatchPredictions(...)`
  - `persistPredictionScores(...)`
  - `recalculateLeaderboardState(...)`
  - `rebuildLeaderboardSnapshots(...)`
  - `rebuildLeaderboardEvents(...)`
  - `awardPostScoreTrophies(...)`

Expected payoff:

- easier reasoning
- easier testing
- cleaner failure boundaries

Risk:

- medium

### 2. Establish a single score source of truth

Primary area:

- `predictions.points_awarded`
- `prediction_scores`

Problem:

- both represent scored state
- current totals are recomputed from `predictions.points_awarded`
- scoring breakdowns live in `prediction_scores`
- mismatches can silently propagate into leaderboard totals

Recommended direction:

- make `prediction_scores` the canonical scored record
- derive leaderboard totals from `prediction_scores`
- keep `predictions.points_awarded` only as a cache/display field if still needed

Expected payoff:

- much stronger scoring integrity
- easier auditing
- fewer drift scenarios

Risk:

- medium-high

### 3. Restore schema fidelity

Primary area:

- `supabase/schema.sql`

Problem:

- the checked-in schema snapshot is missing critical leaderboard-related tables such as:
  - `prediction_scores`
  - `leaderboard_snapshots`
  - `leaderboard_events`

Recommended direction:

- bring `schema.sql` back in sync with the full live/migrated database structure
- ensure new migrations keep the snapshot accurate

Expected payoff:

- faster debugging
- safer reconstruction
- more trustworthy audits

Risk:

- low

### 4. Consolidate leaderboard event generation

Primary area:

- `app/admin/actions.ts`

Problem:

- global and group event recreation duplicate a lot of logic
- score-derived messages and metadata are built twice in similar ways

Recommended direction:

- create one scoped event builder that can operate for:
  - global
  - group

Expected payoff:

- less duplicated logic
- easier event evolution
- lower chance of global/group drift

Risk:

- medium

### 5. Centralize profile query fallback handling

Primary areas:

- `lib/auth-client.ts`
- `app/my-groups/actions.ts`
- other `public.users` readers

Problem:

- missing-column fallback logic is beginning to spread
- profile-loading failures can be hard to distinguish from true anonymous/player state

Recommended direction:

- create a shared helper for core `public.users` reads
- support optional-column downgrade behavior for fields like:
  - `preferred_language`
  - future additive profile columns
- keep hard failure behavior for truly core fields

Expected payoff:

- more consistent behavior
- easier diagnostics
- fewer silent regressions

Risk:

- low-medium

## Suggested Order

1. restore `schema.sql` fidelity
2. split the scoring pipeline into smaller phases
3. move leaderboard total derivation toward `prediction_scores`
4. consolidate global/group event generation
5. centralize profile query fallback handling

## Non-Goals

This cleanup phase should not:

- change scoring rules
- change prediction locking
- redesign leaderboard UI
- remove social features
- introduce a heavy i18n or auth rewrite

## Success Criteria

Phase 10 is successful if:

- scoring code is easier to follow and test
- leaderboard totals have one authoritative origin
- schema documentation matches reality
- leaderboard event generation has less duplication
- profile-loading failures are explicit and diagnosable

