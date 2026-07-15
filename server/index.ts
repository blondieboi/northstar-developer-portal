import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { catalogSummary, listAuditEvents, listServices, listTeams, listUsers, listWebhooks, migrate, onboardingStats, recalculateScores, recordAction, recordSync, recordWebhook, setUserPrimaryTeam, upsertUser, webhookSeen } from './db.js'
import { dispatchWorkflow, syncInstallation, syncRepository } from './github.js'
import { beginLogin, currentUser, finishLogin, logout, requireAdmin, requireUser } from './auth.js'
import { defaults, getBreakGlassAdmins, getConfig, isAdminLogin, scoreWithConfig, type ConfigSection } from './config.js'
import { metadataChanged, verifyWebhookSignature } from './webhook.js'
import { commitSection, ConfigConflictError, ConfigUnavailableError, configDirectoryChanged, configPushMatches, getConfigSource, initializeGitConfig, startConfigPolling, syncGitConfig } from './git-config.js'

const server=Fastify({logger:true})
await server.register(cors,{origin:true})
server.removeContentTypeParser('application/json')
server.addContentTypeParser('application/json',{parseAs:'buffer'},(_request,body,done)=>{try{const value=JSON.parse(body.toString());Object.defineProperty(value,'__raw',{value:body,enumerable:false});done(null,value)}catch(e){done(e as Error,undefined)}})
await migrate()
await initializeGitConfig(async(changed,config)=>{
  if(changed.includes('scorecards')||changed.includes('catalog'))await recalculateScores(scoreWithConfig)
  if(changed.includes('catalog')&&config.catalog.installationId)queueMicrotask(()=>{syncInstallation(config.catalog.installationId!).catch(error=>server.log.error(error))})
})
startConfigPolling()

