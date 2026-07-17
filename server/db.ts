import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export async function migrate() {
  if (!pool) return;
  const sql = await readFile(
    fileURLToPath(new URL("./schema.sql", import.meta.url)),
    "utf8",
  );
  await pool.query(sql);
}

export async function listServices() {
  if (!pool) return null;
  const { rows } = await pool.query(
    "select * from services order by updated_at desc",
  );
  return rows;
}

export async function findServiceByRepository(repository: string) {
  if (!pool) return null;
  return pool
    .query("select * from services where repository=$1", [repository])
    .then((result) => result.rows[0] || null);
}

export async function upsertService(service: Record<string, unknown>) {
  if (!pool) return service;
  const values = [
    service.name,
    service.description,
    service.owner,
    service.system,
    service.lifecycle,
    service.tier,
    service.serviceType,
    service.language,
    service.repository,
    service.metadataPath || ".portal/service.yaml",
    service.metadata,
    service.score,
    service.scorecards || {},
    service.installationId,
  ];
  const { rows } = await pool.query(
    `
    insert into services (name, description, owner, system, lifecycle, tier, service_type, language, repository, metadata_path, metadata, score, scorecards, installation_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    on conflict (name) do update set description=excluded.description, owner=excluded.owner,
      system=excluded.system, lifecycle=excluded.lifecycle, tier=excluded.tier, service_type=excluded.service_type, language=excluded.language,
      repository=excluded.repository, metadata_path=excluded.metadata_path, metadata=excluded.metadata, score=excluded.score, scorecards=excluded.scorecards,
      installation_id=excluded.installation_id, updated_at=now()
    returning *`,
    values,
  );
  return rows[0];
}
export async function updateServiceScores(
  id: string | number,
  score: number,
  scorecards: Record<string, number>,
) {
  if (!pool) return;
  const previous = await pool.query(
    "select score,scorecards from services where id=$1",
    [id],
  );
  const row = previous.rows[0];
  await pool.query("update services set score=$2,scorecards=$3 where id=$1", [
    id,
    score,
    scorecards,
  ]);
  if (
    !row ||
    Number(row.score) !== score ||
    JSON.stringify(row.scorecards) !== JSON.stringify(scorecards)
  )
    await pool.query(
      "insert into service_score_history(service_id,score,scorecards) values($1,$2,$3)",
      [id, score, scorecards],
    );
}
export async function listServiceScoreHistory(serviceName: string) {
  if (!pool) return [];
  return pool
    .query(
      `select h.score,h.scorecards,h.recorded_at from service_score_history h join services s on s.id=h.service_id where s.name=$1 order by h.recorded_at desc limit 90`,
      [serviceName],
    )
    .then((result) => result.rows);
}
export async function removeServiceByRepository(repository: string) {
  if (!pool) return;
  const removed = await pool.query(
    "delete from services where repository=$1 returning name",
    [repository],
  );
  for (const row of removed.rows)
    await pool.query(
      "delete from plugin_snapshots where entity_kind='service' and entity_key=$1",
      [row.name],
    );
}

export async function upsertPluginSnapshot(snapshot: {
  pluginId: string;
  entityKind: string;
  entityKey: string;
  status: string;
  data?: unknown;
  error?: string | null;
  expiresAt?: Date | null;
}) {
  if (!pool) return snapshot;
  const { rows } = await pool.query(
    `insert into plugin_snapshots(plugin_id,entity_kind,entity_key,status,data,error,observed_at,expires_at)
    values($1,$2,$3,$4,$5,$6,now(),$7) on conflict(plugin_id,entity_kind,entity_key) do update set
    status=excluded.status,data=coalesce(excluded.data,plugin_snapshots.data),error=excluded.error,observed_at=now(),expires_at=excluded.expires_at returning *`,
    [
      snapshot.pluginId,
      snapshot.entityKind,
      snapshot.entityKey,
      snapshot.status,
      snapshot.data ?? null,
      snapshot.error || null,
      snapshot.expiresAt || null,
    ],
  );
  return rows[0];
}
export async function listPluginSnapshots(
  entityKind?: string,
  entityKey?: string,
) {
  if (!pool) return [];
  if (entityKind && entityKey)
    return pool
      .query(
        "select * from plugin_snapshots where entity_kind=$1 and entity_key=$2",
        [entityKind, entityKey],
      )
      .then((result) => result.rows);
  if (entityKind)
    return pool
      .query("select * from plugin_snapshots where entity_kind=$1", [
        entityKind,
      ])
      .then((result) => result.rows);
  return pool
    .query("select * from plugin_snapshots")
    .then((result) => result.rows);
}
export async function pluginHealthRows() {
  if (!pool) return [];
  return pool
    .query(
      "select plugin_id,status,error,observed_at,expires_at from plugin_snapshots order by observed_at desc",
    )
    .then((result) => result.rows);
}

