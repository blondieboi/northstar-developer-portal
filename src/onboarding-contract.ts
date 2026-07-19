export const onboardingRequiredChecks = [
  "database",
  "githubApp",
  "oauth",
  "webhookSecret",
  "configRepository",
  "configRevision",
  "administrator",
  "installation",
  "firstSync",
  "firstService",
  "scorecard",
] as const;

export type OnboardingRequiredCheck =
  (typeof onboardingRequiredChecks)[number];

export function isOnboardingComplete(checks: Record<string, boolean>) {
  return onboardingRequiredChecks.every((check) => checks[check]);
}
