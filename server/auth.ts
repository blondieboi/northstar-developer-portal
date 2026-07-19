import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  consumeOAuthState,
  createSession,
  findSessionUser,
  revokeSession,
  storeOAuthState,
  upsertUser,
} from "./db.js";
import {
  getAllowedOrganizations,
  isAdminGithubId,
} from "./config.js";

export type SessionUser = {
  id: number;
  login: string;
  name: string;
  avatarUrl: string;
  role: "admin" | "member";
  primaryTeam: string | null;
};

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000;
const githubHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "perongen-portal",
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const cookie = (request: FastifyRequest, name: string) =>
  request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const production = () => process.env.NODE_ENV === "production";
export const sessionCookieName = () =>
  production() ? "__Host-perongen_session" : "perongen_session";
const oauthStateCookieName = () =>
  production() ? "__Host-perongen_oauth_state" : "perongen_oauth_state";
const cookieFlags = (maxAgeSeconds: number) =>
  `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${production() ? "; Secure" : ""}`;
const expireCookie = (name: string) =>
  `${name}=; ${cookieFlags(0)}`;

export const oauthCallbackUrl = () =>
  `${(process.env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/api/auth/callback`;
export const frontendUrl = () =>
  `${(process.env.APP_URL || process.env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/`;

export async function currentUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = cookie(request, sessionCookieName());
  if (!token) return null;
  const stored = await findSessionUser(digest(token));
  if (!stored || !Number.isSafeInteger(Number(stored.github_id))) return null;
  const matchedOrganizations = Array.isArray(stored.matched_organizations)
    ? stored.matched_organizations.map((organization: unknown) => String(organization).toLowerCase())
    : [];
  let allowedOrganizations: Set<string>;
  try {
    allowedOrganizations = getAllowedOrganizations();
  } catch {
    return null;
  }
  if (!matchedOrganizations.some((organization: string) => allowedOrganizations.has(organization)))
    return null;
  const githubId = Number(stored.github_id);
  return {
    id: githubId,
    login: String(stored.login),
    name: String(stored.name || stored.login),
    avatarUrl: String(stored.avatar_url || ""),
    role: isAdminGithubId(githubId) ? "admin" : "member",
    primaryTeam: stored.primary_team ? String(stored.primary_team) : null,
  };
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  if (!(await currentUser(request)))
    return reply.code(401).send({ error: "Sign in with GitHub to continue" });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await currentUser(request);
  if (!user)
    return reply.code(401).send({ error: "Sign in with GitHub to continue" });
  if (user.role !== "admin")
    return reply.code(403).send({ error: "Administrator access is required" });
}

export async function beginLogin(reply: FastifyReply) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId)
    return reply.code(503).send({ error: "GitHub OAuth is not configured" });
  let allowedOrganizations: Set<string>;
  try {
    allowedOrganizations = getAllowedOrganizations();
  } catch {
    return reply.code(503).send({ error: "GitHub organization access is not configured" });
  }
  if (!allowedOrganizations.size)
    return reply.code(503).send({ error: "GitHub organization access is not configured" });
  const state = randomBytes(32).toString("base64url");
  await storeOAuthState(digest(state), new Date(Date.now() + OAUTH_STATE_LIFETIME_MS));
  reply.header(
    "set-cookie",
    `${oauthStateCookieName()}=${state}; ${cookieFlags(OAUTH_STATE_LIFETIME_MS / 1000)}`,
  );
  const params = new URLSearchParams({
    client_id: clientId,
    state,
    redirect_uri: oauthCallbackUrl(),
    scope: "read:org",
  });
  return reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

function sameSecretValue(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

async function activeOrganizationMemberships(accessToken: string) {
  const memberships = new Set<string>();
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `https://api.github.com/user/memberships/orgs?state=active&per_page=100&page=${page}`,
      { headers: githubHeaders(accessToken) },
    );
    if (!response.ok) throw new Error("GitHub organization verification failed");
    const data = (await response.json()) as Array<{
      state?: string;
      organization?: { login?: string };
    }>;
    if (!Array.isArray(data)) throw new Error("GitHub organization verification failed");
    for (const membership of data) {
      const login = membership.organization?.login;
      if (membership.state === "active" && login)
        memberships.add(login.toLowerCase());
    }
    if (data.length < 100) return memberships;
  }
  throw new Error("GitHub organization verification returned too many pages");
}

export async function finishLogin(
  request: FastifyRequest<{
    Querystring: { code?: string; state?: string; installation_id?: string };
  }>,
  reply: FastifyReply,
) {
  const savedState = cookie(request, oauthStateCookieName());
  const { code, state, installation_id: installationId } = request.query;
  reply.header("set-cookie", expireCookie(oauthStateCookieName()));
  if (installationId && !savedState) return reply.redirect("/api/auth/login");
  if (!code || !state || !sameSecretValue(savedState, state))
    return reply.code(400).send({ error: "OAuth state is invalid or expired" });
  if (!(await consumeOAuthState(digest(state))))
    return reply.code(400).send({ error: "OAuth state is invalid or expired" });

  let accessToken = "";
  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    if (!tokenResponse.ok)
      return reply.code(401).send({ error: "GitHub authorization failed" });
    const token = (await tokenResponse.json()) as { access_token?: string };
    accessToken = token.access_token || "";
    if (!accessToken)
      return reply.code(401).send({ error: "GitHub authorization failed" });

    const [userResponse, memberships] = await Promise.all([
      fetch("https://api.github.com/user", { headers: githubHeaders(accessToken) }),
      activeOrganizationMemberships(accessToken),
    ]);
    if (!userResponse.ok)
      return reply.code(401).send({ error: "GitHub authorization failed" });
    const profile = (await userResponse.json()) as {
      id?: number;
      login?: string;
      name?: string | null;
      avatar_url?: string;
      email?: string | null;
      bio?: string | null;
    };
    const githubId = Number(profile.id);
    if (!Number.isSafeInteger(githubId) || githubId <= 0 || !profile.login)
      return reply.code(401).send({ error: "GitHub authorization failed" });
    const matchedOrganizations = [...getAllowedOrganizations()].filter((org) =>
      memberships.has(org),
    );
    if (!matchedOrganizations.length)
      return reply.code(403).send({ error: "An active membership in an allowed GitHub organization is required" });

    const role = isAdminGithubId(githubId) ? "admin" : "member";
    await upsertUser({
      githubId,
      login: profile.login,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url || "",
      email: profile.email,
      bio: profile.bio,
      role,
    });
    const sessionToken = randomBytes(32).toString("base64url");
    await createSession({
      tokenHash: digest(sessionToken),
      githubId,
      matchedOrganizations,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    });
    reply.header(
      "set-cookie",
      [
        expireCookie(oauthStateCookieName()),
        `${sessionCookieName()}=${sessionToken}; ${cookieFlags(SESSION_LIFETIME_MS / 1000)}`,
      ],
    );
    return reply.redirect(frontendUrl());
  } catch {
    return reply.code(401).send({ error: "GitHub authorization failed" });
  } finally {
    accessToken = "";
  }
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const token = cookie(request, sessionCookieName());
  if (token) await revokeSession(digest(token));
  reply.header("set-cookie", expireCookie(sessionCookieName()));
  return { status: "signed_out" };
}
