import { describe, expect, it } from "vitest";
import { safeExternalUrl, safeMarkdownUrl, safeUiImageUrl } from "./safe-url";

describe("safe URLs", () => {
  it("allows only absolute HTTP(S) external destinations", () => {
    expect(safeExternalUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(safeExternalUrl("http://example.com/path")).toBe("http://example.com/path");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,unsafe")).toBeNull();
    expect(safeExternalUrl("/relative")).toBeNull();
  });

  it("removes unsafe Markdown destinations", () => {
    expect(safeMarkdownUrl("https://example.com/guide")).toBe(
      "https://example.com/guide",
    );
    expect(safeMarkdownUrl("mailto:security@example.com")).toBe("");
  });

  it("allows same-origin assets and GitHub avatars only", () => {
    const origin = "https://portal.example.com";
    expect(safeUiImageUrl("/logo.svg", origin)).toBe(
      "https://portal.example.com/logo.svg",
    );
    expect(
      safeUiImageUrl("https://avatars.githubusercontent.com/u/1?v=4", origin),
    ).toBe("https://avatars.githubusercontent.com/u/1?v=4");
    expect(safeUiImageUrl("https://example.com/tracker.gif", origin)).toBeNull();
    expect(safeUiImageUrl("data:image/svg+xml,unsafe", origin)).toBeNull();
  });
});
