import type { PortalConfig, ConfigSection } from './config.js'
import { activateConfig, assertAdministratorConfigured, configSections, defaults, getBreakGlassAdmins, getConfig, missingPluginScorecards, parseConfigDocuments, serializeSection, validateConfig, validateSection } from './config.js'
import { getConfigState, projectUserRoles, recordConfigSync, saveConfigState } from './db.js'
import { installationOctokit } from './github-app.js'

type ApplyHook=(changed:ConfigSection[],config:PortalConfig)=>Promise<void>
type FileState={path:string;sha:string}
export type ConfigSource={repository:string;branch:string;directory:string;observedSha:string|null;appliedSha:string|null;files:Partial<Record<ConfigSection,FileState>>;status:'unavailable'|'ready'|'degraded'|'syncing';error:string|null;syncedAt:string|null;appliedAt:string|null}

let source:ConfigSource={repository:'',branch:'',directory:'',observedSha:null,appliedSha:null,files:{},status:'unavailable',error:null,syncedAt:null,appliedAt:null}
let hasApplied=false
let applyHook:ApplyHook=async()=>{}
let syncPromise:Promise<SyncResult>|null=null
let octokitFactory:typeof installationOctokit=installationOctokit

export class ConfigConflictError extends Error{}
export class ConfigUnavailableError extends Error{}

function settings(){
  const repository=process.env.NORTHSTAR_CONFIG_REPOSITORY?.trim()
  const branch=process.env.NORTHSTAR_CONFIG_BRANCH?.trim()
  const directory=process.env.NORTHSTAR_CONFIG_DIRECTORY?.replace(/^\/+|\/+$/g,'').trim()
  const installationId=Number(process.env.NORTHSTAR_CONFIG_INSTALLATION_ID)
  if(!repository||!/^[^/\s]+\/[^/\s]+$/.test(repository))throw new Error('NORTHSTAR_CONFIG_REPOSITORY must be owner/repository')
  if(!branch)throw new Error('NORTHSTAR_CONFIG_BRANCH is required')
  if(!directory)throw new Error('NORTHSTAR_CONFIG_DIRECTORY is required')
  if(!Number.isInteger(installationId)||installationId<=0)throw new Error('NORTHSTAR_CONFIG_INSTALLATION_ID must be a positive integer')
  const [owner,repo]=repository.split('/')
  return{repository,owner,repo,branch,directory,installationId}
}

const filePath=(directory:string,section:ConfigSection)=>`${directory}/${section}.yaml`
const changedSections=(before:PortalConfig,after:PortalConfig)=>configSections.filter(section=>JSON.stringify(before[section])!==JSON.stringify(after[section]))
const now=()=>new Date().toISOString()

async function headSha(){
  const cfg=settings();const octokit=await octokitFactory(cfg.installationId)
  const response=await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}',{owner:cfg.owner,repo:cfg.repo,ref:`heads/${cfg.branch}`})
  return response.data.object.sha
}

async function readRevision(commitSha:string){
  const cfg=settings();const octokit=await octokitFactory(cfg.installationId)
  const documents={} as Record<ConfigSection,string>;const files:Partial<Record<ConfigSection,FileState>>={}
  await Promise.all(configSections.map(async section=>{
    const path=filePath(cfg.directory,section)
    let response:any
    try{response=await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner:cfg.owner,repo:cfg.repo,path,ref:commitSha})}
    catch(error){if(section==='integrations'&&(error as {status?:number}).status===404){documents[section]=serializeSection(section,defaults[section]);return}throw error}
    if(Array.isArray(response.data)||response.data.type!=='file'||!('content' in response.data))throw new Error(`${path} is not a file`)
    documents[section]=Buffer.from(response.data.content,'base64').toString('utf8');files[section]={path,sha:response.data.sha}
  }))
  const config=parseConfigDocuments(documents);assertAdministratorConfigured(config)
  return{config,files}
}

