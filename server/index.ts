import Fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  catalogSummary,
  campaignTargets,
  createMetadataCampaign,
  createScorecardRemediation,
  createWaiver,
  decideWaiver,
  findServiceByName,
  graphRows,
  listAuditEvents,
  listMetadataCampaigns,
  listServiceDocuments,
  listServiceScoreHistory,
  listServices,
  listScorecardRemediations,
  listTeams,
  listUsers,
  listWaivers,
  listWebhooks,
  migrate,
  onboardingStats,
  portalAnalytics,
  recordAction,
  recordPortalEvent,
  recordSync,
  recordWebhook,
  setUserPrimaryTeam,
  updateCampaignFromPullRequest,
  updateCampaignStatus,
  updateCampaignTarget,
  updateRemediationFromPullRequest,
  upsertUser,
  webhookSeen,
} from "./db.js";
import {
  dispatchWorkflow,
  syncInstallation,
  syncRepository,
} from "./github.js";
import {
  beginLogin,
  currentUser,
  finishLogin,
  logout,
  requireAdmin,
  requireUser,
} from "./auth.js";
import {
  defaults,
  getBreakGlassAdmins,
  getConfig,
  isAdminLogin,
  type ConfigSection,
} from "./config.js";
import {
  documentationChanged,
  metadataChanged,
  pluginRefreshRequested,
  verifyWebhookSignature,
} from "./webhook.js";
import {
  commitIntegrations,
  commitSection,
  previewConfigChange,
  ConfigConflictError,
  ConfigUnavailableError,
  configDirectoryChanged,
  configPushMatches,
  getConfigSource,
  initializeGitConfig,
  startConfigPolling,
  syncGitConfig,
} from "./git-config.js";
import {
  decorateServicesWithPlugins,
  pluginCatalogResponse,
  pluginFactsForService,
  recalculateAllServiceScorecards,
  refreshAllServicePlugins,
  refreshRepositoryPlugins,
} from "./plugins/runtime.js";
import {
  buildGraph,
  campaignPreview,
  mapWithConcurrency,
  lifecycleProposal,
  openMetadataPullRequest,
  operationalSnapshot,
  valueAtPath,
} from "./platform.js";
import { backfillServiceDocuments } from "./documents.js";
import {
  discoverIntakeCandidates,
  intakePreview,
  openIntakePullRequest,
} from "./intake.js";
import type { IntakeDraft } from "../src/intake-contract.js";

const server = Fastify({ logger: true });
async function reconcileCampaignStatus(id: string | number) {
  const [campaign] = await listMetadataCampaigns(id);
  const targets = campaign?.targets || [];
  const complete =
    targets.length > 0 &&
    targets.every((target: any) =>
      ["completed", "excluded"].includes(target.status),
    );
  await updateCampaignStatus(id, complete ? "completed" : "active");
  return complete;
}
const validCampaignPath = (path: unknown) =>
  typeof path === "string" &&
  /^(metadata|spec)(\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(path) &&
  !path
    .split(".")
    .some((part) => ["__proto__", "prototype", "constructor"].includes(part));
await server.register(cors, { origin: true });
server.removeContentTypeParser("application/json");
server.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (_request, body, done) => {
    try {
      const value = JSON.parse(body.toString());
      Object.defineProperty(value, "__raw", { value: body, enumerable: false });
      done(null, value);
    } catch (e) {
      done(e as Error, undefined);
    }
  },
);
await migrate();
await initializeGitConfig(async (changed, config) => {
  if (changed.includes("scorecards") || changed.includes("catalog"))
    await recalculateAllServiceScorecards();
  if (changed.includes("integrations"))
    queueMicrotask(() => {
      refreshAllServicePlugins().catch((error) => server.log.error(error));
    });
  if (changed.includes("catalog") && config.catalog.installationId)
    queueMicrotask(() => {
      syncInstallation(config.catalog.installationId!).catch((error) =>
        server.log.error(error),
      );
    });
});
startConfigPolling();
queueMicrotask(() => {
  backfillServiceDocuments().catch((error) => server.log.error(error));
});

