import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
export const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null

export async function migrate() {
  if (!pool) return
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8')
  await pool.query(sql)
}

export async function listServices() {
  if (!pool) return null
  const { rows } = await pool.query('select * from services order by updated_at desc')
  return rows
}

export async function findServiceByRepository(repository:string){if(!pool)return null;return pool.query('select * from services where repository=$1',[repository]).then(result=>result.rows[0]||null)}

export async function upsertService(service: Record<string, unknown>) {
  if (!pool) return service
  const values = [service.name, service.description, service.owner, service.system, service.lifecycle, service.tier, service.serviceType, service.language, service.repository, service.metadata, service.score, service.scorecards||{}, service.installationId]
  const { rows } = await pool.query(`
    insert into services (name, description, owner, system, lifecycle, tier, service_type, language, repository, metadata, score, scorecards, installation_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (name) do update set description=excluded.description, owner=excluded.owner,
      system=excluded.system, lifecycle=excluded.lifecycle, tier=excluded.tier, service_type=excluded.service_type, language=excluded.language,
      repository=excluded.repository, metadata=excluded.metadata, score=excluded.score, scorecards=excluded.scorecards,
      installation_id=excluded.installation_id, updated_at=now()
    returning *`, values)
  return rows[0]
}
export async function updateServiceScores(id:string|number,score:number,scorecards:Record<string,number>){if(!pool)return;await pool.query('update services set score=$2,scorecards=$3 where id=$1',[id,score,scorecards])}
export async function removeServiceByRepository(repository:string){if(!pool)return;const removed=await pool.query('delete from services where repository=$1 returning name',[repository]);for(const row of removed.rows)await pool.query("delete from plugin_snapshots where entity_kind='service' and entity_key=$1",[row.name])}

export async function upsertPluginSnapshot(snapshot:{pluginId:string;entityKind:string;entityKey:string;status:string;data?:unknown;error?:string|null;expiresAt?:Date|null}){
  if(!pool)return snapshot
  const {rows}=await pool.query(`insert into plugin_snapshots(plugin_id,entity_kind,entity_key,status,data,error,observed_at,expires_at)
    values($1,$2,$3,$4,$5,$6,now(),$7) on conflict(plugin_id,entity_kind,entity_key) do update set
    status=excluded.status,data=coalesce(excluded.data,plugin_snapshots.data),error=excluded.error,observed_at=now(),expires_at=excluded.expires_at returning *`,
    [snapshot.pluginId,snapshot.entityKind,snapshot.entityKey,snapshot.status,snapshot.data??null,snapshot.error||null,snapshot.expiresAt||null])
  return rows[0]
}
export async function listPluginSnapshots(entityKind?:string,entityKey?:string){if(!pool)return[];if(entityKind&&entityKey)return pool.query('select * from plugin_snapshots where entity_kind=$1 and entity_key=$2',[entityKind,entityKey]).then(result=>result.rows);if(entityKind)return pool.query('select * from plugin_snapshots where entity_kind=$1',[entityKind]).then(result=>result.rows);return pool.query('select * from plugin_snapshots').then(result=>result.rows)}
export async function pluginHealthRows(){if(!pool)return[];return pool.query('select plugin_id,status,error,observed_at,expires_at from plugin_snapshots order by observed_at desc').then(result=>result.rows)}

export async function ensureTeam(name:string) {
  if(!pool)return null
  const title=name.split('-').map(x=>x[0]?.toUpperCase()+x.slice(1)).join(' ')
  const {rows}=await pool.query('insert into teams(name,title) values($1,$2) on conflict(name) do update set title=excluded.title returning *',[name,title])
  return rows[0]
}

export async function upsertTeam(team:{name:string;title:string;description:string;links?:Array<{name:string;url:string}>}){
  if(!pool)return null
  const {rows}=await pool.query(`insert into teams(name,title,description,links) values($1,$2,$3,$4)
    on conflict(name) do update set title=excluded.title,description=excluded.description,links=excluded.links returning *`,[team.name,team.title,team.description,team.links||[]])
  return rows[0]
}

export async function setTeamMembers(teamId:string|number,userIds:Array<string|number>){
  if(!pool)return
  await pool.query('delete from team_members where team_id=$1',[teamId])
  for(const userId of userIds)await pool.query('insert into team_members(team_id,user_id) values($1,$2) on conflict do nothing',[teamId,userId])
}

export async function upsertUser(user:{githubId:number;login:string;name:string;avatarUrl:string;email?:string|null;bio?:string|null;role:string}) {
  if(!pool)return user
  const {rows}=await pool.query(`insert into users(github_id,login,name,avatar_url,email,bio,role,last_seen_at)
    values($1,$2,$3,$4,$5,$6,$7,now()) on conflict(login) do update set github_id=excluded.github_id,name=excluded.name,
    avatar_url=excluded.avatar_url,email=excluded.email,bio=excluded.bio,role=users.role,last_seen_at=now() returning *`,[user.githubId,user.login,user.name,user.avatarUrl,user.email||null,user.bio||null,user.role])
  return rows[0]
}

