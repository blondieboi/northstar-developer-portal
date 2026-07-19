import { afterEach, describe, expect, it, vi } from "vitest";
import { activateConfig, defaults } from "../config.js";
import {
  collectGitHubActions,
  setGitHubActionsOctokitFactory,
} from "./github-actions.js";
import {
  decorateServicesWithPlugins,
  pluginCatalogResponse,
  refreshServicePlugins,
} from "./runtime.js";

const service = {
  id: 1,
  name: "checkout-api",
  repository: "acme/checkout-api",
  installation_id: 42,
  metadata: { spec: { owner: "team:checkout", lifecycle: "production" } },
};

afterEach(() => {
  setGitHubActionsOctokitFactory(null);
  activateConfig(defaults);
});

describe("GitHub Actions plugin", () => {
  it("normalizes workflow runs and calculates delivery facts", async () => {
    const request = vi.fn(async () => ({
      data: {
        total_count: 2,
        workflow_runs: [
          {
            id: 2,
            name: "Deploy",
            workflow_id: 8,
            path: ".github/workflows/deploy.yml",
            head_branch: "main",
            event: "push",
            status: "completed",
            conclusion: "success",
            actor: { login: "octocat" },
            created_at: "2026-07-15T10:00:00Z",
            updated_at: "2026-07-15T10:03:00Z",
            html_url: "https://github.com/acme/checkout-api/actions/runs/2",
          },
          {
            id: 1,
            name: "Test",
            workflow_id: 7,
            path: ".github/workflows/test.yml",
            head_branch: "feature",
            event: "pull_request",
            status: "completed",
            conclusion: "failure",
            actor: { login: "hubot" },
            created_at: "2026-07-14T10:00:00Z",
            updated_at: "2026-07-14T10:02:00Z",
            html_url: "https://github.com/acme/checkout-api/actions/runs/1",
          },
        ],
      },
    }));
    setGitHubActionsOctokitFactory((async () => ({ request })) as any);
    const data = await collectGitHubActions(service, {
      lookbackDays: 30,
      maximumRuns: 20,
    });
    expect(data).toMatchObject({
      repository: "acme/checkout-api",
      totalRuns: 2,
      successRate: 50,
      lastSuccessfulRunAt: "2026-07-15T10:03:00Z",
      medianDurationMinutes: 3,
      failureStreak: 0,
    });
    expect(data.workflows).toHaveLength(2);
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/actions/runs",
      expect.objectContaining({
        owner: "acme",
        repo: "checkout-api",
        per_page: 20,
      }),
    );
  });

  it("isolates provider failures from service scoring", async () => {
    setGitHubActionsOctokitFactory((async () => ({
      request: async () => {
        throw new Error("GitHub unavailable");
      },
    })) as any);
    activateConfig({
      ...defaults,
      integrations: {
        plugins: [
          {
            id: "github-actions",
            enabled: true,
            config: { lookbackDays: 30, maximumRuns: 20 },
          },
        ],
      },
    });
    await expect(refreshServicePlugins(service)).resolves.toHaveProperty(
      "score",
    );
  });
  it("exposes safe manifest health without schemas or secrets", async () => {
    const previousId = process.env.GITHUB_APP_ID;
    const previousKey = process.env.GITHUB_PRIVATE_KEY;
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_PRIVATE_KEY = "private-value";
    activateConfig({
      ...defaults,
      integrations: {
        plugins: [
          {
            id: "github-actions",
            enabled: true,
            config: { lookbackDays: 7, maximumRuns: 5 },
          },
        ],
      },
    });
    const [plugin] = await pluginCatalogResponse();
    expect(plugin).toMatchObject({
      id: "github-actions",
      enabled: true,
      health: { status: "ready" },
    });
    expect(plugin).not.toHaveProperty("configSchema");
    expect(plugin).not.toHaveProperty("config");
    expect(plugin).not.toHaveProperty("defaults");
    expect(JSON.stringify(plugin)).not.toContain("private-value");
    const [diagnostic] = await pluginCatalogResponse({
      includeDiagnostics: true,
    });
    expect(diagnostic).toHaveProperty("config", {
      lookbackDays: 7,
      maximumRuns: 5,
    });
    if (previousId === undefined) delete process.env.GITHUB_APP_ID;
    else process.env.GITHUB_APP_ID = previousId;
    if (previousKey === undefined) delete process.env.GITHUB_PRIVATE_KEY;
    else process.env.GITHUB_PRIVATE_KEY = previousKey;
  });

  it("decorates service reads without recalculating stored scores", async () => {
    const [decorated] = await decorateServicesWithPlugins([
      { ...service, score: 73, scorecards: { stored: 81 } },
    ]);
    expect(decorated).toMatchObject({
      score: 73,
      scorecards: { stored: 81 },
      plugins: {},
      pluginStates: {},
    });
  });
});
