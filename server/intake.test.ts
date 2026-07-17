import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("./github-app.js", () => ({
  installationOctokit: async () => ({ request }),
}));

import {
  analyzeRepository,
  clearIntakeDiscoveryCache,
  discoverIntakeCandidates,
  intakePreview,
  openIntakePullRequest,
} from "./intake.js";
import type { IntakeDraft } from "../src/intake-contract.js";

const draft: IntakeDraft = {
  name: "checkout-app",
  title: "Checkout App",
  description: "Customer checkout application.",
  owner: "team:payments",
  lifecycle: "production",
  tier: "high",
  type: "fullstack",
  system: "commerce",
  language: "TypeScript",
  docsPath: "docs",
  dependsOn: "service:inventory",
  exposure: "public",
  dataSensitivity: "confidential",
  authentication: "required",
  expiresAt: "",
};

describe("application intake", () => {
  beforeEach(() => {
    request.mockReset();
    clearIntakeDiscoveryCache();
  });

  it("derives recommendations with field-level repository evidence", () => {
    const candidate = analyzeRepository(
      {
        name: "checkout-app",
        full_name: "acme/checkout-app",
        owner: { login: "acme" },
        description: "Customer checkout application.",
        language: "TypeScript",
        topics: ["system-commerce", "tier-high", "public", "depends-on-inventory"],
        default_branch: "main",
      },
      ["package.json", "src/server/api.ts", "docs/index.md", ".github/workflows/deploy.yml", ".github/CODEOWNERS"],
      {
        "package.json": `{"dependencies":{"react":"latest","fastify":"latest","next-auth":"latest","prisma":"latest"}}`,
        ".github/CODEOWNERS": "* @acme/payments",
      },
    );
    expect(candidate.draft).toMatchObject({
      owner: "team:payments",
      type: "fullstack",
      tier: "high",
      system: "commerce",
      exposure: "",
      authentication: "",
      dataSensitivity: "",
      docsPath: "docs",
      dependsOn: "service:inventory",
    });
    expect(candidate.evidence.find((item) => item.field === "owner")).toMatchObject({
      confidence: "strong",
      source: "CODEOWNERS",
    });
    expect(candidate.evidence.find((item) => item.field === "authentication")).toMatchObject({
      value: "required",
      confidence: "inferred",
    });
  });

  it("requires human confirmation of all risk facts", () => {
    expect(() => intakePreview({ ...draft, authentication: "" })).toThrow(
      "Confirm exposure",
    );
    expect(intakePreview(draft).yaml).toContain("dataSensitivity: confidential");
    expect(intakePreview(draft).metadata.spec.dependsOn).toEqual(["service:inventory"]);
  });

  it("requires lifecycle confirmation when the repository has no strong signal", () => {
    const candidate = analyzeRepository(
      {
        name: "utility",
        full_name: "acme/utility",
        owner: { login: "acme" },
      },
      [],
    );
    expect(candidate.draft.lifecycle).toBe("");
    expect(candidate.evidence.find((item) => item.field === "lifecycle")).toMatchObject({
      confidence: "inferred",
      value: "production",
    });
    expect(() => intakePreview({ ...draft, lifecycle: "" })).toThrow(
      "Confirm the service lifecycle",
    );
  });

  it("rejects repository paths that could escape the documentation root", () => {
    expect(() => intakePreview({ ...draft, docsPath: "../private" })).toThrow(
      "safe repository-relative path",
    );
  });

  it("creates a new metadata file and reviewable pull request", async () => {
    request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}") return { data: { default_branch: "main" } };
      if (route === "GET /repos/{owner}/{repo}/contents/{path}") throw Object.assign(new Error("Not found"), { status: 404 });
      if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}") return { data: { object: { sha: "base-sha" } } };
      if (route === "POST /repos/{owner}/{repo}/pulls") return { data: { number: 19, html_url: "https://github.test/pr/19" } };
      return { data: {} };
    });
    const result = await openIntakePullRequest({
      installationId: 123,
      repository: "acme/checkout-app",
      metadataPath: ".portal/service.yaml",
      draft,
      actor: "octocat",
    });
    expect(result).toMatchObject({ number: 19, alreadyCataloged: false });
    const create = request.mock.calls.find(([route]) => route === "PUT /repos/{owner}/{repo}/contents/{path}")?.[1];
    const content = Buffer.from(create.content, "base64").toString("utf8");
    expect(content).toContain("owner: team:payments");
    expect(create.sha).toBeUndefined();
  });

  it("does not branch when metadata appeared after discovery", async () => {
    request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}") return { data: { default_branch: "main" } };
      if (route === "GET /repos/{owner}/{repo}/contents/{path}") return { data: { sha: "existing" } };
      return { data: {} };
    });
    const result = await openIntakePullRequest({
      installationId: 123,
      repository: "acme/checkout-app",
      metadataPath: ".portal/service.yaml",
      draft,
      actor: "octocat",
    });
    expect(result.alreadyCataloged).toBe(true);
    expect(request.mock.calls.some(([route]) => route === "POST /repos/{owner}/{repo}/git/refs")).toBe(false);
  });

  it("keeps other intake work available when repository evidence cannot be read", async () => {
    request.mockImplementation(async (route: string) => {
      if (!route) return { data: {} };
      if (route.includes("/installation/repositories"))
        return {
          data: {
            repositories: [
              {
                name: "private-app",
                full_name: "acme/private-app",
                owner: { login: "acme" },
                default_branch: "main",
              },
            ],
          },
        };
      if (route.includes("/git/trees/") || route.includes("/contents/"))
        throw new Error("Contents unavailable");
      return { data: {} };
    });
    const { candidates: [candidate] } = await discoverIntakeCandidates(123, []);
    expect(candidate).toMatchObject({
      repository: "acme/private-app",
      scanError: "Repository evidence is unavailable: Contents unavailable",
    });
  });

  it("reuses a recent discovery unless an administrator explicitly refreshes", async () => {
    request.mockImplementation(async (route?: string) => {
      if (!route || route.includes("/installation/repositories"))
        return { data: { repositories: [] } };
      return { data: {} };
    });
    const first = await discoverIntakeCandidates(456, []);
    const second = await discoverIntakeCandidates(456, []);
    const refreshed = await discoverIntakeCandidates(456, [], { refresh: true });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(refreshed.cached).toBe(false);
    expect(
      request.mock.calls.filter(([route]) =>
        String(route).includes("/installation/repositories"),
      ),
    ).toHaveLength(2);
  });
});