export async function ensureTeam(name: string) {
  if (!pool) return null;
  const title = name
    .split("-")
    .map((x) => x[0]?.toUpperCase() + x.slice(1))
    .join(" ");
  const { rows } = await pool.query(
    "insert into teams(name,title) values($1,$2) on conflict(name) do update set title=excluded.title returning *",
    [name, title],
  );
  return rows[0];
}

export async function upsertTeam(team: {
  name: string;
  title: string;
  description: string;
  links?: Array<{ name: string; url: string }>;
}) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `insert into teams(name,title,description,links) values($1,$2,$3,$4)
    on conflict(name) do update set title=excluded.title,description=excluded.description,links=excluded.links returning *`,
    [team.name, team.title, team.description, team.links || []],
  );
  return rows[0];
}

export async function setTeamMembers(
  teamId: string | number,
  userIds: Array<string | number>,
) {
  if (!pool) return;
  await pool.query("delete from team_members where team_id=$1", [teamId]);
  for (const userId of userIds)
    await pool.query(
      "insert into team_members(team_id,user_id) values($1,$2) on conflict do nothing",
      [teamId, userId],
    );
}

export async function upsertUser(user: {
  githubId: number;
  login: string;
  name: string;
  avatarUrl: string;
  email?: string | null;
  bio?: string | null;
  role: string;
}) {
  if (!pool) return user;
  const { rows } = await pool.query(
    `insert into users(github_id,login,name,avatar_url,email,bio,role,last_seen_at)
    values($1,$2,$3,$4,$5,$6,$7,now()) on conflict(login) do update set github_id=excluded.github_id,name=excluded.name,
    avatar_url=excluded.avatar_url,email=excluded.email,bio=excluded.bio,role=users.role,last_seen_at=now() returning *`,
    [
      user.githubId,
      user.login,
      user.name,
      user.avatarUrl,
      user.email || null,
      user.bio || null,
      user.role,
    ],
  );
  return rows[0];
}

