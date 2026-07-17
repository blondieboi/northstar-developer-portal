import type { ServiceRecord } from "./contracts.js";
import {
  daysBetween,
  githubContext,
  optionalGitHubRequest,
} from "./github-shared.js";

export async function collectGitHubMaintenance(
  service: ServiceRecord,
  config: Record<string, unknown>,
) {
  const { owner, repo, repository, octokit } = await githubContext(service);
  const staleAfterDays = Number(config.staleAfterDays || 30);
  const issueResponse = await optionalGitHubRequest(() =>
    octokit.request("GET /repos/{owner}/{repo}/issues", {
      owner,
      repo,
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    }),
  );
  const contributorResponse = await optionalGitHubRequest(() =>
    octokit.request("GET /repos/{owner}/{repo}/contributors", {
      owner,
      repo,
      per_page: 10,
    }),
  );
  const commitResponse = await optionalGitHubRequest(() =>
    octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner,
      repo,
      per_page: 1,
    }),
  );
  const issues = issueResponse.available
    ? (issueResponse.value.data as any[])
        .filter((item) => !item.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          ageDays: daysBetween(issue.created_at) || 0,
          updatedDays: daysBetween(issue.updated_at) || 0,
          url: issue.html_url,
        }))
    : [];
  const latestCommit: any = commitResponse.available
    ? (commitResponse.value.data as any[])[0]
    : null;
  return {
    repository,
    openIssues: issues.length,
    staleIssues: issues.filter((issue) => issue.updatedDays >= staleAfterDays)
      .length,
    oldestIssueDays: issues.length
      ? Math.max(...issues.map((issue) => issue.ageDays))
      : null,
    activeContributors: contributorResponse.available
      ? (contributorResponse.value.data as any[]).length
      : null,
    lastCommitAt: latestCommit?.commit?.committer?.date || null,
    daysSinceCommit: daysBetween(latestCommit?.commit?.committer?.date),
    issues: issues.slice(0, 10),
    issuesAvailable: issueResponse.available,
  };
}
