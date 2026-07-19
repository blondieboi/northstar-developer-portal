import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("./github-app.js", () => ({
  installationOctokit: async () => ({ request }),
}));

import { openMetadataPullRequest } from "./platform.js";

const encoded = Buffer.from(
  `apiVersion: perongen.dev/v1
kind: Service
metadata:
  name: checkout
spec:
  owner: team:payments
  lifecycle: production
`,
).toString("base64");

describe("GitHub metadata remediation", () => {
  beforeEach(() => request.mockReset());

  it("creates a branch, metadata commit, and pull request", async () => {
    request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}")
        return { data: { default_branch: "main" } };
      if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}")
        return { data: { object: { sha: "base-sha" } } };
      if (route === "GET /repos/{owner}/{repo}/contents/{path}")
        return { data: { content: encoded, sha: "metadata-sha" } };
      if (route === "POST /repos/{owner}/{repo}/pulls")
        return { data: { number: 42, html_url: "https://github.test/pr/42" } };
      return { data: {} };
    });
    const result = await openMetadataPullRequest({
      installationId: 123,
      repository: "acme/checkout",
      metadataPath: ".portal/service.yaml",
      fieldPath: "spec.tier",
      value: "critical",
      title: "chore: classify checkout",
      body: "Metadata campaign",
      branchPrefix: "perongen/campaign-1",
    });
    expect(result).toMatchObject({
      number: 42,
      url: "https://github.test/pr/42",
      alreadySatisfied: false,
    });
    expect(
      request.mock.calls.some(
        ([route]) => route === "POST /repos/{owner}/{repo}/git/refs",
      ),
    ).toBe(true);
    const update = request.mock.calls.find(
      ([route]) => route === "PUT /repos/{owner}/{repo}/contents/{path}",
    )?.[1];
    expect(Buffer.from(update.content, "base64").toString("utf8")).toContain(
      "tier: critical",
    );
  });

  it("does not create a branch when the repository already satisfies the change", async () => {
    const satisfied = Buffer.from(
      Buffer.from(encoded, "base64").toString("utf8") + "  tier: critical\n",
    ).toString("base64");
    request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}")
        return { data: { default_branch: "main" } };
      if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}")
        return { data: { object: { sha: "base-sha" } } };
      if (route === "GET /repos/{owner}/{repo}/contents/{path}")
        return { data: { content: satisfied, sha: "metadata-sha" } };
      return { data: {} };
    });
    const result = await openMetadataPullRequest({
      installationId: 123,
      repository: "acme/checkout",
      metadataPath: ".portal/service.yaml",
      fieldPath: "spec.tier",
      value: "critical",
      title: "chore: classify checkout",
      body: "Metadata campaign",
      branchPrefix: "perongen/campaign-1",
    });
    expect(result.alreadySatisfied).toBe(true);
    expect(
      request.mock.calls.some(
        ([route]) => route === "POST /repos/{owner}/{repo}/git/refs",
      ),
    ).toBe(false);
  });
});
