import { installationOctokit } from '../github-app.js'
import type { ServiceRecord } from './contracts.js'

export type GitHubActionsData={
  repository:string
  totalRuns:number
  successRate:number|null
  lastSuccessfulRunAt:string|null
  workflows:Array<{id:number;name:string;path:string}>
  runs:Array<{id:number;name:string;workflowId:number;branch:string|null;event:string;status:string;conclusion:string|null;actor:string|null;createdAt:string;updatedAt:string;url:string}>
}

let octokitFactory=installationOctokit

export async function collectGitHubActions(service:ServiceRecord,config:Record<string,unknown>):Promise<GitHubActionsData>{
  const installationId=Number(service.installation_id)
  if(!installationId)throw new Error('Service has no GitHub installation ID')
  const [owner,repo]=String(service.repository).split('/')
  if(!owner||!repo)throw new Error('Service repository is invalid')
  const maximumRuns=Number(config.maximumRuns||20)
  const lookbackDays=Number(config.lookbackDays||30)
  const since=new Date(Date.now()-lookbackDays*86400000).toISOString().slice(0,10)
  const octokit=await octokitFactory(installationId)
  const response=await octokit.request('GET /repos/{owner}/{repo}/actions/runs',{owner,repo,per_page:maximumRuns,created:`>=${since}`} as any)
  const source=(response.data as any).workflow_runs||[]
  const runs=source.map((run:any)=>({id:run.id,name:run.name||run.display_title||'Workflow',workflowId:run.workflow_id,branch:run.head_branch||null,event:run.event,status:run.status,conclusion:run.conclusion||null,actor:run.actor?.login||run.triggering_actor?.login||null,createdAt:run.created_at,updatedAt:run.updated_at,url:run.html_url}))
  const completed=runs.filter((run:any)=>run.conclusion);const successful=completed.filter((run:any)=>run.conclusion==='success')
  const workflows=[...new Map(source.map((run:any)=>[run.workflow_id,{id:run.workflow_id,name:run.name||'Workflow',path:run.path||''}])).values()] as GitHubActionsData['workflows']
  return{repository:service.repository,totalRuns:Number((response.data as any).total_count||runs.length),successRate:completed.length?Math.round(successful.length/completed.length*100):null,lastSuccessfulRunAt:successful[0]?.updatedAt||null,workflows,runs}
}

export function setGitHubActionsOctokitFactory(factory:typeof installationOctokit|null){octokitFactory=factory||installationOctokit}
