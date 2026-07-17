import {
  listServicesMissingDocuments,
  replaceServiceDocuments,
} from "./db.js";
import { mapWithConcurrency } from "./platform.js";
import { installationOctokit } from "./github-app.js";

function documentTitle(path: string, content: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (
    heading ||
    path
      .split("/")
      .pop()!
      .replace(/\.md$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export async function syncServiceDocuments(
  octokit: any,
  service: { id: string | number; repository: string },
  configuredPath = "docs",
) {
  const [owner, repo] = service.repository.split("/");
  if (!owner || !repo) return [];
  try {
    const repository = (
      await octokit.request("GET /repos/{owner}/{repo}", { owner, repo })
    ).data;
    const tree = (
      await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
        owner,
        repo,
        tree_sha: repository.default_branch,
        recursive: "1",
      })
    ).data;
    const root = configuredPath.replace(/^\.\//, "").replace(/\/$/, "");
    const paths = (tree.tree || [])
      .filter(
        (entry: any) =>
          entry.type === "blob" &&
          typeof entry.path === "string" &&
          (/^readme\.md$/i.test(entry.path) ||
            (entry.path.startsWith(`${root}/`) && /\.md$/i.test(entry.path))),
      )
      .slice(0, 30);
    const documents = await mapWithConcurrency(paths, 5, async (entry: any) => {
      const [contentResponse, commitsResponse] = await Promise.all([
        octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path: entry.path,
          ref: repository.default_branch,
        }),
        octokit
          .request("GET /repos/{owner}/{repo}/commits", {
            owner,
            repo,
            path: entry.path,
            per_page: 1,
          })
          .catch(() => ({ data: [] })),
      ]);
      const file = contentResponse.data as any;
      const content = Buffer.from(file.content || "", "base64").toString(
        "utf8",
      );
      const commit = (commitsResponse.data as any[])[0];
      return {
        path: entry.path,
        title: documentTitle(entry.path, content),
        content,
        sha: file.sha || entry.sha,
        sourceUpdatedAt:
          commit?.commit?.committer?.date ||
          commit?.commit?.author?.date ||
          null,
      };
    });
    await replaceServiceDocuments(service.id, documents);
    return documents;
  } catch {
    // Documentation is an optional catalog surface. Preserve the last successful
    // snapshot when GitHub cannot expose repository contents.
    return [];
  }
}

export async function backfillServiceDocuments() {
  const services = await listServicesMissingDocuments();
  return mapWithConcurrency(services, 2, async (service: any) => {
    try {
      const octokit = await installationOctokit(Number(service.installation_id));
      return syncServiceDocuments(
        octokit,
        service,
        service.metadata?.spec?.docsPath || "docs",
      );
    } catch {
      // One inaccessible installation must not prevent other catalog entries
      // from receiving their documentation snapshot during an upgrade.
      return [];
    }
  });
}
