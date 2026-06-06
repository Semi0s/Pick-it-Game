# Scoring Baselines

This file records aggregate scoring and match-state baselines that can be used later for operations review and end-of-tournament player synopsis work.

Raw audit reports can include user IDs. Do not commit raw mismatch reports unless they have been sanitized.

## 2026-06-06 Pre-Tournament Baseline

Baseline purpose:

- Establish the clean measurement starting point before tournament scoring begins.
- Confirm current match records are safe as the source for future scoring changes.
- Confirm cached leaderboard state matches canonical recomputation.

Baseline timestamp:

- `2026-06-06T17:53:34Z`

Validation commands:

```bash
npm run scoring:audit -- --report=/private/tmp/pick-it-scoring-baseline-audit.json
npm run scoring:audit -- --apply-leaderboard-cache --report=/private/tmp/pick-it-scoring-baseline-repair.json
npm run scoring:audit -- --report=/private/tmp/pick-it-scoring-baseline-postrepair-audit.json
```

Initial dry-run audit:

- Generated at `2026-06-06T17:51:49.559Z`
- Users checked: `64`
- Groups checked: `14`
- Matches checked: `103`
- Group predictions checked: `142`
- Knockout predictions checked: `13`
- Duplicate group predictions: `0`
- Duplicate knockout predictions: `0`
- Missing matches: `0`
- Mismatches: `38`
- Cause: derived `leaderboard_entries.total_points` and `leaderboard_entries.rank` fields were `null` for zero-score users.
- No prediction, match, or scoring-rule mismatch was reported.

Safe cache repair:

- Generated at `2026-06-06T17:52:26.672Z`
- Mode: `--apply-leaderboard-cache`
- Applied repairs: `38`
- Scope: updated derived leaderboard cache fields only.
- Did not change predictions, match results, scoring rules, group picks, knockout picks, or user-submitted data.

Post-repair dry-run audit:

- Generated at `2026-06-06T17:52:52.825Z`
- Users checked: `64`
- Groups checked: `14`
- Matches checked: `103`
- Group predictions checked: `142`
- Knockout predictions checked: `13`
- Mismatches: `0`
- Duplicate group predictions: `0`
- Duplicate knockout predictions: `0`
- Missing matches: `0`
- Canonical total mismatches: `0`
- Warnings: `[]`

Read-only match operations validation:

- Generated at `2026-06-06T17:53:34.249Z`
- Matches checked: `103`
- Automatic OK: `103`
- Needs review: `0`
- Manual override: `0`
- Conflict: `0`
- Finalized: `0`
- Flagged match records: `0`

Baseline conclusion:

- Current scoring and match records are valid as a clean pre-tournament baseline.
- The baseline state has zero finalized matches, zero match-operation conflicts, and zero canonical scoring mismatches.
- Future scoring measurements should compare against this state when building audit summaries or end-of-tournament player-facing recaps.

Temporary raw report locations from the validation run:

- `/private/tmp/pick-it-scoring-baseline-audit.json`
- `/private/tmp/pick-it-scoring-baseline-repair.json`
- `/private/tmp/pick-it-scoring-baseline-postrepair-audit.json`

Those paths are temporary and should not be treated as durable storage.