server.get("/api/health", async () => ({
  status: getConfigSource().status === "ready" ? "ok" : "degraded",
  database: Boolean(process.env.DATABASE_URL),
  github: Boolean(process.env.GITHUB_APP_ID),
  configuration: getConfigSource(),
}));
server.get("/api/services", async () => ({
  services: await decorateServicesWithPlugins((await listServices()) || []),
}));
server.get("/api/graph", async () => buildGraph(await graphRows()));
server.get<{ Querystring: { service?: string } }>(
  "/api/documents",
  async (request) => ({
    documents: await listServiceDocuments(request.query.service),
  }),
);
server.get<{ Params: { serviceName: string } }>(
  "/api/services/:serviceName/operations",
  async (request, reply) => {
    const service = await findServiceByName(request.params.serviceName);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const [decorated] = await decorateServicesWithPlugins([service]);
    return operationalSnapshot(decorated);
  },
);
server.get<{ Querystring: { service?: string } }>(
  "/api/standards/waivers",
  async (request) => ({ waivers: await listWaivers(request.query.service) }),
);
server.get<{ Params: { serviceName: string } }>(
  "/api/services/:serviceName/remediations",
  async (request, reply) => {
    const service = await findServiceByName(request.params.serviceName);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    return { remediations: await listScorecardRemediations(service.name) };
  },
);
server.post<{
  Params: { serviceName: string };
  Body: { action: "extend" | "promote" | "archive"; expiresAt?: string };
}>(
  "/api/services/:serviceName/lifecycle-actions",
  { preHandler: requireUser },
  async (request, reply) => {
    if (!["extend", "promote", "archive"].includes(request.body?.action))
      return reply.code(400).send({ error: "Lifecycle action is invalid" });
    const service = await findServiceByName(request.params.serviceName);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    if (!service.installation_id)
      return reply.code(400).send({ error: "Service GitHub installation is unavailable" });
    try {
      const proposal = lifecycleProposal(
        service,
        request.body,
        getConfig().catalog.lifecycles,
      );
      const user = await currentUser(request);
      const pull = await openMetadataPullRequest({
        installationId: Number(service.installation_id),
        repository: service.repository,
        metadataPath: service.metadata_path,
        fieldPath: proposal.fieldPath,
        value: proposal.value,
        title: proposal.title,
        body: `${proposal.guidance}\n\nOpened by @${user!.login} from Perongen lifecycle guardrails.`,
        branchPrefix: `perongen/lifecycle-${request.body.action}`,
      });
      await recordPortalEvent({
        eventType: `lifecycle.${request.body.action}`,
        actorLogin: user!.login,
        entityKind: "service",
        entityKey: service.name,
        properties: { pullRequest: pull.number, fieldPath: proposal.fieldPath, value: proposal.value },
      });
      return reply.code(pull.alreadySatisfied ? 200 : 201).send({ pullRequest: pull });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  },
);
server.post<{
  Params: { serviceName: string };
  Body: { scorecardId: string; ruleId: string };
}>(
  "/api/services/:serviceName/remediations/preview",
  { preHandler: requireUser },
  async (request, reply) => {
    const service = await findServiceByName(request.params.serviceName);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const card = getConfig().scorecards.cards.find(
      (candidate) => candidate.id === request.body?.scorecardId,
    );
    const rule = card?.rules.find(
      (candidate) => candidate.id === request.body?.ruleId,
    );
    if (
      !rule?.remediation ||
      rule.remediation.suggestedValue === undefined ||
      rule.source?.kind === "plugin"
    )
      return reply
        .code(400)
        .send({ error: "This rule does not define an automatic metadata fix" });
    return {
      preview: {
        serviceName: service.name,
        repository: service.repository,
        metadataPath: service.metadata_path,
        fieldPath: rule.path,
        beforeValue: valueAtPath(service.metadata || {}, rule.path) ?? null,
        afterValue: rule.remediation.suggestedValue,
        title: `chore: satisfy ${rule.title}`,
      },
    };
  },
);
server.post<{
  Body: {
    serviceName: string;
    scorecardId: string;
    ruleId: string;
    reason: string;
    expiresAt: string;
  };
}>(
  "/api/standards/waivers",
  { preHandler: requireUser },
  async (request, reply) => {
    const service = await findServiceByName(request.body?.serviceName);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    if (!request.body.reason?.trim())
      return reply.code(400).send({ error: "A waiver reason is required" });
    const expiry = new Date(request.body.expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= new Date())
      return reply
        .code(400)
        .send({ error: "Waiver expiry must be in the future" });
    const user = await currentUser(request);
    const waiver = await createWaiver({
      serviceId: service.id,
      scorecardId: request.body.scorecardId,
      ruleId: request.body.ruleId,
      reason: request.body.reason.trim(),
      requestedBy: user!.login,
      expiresAt: expiry.toISOString(),
    });
    await recordPortalEvent({
      eventType: "waiver.requested",
      actorLogin: user!.login,
      entityKind: "service",
      entityKey: service.name,
      properties: { ruleId: request.body.ruleId },
    });
    return reply.code(201).send({ waiver });
  },
);
server.post<{
  Params: { serviceName: string };
  Body: { scorecardId: string; ruleId: string };
}>(
  "/api/services/:serviceName/remediations",
  { preHandler: requireUser },
  async (request, reply) => {
    const service = await findServiceByName(request.params.serviceName);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const card = getConfig().scorecards.cards.find(
      (candidate) => candidate.id === request.body?.scorecardId,
    );
    const rule = card?.rules.find(
      (candidate) => candidate.id === request.body?.ruleId,
    );
    const remediation = rule?.remediation;
    if (!rule || !remediation || remediation.suggestedValue === undefined)
      return reply
        .code(400)
        .send({ error: "This rule does not define an automatic metadata fix" });
    if (rule.source?.kind === "plugin")
      return reply
        .code(400)
        .send({ error: "Provider-backed rules cannot be fixed as metadata" });
    if (!service.installation_id)
      return reply
        .code(400)
        .send({ error: "Service GitHub installation is unavailable" });
    const user = await currentUser(request);
    const pull = await openMetadataPullRequest({
      installationId: Number(service.installation_id),
      repository: service.repository,
      metadataPath: service.metadata_path,
      fieldPath: rule.path,
      value: remediation.suggestedValue,
      title: `chore: satisfy ${rule.title}`,
      body: `${remediation.guidance}\n\nOpened by @${user!.login} from Perongen standards remediation.`,
      branchPrefix: `perongen/remediate-${rule.id}`,
    });
    await recordPortalEvent({
      eventType: "remediation.opened",
      actorLogin: user!.login,
      entityKind: "service",
      entityKey: service.name,
      properties: {
        scorecardId: request.body.scorecardId,
        ruleId: rule.id,
        pullRequest: pull.number,
        pullRequestUrl: pull.url,
        alreadySatisfied: pull.alreadySatisfied,
      },
    });
    if (!pull.alreadySatisfied)
      await createScorecardRemediation({
        serviceId: service.id,
        serviceName: service.name,
        repository: service.repository,
        scorecardId: request.body.scorecardId,
        ruleId: rule.id,
        fieldPath: rule.path,
        beforeValue: valueAtPath(service.metadata || {}, rule.path),
        afterValue: remediation.suggestedValue,
        prNumber: pull.number!,
        prUrl: pull.url!,
        branch: pull.branch!,
        requestedBy: user!.login,
      });
    return reply
      .code(pull.alreadySatisfied ? 200 : 201)
      .send({ pullRequest: pull });
  },
);
server.post<{
  Body: {
    eventType: string;
    path?: string;
    entityKind?: string;
    entityKey?: string;
    properties?: Record<string, unknown>;
  };
}>("/api/events", async (request, reply) => {
  if (!request.body?.eventType || request.body.eventType.length > 80)
    return reply.code(400).send({ error: "Event type is required" });
  const user = await currentUser(request);
  await recordPortalEvent({
    eventType: request.body.eventType,
    actorLogin: user?.login,
    path: request.body.path,
    entityKind: request.body.entityKind,
    entityKey: request.body.entityKey,
    properties: request.body.properties || {},
  });
  return reply.code(202).send({ status: "recorded" });
});
server.get<{ Params: { serviceName: string } }>(
  "/api/services/:serviceName/score-history",
  async (request) => ({
    history: await listServiceScoreHistory(request.params.serviceName),
  }),
);
server.get("/api/teams", async () => ({ teams: await listTeams() }));
server.get("/api/users", async () => ({ users: await listUsers() }));
server.get("/api/summary", async () => {
  const summary = await catalogSummary();
  return {
    ...summary,
    services: await decorateServicesWithPlugins(summary.services || []),
  };
});
server.get("/api/portal", async () => ({
  general: getConfig().general,
  catalog: {
    tiers: getConfig().catalog.tiers,
    types: getConfig().catalog.types,
    lifecycles: getConfig().catalog.lifecycles,
  },
  scorecards: getConfig().scorecards,
  integrations: { plugins: await pluginCatalogResponse() },
  actions: getConfig().actions.definitions.filter(
    (a) => a.enabled && a.published,
  ),
  tools: getConfig().tools,
}));
server.get("/api/plugins", async () => ({
  plugins: await pluginCatalogResponse(),
}));
server.get<{ Params: { serviceName: string } }>(
  "/api/plugins/services/:serviceName",
  async (request) => ({
    plugins: await pluginFactsForService(request.params.serviceName),
  }),
);
server.post(
  "/api/admin/plugins/refresh",
  { preHandler: requireAdmin },
  async () => {
    await refreshAllServicePlugins();
    return { status: "refreshed" };
  },
);
server.get("/api/github/status", async () => ({
  configured: Boolean(
    process.env.GITHUB_APP_ID &&
    (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_PATH),
  ),
  oauth: Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  ),
  database: Boolean(process.env.DATABASE_URL),
  appId: process.env.GITHUB_APP_ID || null,
  configuration: getConfigSource(),
}));
server.get("/api/config/revision", async () => {
  const source = getConfigSource();
  return {
    appliedSha: source.appliedSha,
    status: source.status,
    error: source.error,
    syncedAt: source.syncedAt,
  };
});
server.get("/api/onboarding", async () => {
  const stats = await onboardingStats();
  const cfg = getConfig();
  const configSource = getConfigSource();
  const checks = {
    database: Boolean(process.env.DATABASE_URL),
    githubApp: Boolean(
      process.env.GITHUB_APP_ID &&
      (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_PATH),
    ),
    oauth: Boolean(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
    ),
    webhookSecret: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
    configRepository: Boolean(
      process.env.NORTHSTAR_CONFIG_REPOSITORY &&
      process.env.NORTHSTAR_CONFIG_BRANCH &&
      process.env.NORTHSTAR_CONFIG_DIRECTORY &&
      process.env.NORTHSTAR_CONFIG_INSTALLATION_ID,
    ),
    configRevision: configSource.status === "ready",
    administrator: Number(stats.users) > 0,
    installation: Boolean(
      cfg.catalog.installationId || process.env.GITHUB_INSTALLATION_ID,
    ),
    firstSync: Number(stats.syncs) > 0,
    firstService: Number(stats.services) > 0,
    scorecard: cfg.scorecards.cards.some(
      (card) => card.enabled && card.rules.some((rule) => rule.enabled),
    ),
    publishedAction: cfg.actions.definitions.some(
      (a) => a.enabled && a.published,
    ),
  };
  const publicUrl = (process.env.PUBLIC_URL || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const deployment = {
    DATABASE_URL: checks.database,
    GITHUB_APP_ID_and_private_key: checks.githubApp,
    GITHUB_OAuth: checks.oauth,
    GITHUB_WEBHOOK_SECRET: checks.webhookSecret,
    NORTHSTAR_CONFIG_REPOSITORY_and_location: checks.configRepository,
  };
  return {
    checks,
    complete: Object.values(checks).every(Boolean),
    stats,
    webhookUrl: `${publicUrl}/api/github/webhook`,
    webhookUrlPublic: !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(
      publicUrl,
    ),
    missingDeployment: Object.entries(deployment)
      .filter(([, ready]) => !ready)
      .map(([name]) => name),
    configSource,
  };
});
server.get("/api/auth/login", async (_request, reply) => beginLogin(reply));
server.get<{ Querystring: { code?: string; state?: string } }>(
  "/api/auth/callback",
  finishLogin,
);
server.get("/api/auth/me", async (request) => {
  const user = await currentUser(request);
  if (user)
    await upsertUser({
      githubId: user.id,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    });
  return { user };
});
server.post("/api/auth/logout", async (_request, reply) => logout(reply));
server.put<{ Body: { team: string } }>(
  "/api/me/primary-team",
  { preHandler: requireUser },
  async (request, reply) => {
    if (!request.body?.team)
      return reply.code(400).send({ error: "Team is required" });
    try {
      const user = await currentUser(request);
      return { user: await setUserPrimaryTeam(user!.login, request.body.team) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  },
);
server.post<{ Body?: { installationId?: number } }>(
  "/api/github/sync",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const installationId = Number(
      request.body?.installationId ||
        getConfig().catalog.installationId ||
        process.env.GITHUB_INSTALLATION_ID,
    );
    if (!Number.isInteger(installationId) || installationId <= 0)
      return reply.code(400).send({
        error:
          "A GitHub installation ID must be saved in Catalog settings or GITHUB_INSTALLATION_ID",
      });
    const results = await syncInstallation(installationId);
    return {
      installationId,
      results,
      registered: results.filter((x) => x.status === "registered").length,
      unregistered: results.filter((x) => x.status === "unregistered").length,
    };
  },
);
server.get<{ Querystring: { refresh?: string } }>(
  "/api/admin/intake",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const installationId = Number(
      getConfig().catalog.installationId || process.env.GITHUB_INSTALLATION_ID,
    );
    if (!Number.isInteger(installationId) || installationId <= 0)
      return reply.code(400).send({ error: "GitHub installation ID is not configured" });
    try {
      const [services, teams] = await Promise.all([listServices(), listTeams()]);
      const discovery = await discoverIntakeCandidates(
        installationId,
        (services || []).map((service: any) => service.repository),
        { refresh: request.query.refresh === "1" },
      );
      return {
        ...discovery,
        installationId,
        metadataPath: getConfig().catalog.serviceMetadataPath,
        teams: (teams || []).map((team: any) => ({ name: team.name, title: team.title })),
        catalog: {
          lifecycles: getConfig().catalog.lifecycles,
          tiers: getConfig().catalog.tiers,
          types: getConfig().catalog.types,
        },
      };
    } catch (error) {
      return reply.code(502).send({ error: `Repository discovery failed: ${(error as Error).message}` });
    }
  },
);
server.post<{ Body: { draft: IntakeDraft } }>(
  "/api/admin/intake/preview",
  { preHandler: requireAdmin },
  async (request, reply) => {
    try {
      return intakePreview(request.body?.draft);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  },
);
server.post<{ Body: { repository: string; draft: IntakeDraft } }>(
  "/api/admin/intake/onboard",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const installationId = Number(
      getConfig().catalog.installationId || process.env.GITHUB_INSTALLATION_ID,
    );
    if (!Number.isInteger(installationId) || installationId <= 0)
      return reply.code(400).send({ error: "GitHub installation ID is not configured" });
    try {
      const user = await currentUser(request);
      const pullRequest = await openIntakePullRequest({
        installationId,
        repository: request.body?.repository,
        metadataPath: getConfig().catalog.serviceMetadataPath,
        draft: request.body?.draft,
        actor: user!.login,
      });
      await recordPortalEvent({
        eventType: "application-intake.pull-request",
        actorLogin: user!.login,
        entityKind: "repository",
        entityKey: request.body.repository,
        properties: { pullRequest: pullRequest.number, alreadyCataloged: pullRequest.alreadyCataloged },
      });
      return reply.code(pullRequest.alreadyCataloged ? 200 : 201).send({ pullRequest });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  },
);
server.post<{ Body: { actionId: string; inputs?: Record<string, string> } }>(
  "/api/actions/dispatch",
  { preHandler: requireUser },
  async (request, reply) => {
    const action = getConfig().actions.definitions.find(
      (a) => a.id === request.body?.actionId && a.enabled && a.published,
    );
    if (!action)
      return reply.code(404).send({ error: "Published action not found" });
    const inputs = request.body?.inputs || {};
    for (const input of action.inputs) {
      const value = inputs[input.id];
      if (input.required && (value === undefined || value === ""))
        return reply.code(400).send({ error: `${input.label} is required` });
      if (
        value !== undefined &&
        input.type === "number" &&
        !Number.isFinite(Number(value))
      )
        return reply
          .code(400)
          .send({ error: `${input.label} must be a number` });
      if (
        value !== undefined &&
        input.type === "boolean" &&
        !["true", "false"].includes(String(value))
      )
        return reply
          .code(400)
          .send({ error: `${input.label} must be true or false` });
      if (
        value !== undefined &&
        input.type === "select" &&
        !input.options?.includes(String(value))
      )
        return reply
          .code(400)
          .send({ error: `${input.label} has an invalid option` });
    }
    const installationId =
      getConfig().catalog.installationId ||
      Number(process.env.GITHUB_INSTALLATION_ID);
    if (!installationId)
      return reply
        .code(400)
        .send({ error: "GitHub installation ID is not configured" });
    await dispatchWorkflow(
      installationId,
      action.repository,
      action.workflow,
      inputs,
    );
    const user = await currentUser(request);
    await recordAction(
      action.id,
      action.repository,
      action.workflow,
      inputs,
      user?.login,
      action.version,
    );
    await recordPortalEvent({
      eventType: "action.dispatch",
      actorLogin: user?.login,
      entityKind: "action",
      entityKey: action.id,
      properties: { repository: action.repository, version: action.version },
    });
    return reply.code(202).send({ status: "dispatched" });
  },
);

const configResponse = () => ({
  effective: getConfig(),
  source: getConfigSource(),
});
const configError = (reply: any, error: unknown) =>
  error instanceof ConfigConflictError
    ? reply.code(409).send({ error: error.message })
    : error instanceof ConfigUnavailableError
      ? reply.code(503).send({ error: error.message })
      : reply.code(400).send({ error: (error as Error).message });
server.get("/api/admin/config", { preHandler: requireAdmin }, async () =>
  configResponse(),
);
server.post(
  "/api/admin/config/refresh",
  { preHandler: requireAdmin },
  async (request, reply) => {
    try {
      const user = await currentUser(request);
      await syncGitConfig(user!.login);
      return configResponse();
    } catch (e) {
      return configError(reply, e);
    }
  },
);
server.post<{
  Params: { section: ConfigSection };
  Body: { value: unknown };
}>(
  "/api/admin/config/:section/preview",
  { preHandler: requireAdmin },
  async (request, reply) => {
    try {
      return previewConfigChange(request.params.section, request.body?.value);
    } catch (e) {
      return configError(reply, e);
    }
  },
);
server.put<{
  Params: { section: ConfigSection };
  Body: { value: unknown; expectedBlobSha?: string };
}>(
  "/api/admin/config/:section",
  { preHandler: requireAdmin },
  async (request, reply) => {
    try {
      const user = await currentUser(request);
      const actor = { login: user!.login, id: user!.id, name: user!.name };
      if (request.params.section === "integrations")
        await commitIntegrations(
          request.body?.value,
          request.body?.expectedBlobSha,
          actor,
        );
      else
        await commitSection(
          request.params.section,
          request.body?.value,
          request.body?.expectedBlobSha,
          actor,
        );
      return configResponse();
    } catch (e) {
      return configError(reply, e);
    }
  },
);
server.delete<{
  Params: { section: ConfigSection };
  Body: { expectedBlobSha?: string };
}>(
  "/api/admin/config/:section",
  { preHandler: requireAdmin },
  async (request, reply) => {
    try {
      const user = await currentUser(request);
      await commitSection(
        request.params.section,
        (defaults as any)[request.params.section],
        request.body?.expectedBlobSha,
        { login: user!.login, id: user!.id, name: user!.name },
      );
      return configResponse();
    } catch (e) {
      return configError(reply, e);
    }
  },
);
server.get("/api/admin/users", { preHandler: requireAdmin }, async () => ({
  users: (await listUsers()).map((user) => ({
    ...user,
    role: isAdminLogin(user.login) ? "admin" : "member",
    breakGlass: getBreakGlassAdmins().has(user.login.toLowerCase()),
  })),
}));
server.patch<{
  Params: { login: string };
  Body: { role: "admin" | "member"; expectedBlobSha: string };
}>(
  "/api/admin/users/:login",
  { preHandler: requireAdmin },
  async (request, reply) => {
    if (!["admin", "member"].includes(request.body?.role))
      return reply.code(400).send({ error: "Role must be admin or member" });
    if (
      request.body.role === "member" &&
      getBreakGlassAdmins().has(request.params.login.toLowerCase())
    )
      return reply.code(400).send({
        error: "Deployment break-glass administrators cannot be demoted",
      });
    try {
      const user = await currentUser(request);
      const admins = new Set(
        getConfig().access.admins.map((x) => x.toLowerCase()),
      );
      if (request.body.role === "admin")
        admins.add(request.params.login.toLowerCase());
      else admins.delete(request.params.login.toLowerCase());
      await commitSection(
        "access",
        { admins: [...admins].sort() },
        request.body.expectedBlobSha,
        { login: user!.login, id: user!.id, name: user!.name },
      );
      return {
        users: (await listUsers()).map((candidate) => ({
          ...candidate,
          role: isAdminLogin(candidate.login) ? "admin" : "member",
          breakGlass: getBreakGlassAdmins().has(candidate.login.toLowerCase()),
        })),
        source: getConfigSource(),
      };
    } catch (e) {
      return configError(reply, e);
    }
  },
);
server.get("/api/admin/audit", { preHandler: requireAdmin }, async () => ({
  events: await listAuditEvents(),
}));
server.get("/api/admin/webhooks", { preHandler: requireAdmin }, async () => ({
  deliveries: await listWebhooks(),
}));
server.get("/api/admin/campaigns", { preHandler: requireAdmin }, async () => ({
  campaigns: await listMetadataCampaigns(),
}));
server.get<{ Params: { id: string } }>(
  "/api/admin/campaigns/:id",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const [campaign] = await listMetadataCampaigns(request.params.id);
    return campaign
      ? { campaign }
      : reply.code(404).send({ error: "Campaign not found" });
  },
);
server.post<{
  Body: {
    fieldPath: string;
    desiredValue?: unknown;
    strategy?: "explicit" | "infer";
    filters?: Record<string, string[]>;
  };
}>(
  "/api/admin/campaigns/preview",
  { preHandler: requireAdmin },
  async (request, reply) => {
    if (!validCampaignPath(request.body?.fieldPath))
      return reply.code(400).send({
        error: "Metadata field must be a safe metadata.* or spec.* path",
      });
    if (
      request.body.strategy !== "infer" &&
      request.body.desiredValue === undefined
    )
      return reply.code(400).send({ error: "Desired value is required" });
    const targets = campaignPreview((await listServices()) || [], request.body);
    return { targets, targetCount: targets.length };
  },
);
server.post<{
  Body: {
    title: string;
    description?: string;
    fieldPath: string;
    desiredValue?: unknown;
    strategy?: "explicit" | "infer";
    filters?: Record<string, string[]>;
  };
}>(
  "/api/admin/campaigns",
  { preHandler: requireAdmin },
  async (request, reply) => {
    if (
      !request.body?.title?.trim() ||
      !validCampaignPath(request.body?.fieldPath)
    )
      return reply.code(400).send({
        error: "Campaign title and a safe metadata field are required",
      });
    if (
      request.body.strategy !== "infer" &&
      request.body.desiredValue === undefined
    )
      return reply.code(400).send({ error: "Desired value is required" });
    const targets = campaignPreview((await listServices()) || [], request.body);
    if (!targets.length)
      return reply
        .code(400)
        .send({ error: "No services require this metadata change" });
    const user = await currentUser(request);
    const campaign = await createMetadataCampaign({
      title: request.body.title.trim(),
      description: request.body.description?.trim() || "",
      fieldPath: request.body.fieldPath,
      desiredValue:
        request.body.strategy === "infer"
          ? { strategy: "infer" }
          : request.body.desiredValue,
      filters: request.body.filters || {},
      createdBy: user!.login,
      targets: targets as any,
    });
    await recordPortalEvent({
      eventType: "campaign.created",
      actorLogin: user!.login,
      entityKind: "campaign",
      entityKey: String((campaign as any).id),
      properties: { targets: targets.length },
    });
    return reply.code(201).send({ campaign, targets });
  },
);
server.post<{ Params: { id: string }; Body: { limit?: number } }>(
  "/api/admin/campaigns/:id/launch",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const [campaign] = await listMetadataCampaigns(request.params.id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
    const limit = Math.max(1, Math.min(100, Number(request.body?.limit || 10)));
    const targets = (await campaignTargets(request.params.id)).slice(0, limit);
    if (!targets.length)
      return reply.code(400).send({ error: "No pending or failed targets" });
    await updateCampaignStatus(request.params.id, "active");
    const user = await currentUser(request);
    const results = await mapWithConcurrency(targets, 4, async (target) => {
      try {
        if (!target.installation_id)
          throw new Error(
            "GitHub installation is unavailable for this service",
          );
        const pull = await openMetadataPullRequest({
          installationId: Number(target.installation_id),
          repository: target.repository,
          metadataPath: target.metadata_path,
          fieldPath: campaign.field_path,
          value: target.after_value,
          title: `chore: ${campaign.title}`,
          body: `${campaign.description || "Organization-wide metadata maintenance."}\n\nCampaign #${campaign.id} opened by @${user!.login}.`,
          branchPrefix: `perongen/campaign-${campaign.id}`,
        });
        return await updateCampaignTarget(target.id, {
          status: pull.alreadySatisfied ? "completed" : "pr-open",
          prNumber: pull.number,
          prUrl: pull.url,
          branch: pull.branch,
        });
      } catch (error) {
        return await updateCampaignTarget(target.id, {
          status: "failed",
          error: (error as Error).message,
        });
      }
    });
    await recordPortalEvent({
      eventType: "campaign.launched",
      actorLogin: user!.login,
      entityKind: "campaign",
      entityKey: request.params.id,
      properties: {
        batchSize: limit,
        opened: results.filter((result: any) => result.status === "pr-open")
          .length,
        failed: results.filter((result: any) => result.status === "failed")
          .length,
      },
    });
    await reconcileCampaignStatus(request.params.id);
    return { results };
  },
);
server.patch<{
  Params: { id: string; targetId: string };
  Body: { excluded: boolean; reason?: string };
}>(
  "/api/admin/campaigns/:id/targets/:targetId",
  { preHandler: requireAdmin },
  async (request, reply) => {
    if (request.body?.excluded && !request.body.reason?.trim())
      return reply.code(400).send({ error: "Exclusions require a reason" });
    const target = await updateCampaignTarget(request.params.targetId, {
      status: request.body?.excluded ? "excluded" : "pending",
      exclusionReason: request.body?.excluded
        ? request.body.reason?.trim()
        : null,
    });
    await reconcileCampaignStatus(request.params.id);
    return { target };
  },
);
server.get("/api/admin/waivers", { preHandler: requireAdmin }, async () => ({
  waivers: await listWaivers(),
}));
server.patch<{
  Params: { id: string };
  Body: { status: "approved" | "rejected" };
}>(
  "/api/admin/waivers/:id",
  { preHandler: requireAdmin },
  async (request, reply) => {
    if (!["approved", "rejected"].includes(request.body?.status))
      return reply.code(400).send({ error: "Decision is invalid" });
    const user = await currentUser(request);
    return {
      waiver: await decideWaiver(
        request.params.id,
        request.body.status,
        user!.login,
      ),
    };
  },
);
server.get<{ Querystring: { days?: string } }>(
  "/api/admin/analytics",
  { preHandler: requireAdmin },
  async (request) => ({
    analytics: await portalAnalytics(Number(request.query.days || 30)),
  }),
);

server.post("/api/github/webhook", async (request, reply) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret)
    return reply
      .code(503)
      .send({ error: "GitHub webhook secret is not configured" });
  const signature = String(request.headers["x-hub-signature-256"] || "");
  const raw = (request.body as any)?.__raw as Buffer | undefined;
  if (!raw || !verifyWebhookSignature(raw, signature, secret))
    return reply.code(401).send({ error: "Webhook signature is invalid" });
  const deliveryId = String(request.headers["x-github-delivery"] || "unknown");
  const event = String(request.headers["x-github-event"] || "unknown");
  const body = request.body as any;
  const repository = body.repository?.full_name;
  const installationId = Number(body.installation?.id) || undefined;
  if (await webhookSeen(deliveryId))
    return reply.code(202).send({ status: "duplicate" });
  try {
    if (event === "pull_request" && repository && body.pull_request?.number) {
      const campaignId = await updateCampaignFromPullRequest({
        repository,
        prNumber: Number(body.pull_request.number),
        merged: Boolean(body.pull_request.merged),
        closed: body.action === "closed",
      });
      if (campaignId) {
        await reconcileCampaignStatus(campaignId);
        await recordWebhook({
          deliveryId,
          event,
          action: "campaign.update",
          repository,
          installationId,
          status: body.pull_request.merged ? "completed" : "applied",
          message: `Campaign #${campaignId} target updated`,
        });
        return reply.code(202).send({ status: "applied" });
      }
      const remediationId = await updateRemediationFromPullRequest({
        repository,
        prNumber: Number(body.pull_request.number),
        merged: Boolean(body.pull_request.merged),
        closed: body.action === "closed",
      });
      if (remediationId) {
        await recordWebhook({
          deliveryId,
          event,
          action: "remediation.update",
          repository,
          installationId,
          status: body.pull_request.merged ? "completed" : "applied",
          message: `Remediation #${remediationId} updated`,
        });
        return reply.code(202).send({ status: "applied" });
      }
    }
    if (
      event === "push" &&
      configPushMatches(body) &&
      configDirectoryChanged(body)
    ) {
      await syncGitConfig(`github:${body.sender?.login || "push"}`, body.after);
      await recordWebhook({
        deliveryId,
        event,
        action: "configuration.sync",
        repository,
        installationId,
        status: "applied",
        message: body.after,
      });
      return reply.code(202).send({ status: "applied" });
    }
    if (event === "push" && repository && installationId) {
      const paths = [
        getConfig().catalog.serviceMetadataPath,
        getConfig().catalog.teamMetadataPath,
      ];
      if (metadataChanged(body, paths) || documentationChanged(body)) {
        const [owner, name] = repository.split("/");
        const result = await syncRepository(installationId, owner, name);
        await recordSync(
          installationId,
          [result],
          result.status === "invalid" ? result.error : undefined,
        );
        await recordWebhook({
          deliveryId,
          event,
          action: documentationChanged(body)
            ? "catalog-and-documentation.sync"
            : "metadata.sync",
          repository,
          installationId,
          status: result.status,
          message: result.error,
        });
        return reply.code(202).send({ status: result.status });
      }
    }
    if (pluginRefreshRequested(event, repository)) {
      await refreshRepositoryPlugins(repository);
      await recordWebhook({
        deliveryId,
        event,
        action: "plugin.refresh",
        repository,
        installationId,
        status: "applied",
        message: "GitHub plugin data refreshed",
      });
      return reply.code(202).send({ status: "applied" });
    }
    await recordWebhook({
      deliveryId,
      event,
      action: body.action,
      repository,
      installationId,
      status: "ignored",
      message: "Event did not change configured metadata paths",
    });
    return reply.code(202).send({ status: "ignored" });
  } catch (e) {
    await recordWebhook({
      deliveryId,
      event,
      action: body.action,
      repository,
      installationId,
      status: "failed",
      message: (e as Error).message,
    });
    request.log.error(e);
    return reply.code(202).send({ status: "failed" });
  }
});

const dist = resolve(process.cwd(), "dist");
if (existsSync(dist)) {
  await server.register(staticFiles, { root: dist, wildcard: false });
  server.setNotFoundHandler((request, reply) =>
    request.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
}

await server.listen({
  port: Number(process.env.PORT || 4000),
  host: "0.0.0.0",
});
