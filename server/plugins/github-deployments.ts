import type { ServiceRecord } from "./contracts.js";
import {
  daysBetween,
  githubContext,
  optionalGitHubRequest,
} from "./github-shared.js";

export async function collectGitHubDeployments(
  service: ServiceRecord,
  config: Record<string, unknown>,
) {
  const { owner, repo, repository, octokit } = await githubContext(service);
  const maximumDeployments = Number(config.maximumDeployments || 20);
  const [deploymentResponse, releaseResponse] = await Promise.all([
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/deployments", {
        owner,
        repo,
        per_page: maximumDeployments,
      }),
    ),
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/releases/latest", {
        owner,
        repo,
      }),
    ),
  ]);
  const source = deploymentResponse.available
    ? (deploymentResponse.value.data as any[])
    : [];
  const deployments = await Promise.all(
    source.map(async (deployment) => {
      const statusResponse = await optionalGitHubRequest(() =>
        octokit.request(
          "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
          { owner, repo, deployment_id: deployment.id, per_page: 1 },
        ),
      );
      const status: any = statusResponse.available
        ? (statusResponse.value.data as any[])[0]
        : null;
      return {
        id: deployment.id,
        environment: deployment.environment || "default",
        ref: deployment.ref,
        createdAt: deployment.created_at,
        state: status?.state || "unknown",
        url:
          status?.environment_url ||
          status?.target_url ||
          `https://github.com/${repository}/deployments`,
      };
    }),
  );
  const latestRelease: any = releaseResponse.available
    ? releaseResponse.value.data
    : null;
  return {
    repository,
    deploymentsAvailable: deploymentResponse.available,
    deploymentsReason: deploymentResponse.reason,
    totalDeployments: deployments.length,
    successfulDeployments: deployments.filter(
      (item) => item.state === "success",
    ).length,
    latestDeploymentAt: deployments[0]?.createdAt || null,
    latestDeploymentState: deployments[0]?.state || null,
    deployments,
    latestRelease: latestRelease
      ? {
          name: latestRelease.name || latestRelease.tag_name,
          tag: latestRelease.tag_name,
          publishedAt: latestRelease.published_at,
          ageDays: daysBetween(latestRelease.published_at),
          url: latestRelease.html_url,
        }
      : null,
    releasesAvailable: releaseResponse.available,
  };
}
