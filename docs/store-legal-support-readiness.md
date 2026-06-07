# Store Legal And Support Readiness

Last reviewed: June 7, 2026

## Public Routes

- Privacy Policy: `/privacy`
- Terms / EULA: `/terms`
- Support: `/support`
- Account deletion help: `/support#account-deletion`

## Recommended Production Environment Values

```bash
NEXT_PUBLIC_PRIVACY_POLICY_URL=https://pick-it-game2026.vercel.app/privacy
NEXT_PUBLIC_SUPPORT_EMAIL=pickit@semiosdesign.com
```

## Store Metadata Alignment

- App Privacy / Data Safety should include account info such as email and profile details.
- App Privacy / Data Safety should include user content such as avatars, display names, group names, predictions, picks, comments, and reactions when enabled.
- App Privacy / Data Safety should include identifiers or device-token metadata when native push notification registration is enabled.
- App Privacy / Data Safety should include diagnostics, security logs, operational logs, IP address, user agent, and timestamps when used for security, legal acceptance, support, abuse prevention, or app operations.
- Notification preferences and push permission state should be disclosed if collected.
- Do not mark gambling, wagering, paid pool, or cash-prize behavior unless a separate promotion actually enables it.

## Internal Testing Notes

- Terms acceptance/versioning and forced re-acceptance are handled by the existing `legal_documents` and `user_legal_acceptances` flow.
- Account deletion is available from Profile and is blocked while a user owns or manages active groups or organizations.
- Free-form leaderboard comments remain disabled by default through `leaderboard_comments_enabled`.
- Push notification opt-in is optional and uses the existing onboarding moment.

## Public Submission Follow-Ups

- Replace draft legal copy with final reviewed policy text before public App Store / Google Play submission.
- Keep store privacy forms aligned with the actual database fields, notification behavior, social features, and diagnostics in production.
- If free-form comments are enabled publicly, add or verify report/block/moderation workflows before public submission.
