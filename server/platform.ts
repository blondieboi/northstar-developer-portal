import YAML from "yaml";
import { installationOctokit } from "./github-app.js";
import type { ServiceRelationInput } from "./db.js";

type Metadata = Record<string, any>;
type ServiceRow = Record<string, any>;

export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await operation(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function parseEntityRef(value: string, fallbackKind = "service") {
  const [kind, ...rest] = value.split(":");
  return rest.length
    ? { kind: kind.toLowerCase(), key: rest.join(":") }
    : { kind: fallbackKind, key: value };
}

export function relationsFromMetadata(
  metadata: Metadata,
): ServiceRelationInput[] {
  const service = String(metadata?.metadata?.name || "unknown");
  const spec = metadata?.spec || {};
  const relations: ServiceRelationInput[] = [];
  if (spec.system && spec.system !== "Unassigned")
    relations.push({
      sourceKey: service,
      relationType: "part-of",
      targetKind: "system",
      targetKey: String(spec.system),
    });
  for (const dependency of spec.dependsOn || []) {
    const target = parseEntityRef(String(dependency));
    relations.push({
      sourceKey: service,
      relationType: "depends-on",
      targetKind: target.kind,
      targetKey: target.key,
    });
  }
  for (const api of spec.providesApis || []) {
    const target = parseEntityRef(String(api), "api");
    relations.push({
      sourceKey: service,
      relationType: "provides",
      targetKind: target.kind,
      targetKey: target.key,
    });
  }
  for (const api of spec.consumesApis || []) {
    const target = parseEntityRef(String(api), "api");
    relations.push({
      sourceKey: service,
      relationType: "consumes",
      targetKind: target.kind,
      targetKey: target.key,
    });
  }
  for (const resource of spec.resources || [])
    relations.push({
      sourceKey: service,
      relationType: String(resource.relation || "uses"),
      targetKind: String(resource.type || "resource"),
      targetKey: String(resource.name),
      metadata: resource.url ? { url: resource.url } : {},
    });
  return relations;
}

export function buildGraph(rows: {
  services: ServiceRow[];
  relations: ServiceRow[];
}) {
  const storedKeys = new Set(
    rows.relations.map(
      (relation) =>
        `${relation.source_kind}:${relation.source_key}:${relation.relation_type}:${relation.target_kind}:${relation.target_key}`,
    ),
  );
  const derived = rows.services.flatMap((service) =>
    relationsFromMetadata(service.metadata || {})
      .filter(
        (relation) =>
          !storedKeys.has(
            `${relation.sourceKind || "service"}:${relation.sourceKey}:${relation.relationType}:${relation.targetKind}:${relation.targetKey}`,
          ),
      )
      .map((relation, index) => ({
        id: `derived-${service.id}-${index}`,
        source_kind: relation.sourceKind || "service",
        source_key: relation.sourceKey,
        relation_type: relation.relationType,
        target_kind: relation.targetKind,
        target_key: relation.targetKey,
        metadata: relation.metadata || {},
      })),
  );
  const relationRows = [...rows.relations, ...derived];
  const nodes = new Map<string, Record<string, unknown>>();
  const add = (
    kind: string,
    key: string,
    extra: Record<string, unknown> = {},
  ) => {
    const id = `${kind}:${key}`;
    nodes.set(id, { id, kind, key, title: key, ...nodes.get(id), ...extra });
  };
  for (const service of rows.services)
    add("service", service.name, {
      title: service.metadata?.metadata?.title || service.name,
      owner: service.owner,
      tier: service.tier,
      lifecycle: service.lifecycle,
      score: service.score,
      repository: service.repository,
    });
  const edges = relationRows.map((relation) => {
    add(relation.source_kind, relation.source_key);
    add(relation.target_kind, relation.target_key, relation.metadata || {});
    return {
      id: String(relation.id),
      source: `${relation.source_kind}:${relation.source_key}`,
      target: `${relation.target_kind}:${relation.target_key}`,
      type: relation.relation_type,
    };
  });
  return { nodes: [...nodes.values()], edges };
}

const forbiddenSegments = new Set(["__proto__", "prototype", "constructor"]);
export function valueAtPath(value: Metadata, path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce((current: any, part) => current?.[part], value);
}

export function setAtPath(value: Metadata, path: string, next: unknown) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length || parts.some((part) => forbiddenSegments.has(part)))
    throw new Error("Metadata field path is invalid");
  const clone = structuredClone(value);
  let cursor = clone;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = next;
    else {
      if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
      cursor = cursor[part];
    }
  });
  return clone;
}

export function inferredValue(service: ServiceRow, fieldPath: string) {
  const candidates: Record<string, unknown> = {
    "metadata.description": service.description || undefined,
    "spec.owner": service.owner ? `team:${service.owner}` : undefined,
    "spec.system":
      service.system && service.system !== "Unassigned"
        ? service.system
        : undefined,
    "spec.language":
      service.language && service.language !== "Unknown"
        ? service.language
        : undefined,
    "spec.tier": service.tier || undefined,
    "spec.type": service.service_type || undefined,
  };
  const value = candidates[fieldPath];
  return {
    value,
    confidence: value === undefined ? "unavailable" : "inferred",
  };
}

