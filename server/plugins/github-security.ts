import type { ServiceRecord } from "./contracts.js";
import { githubContext, optionalGitHubRequest } from "./github-shared.js";

export async function collectGitHubSecurity(service: ServiceRecord) {
  const { owner, repo, repository, octokit } = await githubContext(service);
  const [dependabot, codeScanning, secretScanning] = await Promise.all([
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/dependabot/alerts", {
        owner,
        repo,
        state: "open",
        per_page: 100,
      }),
    ),
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/code-scanning/alerts", {
        owner,
        repo,
        state: "open",
        per_page: 100,
      }),
    ),
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/secret-scanning/alerts", {
        owner,
        repo,
        state: "open",
        per_page: 100,
      }),
    ),
  ]);
  const values = (result: { available: boolean; value: any }) =>
    result.available ? (result.value.data as any[]) : [];
  const dependabotAlerts = values(dependabot);
  const codeAlerts = values(codeScanning);
  const secretAlerts = values(secretScanning);
  const criticalDependabot = dependabotAlerts.filter((alert) =>
    ["critical", "high"].includes(alert.security_advisory?.severity),
  ).length;
  return {
    repository,
    openAlerts:
      dependabotAlerts.length + codeAlerts.length + secretAlerts.length,
    criticalAlerts: criticalDependabot + secretAlerts.length,
    dependabot: {
      available: dependabot.available,
      count: dependabotAlerts.length,
      critical: criticalDependabot,
      reason: dependabot.reason,
    },
    codeScanning: {
      available: codeScanning.available,
      count: codeAlerts.length,
      reason: codeScanning.reason,
    },
    secretScanning: {
      available: secretScanning.available,
      count: secretAlerts.length,
      reason: secretScanning.reason,
    },
    coverage: [dependabot, codeScanning, secretScanning].filter(
      (result) => result.available,
    ).length,
  };
}
