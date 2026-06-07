# TestFlight Readiness Notes

## Mixed Pre-TestFlight Hardening Commit

A recent pushed commit intentionally remains mixed because it had already been pushed before cleanup. It contains three related pre-TestFlight hardening items:

- Native push notification foundation.
- Public legal and support pages.
- Image upload validation and media moderation hardening.

Keep follow-up work explicit before relying on the branch for TestFlight or Google Play internal testing:

- Apply the Supabase migrations for native push registration and the media moderation audit log.
- Set production environment variables:
  - `NEXT_PUBLIC_PRIVACY_POLICY_URL=https://pick-it-game2026.vercel.app/privacy`
  - `NEXT_PUBLIC_SUPPORT_EMAIL=pickit@semiosdesign.com`
- Enable Apple Push Notifications for App ID `com.semios.pickit`.
- Refresh iOS provisioning profiles after enabling Push Notifications.
- Test APNs token registration on a real iOS device.
- Keep `leaderboard_comments_enabled` false until report/block/moderation exists.
- Manually QA `/privacy`, `/terms`, `/support`, `/admin/media`, image uploads, iOS simulator, and Android emulator.
