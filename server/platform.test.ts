import { describe, expect, it } from "vitest";
import {
  buildGraph,
  campaignPreview,
  operationalSnapshot,
  relationsFromMetadata,
  setAtPath,
  valueAtPath,
} from "./platform.js";

const metadata = {
  apiVersion: "northstar.dev/v1",
  kind: "Service",
  metadata: { name: "checkout", description: "Checkout service" },
  spec: {
    owner: "team:payments",
    lifecycle: "production",
    system: "commerce",
    dependsOn: ["service:inventory"],
    providesApis: ["checkout-api"],
    consumesApis: ["api:pricing"],
    resources: [
      {
        name: "checkout-db",
        type: "database",
        relation: "reads-writes",
      },
    ],
  },
};

describe("platform catalog model", () => {
  it("extracts systems, dependencies, APIs, and resources", () => {
    expect(relationsFromMetadata(metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "part-of",
          targetKind: "system",
          targetKey: "commerce",
        }),
        expect.objectContaining({
          relationType: "depends-on",
          targetKey: "inventory",
        }),
        expect.objectContaining({
          relationType: "provides",
          targetKind: "api",
          targetKey: "checkout-api",
        }),
        expect.objectContaining({
          relationType: "reads-writes",
          targetKind: "database",
          targetKey: "checkout-db",
        }),
      ]),
    );
  });

  it("builds graph fallback edges directly from stored metadata", () => {
    const graph = buildGraph({
      services: [
        {
          id: "1",
          name: "checkout",
          owner: "payments",
          metadata,
          repository: "acme/checkout",
        },
      ],
      relations: [],
    });
    expect(graph.nodes.map((node) => node.id)).toContain("system:commerce");
    expect(graph.edges.some((edge) => edge.type === "depends-on")).toBe(true);
  });

  it("creates filtered campaign diffs without mutating metadata", () => {
    const service = {
      id: "1",
      name: "checkout",
      owner: "payments",
      tier: null,
      service_type: "backend",
      lifecycle: "production",
      repository: "acme/checkout",
      metadata,
    };
    const preview = campaignPreview([service], {
      fieldPath: "spec.tier",
      desiredValue: "critical",
      filters: { owners: ["payments"] },
    });
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      beforeValue: null,
      afterValue: "critical",
      confidence: "explicit",
    });
    expect(valueAtPath(metadata, "spec.tier")).toBeUndefined();
  });

  it("sets safe nested paths and rejects prototype paths", () => {
    const changed = setAtPath(metadata, "spec.operational.onCall", "payments");
    expect(valueAtPath(changed, "spec.operational.onCall")).toBe("payments");
    expect(valueAtPath(metadata, "spec.operational")).toBeUndefined();
    expect(() => setAtPath(metadata, "__proto__.polluted", true)).toThrow(
      "invalid",
    );
  });
});

describe("operational snapshot", () => {
  it("normalizes GitHub signals into an ordered service timeline", () => {
    const snapshot = operationalSnapshot({
      name: "checkout",
      repository: "acme/checkout",
      metadata: {
        spec: {
          operational: {
            onCall: "payments-primary",
            runbookUrl: "https://docs.example.com/runbook",
          },
        },
      },
      plugins: {
        "github-deployments": {
          latestDeploymentState: "success",
          deployments: [
            {
              id: 1,
              environment: "production",
              state: "success",
              createdAt: "2026-07-17T10:00:00Z",
            },
          ],
        },
        "github-actions": {
          runs: [
            {
              name: "release",
              conclusion: "success",
              updatedAt: "2026-07-17T09:00:00Z",
            },
          ],
        },
        "github-security": { openAlerts: 2, criticalAlerts: 1 },
      },
    });
    expect(snapshot.onCall).toBe("payments-primary");
    expect(snapshot.timeline.map((event) => event.type)).toEqual([
      "deployment",
      "workflow",
    ]);
    expect(snapshot.criticalSecurityAlerts).toBe(1);
  });
});
