import { afterEach, describe, expect, it, vi } from "vitest";
import { collectGitHubDeployments } from "./github-deployments.js";
import { collectGitHubMaintenance } from "./github-maintenance.js";
import { collectGitHubPullRequests } from "./github-pull-requests.js";
import { collectGitHubRepositoryStandards } from "./github-repository-standards.js";
import { collectGitHubSecurity } from "./github-security.js";
import { setSharedGitHubOctokitFactory } from "./github-shared.js";
import { pluginManifests, validatePluginSettings } from "./registry.js";

const service = {
  id: 1,
  name: "checkout-api",
  repository: "acme/checkout-api",
  installation_id: 42,
  metadata: { spec: {} },
};

afterEach(() => setSharedGitHubOctokitFactory(null));

describe("GitHub plugin suite", () => {
  it("publishes validated manifests for every built-in GitHub signal", () => {
    expect(pluginManifests.map((plugin) => plugin.id)).toEqual([
      "github-actions",
      "github-pull-requests",
      "github-repository-standards",
      "github-deployments",
      "github-security",
      "github-maintenance",
    ]);
    expect(
      validatePluginSettings("github-pull-requests", {
        staleAfterDays: 14,
        maximumPullRequests: 30,
      }),
    ).toMatchObject({ staleAfterDays: 14 });
    expect(() =>
      validatePluginSettings("github-maintenance", { staleAfterDays: 0 }),
    ).toThrow();
  });
  it("normalizes pull-request attention signals", async () => {
    setSharedGitHubOctokitFactory((async () => ({
      request: vi.fn(async () => ({
        data: [
          {
            number: 12,
            title: "Ship it",
            user: { login: "octocat" },
            draft: false,
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-02T00:00:00Z",
            html_url: "https://github.com/acme/checkout-api/pull/12",
            requested_reviewers: [{ login: "hubot" }],
          },
        ],
      })),
    })) as any);
    const data = await collectGitHubPullRequests(service, {
      staleAfterDays: 1,
      maximumPullRequests: 10,
    });
    expect(data).toMatchObject({
      repository: "acme/checkout-api",
      openCount: 1,
      waitingForReview: 1,
      staleCount: 1,
    });
  });

  it("collects repository standards while treating optional endpoints as facts", async () => {
    const request = vi.fn(async (route: string, params: any) => {
      if (route === "GET /repos/{owner}/{repo}")
        return {
          data: {
            default_branch: "main",
            visibility: "private",
            has_issues: true,
            description: "Checkout",
            topics: ["payments"],
          },
        };
      if (route.includes("/protection")) return { data: {} };
      if (route.includes("/contents/"))
        return params.path.includes("README") ||
          params.path.includes("CODEOWNERS")
          ? { data: { type: "file" } }
          : Promise.reject(
              Object.assign(new Error("missing"), { status: 404 }),
            );
      return { data: [] };
    });
    setSharedGitHubOctokitFactory((async () => ({ request })) as any);
    const data = await collectGitHubRepositoryStandards(service);
    expect(data.checks).toMatchObject({
      codeowners: true,
      readme: true,
      branchProtection: true,
      description: true,
      topics: true,
    });
    expect(data.coverage).toBeGreaterThan(50);
  });

  it("degrades restricted security signals without failing the plugin", async () => {
    setSharedGitHubOctokitFactory((async () => ({
      request: async (route: string) => {
        if (route.includes("dependabot"))
          return { data: [{ security_advisory: { severity: "high" } }] };
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
    })) as any);
    const data = await collectGitHubSecurity(service);
    expect(data).toMatchObject({
      openAlerts: 1,
      criticalAlerts: 1,
      coverage: 1,
      codeScanning: { available: false },
    });
  });

  it("collects deployments, releases, and maintenance activity", async () => {
    setSharedGitHubOctokitFactory((async () => ({
      request: async (route: string) => {
        if (route.endsWith("/deployments"))
          return {
            data: [
              {
                id: 1,
                environment: "production",
                ref: "main",
                created_at: "2026-07-16T00:00:00Z",
              },
            ],
          };
        if (route.endsWith("/statuses"))
          return {
            data: [
              { state: "success", environment_url: "https://example.com" },
            ],
          };
        if (route.endsWith("/releases/latest"))
          return {
            data: {
              name: "v1",
              tag_name: "v1",
              published_at: "2026-07-15T00:00:00Z",
              html_url: "https://github.com/acme/checkout-api/releases/v1",
            },
          };
        if (route.endsWith("/issues"))
          return {
            data: [
              {
                number: 4,
                title: "Bug",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-02T00:00:00Z",
                html_url: "https://github.com/acme/checkout-api/issues/4",
              },
            ],
          };
        if (route.endsWith("/contributors"))
          return { data: [{ login: "octocat" }] };
        if (route.endsWith("/commits"))
          return {
            data: [{ commit: { committer: { date: "2026-07-16T00:00:00Z" } } }],
          };
        return { data: [] };
      },
    })) as any);
    const deployments = await collectGitHubDeployments(service, {
      maximumDeployments: 10,
    });
    const maintenance = await collectGitHubMaintenance(service, {
      staleAfterDays: 1,
    });
    expect(deployments).toMatchObject({
      totalDeployments: 1,
      successfulDeployments: 1,
      latestDeploymentState: "success",
      latestRelease: { tag: "v1" },
    });
    expect(maintenance).toMatchObject({
      openIssues: 1,
      staleIssues: 1,
      activeContributors: 1,
    });
  });
});
