export const REQUIRED_LAUNCH_ONBOARDING_VERSION = 1;

export function shouldRequireLaunchOnboarding(
  seenVersion: number | null | undefined,
  requiredVersion = REQUIRED_LAUNCH_ONBOARDING_VERSION
) {
  return (seenVersion ?? 0) < requiredVersion;
}
