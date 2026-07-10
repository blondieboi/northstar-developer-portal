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

export async function upsertService(service: Record<string, unknown>) {
  if (!pool) return service
  const values = [service.name, service.description, service.owner, service.system, service.lifecycle, service.language, service.repository, service.metadata, service.score, service.installationId]
  const { rows } = await pool.query(`
    insert into services (name, description, owner, system, lifecycle, language, repository, metadata, score, installation_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict (name) do update set description=excluded.description, owner=excluded.owner,
      system=excluded.system, lifecycle=excluded.lifecycle, language=excluded.language,
      repository=excluded.repository, metadata=excluded.metadata, score=excluded.score,
      installation_id=excluded.installation_id, updated_at=now()
    returning *`, values)
  return rows[0]
}

export async function ensureTeam(name:string) {
  if(!pool)return null
  const title=name.split('-').map(x=>x[0]?.toUpperCase()+x.slice(1)).join(' ')
  const {rows}=await pool.query('insert into teams(name,title) values($1,$2) on conflict(name) do update set title=excluded.title returning *',[name,title])
  return rows[0]
}

export async function upsertTeam(team:{name:string;title:string;description:string}){
  if(!pool)return null
  const {rows}=await pool.query(`insert into teams(name,title,description) values($1,$2,$3)
    on conflict(name) do update set title=excluded.title,description=excluded.description returning *`,[team.name,team.title,team.description])
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
    avatar_url=excluded.avatar_url,email=excluded.email,bio=excluded.bio,role=excluded.role,last_seen_at=now() returning *`,[user.githubId,user.login,user.name,user.avatarUrl,user.email||null,user.bio||null,user.role])
  return rows[0]
}

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

export async function recordAction(actionId:string,repository:string,workflow:string,inputs:Record<string,string>){
  if(!pool)return
  await pool.query('insert into action_runs(action_id,repository,workflow,status,inputs) values($1,$2,$3,$4,$5)',[actionId,repository,workflow,'dispatched',inputs])
}
