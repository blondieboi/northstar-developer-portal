import YAML from "yaml";
import { z } from "zod";
import {
  ensureTeam,
  recordSync,
  removeServiceByRepository,
  replaceServiceRelations,
  setTeamMembers,
  upsertService,
  upsertTeam,
  upsertUser,
} from "./db.js";
import {
  getConfig,
  isAdminLogin,
  scoreWithConfig,
  scoresWithConfig,
} from "./config.js";
import { installationOctokit } from "./github-app.js";
import { refreshServicePlugins } from "./plugins/runtime.js";
import { relationsFromMetadata } from "./platform.js";
import { syncServiceDocuments } from "./documents.js";

const metadataDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Date is invalid");

export const metadataSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal("Service"),
  metadata: z.object({
    name: z.string().min(1),
    title: z.string().optional(),
    description: z.string().default(""),
    tags: z.array(z.string()).optional(),
    annotations: z.record(z.string(), z.string()).optional(),
  }),
  spec: z.object({
    owner: z.string().min(1),
    lifecycle: z.string().min(1),
    tier: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    system: z.string().optional(),
    language: z.string().optional(),
    risk: z
      .object({
        exposure: z.enum(["internal", "public"]),
        dataSensitivity: z.enum(["none", "internal", "confidential", "restricted"]),
        authentication: z.enum(["none", "optional", "required"]),
      })
      .strict()
      .optional(),
    experiment: z
      .object({ expiresAt: metadataDate })
      .strict()
      .optional(),
    links: z
      .array(z.object({ name: z.string(), url: z.string().url() }))
      .optional(),
    dependsOn: z.array(z.string().min(1)).optional(),
    providesApis: z.array(z.string().min(1)).optional(),
    consumesApis: z.array(z.string().min(1)).optional(),
    resources: z
      .array(
        z.object({
          name: z.string().min(1),
          type: z.string().min(1),
          relation: z.string().min(1).default("uses"),
          url: z.string().url().optional(),
        }),
      )
      .optional(),
    docsPath: z.string().min(1).optional(),
    operational: z
      .object({
        onCall: z.string().optional(),
        runbookUrl: z.string().url().optional(),
        dashboardUrl: z.string().url().optional(),
        sloUrl: z.string().url().optional(),
        costUrl: z.string().url().optional(),
      })
      .optional(),
  }),
});

export const teamSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal("Team"),
  metadata: z.object({
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(""),
  }),
  spec: z.object({
    members: z.array(z.string().min(1)).default([]),
    links: z
      .array(z.object({ name: z.string().min(1), url: z.string().url() }))
      .default([]),
  }),
});

export function scoreMetadata(value: z.infer<typeof metadataSchema>) {
  return scoreWithConfig(value);
}

export function validateServiceMetadata(value: unknown) {
  const parsed = metadataSchema.parse(value);
  const config = getConfig();
  if (!config.catalog.lifecycles.includes(parsed.spec.lifecycle))
    throw new Error(`Unsupported lifecycle: ${parsed.spec.lifecycle}`);
  if (
    parsed.spec.tier &&
    !config.catalog.tiers.some((tier) => tier.id === parsed.spec.tier)
  )
    throw new Error(`Unsupported tier: ${parsed.spec.tier}`);
  if (
    parsed.spec.type &&
    !config.catalog.types.some((type) => type.id === parsed.spec.type)
  )
    throw new Error(`Unsupported service type: ${parsed.spec.type}`);
  if (parsed.spec.lifecycle === "experimental" && !parsed.spec.experiment?.expiresAt)
    throw new Error("Experimental services require spec.experiment.expiresAt");
  if (parsed.spec.lifecycle !== "experimental" && parsed.spec.experiment)
    throw new Error("spec.experiment is only valid for experimental services");
  return parsed;
}

