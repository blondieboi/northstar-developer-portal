import { describe, expect, it } from "vitest";
import {
  createSession,
  findSessionUser,
  findUserByGithubId,
  revokeSession,
  upsertUser,
} from "./db.js";

const profile = (githubId: number, login: string) => ({
  githubId,
  login,
  name: login,
  avatarUrl: "",
  role: "member",
});

describe("identity and session persistence", () => {
  it("updates renamed users by immutable GitHub ID", async () => {
    await upsertUser(profile(800001, "old-login"));
    await upsertUser(profile(800001, "new-login"));
    expect(await findUserByGithubId(800001)).toMatchObject({
      github_id: 800001,
      login: "new-login",
    });
  });

  it("rejects a case-insensitive login collision across GitHub IDs", async () => {
    await upsertUser(profile(800002, "Collision-Login"));
    await expect(upsertUser(profile(800003, "collision-login"))).rejects.toThrow(
      "another GitHub ID",
    );
  });

  it("enforces absolute session expiry and revocation", async () => {
    await upsertUser(profile(800004, "session-user"));
    await createSession({
      tokenHash: "active-hash",
      githubId: 800004,
      matchedOrganizations: ["acme"],
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await findSessionUser("active-hash")).toMatchObject({
      github_id: 800004,
      matched_organizations: ["acme"],
    });
    await revokeSession("active-hash");
    expect(await findSessionUser("active-hash")).toBeNull();

    await createSession({
      tokenHash: "expired-hash",
      githubId: 800004,
      matchedOrganizations: ["acme"],
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await findSessionUser("expired-hash")).toBeNull();
  });
});
