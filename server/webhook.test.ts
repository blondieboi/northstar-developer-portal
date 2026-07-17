import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  documentationChanged,
  metadataChanged,
  pluginRefreshRequested,
  verifyWebhookSignature,
} from "./webhook.js";

describe("GitHub webhooks", () => {
  it("accepts only a matching sha256 signature", () => {
    const raw = Buffer.from('{"zen":"ship it"}');
    const signature = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    expect(verifyWebhookSignature(raw, signature, "secret")).toBe(true);
    expect(verifyWebhookSignature(raw, signature, "wrong")).toBe(false);
  });
  it("detects configured metadata paths across changed file groups", () => {
    const payload = {
      commits: [
        {
          added: ["README.md"],
          modified: [".portal/service.yaml"],
          removed: [],
        },
      ],
    };
    expect(
      metadataChanged(payload, [".portal/service.yaml", ".portal/team.yaml"]),
    ).toBe(true);
    expect(metadataChanged(payload, ["catalog.yaml"])).toBe(false);
  });
  it("detects repository Markdown changes for documentation refresh", () => {
    expect(
      documentationChanged({ commits: [{ modified: ["docs/runbook.md"] }] }),
    ).toBe(true);
    expect(
      documentationChanged({ commits: [{ modified: ["src/index.ts"] }] }),
    ).toBe(false);
  });
  it("routes repository activity to plugin refresh", () => {
    for (const event of [
      "workflow_run",
      "pull_request",
      "deployment",
      "deployment_status",
      "issues",
      "release",
      "push",
    ])
      expect(pluginRefreshRequested(event, "acme/service")).toBe(true);
    expect(pluginRefreshRequested("installation", "acme/service")).toBe(false);
    expect(pluginRefreshRequested("workflow_run")).toBe(false);
  });
});
