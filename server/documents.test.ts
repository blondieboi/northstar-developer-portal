import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceServiceDocuments = vi.hoisted(() => vi.fn());
vi.mock("./db.js", () => ({ replaceServiceDocuments }));

import { syncServiceDocuments } from "./documents.js";

describe("repository documentation sync", () => {
  beforeEach(() => replaceServiceDocuments.mockReset());

  it("indexes README and configured Markdown pages with source dates", async () => {
    const request = vi.fn(async (route: string, parameters: any) => {
      if (route === "GET /repos/{owner}/{repo}")
        return { data: { default_branch: "main" } };
      if (route === "GET /repos/{owner}/{repo}/git/trees/{tree_sha}")
        return {
          data: {
            tree: [
              { type: "blob", path: "README.md", sha: "readme" },
              {
                type: "blob",
                path: "engineering/docs/runbook.md",
                sha: "runbook",
              },
              { type: "blob", path: "src/index.ts", sha: "source" },
            ],
          },
        };
      if (route === "GET /repos/{owner}/{repo}/contents/{path}")
        return {
          data: {
            sha: parameters.path,
            content: Buffer.from(
              parameters.path === "README.md"
                ? "# Checkout\nService overview"
                : "# Operations runbook\nEscalation steps",
            ).toString("base64"),
          },
        };
      if (route === "GET /repos/{owner}/{repo}/commits")
        return {
          data: [{ commit: { committer: { date: "2026-07-01T10:00:00Z" } } }],
        };
      throw new Error(`Unexpected route ${route}`);
    });
    const documents = await syncServiceDocuments(
      { request },
      { id: "1", repository: "acme/checkout" },
      "engineering/docs",
    );
    expect(documents.map((document) => document.title)).toEqual([
      "Checkout",
      "Operations runbook",
    ]);
    expect(replaceServiceDocuments).toHaveBeenCalledWith(
      "1",
      expect.arrayContaining([
        expect.objectContaining({
          path: "engineering/docs/runbook.md",
          sourceUpdatedAt: "2026-07-01T10:00:00Z",
        }),
      ]),
    );
  });

  it("preserves the previous document snapshot when GitHub is unavailable", async () => {
    const documents = await syncServiceDocuments(
      { request: vi.fn().mockRejectedValue(new Error("GitHub unavailable")) },
      { id: "1", repository: "acme/checkout" },
    );
    expect(documents).toEqual([]);
    expect(replaceServiceDocuments).not.toHaveBeenCalled();
  });
});
