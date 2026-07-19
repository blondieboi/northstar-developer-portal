import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  consumeOAuthState: vi.fn(),
  createSession: vi.fn(),
  findSessionUser: vi.fn(),
  revokeSession: vi.fn(),
  storeOAuthState: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./db.js", () => database);

import {
  beginLogin,
  currentUser,
  finishLogin,
  logout,
  sessionCookieName,
} from "./auth.js";

type TestReply = ReturnType<typeof reply>;
function reply() {
  const headers = new Map<string, any>();
  return {
    statusCode: 200,
    payload: undefined as unknown,
    location: "",
    headers,
    header: vi.fn((name: string, value: string | string[]) => {
      headers.set(name.toLowerCase(), value);
      return value;
    }),
    code: vi.fn(function (this: TestReply, statusCode: number) {
      this.statusCode = statusCode;
      return this;
    }),
    send: vi.fn(function (this: TestReply, payload: unknown) {
      this.payload = payload;
      return payload;
    }),
    redirect: vi.fn(function (this: TestReply, location: string) {
      this.location = location;
      return location;
    }),
  };
}

const request = (cookieHeader = "", query: Record<string, string> = {}) =>
  ({ headers: { cookie: cookieHeader }, query }) as any;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function oauthFetch(memberships: unknown, profile: unknown = {
  id: 42,
  login: "OctoCat",
  name: "Octo Cat",
  avatar_url: "https://avatars.githubusercontent.com/u/42",
}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("login/oauth/access_token"))
      return jsonResponse({ access_token: "temporary-token" });
    if (url.includes("memberships/orgs")) return jsonResponse(memberships);
    if (url === "https://api.github.com/user") return jsonResponse(profile);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function validState() {
  const loginReply = reply();
  await beginLogin(loginReply as any);
  const cookieValue = loginReply.headers.get("set-cookie")!.split(";")[0];
  const state = new URL(loginReply.location).searchParams.get("state")!;
  return { cookieValue, state };
}

describe("GitHub authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.GITHUB_CLIENT_ID = "client";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    process.env.GITHUB_ALLOWED_ORGANIZATIONS = "Acme, Platform-Partners";
    delete process.env.GITHUB_ADMIN_IDS;
    database.consumeOAuthState.mockResolvedValue(true);
    database.upsertUser.mockResolvedValue({ id: 1 });
    database.createSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a one-time state for the GitHub App authorization", async () => {
    const response = reply();
    await beginLogin(response as any);
    expect(database.storeOAuthState).toHaveBeenCalledWith(
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.any(Date),
    );
    const url = new URL(response.location);
    expect(url.searchParams.get("scope")).toBe("read:org");
    expect(response.headers.get("set-cookie")).toMatch(/^perongen_oauth_state=[A-Za-z0-9_-]+;/);
  });

  it("admits active membership in any allowed organization case-insensitively", async () => {
    const { cookieValue, state } = await validState();
    vi.stubGlobal("fetch", oauthFetch([
      { state: "active", organization: { login: "PLATFORM-PARTNERS" } },
      { state: "active", organization: { login: "unrelated" } },
    ]));
    const response = reply();
    await finishLogin(request(cookieValue, { code: "code", state }), response as any);
    expect(response.location).toBe("http://localhost:4000/");
    expect(database.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ githubId: 42, login: "OctoCat" }));
    expect(database.createSession).toHaveBeenCalledWith(expect.objectContaining({
      githubId: 42,
      matchedOrganizations: ["platform-partners"],
      tokenHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    }));
    expect(JSON.stringify(response.headers.get("set-cookie"))).not.toContain("OctoCat");
    expect(response.headers.get("set-cookie")).toHaveLength(2);
  });

  it("rejects pending or unrelated organization memberships", async () => {
    const { cookieValue, state } = await validState();
    vi.stubGlobal("fetch", oauthFetch([
      { state: "pending", organization: { login: "acme" } },
      { state: "active", organization: { login: "other" } },
    ]));
    const response = reply();
    await finishLogin(request(cookieValue, { code: "code", state }), response as any);
    expect(response.statusCode).toBe(403);
    expect(database.createSession).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub membership verification fails", async () => {
    const { cookieValue, state } = await validState();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("login/oauth/access_token")) return jsonResponse({ access_token: "token" });
      if (url === "https://api.github.com/user") return jsonResponse({ id: 42, login: "octocat" });
      return jsonResponse({}, false);
    }));
    const response = reply();
    await finishLogin(request(cookieValue, { code: "code", state }), response as any);
    expect(response.statusCode).toBe(401);
    expect(database.createSession).not.toHaveBeenCalled();
  });

  it("rejects a replayed OAuth state before exchanging the code", async () => {
    const { cookieValue, state } = await validState();
    database.consumeOAuthState.mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = reply();
    await finishLogin(request(cookieValue, { code: "code", state }), response as any);
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads identity only from an active server-side session", async () => {
    database.findSessionUser.mockResolvedValue({
      github_id: 42,
      login: "octocat",
      name: "Octo Cat",
      avatar_url: "https://avatars.githubusercontent.com/u/42",
      primary_team: "platform",
      matched_organizations: ["ACME"],
    });
    const user = await currentUser(request(`${sessionCookieName()}=opaque-token`));
    expect(database.findSessionUser).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
    expect(user).toMatchObject({ id: 42, login: "octocat", primaryTeam: "platform", role: "member" });
    database.findSessionUser.mockResolvedValue(null);
    expect(await currentUser(request(`${sessionCookieName()}=expired-token`))).toBeNull();
  });

  it("invalidates sessions when their admitted organizations leave the allowlist", async () => {
    database.findSessionUser.mockResolvedValue({
      github_id: 42,
      login: "octocat",
      name: "Octo Cat",
      avatar_url: "",
      matched_organizations: ["former-org"],
    });
    expect(await currentUser(request(`${sessionCookieName()}=opaque-token`))).toBeNull();
  });

  it("revokes the server-side session on logout and uses a Host cookie in production", async () => {
    process.env.NODE_ENV = "production";
    const response = reply();
    await logout(request("__Host-perongen_session=opaque-token"), response as any);
    expect(database.revokeSession).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
    expect(response.headers.get("set-cookie")).toBe("__Host-perongen_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
  });
});
