import YAML from "yaml";
import { getConfig } from "./config.js";
import { installationOctokit } from "./github-app.js";
import { validateServiceMetadata } from "./github.js";
import { mapWithConcurrency } from "./platform.js";
import { pluginManifests } from "./plugins/registry.js";
import {
  intakeDraftSchema,
  type IntakeDraft,
} from "../src/intake-contract.js";

type Repository = {
  name: string;
  full_name: string;
  owner: { login: string };
  description?: string | null;
  language?: string | null;
  topics?: string[];
  archived?: boolean;
  fork?: boolean;
  default_branch?: string;
  html_url?: string;
  homepage?: string | null;
  pushed_at?: string | null;
};

export type IntakeEvidence = {
  field: keyof IntakeDraft;
  value: string;
  confidence: "explicit" | "strong" | "inferred" | "unavailable";
  source: string;
  detail: string;
};

type IntakeDiscovery = {
  candidates: ReturnType<typeof analyzeRepository>[];
  scannedAt: string;
  cached: boolean;
};

const discoveryCache = new Map<
  string,
  Omit<IntakeDiscovery, "cached"> & { expiresAt: number }
>();
const discoveryCacheMs = 60_000;

export function clearIntakeDiscoveryCache() {
  discoveryCache.clear();
}

const titleize = (value: string) =>
  value
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);

const has = (paths: string[], pattern: RegExp) => paths.some((path) => pattern.test(path));

