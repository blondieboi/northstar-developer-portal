import { App } from '@octokit/app'
import { readFileSync } from 'node:fs'
import YAML from 'yaml'
import { z } from 'zod'
import { ensureTeam, recordSync, setTeamMembers, upsertService, upsertTeam, upsertUser } from './db.js'

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
    lifecycle: z.enum(['production','experimental','deprecated']),
    system: z.string().optional(),
    language: z.string().optional(),
    links: z.array(z.object({ name:z.string(), url:z.string().url() })).optional()
  })
})

export const teamSchema=z.object({
  apiVersion:z.string(),kind:z.literal('Team'),
  metadata:z.object({name:z.string().min(1),title:z.string().min(1),description:z.string().default('')}),
  spec:z.object({members:z.array(z.string().min(1)).default([])})
})

function app() {
  const { GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env
  const privateKey=GITHUB_PRIVATE_KEY||process.env.GITHUB_PRIVATE_KEY_PATH&&readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH,'utf8')
  if (!GITHUB_APP_ID || !privateKey) throw new Error('GitHub App is not configured')
  return new App({ appId:GITHUB_APP_ID, privateKey:privateKey.replace(/\\n/g,'\n'), webhooks:{secret:GITHUB_WEBHOOK_SECRET || 'development'}, oauth:GITHUB_CLIENT_ID&&GITHUB_CLIENT_SECRET?{clientId:GITHUB_CLIENT_ID,clientSecret:GITHUB_CLIENT_SECRET}:undefined })
}

export function scoreMetadata(value:z.infer<typeof metadataSchema>) {
  const checks = [Boolean(value.spec.owner), Boolean(value.spec.lifecycle), value.metadata.description.length>=20, Boolean(value.spec.system), Boolean(value.spec.links?.some(l=>l.name.toLowerCase().includes('doc')))]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
}

export async function syncInstallation(installationId:number) {
  const octokit = await app().getInstallationOctokit(installationId)
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
      const contentResponse = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner:repo.owner.login,repo:repo.name,path:'.portal/service.yaml'})
      if (Array.isArray(contentResponse.data) || !('content' in contentResponse.data)) continue
      const parsed = metadataSchema.parse(YAML.parse(Buffer.from(contentResponse.data.content,'base64').toString('utf8')))
      const owner=parsed.spec.owner.replace(/^team:/,'')
      await ensureTeam(owner)
      await upsertService({name:parsed.metadata.name,description:parsed.metadata.description,owner,system:parsed.spec.system||'Unassigned',lifecycle:parsed.spec.lifecycle,language:parsed.spec.language||repo.language||'Unknown',repository:repo.full_name,metadata:parsed,score:scoreMetadata(parsed),installationId})
      results.push({repository:repo.full_name,status:'registered'})
    } catch (error) {
      const status = (error as {status?:number}).status===404?'unregistered':'invalid'
      results.push({repository:repo.full_name,status,error:status==='invalid'?(error as Error).message:undefined})
    }
    try{
      const teamResponse=await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner:repo.owner.login,repo:repo.name,path:'.portal/team.yaml'})
      if(!Array.isArray(teamResponse.data)&&'content' in teamResponse.data){
        const teamData=teamSchema.parse(YAML.parse(Buffer.from(teamResponse.data.content,'base64').toString('utf8')))
        const team=await upsertTeam({name:teamData.metadata.name,title:teamData.metadata.title,description:teamData.metadata.description})
        const userIds=[]
        for(const login of teamData.spec.members){
          const response=await octokit.request('GET /users/{username}',{username:login})
          const profile=response.data
          const user=await upsertUser({githubId:profile.id,login:profile.login,name:profile.name||profile.login,avatarUrl:profile.avatar_url,email:profile.email,bio:profile.bio,role:'member'}) as {id?:string}
          if(user?.id)userIds.push(user.id)
        }
        if(team?.id)await setTeamMembers(team.id,userIds)
      }
    }catch(error){if((error as {status?:number}).status!==404)results.push({repository:repo.full_name,status:'invalid',error:`team.yaml: ${(error as Error).message}`})}
  }
  await recordSync(installationId,results)
  return results
}

export async function dispatchWorkflow(installationId:number, repository:string, workflow:string, inputs:Record<string,string>) {
  const [owner,repo]=repository.split('/')
  if (!owner||!repo) throw new Error('Repository must use owner/name format')
  const octokit=await app().getInstallationOctokit(installationId)
  await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',{owner,repo,workflow_id:workflow,ref:'main',inputs})
}