export async function findUser(login: string) {
  if (!pool) return null;
  return pool
    .query("select * from users where lower(login)=lower($1)", [login])
    .then((x) => x.rows[0] || null);
}
export async function setUserPrimaryTeam(login: string, teamName: string) {
  if (!pool) return { login, primary_team: teamName };
  const membership = await pool.query(
    `select 1 from users u join team_members tm on tm.user_id=u.id join teams t on t.id=tm.team_id where lower(u.login)=lower($1) and t.name=$2`,
    [login, teamName],
  );
  if (!membership.rowCount)
    throw new Error("Primary team must be one of your team memberships");
  return (
    await pool.query(
      "update users set primary_team=$2 where lower(login)=lower($1) returning login,primary_team",
      [login, teamName],
    )
  ).rows[0];
}
export async function setUserRole(
  login: string,
  role: "admin" | "member",
  actor: string,
) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const before = (
      await client.query(
        "select login,role from users where lower(login)=lower($1) for update",
        [login],
      )
    ).rows[0];
    if (!before) throw new Error("User not found");
    if (before.role === "admin" && role === "member") {
      const count = Number(
        (await client.query("select count(*) from users where role='admin'"))
          .rows[0].count,
      );
      if (count <= 1)
        throw new Error("The final administrator cannot be demoted");
    }
    const after = (
      await client.query(
        "update users set role=$2 where lower(login)=lower($1) returning login,role",
        [login, role],
      )
    ).rows[0];
    await client.query(
      "insert into audit_events(category,action,actor_login,target,before_value,after_value) values($1,$2,$3,$4,$5,$6)",
      ["access", "role.changed", actor, login, before, after],
    );
    await client.query("commit");
    return after;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function getConfigOverrides() {
  if (!pool) return {};
  const { rows } = await pool.query(
    "select section,value from config_overrides",
  );
  return Object.fromEntries(rows.map((r) => [r.section, r.value]));
}
export async function getConfigState() {
  if (!pool) return null;
  return pool
    .query("select * from config_state where id=1")
    .then((x) => x.rows[0] || null);
}
export async function saveConfigState(state: {
  observedSha?: string | null;
  appliedSha?: string | null;
  config?: unknown;
  fileShas?: Record<string, string>;
  status: string;
  error?: string | null;
  applied: boolean;
}) {
  if (!pool) return;
  await pool.query(
    `insert into config_state(id,observed_sha,applied_sha,config,file_shas,status,error,synced_at,applied_at)
    values(1,$1,$2,$3,$4,$5,$6,now(),case when $7 then now() else null end)
    on conflict(id) do update set observed_sha=excluded.observed_sha,applied_sha=excluded.applied_sha,
      config=coalesce(excluded.config,config_state.config),file_shas=case when $7 then excluded.file_shas else config_state.file_shas end,
      status=excluded.status,error=excluded.error,synced_at=now(),applied_at=case when $7 then now() else config_state.applied_at end`,
    [
      state.observedSha || null,
      state.appliedSha || null,
      state.config || null,
      state.fileShas || {},
      state.status,
      state.error || null,
      state.applied,
    ],
  );
}
export async function recordConfigSync(event: {
  observedSha?: string | null;
  appliedSha?: string | null;
  status: string;
  actor: string;
  error?: string | null;
}) {
  if (!pool) return;
  await pool.query(
    "insert into config_sync_events(observed_sha,applied_sha,status,actor_login,error) values($1,$2,$3,$4,$5)",
    [
      event.observedSha || null,
      event.appliedSha || null,
      event.status,
      event.actor,
      event.error || null,
    ],
  );
  await pool.query(
    "insert into audit_events(category,action,actor_login,target,after_value) values($1,$2,$3,$4,$5)",
    [
      "configuration",
      `sync.${event.status}`,
      event.actor,
      event.observedSha || "unknown",
      { appliedSha: event.appliedSha, error: event.error },
    ],
  );
}
export async function listAdminLogins() {
  if (!pool) return [];
  return pool
    .query("select login from users where role='admin' order by lower(login)")
    .then((x) => x.rows.map((row) => String(row.login)));
}
export async function projectUserRoles(admins: Set<string>) {
  if (!pool) return;
  await pool.query(
    "update users set role=case when lower(login)=any($1::text[]) then 'admin' else 'member' end",
    [[...admins].map((x) => x.toLowerCase())],
  );
}
export async function saveConfigOverride(
  section: string,
  value: unknown,
  actor: string,
  action = "updated",
) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const before =
      (
        await client.query(
          "select value from config_overrides where section=$1",
          [section],
        )
      ).rows[0]?.value || null;
    await client.query(
      "insert into config_overrides(section,value,updated_by) values($1,$2,$3) on conflict(section) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()",
      [section, value, actor],
    );
    await client.query(
      "insert into config_revisions(section,value,actor_login,action) values($1,$2,$3,$4)",
      [section, value, actor, action],
    );
    await client.query(
      "insert into audit_events(category,action,actor_login,target,before_value,after_value) values($1,$2,$3,$4,$5,$6)",
      ["configuration", action, actor, section, before, value],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
export async function resetConfigOverride(section: string, actor: string) {
  if (!pool) return;
  const before =
    (
      await pool.query(
        "delete from config_overrides where section=$1 returning value",
        [section],
      )
    ).rows[0]?.value || null;
  await pool.query(
    "insert into config_revisions(section,value,actor_login,action) values($1,$2,$3,$4)",
    [section, null, actor, "reset"],
  );
  await pool.query(
    "insert into audit_events(category,action,actor_login,target,before_value) values($1,$2,$3,$4,$5)",
    ["configuration", "reset", actor, section, before],
  );
}
export async function listConfigRevisions() {
  if (!pool) return [];
  return pool
    .query("select * from config_revisions order by created_at desc limit 100")
    .then((x) => x.rows);
}
export async function getConfigRevision(id: number) {
  if (!pool) return null;
  return pool
    .query("select * from config_revisions where id=$1", [id])
    .then((x) => x.rows[0] || null);
}
export async function listAuditEvents() {
  if (!pool) return [];
  return pool
    .query("select * from audit_events order by created_at desc limit 100")
    .then((x) => x.rows);
}
export async function recordWebhook(delivery: {
  deliveryId: string;
  event: string;
  action?: string;
  repository?: string;
  installationId?: number;
  status: string;
  message?: string;
}) {
  if (!pool) return;
  await pool.query(
    `insert into webhook_deliveries(delivery_id,event,action,repository,installation_id,status,message) values($1,$2,$3,$4,$5,$6,$7) on conflict(delivery_id) do nothing`,
    [
      delivery.deliveryId,
      delivery.event,
      delivery.action || null,
      delivery.repository || null,
      delivery.installationId || null,
      delivery.status,
      delivery.message || null,
    ],
  );
}
export async function webhookSeen(deliveryId: string) {
  if (!pool) return false;
  return Boolean(
    (
      await pool.query(
        "select 1 from webhook_deliveries where delivery_id=$1",
        [deliveryId],
      )
    ).rowCount,
  );
}
export async function listWebhooks() {
  if (!pool) return [];
  return pool
    .query("select * from webhook_deliveries order by created_at desc limit 50")
    .then((x) => x.rows);
}
export async function onboardingStats() {
  if (!pool) return { users: 0, services: 0, syncs: 0 };
  const { rows } = await pool.query(
    `select (select count(*)::int from users) users,(select count(*)::int from services) services,(select count(*)::int from sync_runs where status='completed') syncs`,
  );
  return rows[0];
}
export async function recalculateScores(score: (metadata: any) => number) {
  if (!pool) return;
  const { rows } = await pool.query("select id,metadata from services");
  for (const row of rows)
    await pool.query("update services set score=$2 where id=$1", [
      row.id,
      score(row.metadata),
    ]);
}

export async function listTeams() {
  if (!pool) return [];
  const { rows } =
    await pool.query(`select t.*, count(distinct tm.user_id)::int member_count, count(distinct s.id)::int service_count,
    coalesce(jsonb_agg(distinct jsonb_build_object('login',u.login,'name',u.name,'avatarUrl',u.avatar_url)) filter(where u.id is not null),'[]') members
    from teams t left join team_members tm on tm.team_id=t.id left join users u on u.id=tm.user_id
    left join services s on s.owner=t.name group by t.id order by t.title`);
  return rows;
}

export async function listUsers() {
  if (!pool) return [];
  const { rows } =
    await pool.query(`select u.*, coalesce(jsonb_agg(distinct jsonb_build_object('name',t.name,'title',t.title)) filter(where t.id is not null),'[]') teams
    from users u left join team_members tm on tm.user_id=u.id left join teams t on t.id=tm.team_id group by u.id order by u.name`);
  return rows;
}

export async function catalogSummary() {
  if (!pool)
    return { services: [], teams: [], users: [], activity: [], actions: [] };
  const [services, teams, users, activity, actions] = await Promise.all([
    listServices(),
    listTeams(),
    listUsers(),
    pool
      .query(
        `select 'sync' type,status,registered,discovered,error,results,created_at from sync_runs order by created_at desc limit 5`,
      )
      .then((x) => x.rows),
    pool
      .query(`select * from action_runs order by created_at desc limit 5`)
      .then((x) => x.rows),
  ]);
  return { services: services || [], teams, users, activity, actions };
}

export async function recordSync(
  installationId: number,
  results: Array<{ repository?: string; status: string; error?: string }>,
  error?: string,
) {
  if (!pool) return;
  await pool.query(
    "insert into sync_runs(installation_id,status,discovered,registered,error,results) values($1,$2,$3,$4,$5,$6)",
    [
      installationId,
      error ? "failed" : "completed",
      results.length,
      results.filter((x) => x.status === "registered").length,
      error || null,
      results,
    ],
  );
}

export async function recordAction(
  actionId: string,
  repository: string,
  workflow: string,
  inputs: Record<string, string>,
  actor?: string,
  version?: number,
) {
  if (!pool) return;
  await pool.query(
    "insert into action_runs(action_id,repository,workflow,status,inputs,actor_login,action_version) values($1,$2,$3,$4,$5,$6,$7)",
    [
      actionId,
      repository,
      workflow,
      "dispatched",
      inputs,
      actor || null,
      version || null,
    ],
  );
}

export async function findServiceByName(name: string) {
  if (!pool) return null;
  return pool
    .query("select * from services where name=$1", [name])
    .then((result) => result.rows[0] || null);
}

export type ServiceRelationInput = {
  sourceKind?: string;
  sourceKey: string;
  relationType: string;
  targetKind: string;
  targetKey: string;
  metadata?: Record<string, unknown>;
};

export async function replaceServiceRelations(
  serviceId: string | number,
  relations: ServiceRelationInput[],
) {
  if (!pool) return relations;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from service_relations where service_id=$1", [
      serviceId,
    ]);
    for (const relation of relations)
      await client.query(
        `insert into service_relations(service_id,source_kind,source_key,relation_type,target_kind,target_key,metadata)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [
          serviceId,
          relation.sourceKind || "service",
          relation.sourceKey,
          relation.relationType,
          relation.targetKind,
          relation.targetKey,
          relation.metadata || {},
        ],
      );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return relations;
}

export async function graphRows() {
  if (!pool) return { services: [], relations: [] };
  const [services, relations] = await Promise.all([
    listServices(),
    pool
      .query("select * from service_relations order by source_key,target_key")
      .then((result) => result.rows),
  ]);
  return { services: services || [], relations };
}

export type ServiceDocumentInput = {
  path: string;
  title: string;
  content: string;
  sha?: string | null;
  sourceUpdatedAt?: string | null;
};

export async function replaceServiceDocuments(
  serviceId: string | number,
  documents: ServiceDocumentInput[],
) {
  if (!pool) return documents;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from service_documents where service_id=$1", [
      serviceId,
    ]);
    for (const document of documents)
      await client.query(
        `insert into service_documents(service_id,path,title,content,sha,source_updated_at)
         values($1,$2,$3,$4,$5,$6)`,
        [
          serviceId,
          document.path,
          document.title,
          document.content,
          document.sha || null,
          document.sourceUpdatedAt || null,
        ],
      );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return documents;
}

export async function listServiceDocuments(serviceName?: string) {
  if (!pool) return [];
  const params = serviceName ? [serviceName] : [];
  const where = serviceName ? "where s.name=$1" : "";
  return pool
    .query(
      `select d.id,d.path,d.title,d.content,d.sha,d.source_updated_at,d.fetched_at,
       s.name service_name,s.repository,s.owner from service_documents d
       join services s on s.id=d.service_id ${where}
       order by s.name,case when lower(d.path)='readme.md' then 0 else 1 end,d.path`,
      params,
    )
    .then((result) => result.rows);
}

export async function listServicesMissingDocuments() {
  if (!pool) return [];
  return pool
    .query(
      `select s.* from services s where s.installation_id is not null and not exists
       (select 1 from service_documents d where d.service_id=s.id) order by s.id`,
    )
    .then((result) => result.rows);
}

export async function createMetadataCampaign(input: {
  title: string;
  description: string;
  fieldPath: string;
  desiredValue: unknown;
  filters: Record<string, unknown>;
  createdBy: string;
  targets: Array<{
    serviceId: string | number;
    serviceName: string;
    repository: string;
    beforeValue: unknown;
    afterValue: unknown;
    patch: unknown;
    confidence: string;
  }>;
}) {
  if (!pool) return { id: "preview", ...input, status: "draft" };
  const client = await pool.connect();
  try {
    await client.query("begin");
    const campaign = (
      await client.query(
        `insert into metadata_campaigns(title,description,field_path,desired_value,filters,created_by)
         values($1,$2,$3,$4,$5,$6) returning *`,
        [
          input.title,
          input.description,
          input.fieldPath,
          JSON.stringify(input.desiredValue),
          input.filters,
          input.createdBy,
        ],
      )
    ).rows[0];
    for (const target of input.targets)
      await client.query(
        `insert into metadata_campaign_targets(campaign_id,service_id,service_name,repository,before_value,after_value,patch,confidence)
         values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          campaign.id,
          target.serviceId,
          target.serviceName,
          target.repository,
          target.beforeValue === undefined
            ? null
            : JSON.stringify(target.beforeValue),
          JSON.stringify(target.afterValue),
          target.patch,
          target.confidence,
        ],
      );
    await client.query("commit");
    return campaign;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listMetadataCampaigns(id?: string | number) {
  if (!pool) return [];
  const campaigns = await pool.query(
    `select c.*,
     count(t.id)::int target_count,
     count(t.id) filter(where t.status='completed')::int completed_count,
     count(t.id) filter(where t.status='failed')::int failed_count,
     count(t.id) filter(where t.status='excluded')::int excluded_count,
     count(t.id) filter(where t.status in ('pr-open','launched'))::int active_count
     from metadata_campaigns c left join metadata_campaign_targets t on t.campaign_id=c.id
     ${id ? "where c.id=$1" : ""} group by c.id order by c.created_at desc`,
    id ? [id] : [],
  );
  if (!id) return campaigns.rows;
  if (!campaigns.rows[0]) return [];
  const targets = await pool.query(
    "select * from metadata_campaign_targets where campaign_id=$1 order by service_name",
    [id],
  );
  return [{ ...campaigns.rows[0], targets: targets.rows }];
}

