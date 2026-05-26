# Player-Facing i18n Sweep

## Scope
- Comprehensive player-facing multilingual cleanup for `en`, `es`, `fr`, `pt`, `de`
- Portuguese remains global `pt`
- Visual/home-team/country themes were left unchanged
- Super Admin tooling remains intentionally out of scope for now

## Files Changed
- `lib/strings.ts`
- `app/start-playing/page.tsx`
- `components/StartPlayingChoiceClient.tsx`
- `components/DashboardOverview.tsx`
- `components/dashboard/DashboardCommandCenter.tsx`
- `components/dashboard/DashboardNoGroupsPanel.tsx`
- `components/AppUpdatesCard.tsx`
- `components/player-management/Shared.tsx`
- `components/GroupPredictionCard.tsx`
- `components/GroupPredictions.tsx`
- `components/SocialPredictionList.tsx`
- `components/BracketBuilderClient.tsx`
- `components/KnockoutGroupComparison.tsx`
- `components/MyGroupsClient.tsx`
- `components/ProfileSummary.tsx`
- `components/NotificationsBell.tsx`
- `components/ResetPasswordForm.tsx`
- `app/bracket-builder/page.tsx`
- `app/reset-password/page.tsx`

## Namespaces Extended
- `common`
- `dashboard`
- `bracket`
- `groups`
- `updates`
- `profile`
- `auth`
- `knockout`
- `notifications`
- `onboarding`

## Player-Facing Areas Swept
- Dashboard hero-adjacent command center labels, chips, reminder states, and no-groups panel
- Dashboard global challenge card, standings labels, trophies card, and how-to-play disclosure labels
- Updates card player-facing labels and navigation labels
- Onboarding intro card, step titles/body copy, CTA buttons, step progress, and carousel ARIA labels
- Group-stage prediction card labels, save states, status pills, live/final messaging, and score-stepper ARIA labels
- Group-stage prediction list empty state and Auto Pick language coverage
- Easy group-stage bracket builder completion, lock, deadline, status, CTA, date, and ARIA labels
- Social/group picks disclosure labels, pick-count plurals, and empty state
- Knockout group-comparison labels, champion/finalist summaries, health badges, and detail drawer labels
- Profile/account top card, followed teams, notifications, password, trophies, knockout summary, and legal status copy
- Reset-password page/form labels, placeholders, validation messages, and recovery notices
- Notifications bell title, ARIA labels, unread-count plural, loading/empty states, and mark-read label
- My Groups intro/header copy and invite entry form labels

## Examples of Hardcoded Strings Removed
- `Global Challenge`
- `Group Strategy + Knockout Picks`
- `Tournament Standings`
- `How To Play`
- `Pick team(s) to follow`
- `No upcoming match`
- `WELCOME TO PIK•IT!`
- `Predict the 2026 World Cup winner.`
- `Back`, `Next`, `Start`, `Home` in onboarding
- `Pick before:`
- `Auto Pick`
- `Pick locked`
- `Editable until kickoff`
- `Your bracket is complete.`
- `Group Picks`
- `No one else has picked this match yet.`
- `Loading profile...`
- `Notifications On`
- `Password Reset`
- `Round-by-round picks`

## Templates / Plurals Added or Reused
- `groups.joinedManagedSummary`
- `updates.itemCount`
- `onboarding.stepLabel`
- `onboarding.stepAria`
- `bracket.saveMatch`
- `common.pickCount`
- `common.matchCount`
- `notifications.unreadCount`
- `knockout.championPickCount`
- `knockout.playersPickedChampion`
- `knockout.meaningfulMatchesShown`

## Formatter / Locale Notes
- Existing locale-aware format helpers remain the base formatting layer
- This pass avoided coupling language to visual theme selection
- Warning styling remains universal and unchanged

## Remaining Follow-Up Areas
- Some deeper My Groups flows still contain player-facing English beyond the intro/invite entry layer
- Some dashboard/admin-only copy remains English by design
- Some server/action messages still return English strings directly and should be converted to message keys in a follow-up server-message pass
- Some deeper leaderboard and My Groups management flows still contain player-facing English; Super Admin/manager-heavy controls remain lower priority unless exposed to regular players
- Help/onboarding content files already exist; this pass focused on the currently visible onboarding UI wiring

## Confirmations
- Portuguese remains global `pt`
- Visual/home-team themes were not changed
- Super Admin remains out of scope