export async function findUser(login:string){if(!pool)return null;return pool.query('select * from users where lower(login)=lower($1)',[login]).then(x=>x.rows[0]||null)}
export async function setUserPrimaryTeam(login:string,teamName:string){
  if(!pool)return{login,primary_team:teamName}
  const membership=await pool.query(`select 1 from users u join team_members tm on tm.user_id=u.id join teams t on t.id=tm.team_id where lower(u.login)=lower($1) and t.name=$2`,[login,teamName])
  if(!membership.rowCount)throw new Error('Primary team must be one of your team memberships')
  return (await pool.query('update users set primary_team=$2 where lower(login)=lower($1) returning login,primary_team',[login,teamName])).rows[0]
}
export async function setUserRole(login:string,role:'admin'|'member',actor:string){
  if(!pool)return null
  const client=await pool.connect();try{await client.query('begin');const before=(await client.query('select login,role from users where lower(login)=lower($1) for update',[login])).rows[0];if(!before)throw new Error('User not found');if(before.role==='admin'&&role==='member'){const count=Number((await client.query("select count(*) from users where role='admin'")).rows[0].count);if(count<=1)throw new Error('The final administrator cannot be demoted')};const after=(await client.query('update users set role=$2 where lower(login)=lower($1) returning login,role',[login,role])).rows[0];await client.query('insert into audit_events(category,action,actor_login,target,before_value,after_value) values($1,$2,$3,$4,$5,$6)',['access','role.changed',actor,login,before,after]);await client.query('commit');return after}catch(e){await client.query('rollback');throw e}finally{client.release()}
}

export async function getConfigOverrides(){if(!pool)return {};const {rows}=await pool.query('select section,value from config_overrides');return Object.fromEntries(rows.map(r=>[r.section,r.value]))}
export async function getConfigState(){if(!pool)return null;return pool.query('select * from config_state where id=1').then(x=>x.rows[0]||null)}
export async function saveConfigState(state:{observedSha?:string|null;appliedSha?:string|null;config?:unknown;fileShas?:Record<string,string>;status:string;error?:string|null;applied:boolean}){
  if(!pool)return
  await pool.query(`insert into config_state(id,observed_sha,applied_sha,config,file_shas,status,error,synced_at,applied_at)
    values(1,$1,$2,$3,$4,$5,$6,now(),case when $7 then now() else null end)
    on conflict(id) do update set observed_sha=excluded.observed_sha,applied_sha=excluded.applied_sha,
      config=coalesce(excluded.config,config_state.config),file_shas=case when $7 then excluded.file_shas else config_state.file_shas end,
      status=excluded.status,error=excluded.error,synced_at=now(),applied_at=case when $7 then now() else config_state.applied_at end`,
    [state.observedSha||null,state.appliedSha||null,state.config||null,state.fileShas||{},state.status,state.error||null,state.applied])
}
export async function recordConfigSync(event:{observedSha?:string|null;appliedSha?:string|null;status:string;actor:string;error?:string|null}){
  if(!pool)return
  await pool.query('insert into config_sync_events(observed_sha,applied_sha,status,actor_login,error) values($1,$2,$3,$4,$5)',[event.observedSha||null,event.appliedSha||null,event.status,event.actor,event.error||null])
  await pool.query('insert into audit_events(category,action,actor_login,target,after_value) values($1,$2,$3,$4,$5)',['configuration',`sync.${event.status}`,event.actor,event.observedSha||'unknown',{appliedSha:event.appliedSha,error:event.error}])
}
export async function listAdminLogins(){if(!pool)return[];return pool.query("select login from users where role='admin' order by lower(login)").then(x=>x.rows.map(row=>String(row.login)))}
export async function projectUserRoles(admins:Set<string>){if(!pool)return;await pool.query("update users set role=case when lower(login)=any($1::text[]) then 'admin' else 'member' end",[[...admins].map(x=>x.toLowerCase())])}
export async function saveConfigOverride(section:string,value:unknown,actor:string,action='updated'){
  if(!pool)return;const client=await pool.connect();try{await client.query('begin');const before=(await client.query('select value from config_overrides where section=$1',[section])).rows[0]?.value||null;await client.query('insert into config_overrides(section,value,updated_by) values($1,$2,$3) on conflict(section) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()',[section,value,actor]);await client.query('insert into config_revisions(section,value,actor_login,action) values($1,$2,$3,$4)',[section,value,actor,action]);await client.query('insert into audit_events(category,action,actor_login,target,before_value,after_value) values($1,$2,$3,$4,$5,$6)',['configuration',action,actor,section,before,value]);await client.query('commit')}catch(e){await client.query('rollback');throw e}finally{client.release()}}
