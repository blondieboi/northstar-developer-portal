import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const entry = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const foundation = readFileSync(new URL("./foundation.css", import.meta.url), "utf8");
const product = readFileSync(new URL("./product.css", import.meta.url), "utf8");

const luminance = (hex: string) => {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (left: string, right: string) => {
  const [bright, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
};

describe("visual foundation", () => {
  it("loads compatibility, canonical tokens, and product surfaces in a stable order", () => {
    expect(entry.trim().split("\n")).toEqual([
      '@import "./styles/legacy.css";',
      '@import "./styles/foundation.css";',
      '@import "./styles/product.css";',
    ]);
    expect(product).not.toMatch(/^:root\s*\{/m);
    expect(root.pathname).toContain("/src/");
  });

  it("keeps operational copy above WCAG AA contrast in both themes", () => {
    expect(contrast("#202622", "#fbfcf9")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#59645d", "#fbfcf9")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#f2f4ef", "#222a24")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#b5beb6", "#222a24")).toBeGreaterThanOrEqual(4.5);
    expect(foundation).toContain("--font-display:");
    expect(foundation).toContain("--space-7:");
  });
});