export async function campaignTargets(
  campaignId: string | number,
  statuses: string[] = ["pending", "failed"],
) {
  if (!pool) return [];
  return pool
    .query(
      `select t.*,s.metadata,s.metadata_path,s.installation_id from metadata_campaign_targets t
       left join services s on s.id=t.service_id
       where t.campaign_id=$1 and t.status=any($2::text[]) order by t.id`,
      [campaignId, statuses],
    )
    .then((result) => result.rows);
}

export async function updateCampaignTarget(
  id: string | number,
  update: {
    status: string;
    prNumber?: number | null;
    prUrl?: string | null;
    branch?: string | null;
    error?: string | null;
    exclusionReason?: string | null;
  },
) {
  if (!pool) return { id, ...update };
  return (
    await pool.query(
      `update metadata_campaign_targets set status=$2,pr_number=coalesce($3,pr_number),
       pr_url=coalesce($4,pr_url),branch=coalesce($5,branch),error=$6,
       exclusion_reason=coalesce($7,exclusion_reason),updated_at=now() where id=$1 returning *`,
      [
        id,
        update.status,
        update.prNumber ?? null,
        update.prUrl ?? null,
        update.branch ?? null,
        update.error ?? null,
        update.exclusionReason ?? null,
      ],
    )
  ).rows[0];
}

