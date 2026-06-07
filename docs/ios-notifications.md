# iOS Notification Foundation

This v1 foundation wires PICK-IT's existing onboarding notification opt-in to native Capacitor push registration for the iOS app.

## Implemented

- Bundle ID: `com.semios.pickit`.
- Capacitor plugin: `@capacitor/push-notifications`.
- iOS AppDelegate forwards APNs registration success/failure events to Capacitor.
- iOS entitlements include `aps-environment` via build settings:
  - Debug: `development`
  - Release: `production`
- The onboarding notification opt-in saves app notification preferences first, then requests/registers native iOS push.
- Web/PWA falls back to the existing web push path.
- Android includes the generated Capacitor plugin dependency, but app code defers Android registration until Firebase/FCM is configured.
- Device tokens are stored in `public.push_tokens` with platform, token, permission state, `created_at`, `updated_at`, and `last_seen_at`.
- User preferences are stored in `public.user_settings` for:
  - picks lock reminders
  - match finalized / score updated
  - leaderboard updates
  - group activity

## Apple Developer Requirements

- Enable Push Notifications on the Apple Developer App ID for `com.semios.pickit`.
- Regenerate or refresh provisioning profiles after enabling Push Notifications.
- Confirm the Release/TestFlight provisioning profile includes the production APNs entitlement.
- Test token registration on a real iOS device before relying on delivery. Simulator builds can compile, but APNs delivery testing should be done on device.

## Delivery Provider

Actual native push delivery is not fully configured yet. Pick one provider before public launch:

- APNs direct from a server-side function.
- FCM for iOS and Android.
- Supabase Edge Function or another server-side job that owns APNs/FCM credentials.

Do not expose APNs keys, FCM server keys, or provider secrets to client code.

## Remaining Before Public Push

- Choose and configure the native push send provider.
- Store provider credentials server-side only.
- Add a delivery job/function that reads eligible `push_tokens` and respects `user_settings`.
- Add Android Firebase/FCM configuration if Android push is included in v1.
- Run end-to-end delivery tests on a real iOS device.
