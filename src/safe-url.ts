const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const GITHUB_AVATAR_HOSTS = new Set(["avatars.githubusercontent.com"]);

function parseUrl(value: unknown, base?: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** Returns an absolute HTTP(S) URL, or null when the value is unsafe. */
export function safeExternalUrl(value: unknown) {
  const parsed = parseUrl(value);
  return parsed && HTTP_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
}

/**
 * Allows same-origin image assets and GitHub's dedicated avatar CDN. Repository
 * Markdown images are handled separately and are intentionally never rendered.
 */
export function safeUiImageUrl(
  value: unknown,
  origin = typeof window === "undefined" ? "https://perongen.invalid" : window.location.origin,
) {
  const parsed = parseUrl(value, origin);
  if (!parsed || !HTTP_PROTOCOLS.has(parsed.protocol)) return null;
  const expectedOrigin = parseUrl(origin)?.origin;
  if (parsed.origin === expectedOrigin || GITHUB_AVATAR_HOSTS.has(parsed.hostname))
    return parsed.href;
  return null;
}

/** Restricts repository-authored Markdown links to HTTP(S). */
export function safeMarkdownUrl(value: string) {
  return safeExternalUrl(value) || "";
}