export function analyzeRepository(
  repository: Repository,
  paths: string[],
  contents: Record<string, string> = {},
  now = new Date(),
) {
  const config = getConfig();
  const topics = repository.topics || [];
  const joined = `${paths.join("\n")}\n${Object.values(contents).join("\n")}`.toLowerCase();
  const codeowners = Object.entries(contents).find(([path]) => /codeowners$/i.test(path))?.[1] || "";
  const teamMatch = codeowners.match(/@[\w.-]+\/([\w.-]+)/);
  const userMatch = codeowners.match(/(?:^|\s)@([\w.-]+)(?:\s|$)/m);
  const owner = teamMatch ? `team:${slug(teamMatch[1])}` : userMatch ? userMatch[1] : "";
  const deployment = has(paths, /(^|\/)(vercel\.json|netlify\.toml|render\.yaml|fly\.toml|app\.json)$/i) || has(paths, /^\.github\/workflows\/.*(deploy|release|publish)/i);
  const frontend = has(paths, /(^|\/)(vite\.config|next\.config|nuxt\.config|astro\.config)/i) || /react|vue|svelte|next\.js|nuxt/.test(joined);
  const backend = /fastify|express|django|flask|rails|spring|gin-gonic|actix|nestjs/.test(joined) || has(paths, /(^|\/)(server|api)\//i);
  const pipeline = has(paths, /^\.github\/workflows\//i) && !frontend && !backend;
  const configuration = !frontend && !backend && has(paths, /(^|\/)(terraform|helm|kustomize|catalog|config)/i);
  const inferredType = frontend && backend ? "fullstack" : frontend ? "frontend" : backend ? "backend" : pipeline ? "pipeline" : configuration ? "configuration" : "";
  const typeAliases: Record<string, string[]> = {
    frontend: ["frontend", "webapp"],
    backend: ["backend", "service", "api"],
    fullstack: ["fullstack", "webapp", "portal"],
    pipeline: ["pipeline", "automation"],
    configuration: ["configuration", "config"],
  };
  const type = (typeAliases[inferredType] || []).find((id) =>
    config.catalog.types.some((item) => item.id === id),
  ) || "";
  const experimental = topics.some((topic) => /^(prototype|experiment|experimental|poc)$/.test(topic));
  const lifecycle = repository.archived && config.catalog.lifecycles.includes("deprecated")
    ? "deprecated"
    : experimental && config.catalog.lifecycles.includes("experimental")
      ? "experimental"
      : deployment && config.catalog.lifecycles.includes("production")
        ? "production"
        : "";
  const suggestedLifecycle = lifecycle || (config.catalog.lifecycles.includes("production") ? "production" : config.catalog.lifecycles[0]);
  const tierMatch = config.catalog.tiers.find((tier) =>
    topics.includes(tier.id) || topics.includes(`tier-${tier.id}`),
  );
  const tierTopic = tierMatch
    ? topics.find((topic) => topic === tierMatch.id || topic === `tier-${tierMatch.id}`)
    : undefined;
  const tier = tierMatch?.id || "";
  const systemTopic = topics.find((topic) => topic.startsWith("system-"));
  const dependencyTopics = topics
    .filter((topic) => topic.startsWith("depends-on-") && topic.length > "depends-on-".length)
    .map((topic) => `service:${topic.slice("depends-on-".length)}`);
  const docsPath = has(paths, /^docs\/.*\.md$/i) ? "docs" : "";
  const readme = has(paths, /^readme\.md$/i);
  const publicExposure = Boolean(repository.homepage) || deployment || topics.includes("public");
  const auth = /auth0|clerk|next-auth|passport|oauth|openid|firebase-auth|supabase\/auth/.test(joined);
  const database = /prisma|sequelize|typeorm|mongoose|postgres|mysql|database|supabase/.test(joined);
  const expiresAt = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const draft: IntakeDraft = {
    name: slug(repository.name),
    title: titleize(repository.name),
    description: repository.description || "",
    owner,
    lifecycle,
    tier,
    type,
    system: systemTopic?.slice("system-".length) || "",
    language: repository.language || "",
    docsPath,
    dependsOn: dependencyTopics.join(", "),
    exposure: "",
    dataSensitivity: "",
    authentication: "",
    expiresAt,
  };
  const evidence: IntakeEvidence[] = [
    { field: "name", value: draft.name, confidence: "explicit", source: "Repository name", detail: repository.full_name },
    { field: "description", value: draft.description, confidence: draft.description ? "explicit" : "unavailable", source: "GitHub description", detail: draft.description || "No repository description" },
    { field: "owner", value: owner, confidence: owner ? "strong" : "unavailable", source: "CODEOWNERS", detail: owner ? `Matched ${owner}` : "No team or user owner found" },
    { field: "lifecycle", value: suggestedLifecycle, confidence: lifecycle ? "strong" : "inferred", source: repository.archived ? "Archived state" : experimental ? "Repository topic" : deployment ? "Deployment workflow" : "Active repository", detail: repository.archived ? "Repository is archived" : experimental ? "Prototype or experiment topic found" : deployment ? "Deployment automation found" : `Suggested ${suggestedLifecycle}; confirm before onboarding` },
    { field: "type", value: type, confidence: type ? "strong" : "unavailable", source: "Repository structure", detail: type ? `Matched ${type} files or dependencies` : "No configured service type matched" },
    { field: "tier", value: tier, confidence: tier ? "explicit" : "unavailable", source: "Repository topics", detail: tierTopic || "No configured tier topic" },
    { field: "system", value: draft.system, confidence: draft.system ? "explicit" : "unavailable", source: "Repository topics", detail: systemTopic || "No system-* topic" },
    { field: "language", value: draft.language, confidence: draft.language ? "explicit" : "unavailable", source: "GitHub language", detail: draft.language || "Language unavailable" },
    { field: "docsPath", value: docsPath, confidence: docsPath || readme ? "explicit" : "unavailable", source: "Repository tree", detail: docsPath ? "Markdown found under docs/" : readme ? "Root README will be indexed automatically" : "No repository documentation found" },
    { field: "dependsOn", value: draft.dependsOn, confidence: dependencyTopics.length ? "explicit" : "unavailable", source: "Repository topics", detail: dependencyTopics.length ? `Matched ${dependencyTopics.join(", ")}` : "No depends-on-* catalog topics" },
    { field: "exposure", value: publicExposure ? "public" : "", confidence: publicExposure ? "inferred" : "unavailable", source: "Deployment evidence", detail: publicExposure ? "Suggested public; confirm from deployment context" : "Exposure needs confirmation" },
    { field: "dataSensitivity", value: database ? "internal" : "", confidence: database ? "inferred" : "unavailable", source: "Dependency evidence", detail: database ? "Suggested internal; persistence dependency found" : "Data sensitivity needs confirmation" },
    { field: "authentication", value: auth ? "required" : "", confidence: auth ? "inferred" : "unavailable", source: "Dependency evidence", detail: auth ? "Suggested required; authentication dependency found" : "Authentication needs confirmation" },
  ];
  const configured = new Map(config.integrations.plugins.map((plugin) => [plugin.id, plugin.enabled]));
  const pluginReasons: Record<string, string> = {
    "github-actions": has(paths, /^\.github\/workflows\//i) ? "Workflow files detected" : "Track delivery automation when added",
    "github-pull-requests": "Track review flow and stale work",
    "github-repository-standards": "Validate repository ownership and policy files",
    "github-deployments": deployment ? "Deployment automation detected" : "Track future GitHub deployments",
    "github-security": "Monitor code, dependency, and secret scanning",
    "github-maintenance": "Track repository activity and issue health",
  };
  const plugins = pluginManifests.map((plugin) => ({
    id: plugin.id,
    title: plugin.title,
    enabled: configured.get(plugin.id) === true,
    recommended: plugin.id !== "github-deployments" || deployment,
    reason: pluginReasons[plugin.id],
  }));
  const known = evidence.filter((item) => item.confidence !== "unavailable").length;
  return {
    repository: repository.full_name,
    url: repository.html_url || `https://github.com/${repository.full_name}`,
    defaultBranch: repository.default_branch || "main",
    archived: Boolean(repository.archived),
    fork: Boolean(repository.fork),
    pushedAt: repository.pushed_at || null,
    paths,
    draft,
    evidence,
    plugins,
    readiness: Math.round((known / evidence.length) * 100),
  };
}

async function repositoryEvidence(octokit: any, repository: Repository) {
  let paths: string[] = [];
  try {
    const tree = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner: repository.owner.login,
      repo: repository.name,
      tree_sha: repository.default_branch || "main",
      recursive: "1",
    });
    paths = (tree.data.tree || []).filter((item: any) => item.type === "blob").map((item: any) => item.path);
  } catch {
    try {
      const root = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: repository.owner.login,
        repo: repository.name,
        path: "",
      });
      paths = Array.isArray(root.data) ? root.data.filter((item: any) => item.type === "file").map((item: any) => item.path) : [];
    } catch (error) {
      return { paths: [], contents: {}, error: (error as Error).message };
    }
  }
  const useful = paths.filter((path) => /(^|\/)(codeowners|package\.json|requirements\.txt|pyproject\.toml|go\.mod|gemfile)$/i.test(path)).slice(0, 6);
  const contents: Record<string, string> = {};
  await Promise.all(useful.map(async (path) => {
    try {
      const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: repository.owner.login,
        repo: repository.name,
        path,
        ref: repository.default_branch || "main",
      });
      if (!Array.isArray(response.data) && response.data.content)
        contents[path] = Buffer.from(response.data.content, "base64").toString("utf8");
    } catch {}
  }));
  return { paths, contents };
}