server.get('/api/health',async()=>({status:getConfigSource().status==='ready'?'ok':'degraded',database:Boolean(process.env.DATABASE_URL),github:Boolean(process.env.GITHUB_APP_ID),configuration:getConfigSource()}))
server.get('/api/services',async()=>({services:(await listServices())||[]}))
server.get('/api/teams',async()=>({teams:await listTeams()}))
server.get('/api/users',async()=>({users:await listUsers()}))
server.get('/api/summary',async()=>catalogSummary())
server.get('/api/portal',async()=>({general:getConfig().general,catalog:{tiers:getConfig().catalog.tiers},scorecards:getConfig().scorecards,actions:getConfig().actions.definitions.filter(a=>a.enabled&&a.published),tools:getConfig().tools}))
server.get('/api/github/status',async()=>({configured:Boolean(process.env.GITHUB_APP_ID&&(process.env.GITHUB_PRIVATE_KEY||process.env.GITHUB_PRIVATE_KEY_PATH)),oauth:Boolean(process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET),database:Boolean(process.env.DATABASE_URL),appId:process.env.GITHUB_APP_ID||null,configuration:getConfigSource()}))
server.get('/api/config/revision',async()=>{const source=getConfigSource();return{appliedSha:source.appliedSha,status:source.status,error:source.error,syncedAt:source.syncedAt}})
server.get('/api/onboarding',async()=>{const stats=await onboardingStats();const cfg=getConfig();const configSource=getConfigSource();const checks={database:Boolean(process.env.DATABASE_URL),githubApp:Boolean(process.env.GITHUB_APP_ID&&(process.env.GITHUB_PRIVATE_KEY||process.env.GITHUB_PRIVATE_KEY_PATH)),oauth:Boolean(process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET),webhookSecret:Boolean(process.env.GITHUB_WEBHOOK_SECRET),configRepository:Boolean(process.env.NORTHSTAR_CONFIG_REPOSITORY&&process.env.NORTHSTAR_CONFIG_BRANCH&&process.env.NORTHSTAR_CONFIG_DIRECTORY&&process.env.NORTHSTAR_CONFIG_INSTALLATION_ID),configRevision:configSource.status==='ready',administrator:Number(stats.users)>0,installation:Boolean(cfg.catalog.installationId||process.env.GITHUB_INSTALLATION_ID),firstSync:Number(stats.syncs)>0,firstService:Number(stats.services)>0,scorecard:cfg.scorecards.rules.some(r=>r.enabled),publishedAction:cfg.actions.definitions.some(a=>a.enabled&&a.published)};const publicUrl=(process.env.PUBLIC_URL||'http://localhost:4000').replace(/\/$/,'');const deployment={DATABASE_URL:checks.database,GITHUB_APP_ID_and_private_key:checks.githubApp,GITHUB_OAuth:checks.oauth,GITHUB_WEBHOOK_SECRET:checks.webhookSecret,NORTHSTAR_CONFIG_REPOSITORY_and_location:checks.configRepository};return{checks,complete:Object.values(checks).every(Boolean),stats,webhookUrl:`${publicUrl}/api/github/webhook`,webhookUrlPublic:!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(publicUrl),missingDeployment:Object.entries(deployment).filter(([,ready])=>!ready).map(([name])=>name),configSource}})
server.get('/api/auth/login',async(_request,reply)=>beginLogin(reply))
server.get<{Querystring:{code?:string;state?:string}}>('/api/auth/callback',finishLogin)
server.get('/api/auth/me',async request=>{const user=await currentUser(request);if(user)await upsertUser({githubId:user.id,login:user.login,name:user.name,avatarUrl:user.avatarUrl,role:user.role});return{user}})
server.post('/api/auth/logout',async(_request,reply)=>logout(reply))
server.put<{Body:{team:string}}>('/api/me/primary-team',{preHandler:requireUser},async(request,reply)=>{if(!request.body?.team)return reply.code(400).send({error:'Team is required'});try{const user=await currentUser(request);return{user:await setUserPrimaryTeam(user!.login,request.body.team)}}catch(e){return reply.code(400).send({error:(e as Error).message})}})
server.post<{Body?:{installationId?:number}}>('/api/github/sync',{preHandler:requireAdmin},async(request,reply)=>{
  const installationId=Number(request.body?.installationId||getConfig().catalog.installationId||process.env.GITHUB_INSTALLATION_ID)
  if(!Number.isInteger(installationId)||installationId<=0)return reply.code(400).send({error:'A GitHub installation ID must be saved in Catalog settings or GITHUB_INSTALLATION_ID'})
  const results=await syncInstallation(installationId)
  return {installationId,results,registered:results.filter(x=>x.status==='registered').length,unregistered:results.filter(x=>x.status==='unregistered').length}
})
server.post<{Body:{actionId:string;inputs?:Record<string,string>}}>('/api/actions/dispatch',{preHandler:requireUser},async(request,reply)=>{
  const action=getConfig().actions.definitions.find(a=>a.id===request.body?.actionId&&a.enabled&&a.published);if(!action)return reply.code(404).send({error:'Published action not found'})
  const inputs=request.body?.inputs||{};for(const input of action.inputs){const value=inputs[input.id];if(input.required&&(value===undefined||value===''))return reply.code(400).send({error:`${input.label} is required`});if(value!==undefined&&input.type==='number'&&!Number.isFinite(Number(value)))return reply.code(400).send({error:`${input.label} must be a number`});if(value!==undefined&&input.type==='boolean'&&!['true','false'].includes(String(value)))return reply.code(400).send({error:`${input.label} must be true or false`});if(value!==undefined&&input.type==='select'&&!input.options?.includes(String(value)))return reply.code(400).send({error:`${input.label} has an invalid option`})}
  const installationId=getConfig().catalog.installationId||Number(process.env.GITHUB_INSTALLATION_ID);if(!installationId)return reply.code(400).send({error:'GitHub installation ID is not configured'})
  await dispatchWorkflow(installationId,action.repository,action.workflow,inputs)
  const user=await currentUser(request);await recordAction(action.id,action.repository,action.workflow,inputs,user?.login,action.version)
  return reply.code(202).send({status:'dispatched'})
})

