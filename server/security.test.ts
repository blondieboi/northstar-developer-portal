import { describe, expect, it, vi } from "vitest";
import {
  browserSecurityHeaders,
  canMutateOwnedService,
  InMemoryRateLimiter,
  publicActionRunDto,
  publicApiRoutes,
  publicDocumentDto,
  publicRemediationDto,
  publicScoreHistoryDto,
  publicWaiverDto,
  requestOriginAllowed,
  webhookInstallationScope,
} from "./security.js";

describe("API security policy", () => {
  it("keeps only coarse and authentication bootstrap routes public", () => {
    expect([...publicApiRoutes].sort()).toEqual(
      [
        "/api/auth/callback",
        "/api/auth/login",
        "/api/auth/me",
        "/api/github/webhook",
        "/api/health",
        "/api/public/branding",
      ].sort(),
    );
    expect(publicApiRoutes.has("/api/services")).toBe(false);
    expect(publicApiRoutes.has("/api/github/status")).toBe(false);
    expect(publicApiRoutes.has("/api/onboarding")).toBe(false);
  });

  it("sets restrictive browser headers and enables HSTS only in production", () => {
    const headers = browserSecurityHeaders(true);
    expect(headers["content-security-policy"]).toContain("base-uri 'none'");
    expect(headers["content-security-policy"]).toContain(
      "img-src 'self' https://avatars.githubusercontent.com",
    );
    expect(headers["content-security-policy"]).not.toContain("data:");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(browserSecurityHeaders(false)).not.toHaveProperty(
      "strict-transport-security",
    );
  });

  it("requires an exact trusted origin for unsafe methods except webhooks", () => {
    const expectedOrigin = "https://portal.example.com";
    expect(
      requestOriginAllowed({
        method: "POST",
        routePath: "/api/events",
        origin: expectedOrigin,
        expectedOrigin,
      }),
    ).toBe(true);
    expect(
      requestOriginAllowed({
        method: "POST",
        routePath: "/api/events",
        origin: "https://evil.example.com",
        expectedOrigin,
      }),
    ).toBe(false);
    expect(
      requestOriginAllowed({
        method: "POST",
        routePath: "/api/events",
        expectedOrigin,
      }),
    ).toBe(false);
    expect(
      requestOriginAllowed({
        method: "POST",
        routePath: "/api/github/webhook",
        expectedOrigin,
      }),
    ).toBe(true);
  });

  it("allows service mutations only for owners or administrators", async () => {
    const membership = vi.fn(async (id: number, team: string) =>
      id === 42 && team === "payments",
    );
    await expect(
      canMutateOwnedService(
        { id: 1, role: "admin" },
        "payments",
        membership,
      ),
    ).resolves.toBe(true);
    expect(membership).not.toHaveBeenCalled();
    await expect(
      canMutateOwnedService(
        { id: 42, role: "member" },
        "payments",
        membership,
      ),
    ).resolves.toBe(true);
    await expect(
      canMutateOwnedService(
        { id: 43, role: "member" },
        "payments",
        membership,
      ),
    ).resolves.toBe(false);
    await expect(
      canMutateOwnedService(null, "payments", membership),
    ).resolves.toBe(false);
  });

  it("limits both shared IPs and authenticated users and resets windows", () => {
    const limiter = new InMemoryRateLimiter();
    expect(
      limiter.consume({
        bucket: "mutation",
        ip: "192.0.2.1",
        userId: 42,
        maximum: 1,
        windowMs: 1_000,
        now: 10_000,
      }),
    ).toBeNull();
    expect(
      limiter.consume({
        bucket: "mutation",
        ip: "192.0.2.2",
        userId: 42,
        maximum: 1,
        windowMs: 1_000,
        now: 10_100,
      }),
    ).toBe(1);
    expect(
      limiter.consume({
        bucket: "mutation",
        ip: "192.0.2.1",
        userId: 99,
        maximum: 1,
        windowMs: 1_000,
        now: 10_200,
      }),
    ).toBe(1);
    expect(
      limiter.consume({
        bucket: "mutation",
        ip: "192.0.2.1",
        userId: 42,
        maximum: 1,
        windowMs: 1_000,
        now: 11_100,
      }),
    ).toBeNull();
  });

  it("separates catalog and configuration webhook installation authority", () => {
    expect(
      webhookInstallationScope({
        installationId: 10,
        catalogInstallationIds: [10],
        configurationInstallationId: 20,
      }),
    ).toEqual({ allowed: true, catalog: true, configuration: false });
    expect(
      webhookInstallationScope({
        installationId: 20,
        catalogInstallationIds: [10],
        configurationInstallationId: 20,
      }),
    ).toEqual({ allowed: true, catalog: false, configuration: true });
    expect(
      webhookInstallationScope({
        installationId: 30,
        catalogInstallationIds: [10],
        configurationInstallationId: 20,
      }),
    ).toEqual({ allowed: false, catalog: false, configuration: false });
  });

  it("omits persistence and provider details from ordinary-user DTOs", () => {
    const sensitive = {
      id: 7,
      email: "private@example.com",
      bio: "private",
      role: "admin",
      installation_id: 99,
      inputs: { secret: "value" },
      error: "provider detail",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      recorded_at: "2026-01-03T00:00:00Z",
      fetched_at: "2026-01-04T00:00:00Z",
      source_updated_at: "2026-01-05T00:00:00Z",
      action_id: "deploy",
      repository: "acme/api",
      workflow: "deploy.yml",
      status: "ready",
      action_version: 1,
      score: 90,
      scorecards: { quality: 90 },
      scorecard_id: "quality",
      rule_id: "owner",
      reason: "temporary",
      expires_at: "2026-02-01T00:00:00Z",
      pr_number: 12,
      pr_url: "https://github.com/acme/api/pull/12",
      path: "README.md",
      title: "Readme",
      content: "Hello",
      service_name: "api",
      owner: "team:platform",
    };
    const dtos = [
      publicActionRunDto(sensitive),
      publicDocumentDto(sensitive, Date.parse("2026-01-06T00:00:00Z")),
      publicRemediationDto(sensitive),
      publicScoreHistoryDto(sensitive),
      publicWaiverDto(sensitive),
    ];
    for (const dto of dtos) {
      expect(dto).not.toHaveProperty("id");
      expect(dto).not.toHaveProperty("email");
      expect(dto).not.toHaveProperty("bio");
      expect(dto).not.toHaveProperty("role");
      expect(dto).not.toHaveProperty("installation_id");
      expect(dto).not.toHaveProperty("inputs");
      expect(dto).not.toHaveProperty("error");
      expect(dto).not.toHaveProperty("created_at");
      expect(dto).not.toHaveProperty("updated_at");
      expect(dto).not.toHaveProperty("recorded_at");
      expect(dto).not.toHaveProperty("fetched_at");
      expect(dto).not.toHaveProperty("source_updated_at");
    }
    expect(dtos[1]).toHaveProperty("source_age_days", 1);
  });
});
