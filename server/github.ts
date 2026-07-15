import YAML from 'yaml'
import { z } from 'zod'
import { ensureTeam, recordSync, removeServiceByRepository, setTeamMembers, upsertService, upsertTeam, upsertUser } from './db.js'
import { getConfig, isAdminLogin, scoreWithConfig } from './config.js'
import { installationOctokit } from './github-app.js'

export const metadataSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Service'),
  metadata: z.object({
    name: z.string().min(1),
    title: z.string().optional(),
    description: z.string().default(''),
    tags: z.array(z.string()).optional()
  }),
  spec: z.object({
    owner: z.string().min(1),
    lifecycle: z.string().min(1),
    tier: z.string().min(1).optional(),
    system: z.string().optional(),
    language: z.string().optional(),
    links: z.array(z.object({ name:z.string(), url:z.string().url() })).optional()
  })
})

export const teamSchema=z.object({
  apiVersion:z.string(),kind:z.literal('Team'),
  metadata:z.object({name:z.string().min(1),title:z.string().min(1),description:z.string().default('')}),
  spec:z.object({members:z.array(z.string().min(1)).default([]),links:z.array(z.object({name:z.string().min(1),url:z.string().url()})).default([])})
})

export function scoreMetadata(value:z.infer<typeof metadataSchema>) {
  return scoreWithConfig(value)
}

export function validateServiceMetadata(value:unknown){
  const parsed=metadataSchema.parse(value)
  const config=getConfig()
  if(!config.catalog.lifecycles.includes(parsed.spec.lifecycle))throw new Error(`Unsupported lifecycle: ${parsed.spec.lifecycle}`)
  if(parsed.spec.tier&&!config.catalog.tiers.some(tier=>tier.id===parsed.spec.tier))throw new Error(`Unsupported tier: ${parsed.spec.tier}`)
  return parsed
}

export async function syncInstallation(installationId:number) {
  const octokit = await installationOctokit(installationId)
  const repositories: Array<{owner:{login:string};name:string;full_name:string;language?:string|null}>=[]
  for(let page=1;;page++){
    const response=await octokit.request('GET /installation/repositories',{per_page:100,page})
    repositories.push(...response.data.repositories)
    if(response.data.repositories.length<100)break
  }
  const results:{repository:string,status:string,error?:string}[]=[]
  for (const repository of repositories) {
    const repo = repository
    try {
      const contentResponse = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner:repo.owner.login,repo:repo.name,path:getConfig().catalog.serviceMetadataPath})
      if (Array.isArray(contentResponse.data) || !('content' in contentResponse.data)) continue
      const parsed = validateServiceMetadata(YAML.parse(Buffer.from(contentResponse.data.content,'base64').toString('utf8')))
      const owner=parsed.spec.owner.replace(/^team:/,'')
      await ensureTeam(owner)
      await upsertService({name:parsed.metadata.name,description:parsed.metadata.description,owner,system:parsed.spec.system||'Unassigned',lifecycle:parsed.spec.lifecycle,tier:parsed.spec.tier||null,language:parsed.spec.language||repo.language||'Unknown',repository:repo.full_name,metadata:parsed,score:scoreMetadata(parsed),installationId})
      results.push({repository:repo.full_name,status:'registered'})
    } catch (error) {
      const status = (error as {status?:number}).status===404?'unregistered':'invalid'
      results.push({repository:repo.full_name,status,error:status==='invalid'?(error as Error).message:undefined})
    }
    try{
      const teamResponse=await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner:repo.owner.login,repo:repo.name,path:getConfig().catalog.teamMetadataPath})
      if(!Array.isArray(teamResponse.data)&&'content' in teamResponse.data){
        const teamData=teamSchema.parse(YAML.parse(Buffer.from(teamResponse.data.content,'base64').toString('utf8')))
        const team=await upsertTeam({name:teamData.metadata.name,title:teamData.metadata.title,description:teamData.metadata.description,links:teamData.spec.links})
        const userIds=[]
        for(const login of teamData.spec.members){
          const response=await octokit.request('GET /users/{username}',{username:login})
          const profile=response.data
          const user=await upsertUser({githubId:profile.id,login:profile.login,name:profile.name||profile.login,avatarUrl:profile.avatar_url,email:profile.email,bio:profile.bio,role:isAdminLogin(profile.login)?'admin':'member'}) as {id?:string}
          if(user?.id)userIds.push(user.id)
        }
        if(team?.id)await setTeamMembers(team.id,userIds)
      }
    }catch(error){if((error as {status?:number}).status!==404)results.push({repository:repo.full_name,status:'invalid',error:`team.yaml: ${(error as Error).message}`})}
  }
  await recordSync(installationId,results)
  return results
}

export async function syncRepository(installationId:number,owner:string,name:string){
  const octokit=await installationOctokit(installationId)
  const repository=(await octokit.request('GET /repos/{owner}/{repo}',{owner,repo:name})).data
  const fullName=repository.full_name
  let serviceStatus:'registered'|'unregistered'|'invalid'='unregistered';let error:string|undefined
  try{
    const response=await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner,repo:name,path:getConfig().catalog.serviceMetadataPath})
    if(Array.isArray(response.data)||!('content' in response.data))throw Object.assign(new Error('Metadata path is not a file'),{status:422})
    const parsed=validateServiceMetadata(YAML.parse(Buffer.from(response.data.content,'base64').toString('utf8')))
    const team=parsed.spec.owner.replace(/^team:/,'');await ensureTeam(team)
    await upsertService({name:parsed.metadata.name,description:parsed.metadata.description,owner:team,system:parsed.spec.system||'Unassigned',lifecycle:parsed.spec.lifecycle,tier:parsed.spec.tier||null,language:parsed.spec.language||repository.language||'Unknown',repository:fullName,metadata:parsed,score:scoreMetadata(parsed),installationId})
    serviceStatus='registered'
  }catch(e){if((e as {status?:number}).status===404){await removeServiceByRepository(fullName);serviceStatus='unregistered'}else{serviceStatus='invalid';error=(e as Error).message}}
  try{
    const response=await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner,repo:name,path:getConfig().catalog.teamMetadataPath})
    if(!Array.isArray(response.data)&&'content' in response.data){const parsed=teamSchema.parse(YAML.parse(Buffer.from(response.data.content,'base64').toString('utf8')));const team=await upsertTeam({name:parsed.metadata.name,title:parsed.metadata.title,description:parsed.metadata.description,links:parsed.spec.links});const ids=[];for(const login of parsed.spec.members){const profile=(await octokit.request('GET /users/{username}',{username:login})).data;const user=await upsertUser({githubId:profile.id,login:profile.login,name:profile.name||profile.login,avatarUrl:profile.avatar_url,email:profile.email,bio:profile.bio,role:isAdminLogin(profile.login)?'admin':'member'}) as {id?:string};if(user?.id)ids.push(user.id)}if(team?.id)await setTeamMembers(team.id,ids)}
  }catch(e){if((e as {status?:number}).status!==404){serviceStatus='invalid';error=`team metadata: ${(e as Error).message}`}}
  return{repository:fullName,status:serviceStatus,error}
}

export async function dispatchWorkflow(installationId:number, repository:string, workflow:string, inputs:Record<string,string>) {
  const [owner,repo]=repository.split('/')
  if (!owner||!repo) throw new Error('Repository must use owner/name format')
  const octokit=await installationOctokit(installationId)
  await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',{owner,repo,workflow_id:workflow,ref:'main',inputs})
}
