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
  const [branchRules, codeownerErrors, codeowners, readme, contributing, securityPolicy] = await Promise.all([
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/rules/branches/{branch}", {
        owner,
        repo,
        branch,
        per_page: 100,
      }),
    ),
    optionalGitHubRequest(() =>
      octokit.request("GET /repos/{owner}/{repo}/codeowners/errors", {
        owner,
        repo,
        ref: branch,
      }),
    ),
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
  const activeRules = branchRules.available
    ? ((branchRules.value.data as any[]) || [])
    : [];
  const ownershipErrors = codeownerErrors.available
    ? (((codeownerErrors.value.data as any)?.errors || []) as any[])
    : [];
  const checks = {
    codeowners: codeowners && ownershipErrors.length === 0,
    readme,
    contributing,
    securityPolicy,
    branchProtection: protection.available || activeRules.length > 0,
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
    governanceSource: protection.available
      ? activeRules.length
        ? "branch protection + rulesets"
        : "branch protection"
      : activeRules.length
        ? "rulesets"
        : null,
    activeRules: activeRules.map((rule: any) => ({
      type: rule.type,
      source: rule.ruleset_source,
      sourceType: rule.ruleset_source_type,
      rulesetId: rule.ruleset_id,
    })),
    rulesAvailable: branchRules.available,
    codeownersPresent: codeowners,
    codeownersErrors: ownershipErrors.map((error: any) => ({
      line: error.line,
      kind: error.kind,
      message: error.message,
      suggestion: error.suggestion,
    })),
    codeownersErrorsAvailable: codeownerErrors.available,
  };
}
