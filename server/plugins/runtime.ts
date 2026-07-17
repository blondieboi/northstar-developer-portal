import { getConfig, scoreWithConfig, scoresWithConfig } from "../config.js";
import {
  findServiceByRepository,
  listPluginSnapshots,
  listServices,
  pluginHealthRows,
  updateServiceScores,
  upsertPluginSnapshot,
} from "../db.js";
import { collectGitHubActions } from "./github-actions.js";
import { collectGitHubDeployments } from "./github-deployments.js";
import { collectGitHubMaintenance } from "./github-maintenance.js";
import { collectGitHubPullRequests } from "./github-pull-requests.js";
import { collectGitHubRepositoryStandards } from "./github-repository-standards.js";
import { collectGitHubSecurity } from "./github-security.js";
import {
  pluginById,
  pluginManifests,
  publicPluginCatalog,
  validatePluginSettings,
} from "./registry.js";

const collectors: Record<
  string,
  (
    service: Record<string, any>,
    config: Record<string, unknown>,
  ) => Promise<unknown>
> = {
  "github-actions": collectGitHubActions,
  "github-pull-requests": collectGitHubPullRequests,
  "github-repository-standards": collectGitHubRepositoryStandards,
  "github-deployments": collectGitHubDeployments,
  "github-security": collectGitHubSecurity,
  "github-maintenance": collectGitHubMaintenance,
};

export function enabledPluginSettings() {
  return getConfig()
    .integrations.plugins.filter((plugin) => plugin.enabled)
    .map((plugin) => ({
      plugin: pluginById(plugin.id)!,
      config: validatePluginSettings(plugin.id, plugin.config) as Record<
        string,
        unknown
      >,
    }));
}

async function pluginBundleForService(serviceName: string) {
  const enabled = new Set(
    enabledPluginSettings().map((item) => item.plugin.id),
  );
  const rows = await listPluginSnapshots("service", serviceName);
  const active = rows.filter((row: any) => enabled.has(row.plugin_id));
  return {
    facts: Object.fromEntries(
      active
        .filter((row: any) => row.data !== null && row.data !== undefined)
        .map((row: any) => [row.plugin_id, row.data]),
    ),
    states: Object.fromEntries(
      active.map((row: any) => [
        row.plugin_id,
        {
          status: row.status,
          error: row.error,
          observedAt: row.observed_at,
          expiresAt: row.expires_at,
        },
      ]),
    ),
  };
}

export async function pluginFactsForService(serviceName: string) {
  return (await pluginBundleForService(serviceName)).facts;
}

export async function recalculateServiceScorecards(
  service: Record<string, any>,
) {
  const bundle = await pluginBundleForService(service.name);
  const scorecards = scoresWithConfig(service.metadata, bundle.facts);
  const score = scoreWithConfig(service.metadata, bundle.facts);
  await updateServiceScores(service.id, score, scorecards);
  return {
    score,
    scorecards,
    plugins: bundle.facts,
    pluginStates: bundle.states,
  };
}

export async function refreshServicePlugins(service: Record<string, any>) {
  for (const { plugin, config } of enabledPluginSettings()) {
    const collect = collectors[plugin.id];
    if (!collect) continue;
    try {
      const data = await collect(service, config);
      await upsertPluginSnapshot({
        pluginId: plugin.id,
        entityKind: "service",
        entityKey: service.name,
        status: "ready",
        data,
        expiresAt: new Date(Date.now() + 5 * 60000),
      });
    } catch (error) {
      await upsertPluginSnapshot({
        pluginId: plugin.id,
        entityKind: "service",
        entityKey: service.name,
        status: "degraded",
        error: (error as Error).message,
        expiresAt: new Date(Date.now() + 60000),
      });
    }
  }
  return recalculateServiceScorecards(service);
}

export async function refreshRepositoryPlugins(repository: string) {
  const service = await findServiceByRepository(repository);
  if (service) return refreshServicePlugins(service);
  return null;
}
export async function refreshAllServicePlugins() {
  const services = (await listServices()) || [];
  for (const service of services) await refreshServicePlugins(service);
}
export async function recalculateAllServiceScorecards() {
  const services = (await listServices()) || [];
  for (const service of services) await recalculateServiceScorecards(service);
}

export async function decorateServicesWithPlugins(
  services: Array<Record<string, any>>,
) {
  return Promise.all(
    services.map(async (service) => ({
      ...service,
      ...(await recalculateServiceScorecards(service)),
    })),
  );
}

export async function pluginCatalogResponse() {
  const configured = new Map(
    getConfig().integrations.plugins.map((plugin) => [plugin.id, plugin]),
  );
  const health = new Map<string, any>();
  for (const row of await pluginHealthRows()) {
    const current = health.get(row.plugin_id);
    if (!current) health.set(row.plugin_id, row);
    else
      health.set(row.plugin_id, {
        ...current,
        status:
          current.status === "degraded" || row.status === "degraded"
            ? "degraded"
            : current.status,
        error: row.status === "degraded" ? row.error : current.error,
        expires_at:
          new Date(row.expires_at || 8640000000000000).getTime() <
          new Date(current.expires_at || 8640000000000000).getTime()
            ? row.expires_at
            : current.expires_at,
      });
  }
  return publicPluginCatalog().map((plugin) => {
    const settings = configured.get(plugin.id);
    const latest = health.get(plugin.id) as any;
    const environmentReady = Boolean(
      process.env.GITHUB_APP_ID &&
        (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_PATH),
    );
    const expired = Boolean(
      latest?.expires_at && new Date(latest.expires_at).getTime() < Date.now(),
    );
    return {
      ...plugin,
      enabled: Boolean(settings?.enabled),
      config: { ...plugin.defaults, ...settings?.config },
      health: !settings?.enabled
        ? { status: "disabled", message: "Plugin is disabled" }
        : !environmentReady
          ? {
              status: "degraded",
              message: "Required GitHub App credentials are missing",
            }
          : latest?.status === "degraded"
            ? {
                status: "degraded",
                message: latest.error || "Latest refresh failed",
                observedAt: latest.observed_at,
              }
            : expired
              ? {
                  status: "stale",
                  message: "Cached data is ready for refresh",
                  observedAt: latest.observed_at,
                }
              : {
                  status: "ready",
                  message: latest
                    ? "Data collection is healthy"
                    : "Ready for first refresh",
                  observedAt: latest?.observed_at || null,
                },
    };
  });
}