export async function discoverIntakeCandidates(
  installationId: number,
  catalogRepositories: string[],
  options: { refresh?: boolean } = {},
): Promise<IntakeDiscovery> {
  const config = getConfig();
  const cacheKey = JSON.stringify({
    installationId,
    repositories: [...catalogRepositories]
      .map((repository) => repository.toLowerCase())
      .sort(),
    lifecycles: config.catalog.lifecycles,
    tiers: config.catalog.tiers.map((tier) => tier.id),
    types: config.catalog.types.map((type) => type.id),
    plugins: config.integrations.plugins.map((plugin) => [
      plugin.id,
      plugin.enabled,
    ]),
  });
  const cached = discoveryCache.get(cacheKey);
  if (!options.refresh && cached && cached.expiresAt > Date.now())
    return {
      candidates: structuredClone(cached.candidates),
      scannedAt: cached.scannedAt,
      cached: true,
    };
  const octokit = await installationOctokit(installationId);
  const repositories: Repository[] = [];
  for (let page = 1; ; page++) {
    const response = await octokit.request("GET /installation/repositories", { per_page: 100, page });
    repositories.push(...response.data.repositories);
    if (response.data.repositories.length < 100) break;
  }
  const tracked = new Set(catalogRepositories.map((item) => item.toLowerCase()));
  const untracked = repositories
    .filter((repository) => !tracked.has(repository.full_name.toLowerCase()))
    .sort(
      (left, right) =>
        Number(Boolean(left.archived)) - Number(Boolean(right.archived)) ||
        Number(Boolean(left.fork)) - Number(Boolean(right.fork)) ||
        new Date(right.pushed_at || 0).getTime() - new Date(left.pushed_at || 0).getTime(),
    );
  const candidates = await mapWithConcurrency(untracked, 5, async (repository) => {
    try {
      const evidence = await repositoryEvidence(octokit, repository);
      const candidate = analyzeRepository(repository, evidence.paths, evidence.contents);
      return evidence.error
        ? { ...candidate, scanError: `Repository evidence is unavailable: ${evidence.error}` }
        : candidate;
    } catch (error) {
      return {
        ...analyzeRepository(repository, [], {}),
        scanError: `Repository evidence is unavailable: ${(error as Error).message}`,
      };
    }
  });
  const scannedAt = new Date().toISOString();
  discoveryCache.set(cacheKey, {
    candidates,
    scannedAt,
    expiresAt: Date.now() + discoveryCacheMs,
  });
  return { candidates, scannedAt, cached: false };
}

