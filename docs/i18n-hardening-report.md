# I18n hardening report

## Source of truth

Player-facing UI language is resolved through `resolveAppLanguage` and provided by `AppLanguageProvider`.

Precedence:

1. Optimistic language selected in the current session.
2. Authenticated user `preferredLanguage`.
3. Persisted app language storage.
4. Browser language.
5. English fallback.

Supported app languages are `en`, `es`, `fr`, `pt`, and `de`. Portuguese is global `pt`.

## Storage

Canonical client storage:

- `pickit:app-language`
- `pickit_app_language` cookie

Legacy bridge:

- `pickit:play-explainer-language`

The provider writes both canonical and legacy keys for compatibility, but feature components should consume `useAppLanguage()` instead of reading storage directly.

## Components migrated in this pass

- `components/AppShell.tsx`
- `components/DashboardOverview.tsx`
- `components/GroupPredictions.tsx`
- `components/GroupPageClient.tsx`
- `components/BracketBuilderClient.tsx`
- `components/KnockoutBracketBuilder.tsx`
- `components/AppUpdatesCard.tsx`
- `components/NotificationsBell.tsx`
- `components/LeaderboardClient.tsx`
- `components/MyGroupsClient.tsx`

## Validation added

- `tests/i18n-coverage.test.ts` checks every language catalog has the same keys as English.
- The same test checks plural leaf shape compatibility.
- The same test checks template variable compatibility.
- `t()` now warns in development when a selected language falls back to English for a missing key.

## Remaining risks

- Some server-rendered route shells still resolve language from user profile before client hydration. Client components now converge on the provider, but future server copy should read the same cookie/user-preference path.
- Super Admin tools intentionally remain English-only.
- Transactional email and backend logs are out of scope for player-facing in-app UI.

## Manual QA checklist

- Switch each language from the header and confirm the current page updates without reload.
- Check dashboard, bracket, knockout, My Groups, leaderboard, updates, profile, help, onboarding, and legal.
- Confirm nav/dock labels, top cards, buttons, chips, mini tables, placeholders, and aria labels follow one language.
- Confirm visual themes such as Oranjekoorts, Brazil, Colombia, Japan, and default green do not change language.
- Confirm warning yellow remains semantic and not localized visually.

## Verification

- `npm run test`
- `npm run typecheck`
- `npm run lint`
