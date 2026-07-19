export const publicApiRoutes = new Set([
  "/api/health",
  "/api/public/branding",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/me",
  "/api/github/webhook",
]);

export const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function browserSecurityHeaders(production: boolean) {
  return {
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'self'",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' https://avatars.githubusercontent.com",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
    "permissions-policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...(production
      ? {
          "strict-transport-security":
            "max-age=31536000; includeSubDomains",
        }
      : {}),
  };
}

export function requestOriginAllowed(input: {
  method: string;
  routePath: string;
  origin?: string;
  expectedOrigin: string;
}) {
  return (
    !unsafeMethods.has(input.method) ||
    input.routePath === "/api/github/webhook" ||
    input.origin === input.expectedOrigin
  );
}

type RateLimitWindow = { count: number; resetAt: number };

export class InMemoryRateLimiter {
  private readonly windows = new Map<string, RateLimitWindow>();
  private lastPrune = 0;

  consume(input: {
    bucket: string;
    ip: string;
    userId?: number;
    maximum: number;
    windowMs: number;
    now?: number;
  }) {
    const now = input.now ?? Date.now();
    if (now - this.lastPrune >= 60_000) {
      for (const [key, window] of this.windows)
        if (window.resetAt <= now) this.windows.delete(key);
      this.lastPrune = now;
    }
    const identities = [`ip:${input.ip}`];
    if (input.userId) identities.push(`user:${input.userId}`);
    let retryAfter = 0;
    for (const identity of identities) {
      const key = `${input.bucket}:${identity}`;
      const previous = this.windows.get(key);
      const current =
        !previous || previous.resetAt <= now
          ? { count: 0, resetAt: now + input.windowMs }
          : previous;
      current.count += 1;
      this.windows.set(key, current);
      if (current.count > input.maximum)
        retryAfter = Math.max(
          retryAfter,
          Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        );
    }
    return retryAfter || null;
  }
}

export async function canMutateOwnedService(
  user: { id: number; role: "admin" | "member" } | null,
  owner: string,
  isTeamMember: (githubId: number, teamName: string) => Promise<boolean>,
) {
  if (user?.role === "admin") return true;
  return Boolean(user && (await isTeamMember(user.id, owner)));
}

export function webhookInstallationScope(input: {
  installationId?: number;
  catalogInstallationIds: Array<number | null | undefined>;
  configurationInstallationId?: number | null;
}) {
  const installationId = input.installationId;
  if (!installationId || !Number.isSafeInteger(installationId))
    return { allowed: false, catalog: false, configuration: false };
  const catalog = input.catalogInstallationIds.some(
    (candidate) =>
      Number.isSafeInteger(candidate) && Number(candidate) === installationId,
  );
  const configuration =
    Number.isSafeInteger(input.configurationInstallationId) &&
    Number(input.configurationInstallationId) === installationId;
  return { allowed: catalog || configuration, catalog, configuration };
}

export const publicDocumentDto = (
  document: Record<string, any>,
  now = Date.now(),
) => {
  const sourceTime = new Date(document.source_updated_at || "").getTime();
  return {
    path: document.path,
    title: document.title,
    content: document.content,
    source_age_days: Number.isFinite(sourceTime)
      ? Math.max(0, Math.floor((now - sourceTime) / 86_400_000))
      : null,
    service_name: document.service_name,
    repository: document.repository,
    owner: document.owner,
  };
};

export const publicScoreHistoryDto = (entry: Record<string, any>) => ({
  score: entry.score,
  scorecards: entry.scorecards,
});

export const publicWaiverDto = (waiver: Record<string, any>) => ({
  scorecard_id: waiver.scorecard_id,
  rule_id: waiver.rule_id,
  reason: waiver.reason,
  status: waiver.status,
  // Expiry is policy data required to decide whether the waiver is active.
  expires_at: waiver.expires_at,
});

export const publicRemediationDto = (remediation: Record<string, any>) => ({
  rule_id: remediation.rule_id,
  status: remediation.status,
  pr_number: remediation.pr_number,
  pr_url: remediation.pr_url,
});

export const publicActionRunDto = (action: Record<string, any>) => ({
  action_id: action.action_id,
  repository: action.repository,
  workflow: action.workflow,
  status: action.status,
  action_version: action.action_version,
});