export type SyncResult={changed:ConfigSection[];source:ConfigSource}
async function performSync(actor:string,requestedSha?:string):Promise<SyncResult>{
  const cfg=settings();source={...source,repository:cfg.repository,branch:cfg.branch,directory:cfg.directory,status:'syncing',error:null}
  let observedSha:string|null=requestedSha||null
  try{
    observedSha=observedSha||await headSha()
    if(observedSha===source.appliedSha&&hasApplied){source={...source,observedSha,status:'ready',error:null,syncedAt:now()};await saveConfigState({observedSha,appliedSha:source.appliedSha,status:'ready',error:null,applied:false});return{changed:[],source:getConfigSource()}}
    const revision=await readRevision(observedSha)
    const before=getConfig();const changed=hasApplied?changedSections(before,revision.config):configSections
    activateConfig(revision.config);hasApplied=true
    source={...source,observedSha,appliedSha:observedSha,files:revision.files,status:'ready',error:null,syncedAt:now(),appliedAt:now()}
    const effectiveAdmins=new Set([...revision.config.access.admins.map(x=>x.toLowerCase()),...getBreakGlassAdmins()])
    await saveConfigState({observedSha,appliedSha:observedSha,config:revision.config,fileShas:Object.fromEntries(Object.entries(revision.files).map(([section,file])=>[section,file!.sha])),status:'ready',error:null,applied:true})
    await projectUserRoles(effectiveAdmins);await applyHook(changed,revision.config);await recordConfigSync({observedSha,appliedSha:observedSha,status:'applied',actor})
    return{changed,source:getConfigSource()}
  }catch(error){
    const message=(error as Error).message;source={...source,observedSha,status:'degraded',error:message,syncedAt:now()}
    await saveConfigState({observedSha,appliedSha:source.appliedSha,status:'degraded',error:message,applied:false});await recordConfigSync({observedSha,appliedSha:source.appliedSha,status:'failed',actor,error:message})
    throw error
  }
}

export function syncGitConfig(actor='system:poll',requestedSha?:string):Promise<SyncResult>{
  if(syncPromise)return requestedSha?syncPromise.then(()=>syncGitConfig(actor,requestedSha)):syncPromise
  syncPromise=performSync(actor,requestedSha).finally(()=>{syncPromise=null})
  return syncPromise
}

export async function initializeGitConfig(hook:ApplyHook){
  applyHook=hook;const cfg=settings();source={...source,repository:cfg.repository,branch:cfg.branch,directory:cfg.directory}
  const snapshot=await getConfigState()
  if(snapshot?.config){
    const config=activateConfig(snapshot.config);assertAdministratorConfigured(config);hasApplied=true
    source={...source,observedSha:snapshot.observed_sha,appliedSha:snapshot.applied_sha,files:Object.fromEntries(Object.entries(snapshot.file_shas||{}).map(([section,sha])=>[section,{path:filePath(cfg.directory,section as ConfigSection),sha:String(sha)}])),status:'degraded',error:'Checking GitHub for the latest configuration',syncedAt:snapshot.synced_at?.toISOString?.()||snapshot.synced_at||null,appliedAt:snapshot.applied_at?.toISOString?.()||snapshot.applied_at||null}
  }
  try{await syncGitConfig('system:startup')}catch(error){if(!hasApplied)throw error}
}

export function startConfigPolling(){
  const seconds=Number(process.env.NORTHSTAR_CONFIG_POLL_INTERVAL_SECONDS||60)
  if(!Number.isFinite(seconds)||seconds<=0)return()=>{}
  const timer=setInterval(()=>{syncGitConfig('system:poll').catch(()=>{})},seconds*1000);timer.unref()
  return()=>clearInterval(timer)
}

export const getConfigSource=():ConfigSource=>structuredClone(source)
export const configReady=()=>hasApplied

async function markWriteUnavailable(error:unknown,actor:string){const message=(error as Error).message;source={...source,status:'degraded',error:message,syncedAt:now()};await saveConfigState({observedSha:source.observedSha,appliedSha:source.appliedSha,status:'degraded',error:message,applied:false});await recordConfigSync({observedSha:source.observedSha,appliedSha:source.appliedSha,status:'failed',actor,error:message})}

