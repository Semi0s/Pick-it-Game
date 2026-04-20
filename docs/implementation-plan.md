# Phased Implementation Plan

## Phase 1: Foundation and Group Predictions

Status: in progress

- Scaffold a Next.js, TypeScript, Tailwind CSS app.
- Add Supabase client/server helpers and environment placeholders.
- Define the database schema for invites, users, teams, matches, predictions, bracket picks, side picks, and leaderboard entries.
- Seed realistic mock invites, teams, and group-stage matches.
- Build invite-only prototype auth with demo profiles.
- Build the dashboard and mobile-first group-stage prediction UI.
- Store Phase 1 predictions locally until Supabase data wiring is added.
- Enforce kickoff locking in the prediction UI.

## Phase 2: Results, Scoring, and Leaderboard

- Add admin result entry for group-stage matches.
- Implement group-stage scoring: correct outcome and exact-score bonus.
- Recalculate totals after results are entered.
- Build the leaderboard screen.
- Replace local prediction reads/writes with Supabase queries where appropriate.

## Phase 3: Knockout Bracket

- Add Round of 32, Round of 16, Quarterfinals, Semifinals, and Final match data.
- Build the knockout bracket prediction view.
- Visually advance winners through the bracket.
- Add knockout scoring values and exact-score bonus.

## Phase 4: Side Picks and Profile Polish

- Add tournament winner, Golden Boot, and MVP side picks.
- Add editable display names and avatar handling.
- Harden admin route protection.
- Add basic account and invite-management affordances.

## Phase 5: Production Readiness

- Complete Supabase integration and RLS verification.
- Add loading, empty, and error states across all screens.
- Test mobile layouts and prediction locking.
- Prepare deployment setup and environment documentation.
