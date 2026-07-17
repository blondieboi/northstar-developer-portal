import type { ServiceRecord } from "./contracts.js";
import { daysBetween, githubContext } from "./github-shared.js";

export type GitHubPullRequestsData = {
  repository: string;
  openCount: number;
  draftCount: number;
  waitingForReview: number;
  staleCount: number;
  oldestAgeDays: number | null;
  pullRequests: Array<{
    number: number;
    title: string;
    author: string | null;
    draft: boolean;
    ageDays: number;
    updatedAt: string;
    url: string;
    reviewRequested: boolean;
  }>;
};

export async function collectGitHubPullRequests(
  service: ServiceRecord,
  config: Record<string, unknown>,
): Promise<GitHubPullRequestsData> {
  const { owner, repo, repository, octokit } = await githubContext(service);
  const maximumPullRequests = Number(config.maximumPullRequests || 30);
  const staleAfterDays = Number(config.staleAfterDays || 14);
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: maximumPullRequests,
  });
  const pullRequests = (response.data as any[]).map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login || null,
    draft: Boolean(pr.draft),
    ageDays: daysBetween(pr.created_at) || 0,
    updatedAt: pr.updated_at,
    url: pr.html_url,
    reviewRequested: Boolean(
      pr.requested_reviewers?.length || pr.requested_teams?.length,
    ),
  }));
  return {
    repository,
    openCount: pullRequests.length,
    draftCount: pullRequests.filter((pr) => pr.draft).length,
    waitingForReview: pullRequests.filter(
      (pr) => !pr.draft && pr.reviewRequested,
    ).length,
    staleCount: pullRequests.filter(
      (pr) => daysBetween(pr.updatedAt)! >= staleAfterDays,
    ).length,
    oldestAgeDays: pullRequests.length
      ? Math.max(...pullRequests.map((pr) => pr.ageDays))
      : null,
    pullRequests,
  };
}