export async function commitSection(section:ConfigSection,value:unknown,expectedBlobSha:string|undefined,actor:{login:string;id:number;name:string}){
  if(source.status!=='ready')throw new ConfigUnavailableError('GitHub configuration is degraded; writes are disabled until synchronization recovers')
  const checked=validateSection(section,value);const candidate=validateConfig({...getConfig(),[section]:checked});assertAdministratorConfigured(candidate)
  const cfg=settings();const path=filePath(cfg.directory,section)
  try{
    const octokit=await octokitFactory(cfg.installationId)
    let currentSha:string|undefined
    try{const current=await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{owner:cfg.owner,repo:cfg.repo,path,ref:cfg.branch});if(Array.isArray(current.data)||current.data.type!=='file')throw new Error(`${path} is not a file`);currentSha=current.data.sha}
    catch(error){if((error as {status?:number}).status!==404||section!=='integrations')throw error}
    if(currentSha&&(!expectedBlobSha||currentSha!==expectedBlobSha))throw new ConfigConflictError(`${section}.yaml changed in GitHub; reload before saving`)
    if(!currentSha&&expectedBlobSha)throw new ConfigConflictError(`${section}.yaml changed in GitHub; reload before saving`)
    const response=await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}',{owner:cfg.owner,repo:cfg.repo,path,branch:cfg.branch,...(currentSha?{sha:currentSha}:{}),message:`settings(${section}): update via UI by @${actor.login}`,content:Buffer.from(serializeSection(section,checked)).toString('base64'),author:{name:actor.name||actor.login,email:`${actor.id}+${actor.login}@users.noreply.github.com`},committer:{name:'Perongen GitHub App',email:'noreply@perongen.local'}} as any)
    const commitSha=response.data.commit.sha;if(!commitSha)throw new Error('GitHub did not return a commit SHA')
    return syncGitConfig(actor.login,commitSha)
  }catch(error){if(error instanceof ConfigConflictError||(error as {status?:number}).status===409||String((error as Error).message).includes('does not match'))throw new ConfigConflictError(`${section}.yaml changed in GitHub; reload before saving`);await markWriteUnavailable(error,actor.login);throw new ConfigUnavailableError(`GitHub configuration write failed: ${(error as Error).message}`)}
}

export async function commitIntegrations(value:unknown,expectedBlobSha:string|undefined,actor:{login:string;id:number;name:string}){
  const integrations=validateSection('integrations',value) as PortalConfig['integrations']
  const current=getConfig();const integrationsChanged=JSON.stringify(integrations)!==JSON.stringify(current.integrations)
  const additions=missingPluginScorecards({integrations,scorecards:current.scorecards})
  let result:SyncResult|undefined
  if(additions.length){
    result=await commitSection('scorecards',{cards:[...current.scorecards.cards,...additions]},source.files.scorecards?.sha,actor)
  }
  return integrationsChanged?commitSection('integrations',integrations,expectedBlobSha,actor):result||{changed:[],source:getConfigSource()}
}

export function configPushMatches(payload:any){
  const cfg=settings();return payload.repository?.full_name===cfg.repository&&payload.ref===`refs/heads/${cfg.branch}`
}

export function configDirectoryChanged(payload:any){
  const cfg=settings();const prefix=`${cfg.directory}/`;return (payload.commits||[]).some((commit:any)=>[...(commit.added||[]),...(commit.modified||[]),...(commit.removed||[])].some((path:string)=>path.startsWith(prefix)))
}

export function setGitConfigOctokitFactoryForTests(factory:typeof installationOctokit|null){octokitFactory=factory||installationOctokit}
export function resetGitConfigForTests(){source={repository:'',branch:'',directory:'',observedSha:null,appliedSha:null,files:{},status:'unavailable',error:null,syncedAt:null,appliedAt:null};hasApplied=false;applyHook=async()=>{};syncPromise=null;octokitFactory=installationOctokit;activateConfig(defaults)}
