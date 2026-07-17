import { z } from "zod";
import type { PortalPlugin } from "./contracts.js";

const githubActionsConfig = z
  .object({
    lookbackDays: z.number().int().min(1).max(365).default(30),
    maximumRuns: z.number().int().min(1).max(100).default(20),
  })
  .strict();
const githubPullRequestsConfig = z
  .object({
    staleAfterDays: z.number().int().min(1).max(365).default(14),
    maximumPullRequests: z.number().int().min(1).max(100).default(30),
  })
  .strict();
const githubDeploymentsConfig = z
  .object({ maximumDeployments: z.number().int().min(1).max(100).default(20) })
  .strict();
const githubMaintenanceConfig = z
  .object({ staleAfterDays: z.number().int().min(1).max(365).default(30) })
  .strict();
const noConfig = z.object({}).strict();

const githubEnvironment = ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY"];

export const pluginManifests: PortalPlugin[] = [
  {
    id: "github-actions",
    title: "GitHub Actions",
    description:
      "Workflow activity, delivery health, and scorecard facts for catalog services.",
    version: "1.0.0",
    surfaces: ["service", "overview", "scorecards", "health"],
    configSchema: githubActionsConfig,
    defaults: { lookbackDays: 30, maximumRuns: 20 },
    requiredEnvironment: githubEnvironment,
  },
  {
    id: "github-pull-requests",
    title: "GitHub pull requests",
    description: "Open pull requests, review queues, age, and stale work.",
    version: "1.0.0",
    surfaces: ["service", "overview", "scorecards", "health"],
    configSchema: githubPullRequestsConfig,
    defaults: { staleAfterDays: 14, maximumPullRequests: 30 },
    requiredEnvironment: githubEnvironment,
  },
  {
    id: "github-repository-standards",
    title: "GitHub repository standards",
    description:
      "CODEOWNERS, documentation, policy, and default-branch safeguards.",
    version: "1.0.0",
    surfaces: ["service", "overview", "scorecards", "health"],
    configSchema: noConfig,
    defaults: {},
    requiredEnvironment: githubEnvironment,
  },
  {
    id: "github-deployments",
    title: "GitHub deployments and releases",
    description:
      "Environment deployments, latest delivery state, and release freshness.",
    version: "1.0.0",
    surfaces: ["service", "overview", "scorecards", "health"],
    configSchema: githubDeploymentsConfig,
    defaults: { maximumDeployments: 20 },
    requiredEnvironment: githubEnvironment,
  },
  {
    id: "github-security",
    title: "GitHub security",
    description:
      "Dependabot, code-scanning, and secret-scanning posture with permission-aware health.",
    version: "1.0.0",
    surfaces: ["service", "overview", "scorecards", "health"],
    configSchema: noConfig,
    defaults: {},
    requiredEnvironment: githubEnvironment,
  },
  {
    id: "github-maintenance",
    title: "GitHub maintenance",
    description:
      "Issue backlog, repository activity, contributors, and maintenance freshness.",
    version: "1.0.0",
    surfaces: ["service", "overview", "scorecards", "health"],
    configSchema: githubMaintenanceConfig,
    defaults: { staleAfterDays: 30 },
    requiredEnvironment: githubEnvironment,
  },
];

export const pluginById = (id: string) =>
  pluginManifests.find((plugin) => plugin.id === id);

export function validatePluginSettings(id: string, value: unknown) {
  const plugin = pluginById(id);
  if (!plugin) throw new Error(`Unknown plugin: ${id}`);
  return plugin.configSchema.parse(value);
}

export function publicPluginCatalog() {
  return pluginManifests.map(
    ({ configSchema: _, collectService: __, registerRoutes: ___, ...plugin }) =>
      plugin,
  );
}