const configResponse=()=>({effective:getConfig(),source:getConfigSource()})
const configError=(reply:any,error:unknown)=>error instanceof ConfigConflictError?reply.code(409).send({error:error.message}):error instanceof ConfigUnavailableError?reply.code(503).send({error:error.message}):reply.code(400).send({error:(error as Error).message})
server.get('/api/admin/config',{preHandler:requireAdmin},async()=>configResponse())
server.post('/api/admin/config/refresh',{preHandler:requireAdmin},async(request,reply)=>{try{const user=await currentUser(request);await syncGitConfig(user!.login);return configResponse()}catch(e){return configError(reply,e)}})
server.put<{Params:{section:ConfigSection};Body:{value:unknown;expectedBlobSha:string}}>('/api/admin/config/:section',{preHandler:requireAdmin},async(request,reply)=>{try{const user=await currentUser(request);await commitSection(request.params.section,request.body?.value,request.body?.expectedBlobSha,{login:user!.login,id:user!.id,name:user!.name});return configResponse()}catch(e){return configError(reply,e)}})
server.delete<{Params:{section:ConfigSection};Body:{expectedBlobSha:string}}>('/api/admin/config/:section',{preHandler:requireAdmin},async(request,reply)=>{try{const user=await currentUser(request);await commitSection(request.params.section,(defaults as any)[request.params.section],request.body?.expectedBlobSha,{login:user!.login,id:user!.id,name:user!.name});return configResponse()}catch(e){return configError(reply,e)}})
server.get('/api/admin/users',{preHandler:requireAdmin},async()=>({users:(await listUsers()).map(user=>({...user,role:isAdminLogin(user.login)?'admin':'member',breakGlass:getBreakGlassAdmins().has(user.login.toLowerCase())}))}))
server.patch<{Params:{login:string};Body:{role:'admin'|'member';expectedBlobSha:string}}>('/api/admin/users/:login',{preHandler:requireAdmin},async(request,reply)=>{if(!['admin','member'].includes(request.body?.role))return reply.code(400).send({error:'Role must be admin or member'});if(request.body.role==='member'&&getBreakGlassAdmins().has(request.params.login.toLowerCase()))return reply.code(400).send({error:'Deployment break-glass administrators cannot be demoted'});try{const user=await currentUser(request);const admins=new Set(getConfig().access.admins.map(x=>x.toLowerCase()));if(request.body.role==='admin')admins.add(request.params.login.toLowerCase());else admins.delete(request.params.login.toLowerCase());await commitSection('access',{admins:[...admins].sort()},request.body.expectedBlobSha,{login:user!.login,id:user!.id,name:user!.name});return{users:(await listUsers()).map(candidate=>({...candidate,role:isAdminLogin(candidate.login)?'admin':'member',breakGlass:getBreakGlassAdmins().has(candidate.login.toLowerCase())})),source:getConfigSource()}}catch(e){return configError(reply,e)}})
server.get('/api/admin/audit',{preHandler:requireAdmin},async()=>({events:await listAuditEvents()}))
server.get('/api/admin/webhooks',{preHandler:requireAdmin},async()=>({deliveries:await listWebhooks()}))

server.post('/api/github/webhook',async(request,reply)=>{
  const secret=process.env.GITHUB_WEBHOOK_SECRET;if(!secret)return reply.code(503).send({error:'GitHub webhook secret is not configured'})
  const signature=String(request.headers['x-hub-signature-256']||'');const raw=(request.body as any)?.__raw as Buffer|undefined
  if(!raw||!verifyWebhookSignature(raw,signature,secret))return reply.code(401).send({error:'Webhook signature is invalid'})
  const deliveryId=String(request.headers['x-github-delivery']||'unknown');const event=String(request.headers['x-github-event']||'unknown');const body=request.body as any;const repository=body.repository?.full_name;const installationId=Number(body.installation?.id)||undefined
  if(await webhookSeen(deliveryId))return reply.code(202).send({status:'duplicate'})
  try{
    if(event==='push'&&configPushMatches(body)&&configDirectoryChanged(body)){await syncGitConfig(`github:${body.sender?.login||'push'}`,body.after);await recordWebhook({deliveryId,event,action:'configuration.sync',repository,installationId,status:'applied',message:body.after});return reply.code(202).send({status:'applied'})}
    if(event==='push'&&repository&&installationId){const paths=[getConfig().catalog.serviceMetadataPath,getConfig().catalog.teamMetadataPath];if(metadataChanged(body,paths)){const [owner,name]=repository.split('/');const result=await syncRepository(installationId,owner,name);await recordSync(installationId,[result],result.status==='invalid'?result.error:undefined);await recordWebhook({deliveryId,event,action:'metadata.sync',repository,installationId,status:result.status,message:result.error});return reply.code(202).send({status:result.status})}}
    await recordWebhook({deliveryId,event,action:body.action,repository,installationId,status:'ignored',message:'Event did not change configured metadata paths'});return reply.code(202).send({status:'ignored'})
  }catch(e){await recordWebhook({deliveryId,event,action:body.action,repository,installationId,status:'failed',message:(e as Error).message});request.log.error(e);return reply.code(202).send({status:'failed'})}
})

const dist=resolve(process.cwd(),'dist')
if(existsSync(dist)){
  await server.register(staticFiles,{root:dist,wildcard:false})
  server.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html'))
}

await server.listen({port:Number(process.env.PORT||4000),host:'0.0.0.0'})
