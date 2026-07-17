import { describe, expect, it } from "vitest";
import { experimentStatus, riskProfile } from "./governance";

describe("catalog governance", () => {
  it("derives critical risk from public restricted applications", () => {
    expect(
      riskProfile({
        spec: {
          lifecycle: "production",
          risk: {
            exposure: "public",
            dataSensitivity: "restricted",
            authentication: "required",
          },
        },
      }),
    ).toMatchObject({ level: "critical", complete: true });
  });

  it("keeps incomplete risk evidence explicitly unclassified", () => {
    expect(riskProfile({ spec: { risk: { exposure: "internal" } } })).toMatchObject({
      level: "unclassified",
      complete: false,
      missing: ["data sensitivity", "authentication"],
    });
  });

  it("classifies experiment clocks deterministically", () => {
    const now = new Date("2026-07-17T12:00:00Z");
    expect(experimentStatus({ spec: { lifecycle: "experimental" } }, now).status).toBe("missing");
    expect(experimentStatus({ spec: { lifecycle: "experimental", experiment: { expiresAt: "2026-07-20" } } }, now).status).toBe("due");
    expect(experimentStatus({ spec: { lifecycle: "experimental", experiment: { expiresAt: "2026-07-01" } } }, now).status).toBe("expired");
    expect(experimentStatus({ spec: { lifecycle: "experimental", experiment: { expiresAt: "2026-07-16" } } }, new Date("2026-07-17T00:00:00Z"))).toMatchObject({ status: "expired", daysRemaining: -1 });
  });
});
