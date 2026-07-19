import { describe, expect, it } from "vitest";
import {
  isOnboardingComplete,
  onboardingRequiredChecks,
} from "../src/onboarding-contract.js";

describe("first-run completion", () => {
  it("completes at the first scored repository without requiring an action", () => {
    const checks = Object.fromEntries(
      onboardingRequiredChecks.map((check) => [check, true]),
    );
    expect(isOnboardingComplete({ ...checks, publishedAction: false })).toBe(
      true,
    );
  });

  it("stays open when an activation requirement is missing", () => {
    const checks = Object.fromEntries(
      onboardingRequiredChecks.map((check) => [check, true]),
    );
    expect(isOnboardingComplete({ ...checks, firstService: false })).toBe(
      false,
    );
  });
});
