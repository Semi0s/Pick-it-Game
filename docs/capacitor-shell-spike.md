# Capacitor Shell Spike

## Decision

Use Capacitor as a thin native shell for iOS and Android. Keep the existing Next/Supabase app as the source of truth. Do not start a React Native rewrite.

The current spike uses the hosted app URL:

```text
https://pick-it-game2026.vercel.app
```

Override for preview/dev shells with:

```bash
CAPACITOR_SERVER_URL=https://your-preview-url.example npm run cap:sync
```

## What Was Added

- Capacitor 8 iOS and Android projects.
- Native shell config in `capacitor.config.ts`.
- Minimal fallback web asset in `native-shell/www`.
- Native bridge in `components/CapacitorShellBridge.tsx` for:
  - `appUrlOpen` deep-link routing.
  - Android back-button handling.
  - native keyboard open/close body classes.
  - external HTTP(S) links opened through Capacitor Browser.
- Custom URL scheme:
  - `pickit://...`
- Android HTTPS app-link intent for:
  - `https://pick-it-game2026.vercel.app/...`

Notifications are intentionally not wired in this spike.

## Verified

### Web

```bash
npm run typecheck
npm run build
```

Both pass.

### iOS

Verified with XcodeBuildMCP:

- project: `ios/App/App.xcodeproj`
- scheme: `App`
- simulator: `iPhone 17`
- bundle id: `com.semios.pickit`

Results:

- iOS simulator build succeeded.
- iOS simulator launch succeeded.
- The shell loaded the live PICK-IT sign-in screen.
- `pickit://invite/FAM2026` is recognized by iOS and shows the expected "Open in PICK-IT!" handoff prompt.

### Android

Verified with Gradle:

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
export ANDROID_HOME=/Users/semios/Library/Android/sdk
export ANDROID_SDK_ROOT=/Users/semios/Library/Android/sdk
cd android
./gradlew assembleDebug
```

Results:

- Android debug build succeeded.
- Debug APK generated at `android/app/build/outputs/apk/debug/app-debug.apk`.
- Gradle auto-installed the required Android SDK Platform 36 and Build-Tools 35 during the build.

Java:

```text
21.0.11 (arm64) "Eclipse Adoptium" - "OpenJDK 21.0.11" /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
```

The earlier copied JDK at `/Users/semios/Documents/Codex/jdk-26.0.1` was not usable because it was a Linux ARM64 JDK, not a macOS ARM64 JDK.

SDK:

```text
/Users/semios/Library/Android/sdk
```

The project-local SDK pointer is set in ignored file `android/local.properties`:

```text
sdk.dir=/Users/semios/Library/Android/sdk
```

For a persistent Terminal setup, add this to the active shell profile:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

## Deep Links

Implemented:

- iOS custom scheme in `ios/App/App/Info.plist`.
- Android custom scheme and HTTPS host intent filters in `android/app/src/main/AndroidManifest.xml`.
- Runtime routing in `CapacitorShellBridge`.

Examples:

```text
pickit://invite/FAM2026
pickit://my-groups?invite=FAM2026
https://pick-it-game2026.vercel.app/invite/FAM2026
```

Remaining for store-grade universal/app links:

- iOS Associated Domains entitlement.
- `apple-app-site-association` hosted on the production domain.
- Android `assetlinks.json` hosted on the production domain.
- Final Apple Team ID and Android signing certificate fingerprints.

## Store Blockers / Checklist

- App icons and splash screens still use generated/default native assets.
- Store display name, SKU/package metadata, screenshots, subtitle, descriptions, and keywords need final copy.
- iOS Associated Domains are not configured yet.
- Android App Links need production `assetlinks.json`.
- Account deletion exists at the API level and profile flow should be verified end-to-end inside the native shell before submission.
- Privacy policy / data safety labels need final review for auth, user content, push tokens, analytics if added, and Supabase data processing.
- External-link handling is implemented through Capacitor Browser but needs QA across Contact Us, legal documents, reset flows, and organizer links.
- Safe-area support already exists in app CSS, but native-shell QA is still required on notched iPhones, compact landscape, Android gesture navigation, and tablets.
- Keyboard behavior is configured with Capacitor Keyboard resize mode and body classes, but login/signup/profile fields need device QA.
- Android back button is implemented, but needs device QA across modal/sheet-heavy surfaces.
- Push notification permission is intentionally not requested. If push is committed for v1, add native push plugins and a separate permission/onboarding design.
- Dependency audit currently reports advisories in Next/PostCSS/ws/brace-expansion. Review and upgrade before store submission.

## Static Bundled Assets Recommendation

Bundled static assets are **not viable for the current Next app as the primary app-store build**.

Reason:

- `npm run build` shows most product routes are dynamic/server-rendered.
- The app depends on Supabase auth/session behavior, server actions, API routes, middleware, and dynamic pages.
- A static Capacitor bundle would lose important live app behavior unless we re-architect those flows into purely client-side API calls or ship a separate static shell.

Recommendation:

- Use Capacitor as a hosted-app shell for the beta/app-store spike.
- Keep `native-shell/www` only as a fallback asset.
- Revisit static bundling later only if we intentionally create a native/static client architecture.

## Commands

```bash
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
npm run cap:run:ios
npm run cap:run:android
```

For iOS simulator debugging, XcodeBuildMCP was used successfully.