export async function syncInstallation(installationId: number) {
  const octokit = await installationOctokit(installationId);
  const repositories: Array<{
    owner: { login: string };
    name: string;
    full_name: string;
    language?: string | null;
  }> = [];
  for (let page = 1; ; page++) {
    const response = await octokit.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });
    repositories.push(...response.data.repositories);
    if (response.data.repositories.length < 100) break;
  }
  const results: { repository: string; status: string; error?: string }[] = [];
  for (const repository of repositories) {
    const repo = repository;
    try {
      const contentResponse = await octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: repo.owner.login,
          repo: repo.name,
          path: getConfig().catalog.serviceMetadataPath,
        },
      );
      if (
        Array.isArray(contentResponse.data) ||
        !("content" in contentResponse.data)
      )
        continue;
      const parsed = validateServiceMetadata(
        YAML.parse(
          Buffer.from(contentResponse.data.content, "base64").toString("utf8"),
        ),
      );
      const owner = parsed.spec.owner.replace(/^team:/, "");
      await ensureTeam(owner);
      const service = await upsertService({
        name: parsed.metadata.name,
        description: parsed.metadata.description,
        owner,
        system: parsed.spec.system || "Unassigned",
        lifecycle: parsed.spec.lifecycle,
        tier: parsed.spec.tier || null,
        serviceType: parsed.spec.type || null,
        language: parsed.spec.language || repo.language || "Unknown",
        repository: repo.full_name,
        metadataPath: getConfig().catalog.serviceMetadataPath,
        metadata: parsed,
        score: scoreMetadata(parsed),
        scorecards: scoresWithConfig(parsed),
        installationId,
      });
      if ((service as any)?.id) {
        await replaceServiceRelations(
          (service as any).id,
          relationsFromMetadata(parsed),
        );
        await syncServiceDocuments(
          octokit,
          service as any,
          parsed.spec.docsPath,
        );
      }
      await refreshServicePlugins(service as any);
      results.push({ repository: repo.full_name, status: "registered" });
    } catch (error) {
      const status =
        (error as { status?: number }).status === 404
          ? "unregistered"
          : "invalid";
      results.push({
        repository: repo.full_name,
        status,
        error: status === "invalid" ? (error as Error).message : undefined,
      });
    }
    try {
      const teamResponse = await octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: repo.owner.login,
          repo: repo.name,
          path: getConfig().catalog.teamMetadataPath,
        },
      );
      if (!Array.isArray(teamResponse.data) && "content" in teamResponse.data) {
        const teamData = teamSchema.parse(
          YAML.parse(
            Buffer.from(teamResponse.data.content, "base64").toString("utf8"),
          ),
        );
        const team = await upsertTeam({
          name: teamData.metadata.name,
          title: teamData.metadata.title,
          description: teamData.metadata.description,
          links: teamData.spec.links,
        });
        const userIds = [];
        for (const login of teamData.spec.members) {
          const response = await octokit.request("GET /users/{username}", {
            username: login,
          });
          const profile = response.data;
          const user = (await upsertUser({
            githubId: profile.id,
            login: profile.login,
            name: profile.name || profile.login,
            avatarUrl: profile.avatar_url,
            email: profile.email,
            bio: profile.bio,
            role: isAdminLogin(profile.login) ? "admin" : "member",
          })) as { id?: string };
          if (user?.id) userIds.push(user.id);
        }
        if (team?.id) await setTeamMembers(team.id, userIds);
      }
    } catch (error) {
      if ((error as { status?: number }).status !== 404)
        results.push({
          repository: repo.full_name,
          status: "invalid",
          error: `team.yaml: ${(error as Error).message}`,
        });
    }
  }
  await recordSync(installationId, results);
  return results;
}

export async function syncRepository(
  installationId: number,
  owner: string,
  name: string,
) {
  const octokit = await installationOctokit(installationId);
  const repository = (
    await octokit.request("GET /repos/{owner}/{repo}", { owner, repo: name })
  ).data;
  const fullName = repository.full_name;
  let serviceStatus: "registered" | "unregistered" | "invalid" = "unregistered";
  let error: string | undefined;
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo: name, path: getConfig().catalog.serviceMetadataPath },
    );
    if (Array.isArray(response.data) || !("content" in response.data))
      throw Object.assign(new Error("Metadata path is not a file"), {
        status: 422,
      });
    const parsed = validateServiceMetadata(
      YAML.parse(Buffer.from(response.data.content, "base64").toString("utf8")),
    );
    const team = parsed.spec.owner.replace(/^team:/, "");
    await ensureTeam(team);
    const service = await upsertService({
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      owner: team,
      system: parsed.spec.system || "Unassigned",
      lifecycle: parsed.spec.lifecycle,
      tier: parsed.spec.tier || null,
      serviceType: parsed.spec.type || null,
      language: parsed.spec.language || repository.language || "Unknown",
      repository: fullName,
      metadataPath: getConfig().catalog.serviceMetadataPath,
      metadata: parsed,
      score: scoreMetadata(parsed),
      scorecards: scoresWithConfig(parsed),
      installationId,
    });
    if ((service as any)?.id) {
      await replaceServiceRelations(
        (service as any).id,
        relationsFromMetadata(parsed),
      );
      await syncServiceDocuments(octokit, service as any, parsed.spec.docsPath);
    }
    await refreshServicePlugins(service as any);
    serviceStatus = "registered";
  } catch (e) {
    if ((e as { status?: number }).status === 404) {
      await removeServiceByRepository(fullName);
      serviceStatus = "unregistered";
    } else {
      serviceStatus = "invalid";
      error = (e as Error).message;
    }
  }
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo: name, path: getConfig().catalog.teamMetadataPath },
    );
    if (!Array.isArray(response.data) && "content" in response.data) {
      const parsed = teamSchema.parse(
        YAML.parse(
          Buffer.from(response.data.content, "base64").toString("utf8"),
        ),
      );
      const team = await upsertTeam({
        name: parsed.metadata.name,
        title: parsed.metadata.title,
        description: parsed.metadata.description,
        links: parsed.spec.links,
      });
      const ids = [];
      for (const login of parsed.spec.members) {
        const profile = (
          await octokit.request("GET /users/{username}", { username: login })
        ).data;
        const user = (await upsertUser({
          githubId: profile.id,
          login: profile.login,
          name: profile.name || profile.login,
          avatarUrl: profile.avatar_url,
          email: profile.email,
          bio: profile.bio,
          role: isAdminLogin(profile.login) ? "admin" : "member",
        })) as { id?: string };
        if (user?.id) ids.push(user.id);
      }
      if (team?.id) await setTeamMembers(team.id, ids);
    }
  } catch (e) {
    if ((e as { status?: number }).status !== 404) {
      serviceStatus = "invalid";
      error = `team metadata: ${(e as Error).message}`;
    }
  }
  return { repository: fullName, status: serviceStatus, error };
}

export async function dispatchWorkflow(
  installationId: number,
  repository: string,
  workflow: string,
  inputs: Record<string, string>,
) {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Repository must use owner/name format");
  const octokit = await installationOctokit(installationId);
  await octokit.request(
    "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches",
    { owner, repo, workflow_id: workflow, ref: "main", inputs },
  );
}
