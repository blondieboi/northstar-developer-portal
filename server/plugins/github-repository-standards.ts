import type { ServiceRecord } from "./contracts.js";
import { githubContext, optionalGitHubRequest } from "./github-shared.js";

async function contentExists(
  octokit: any,
  owner: string,
  repo: string,
  paths: string[],
) {
  for (const path of paths) {
    const result = await optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path,
      }),
    );
    if (result.available) return true;
  }
  return false;
}

export async function collectGitHubRepositoryStandards(service: ServiceRecord) {
  const { owner, repo, repository, octokit } = await githubContext(service);
  const repositoryResponse = await octokit.request(
    "GET /repos/{owner}/{repo}",
    { owner, repo },
  );
  const details: any = repositoryResponse.data;
  const branch = String(details.default_branch || "main");
  const protection = await optionalGitHubRequest(() =>
    octokit.request("GET /repos/{owner}/{repo}/branches/{branch}/protection", {
      owner,
      repo,
      branch,
    }),
  );
  const [codeowners, readme, contributing, securityPolicy] = await Promise.all([
    contentExists(octokit, owner, repo, [
      ".github/CODEOWNERS",
      "CODEOWNERS",
      "docs/CODEOWNERS",
    ]),
    contentExists(octokit, owner, repo, ["README.md", "README"]),
    contentExists(octokit, owner, repo, [
      "CONTRIBUTING.md",
      ".github/CONTRIBUTING.md",
    ]),
    contentExists(octokit, owner, repo, ["SECURITY.md", ".github/SECURITY.md"]),
  ]);
  const checks = {
    codeowners,
    readme,
    contributing,
    securityPolicy,
    branchProtection: protection.available,
    issuesEnabled: Boolean(details.has_issues),
    description: Boolean(details.description),
    topics: Boolean(details.topics?.length),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    repository,
    defaultBranch: branch,
    visibility: details.visibility || (details.private ? "private" : "public"),
    archived: Boolean(details.archived),
    checks,
    passed,
    total: Object.keys(checks).length,
    coverage: Math.round((passed / Object.keys(checks).length) * 100),
    branchProtectionReason: protection.available ? null : protection.reason,
  };
}
