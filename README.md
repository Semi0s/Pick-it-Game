# PICK-IT!

A mobile-first private prediction game for family and friends, built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## What It Is

PICK-IT lets players:

- predict match scores
- compete inside one or more private groups
- follow global and group leaderboards
- track score movement, highlights, and social activity

The app currently includes:

- invite-based onboarding
- player, manager, and super admin roles
- group creation and management
- group-stage match predictions
- scoring breakdowns
- global and group leaderboards
- activity feed, reactions, comments, and notifications
- optional avatars

## Player Guide

### Get Started

- Check your email for an invite
- Open the invite link and finish signing up
- Log in and start playing

Tip: always use the invite link. That is what connects the account to the right group automatically.

### Make Your Picks

- Go to `Play`
- Predict the score for each match
- Picks stay open only while the match is scheduled
- Once a match starts, predictions lock

### How Scoring Works

- Correct winner or draw: `+3`
- Exact score: `+8 total`
- Same goal difference without exact score: `+1 bonus`

### My Groups

- A player can belong to multiple groups
- Each group has its own leaderboard
- Managers can invite players and manage their groups
- Super admins can manage all groups

### Leaderboard

- `Global` shows the overall standings
- Group views show standings within a selected group
- Depending on feature toggles, players may also see:
  - rank movement
  - points delta
  - `Perfect Pick`
  - `Daily Winner`
  - recent activity

### Profile

- Users can manage their profile details
- Avatar upload is optional
- Notifications and push notifications are opt-in

### Troubleshooting

- If an invite did not complete correctly, open the invite link again
- If a user is still stuck, ask a group admin or super admin for a fresh invite

## Roles

### Player

- joins groups
- makes predictions
- views standings and results

### Manager

- creates and manages assigned groups
- invites players into those groups
- edits group capacity within assigned limits

### Super Admin

- manages players, managers, invites, groups, and matches
- can adjust manager limits
- can manage leaderboard feature toggles

## Main App Areas

- `Play`: score picks and match cards
- `My Groups`: groups, members, invites, and group management
- `Leaderboard`: global and group standings
- `Profile`: account details, avatar, and notification preferences
- `Admin`: player, manager, group, and match controls for super admins

## Local Development

### Requirements

- Node.js 18+
- npm
- a Supabase project

### Start the App

```bash
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=mailto:you@example.com
```

## Supabase Setup

This app depends on:

- Supabase Auth
- Postgres tables in `public`
- Supabase Storage
- optional web push VAPID configuration

### Storage

The app expects a public `avatars` bucket for profile images.

### Migrations

Apply the migrations in [`supabase/migrations`](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations). Recent app features depend on these in particular:

- [20260424_profile_setup_and_invite_repair.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260424_profile_setup_and_invite_repair.sql)
- [20260425_avatar_storage.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260425_avatar_storage.sql)
- [20260425_leaderboard_feature_settings.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260425_leaderboard_feature_settings.sql)
- [20260425_leaderboard_event_reactions.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260425_leaderboard_event_reactions.sql)
- [20260425_leaderboard_event_comments.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260425_leaderboard_event_comments.sql)
- [20260425_user_notifications.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260425_user_notifications.sql)
- [20260425_push_tokens.sql](/Users/semios/Documents/Codex/2026-04-19-build-a-mobile-first-private-web/supabase/migrations/20260425_push_tokens.sql)

If those are missing in a live environment, some newer UI features will safely stay off or degrade to simpler behavior.

## Notifications

### In-App Notifications

Users can opt in from Profile. The app keeps notification volume intentionally low.

Current high-value notification types:

- `Perfect Pick`
- `Daily Winner`
- big upward rank movement
- new comment on a user activity item

### Web Push Notifications

Web push is supported behind the existing notification system.

Required:

- valid VAPID public/private keys
- browser permission granted from Profile
- registered push token in the backend

Native iOS and Android push remain abstracted for later.

## Feature Toggles

Super admins can control leaderboard extras from the admin area without redeploying.

Current app settings include:

- `daily_winner_enabled`
- `perfect_pick_enabled`
- `leaderboard_activity_enabled`

All default to `false` until enabled.

## Useful Commands

```bash
npm run dev
npm run lint
npm run build
npm run typecheck
```

If route or generated Next types are stale, regenerate them with:

```bash
npx next typegen
```

## Notes

- Predictions are global to the user, while leaderboard competition can be viewed globally or by group
- Reopening a finalized match clears the match-scoped scoring and activity data, then resyncs leaderboard highlights
- Avatars, reactions, comments, notifications, and push are optional enhancements and should never block core gameplay