export function intakeMetadata(input: unknown) {
  const draft = intakeDraftSchema.parse(input);
  if (!draft.owner?.trim()) throw new Error("An accountable owner is required");
  if (!draft.lifecycle) throw new Error("Confirm the service lifecycle before onboarding");
  if (!draft.exposure || !draft.dataSensitivity || !draft.authentication)
    throw new Error("Confirm exposure, data sensitivity, and authentication before onboarding");
  const metadata: any = {
    apiVersion: "northstar.dev/v1",
    kind: "Service",
    metadata: {
      name: slug(draft.name),
      title: draft.title.trim() || undefined,
      description: draft.description.trim(),
    },
    spec: {
      owner: draft.owner.trim(),
      lifecycle: draft.lifecycle,
      tier: draft.tier || undefined,
      type: draft.type || undefined,
      system: draft.system.trim() || undefined,
      language: draft.language.trim() || undefined,
      docsPath: draft.docsPath.trim() || undefined,
      dependsOn: draft.dependsOn
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    },
  };
  if (!metadata.spec.dependsOn.length) delete metadata.spec.dependsOn;
  metadata.spec.risk = {
    exposure: draft.exposure,
    dataSensitivity: draft.dataSensitivity,
    authentication: draft.authentication,
  };
  if (draft.lifecycle === "experimental") metadata.spec.experiment = { expiresAt: draft.expiresAt };
  return validateServiceMetadata(metadata);
}

export function intakePreview(draft: unknown) {
  const metadata = intakeMetadata(draft);
  return { metadata, yaml: YAML.stringify(metadata, { lineWidth: 0 }) };
}

export async function openIntakePullRequest(input: {
  installationId: number;
  repository: string;
  metadataPath: string;
  draft: IntakeDraft;
  actor: string;
}) {
  if (typeof input.repository !== "string" || !/^[^/]+\/[^/]+$/.test(input.repository))
    throw new Error("Repository must use owner/name format");
  const [owner, repo] = input.repository.split("/");
  const preview = intakePreview(input.draft);
  const octokit = await installationOctokit(input.installationId);
  const repository = (await octokit.request("GET /repos/{owner}/{repo}", { owner, repo })).data;
  const base = repository.default_branch;
  try {
    await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: input.metadataPath,
      ref: base,
    });
    return { number: null, url: null, branch: null, alreadyCataloged: true };
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
  }
  const baseRef = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${base}`,
  });
  const branch = `perongen/application-intake-${Date.now().toString(36)}`;
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseRef.data.object.sha,
  });
  try {
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: input.metadataPath,
      message: `chore: catalog ${preview.metadata.metadata.name}`,
      content: Buffer.from(preview.yaml).toString("base64"),
      branch,
    });
    const pull = (await octokit.request("POST /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      title: `chore: onboard ${preview.metadata.metadata.name} to Perongen`,
      body: `Add repository-owned service metadata generated from Application Intake.\n\nEvery inferred field was reviewed before this pull request was opened by @${input.actor}.`,
      head: branch,
      base,
    })).data;
    return { number: pull.number, url: pull.html_url, branch, alreadyCataloged: false };
  } catch (error) {
    await octokit.request("DELETE /repos/{owner}/{repo}/git/refs/{ref}", {
      owner,
      repo,
      ref: `heads/${branch}`,
    }).catch(() => {});
    throw error;
  }
}