export async function resetConfigOverride(section:string,actor:string){if(!pool)return;const before=(await pool.query('delete from config_overrides where section=$1 returning value',[section])).rows[0]?.value||null;await pool.query('insert into config_revisions(section,value,actor_login,action) values($1,$2,$3,$4)',[section,null,actor,'reset']);await pool.query('insert into audit_events(category,action,actor_login,target,before_value) values($1,$2,$3,$4,$5)',['configuration','reset',actor,section,before])}
export async function listConfigRevisions(){if(!pool)return [];return pool.query('select * from config_revisions order by created_at desc limit 100').then(x=>x.rows)}
export async function getConfigRevision(id:number){if(!pool)return null;return pool.query('select * from config_revisions where id=$1',[id]).then(x=>x.rows[0]||null)}
export async function listAuditEvents(){if(!pool)return [];return pool.query('select * from audit_events order by created_at desc limit 100').then(x=>x.rows)}
export async function recordWebhook(delivery:{deliveryId:string;event:string;action?:string;repository?:string;installationId?:number;status:string;message?:string}){if(!pool)return;await pool.query(`insert into webhook_deliveries(delivery_id,event,action,repository,installation_id,status,message) values($1,$2,$3,$4,$5,$6,$7) on conflict(delivery_id) do nothing`,[delivery.deliveryId,delivery.event,delivery.action||null,delivery.repository||null,delivery.installationId||null,delivery.status,delivery.message||null])}
export async function webhookSeen(deliveryId:string){if(!pool)return false;return Boolean((await pool.query('select 1 from webhook_deliveries where delivery_id=$1',[deliveryId])).rowCount)}
export async function listWebhooks(){if(!pool)return [];return pool.query('select * from webhook_deliveries order by created_at desc limit 50').then(x=>x.rows)}
export async function onboardingStats(){if(!pool)return{users:0,services:0,syncs:0};const {rows}=await pool.query(`select (select count(*)::int from users) users,(select count(*)::int from services) services,(select count(*)::int from sync_runs where status='completed') syncs`);return rows[0]}
export async function recalculateScores(score:(metadata:any)=>number){if(!pool)return;const {rows}=await pool.query('select id,metadata from services');for(const row of rows)await pool.query('update services set score=$2 where id=$1',[row.id,score(row.metadata)])}

export async function listTeams(){
  if(!pool)return []
  const {rows}=await pool.query(`select t.*, count(distinct tm.user_id)::int member_count, count(distinct s.id)::int service_count,
    coalesce(jsonb_agg(distinct jsonb_build_object('login',u.login,'name',u.name,'avatarUrl',u.avatar_url)) filter(where u.id is not null),'[]') members
    from teams t left join team_members tm on tm.team_id=t.id left join users u on u.id=tm.user_id
    left join services s on s.owner=t.name group by t.id order by t.title`)
  return rows
}

export async function listUsers(){
  if(!pool)return []
  const {rows}=await pool.query(`select u.*, coalesce(jsonb_agg(distinct jsonb_build_object('name',t.name,'title',t.title)) filter(where t.id is not null),'[]') teams
    from users u left join team_members tm on tm.user_id=u.id left join teams t on t.id=tm.team_id group by u.id order by u.name`)
  return rows
}

export async function catalogSummary(){
  if(!pool)return {services:[],teams:[],users:[],activity:[],actions:[]}
  const [services,teams,users,activity,actions]=await Promise.all([
    listServices(),listTeams(),listUsers(),
    pool.query(`select 'sync' type,status,registered,discovered,error,created_at from sync_runs order by created_at desc limit 5`).then(x=>x.rows),
    pool.query(`select * from action_runs order by created_at desc limit 5`).then(x=>x.rows)
  ])
  return {services:services||[],teams,users,activity,actions}
}

export async function recordSync(installationId:number,results:Array<{status:string}>,error?:string){
  if(!pool)return
  await pool.query('insert into sync_runs(installation_id,status,discovered,registered,error) values($1,$2,$3,$4,$5)',[installationId,error?'failed':'completed',results.length,results.filter(x=>x.status==='registered').length,error||null])
}

export async function recordAction(actionId:string,repository:string,workflow:string,inputs:Record<string,string>,actor?:string,version?:number){
  if(!pool)return
  await pool.query('insert into action_runs(action_id,repository,workflow,status,inputs,actor_login,action_version) values($1,$2,$3,$4,$5,$6,$7)',[actionId,repository,workflow,'dispatched',inputs,actor||null,version||null])
}