export async function updateCampaignStatus(
  id: string | number,
  status: string,
) {
  if (!pool) return { id, status };
  const completed = status === "completed" ? "now()" : "completed_at";
  const launched = status === "active" ? "now()" : "launched_at";
  return (
    await pool.query(
      `update metadata_campaigns set status=$2,launched_at=${launched},completed_at=${completed} where id=$1 returning *`,
      [id, status],
    )
  ).rows[0];
}

export async function updateCampaignFromPullRequest(input: {
  repository: string;
  prNumber: number;
  merged: boolean;
  closed: boolean;
}) {
  if (!pool) return null;
  const status = input.merged
    ? "completed"
    : input.closed
      ? "failed"
      : "pr-open";
  const { rows } = await pool.query(
    `update metadata_campaign_targets set status=$3,error=case when $3='failed' then 'Pull request closed without merge' else null end,updated_at=now()
     where repository=$1 and pr_number=$2 returning campaign_id`,
    [input.repository, input.prNumber, status],
  );
  return rows[0]?.campaign_id || null;
}

export async function createScorecardRemediation(input: {
  serviceId: string | number;
  serviceName: string;
  repository: string;
  scorecardId: string;
  ruleId: string;
  fieldPath: string;
  beforeValue: unknown;
  afterValue: unknown;
  prNumber: number;
  prUrl: string;
  branch: string;
  requestedBy: string;
}) {
  if (!pool) return { id: "preview", ...input, status: "pr-open" };
  return (
    await pool.query(
      `insert into scorecard_remediations(service_id,service_name,repository,scorecard_id,rule_id,field_path,before_value,after_value,pr_number,pr_url,branch,requested_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        input.serviceId,
        input.serviceName,
        input.repository,
        input.scorecardId,
        input.ruleId,
        input.fieldPath,
        input.beforeValue === undefined
          ? null
          : JSON.stringify(input.beforeValue),
        JSON.stringify(input.afterValue),
        input.prNumber,
        input.prUrl,
        input.branch,
        input.requestedBy,
      ],
    )
  ).rows[0];
}

export async function listScorecardRemediations(serviceName: string) {
  if (!pool) return [];
  return pool
    .query(
      "select * from scorecard_remediations where service_name=$1 order by created_at desc",
      [serviceName],
    )
    .then((result) => result.rows);
}

export async function updateRemediationFromPullRequest(input: {
  repository: string;
  prNumber: number;
  merged: boolean;
  closed: boolean;
}) {
  if (!pool) return null;
  const status = input.merged
    ? "completed"
    : input.closed
      ? "closed"
      : "pr-open";
  const { rows } = await pool.query(
    `update scorecard_remediations set status=$3,updated_at=now()
     where repository=$1 and pr_number=$2 returning id`,
    [input.repository, input.prNumber, status],
  );
  return rows[0]?.id || null;
}

export async function createWaiver(input: {
  serviceId: string | number;
  scorecardId: string;
  ruleId: string;
  reason: string;
  requestedBy: string;
  expiresAt: string;
}) {
  if (!pool) return { id: "preview", ...input, status: "requested" };
  return (
    await pool.query(
      `insert into scorecard_waivers(service_id,scorecard_id,rule_id,reason,requested_by,expires_at)
       values($1,$2,$3,$4,$5,$6) returning *`,
      [
        input.serviceId,
        input.scorecardId,
        input.ruleId,
        input.reason,
        input.requestedBy,
        input.expiresAt,
      ],
    )
  ).rows[0];
}

export async function listWaivers(serviceName?: string) {
  if (!pool) return [];
  return pool
    .query(
      `select w.*,s.name service_name,s.repository,s.owner from scorecard_waivers w
       join services s on s.id=w.service_id ${serviceName ? "where s.name=$1" : ""}
       order by w.created_at desc`,
      serviceName ? [serviceName] : [],
    )
    .then((result) => result.rows);
}

export async function decideWaiver(
  id: string | number,
  status: "approved" | "rejected",
  actor: string,
) {
  if (!pool) return { id, status, decided_by: actor };
  return (
    await pool.query(
      `update scorecard_waivers set status=$2,decided_by=$3,decided_at=now() where id=$1 returning *`,
      [id, status, actor],
    )
  ).rows[0];
}

export async function recordPortalEvent(input: {
  eventType: string;
  actorLogin?: string | null;
  path?: string | null;
  entityKind?: string | null;
  entityKey?: string | null;
  properties?: Record<string, unknown>;
}) {
  if (!pool) return;
  await pool.query(
    `insert into portal_events(event_type,actor_login,path,entity_kind,entity_key,properties)
     values($1,$2,$3,$4,$5,$6)`,
    [
      input.eventType,
      input.actorLogin || null,
      input.path || null,
      input.entityKind || null,
      input.entityKey || null,
      input.properties || {},
    ],
  );
}

export async function portalAnalytics(days = 30) {
  if (!pool)
    return {
      days,
      totals: { events: 0, activeUsers: 0, pageViews: 0, actions: 0 },
      eventTypes: [],
      popularPaths: [],
      searchesWithoutResults: [],
      daily: [],
      campaignOutcomes: [],
    };
  const interval = `${Math.max(1, Math.min(days, 365))} days`;
  const [totals, eventTypes, popularPaths, searches, daily, outcomes] =
    await Promise.all([
      pool
        .query(
          `select count(*)::int events,count(distinct actor_login)::int active_users,
           count(*) filter(where event_type='page.view')::int page_views,
           count(*) filter(where event_type in ('action.dispatch','remediation.opened'))::int actions
           from portal_events where created_at >= now()-$1::interval`,
          [interval],
        )
        .then((result) => result.rows[0]),
      pool
        .query(
          `select event_type,count(*)::int count from portal_events where created_at >= now()-$1::interval
           group by event_type order by count desc`,
          [interval],
        )
        .then((result) => result.rows),
      pool
        .query(
          `select path,count(*)::int views from portal_events where event_type='page.view' and created_at >= now()-$1::interval
           group by path order by views desc limit 10`,
          [interval],
        )
        .then((result) => result.rows),
      pool
        .query(
          `select properties->>'query' query,count(*)::int count from portal_events
           where event_type='search.empty' and created_at >= now()-$1::interval
           group by properties->>'query' order by count desc limit 10`,
          [interval],
        )
        .then((result) => result.rows),
      pool
        .query(
          `select date_trunc('day',created_at)::date as event_day,count(*)::int events,
           count(distinct actor_login)::int users from portal_events where created_at >= now()-$1::interval
           group by 1 order by 1`,
          [interval],
        )
        .then((result) => result.rows),
      pool
        .query(
          `select status,count(*)::int count from metadata_campaign_targets group by status order by count desc`,
        )
        .then((result) => result.rows),
    ]);
  return {
    days,
    totals: {
      events: totals.events,
      activeUsers: totals.active_users,
      pageViews: totals.page_views,
      actions: totals.actions,
    },
    eventTypes,
    popularPaths,
    searchesWithoutResults: searches,
    daily,
    campaignOutcomes: outcomes,
  };
}
