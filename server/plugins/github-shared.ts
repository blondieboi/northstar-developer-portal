import { installationOctokit } from "../github-app.js";
import type { ServiceRecord } from "./contracts.js";

let octokitFactory = installationOctokit;

export type GitHubContext = {
  installationId: number;
  owner: string;
  repo: string;
  repository: string;
  octokit: Awaited<ReturnType<typeof installationOctokit>>;
};

export async function githubContext(
  service: ServiceRecord,
): Promise<GitHubContext> {
  const installationId = Number(service.installation_id);
  if (!installationId) throw new Error("Service has no GitHub installation ID");
  const [owner, repo] = String(service.repository).split("/");
  if (!owner || !repo) throw new Error("Service repository is invalid");
  return {
    installationId,
    owner,
    repo,
    repository: String(service.repository),
    octokit: await octokitFactory(installationId),
  };
}

export function setSharedGitHubOctokitFactory(
  factory: typeof installationOctokit | null,
) {
  octokitFactory = factory || installationOctokit;
}

export async function optionalGitHubRequest<T>(request: () => Promise<T>) {
  try {
    return { available: true as const, value: await request(), reason: null };
  } catch (error) {
    const status = Number((error as { status?: number }).status || 0);
    if ([403, 404, 422].includes(status)) {
      return {
        available: false as const,
        value: null,
        reason:
          status === 403
            ? "GitHub App permission required"
            : "Not enabled or not available",
      };
    }
    throw error;
  }
}

export function daysBetween(value?: string | null) {
  if (!value) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
}