export function campaignPreview(
  services: ServiceRow[],
  input: {
    fieldPath: string;
    desiredValue?: unknown;
    strategy?: "explicit" | "infer";
    filters?: {
      owners?: string[];
      tiers?: string[];
      types?: string[];
      services?: string[];
      lifecycles?: string[];
    };
  },
) {
  const filters = input.filters || {};
  return services
    .filter(
      (service) =>
        (!filters.owners?.length || filters.owners.includes(service.owner)) &&
        (!filters.tiers?.length || filters.tiers.includes(service.tier)) &&
        (!filters.types?.length ||
          filters.types.includes(service.service_type)) &&
        (!filters.services?.length ||
          filters.services.includes(service.name)) &&
        (!filters.lifecycles?.length ||
          filters.lifecycles.includes(service.lifecycle)),
    )
    .map((service) => {
      const before = valueAtPath(service.metadata || {}, input.fieldPath);
      const inferred = inferredValue(service, input.fieldPath);
      const after =
        input.strategy === "infer" ? inferred.value : input.desiredValue;
      if (
        after === undefined ||
        JSON.stringify(before) === JSON.stringify(after)
      )
        return null;
      return {
        serviceId: service.id,
        serviceName: service.name,
        repository: service.repository,
        beforeValue: before ?? null,
        afterValue: after,
        confidence:
          input.strategy === "infer" ? inferred.confidence : "explicit",
        patch: [
          {
            op: before === undefined ? "add" : "replace",
            path: input.fieldPath,
            before: before ?? null,
            after,
          },
        ],
      };
    })
    .filter(Boolean) as Array<Record<string, any>>;
}

export async function openMetadataPullRequest(input: {
  installationId: number;
  repository: string;
  metadataPath: string;
  fieldPath: string;
  value: unknown;
  title: string;
  body: string;
  branchPrefix: string;
}) {
  const [owner, repo] = input.repository.split("/");
  if (!owner || !repo) throw new Error("Repository must use owner/name format");
  const octokit = await installationOctokit(input.installationId);
  const repository = (
    await octokit.request("GET /repos/{owner}/{repo}", { owner, repo })
  ).data;
  const base = repository.default_branch;
  const [baseRef, contentResponse] = await Promise.all([
    await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
      owner,
      repo,
      ref: `heads/${base}`,
    }),
    octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: input.metadataPath,
      ref: base,
    }),
  ]);
  const content = contentResponse.data as any;
  if (Array.isArray(content) || !content.content)
    throw new Error("Service metadata path is not a file");
  const current = YAML.parse(
    Buffer.from(content.content, "base64").toString("utf8"),
  );
  if (
    JSON.stringify(valueAtPath(current, input.fieldPath)) ===
    JSON.stringify(input.value)
  )
    return { number: null, url: null, branch: null, alreadySatisfied: true };
  const branch = `${input.branchPrefix}-${Date.now().toString(36)}`
    .replace(/[^a-zA-Z0-9/_-]/g, "-")
    .slice(0, 120);
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseRef.data.object.sha,
  });
  try {
    const updated = setAtPath(current, input.fieldPath, input.value);
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: input.metadataPath,
      message: input.title,
      content: Buffer.from(YAML.stringify(updated, { lineWidth: 0 })).toString(
        "base64",
      ),
      sha: content.sha,
      branch,
    });
    const pull = (
      await octokit.request("POST /repos/{owner}/{repo}/pulls", {
        owner,
        repo,
        title: input.title,
        body: input.body,
        head: branch,
        base,
      })
    ).data;
    return {
      number: pull.number,
      url: pull.html_url,
      branch,
      alreadySatisfied: false,
    };
  } catch (error) {
    await octokit
      .request("DELETE /repos/{owner}/{repo}/git/refs/{ref}", {
        owner,
        repo,
        ref: `heads/${branch}`,
      })
      .catch(() => {});
    throw error;
  }
}

export function operationalSnapshot(service: ServiceRow) {
  const plugins = service.plugins || {};
  const deployments = plugins["github-deployments"] || {};
  const actions = plugins["github-actions"] || {};
  const security = plugins["github-security"] || {};
  const maintenance = plugins["github-maintenance"] || {};
  const operational = service.metadata?.spec?.operational || {};
  const links = service.metadata?.spec?.links || [];
  const link = (pattern: RegExp) =>
    links.find((candidate: any) => pattern.test(candidate.name || ""))?.url;
  const timeline = [
    ...(deployments.deployments || []).map((item: any) => ({
      type: "deployment",
      title: `${item.environment} deployment ${item.state}`,
      status: item.state,
      occurredAt: item.createdAt,
      url: item.url,
    })),
    ...(actions.runs || []).map((item: any) => ({
      type: "workflow",
      title: item.name,
      status: item.conclusion || item.status,
      occurredAt: item.updatedAt,
      url: item.url,
    })),
    ...(maintenance.issues || [])
      .filter((item: any) =>
        (item.labels || []).some((label: string) =>
          /incident|sev/i.test(label),
        ),
      )
      .map((item: any) => ({
        type: "incident",
        title: item.title,
        status: "open",
        occurredAt: item.updatedAt,
        url: item.url,
      })),
  ]
    .filter((item) => item.occurredAt)
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
    .slice(0, 20);
  return {
    service: service.name,
    repository: service.repository,
    onCall: operational.onCall || null,
    runbookUrl: operational.runbookUrl || link(/runbook/i) || null,
    dashboardUrl:
      operational.dashboardUrl || link(/dashboard|observability/i) || null,
    sloUrl: operational.sloUrl || link(/slo|reliability/i) || null,
    costUrl: operational.costUrl || link(/cost|finops/i) || null,
    deployments: deployments.deployments || [],
    latestDeploymentState: deployments.latestDeploymentState || null,
    openSecurityAlerts: security.openAlerts ?? null,
    criticalSecurityAlerts: security.criticalAlerts ?? null,
    openIncidents: timeline.filter(
      (item) => item.type === "incident" && item.status === "open",
    ).length,
    timeline,
  };
}
