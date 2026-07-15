import { Activity, Check, ExternalLink, GitBranch, Workflow, X } from 'lucide-react'
import type { ComponentType } from 'react'

export type PublicPlugin={id:string;title:string;description:string;version:string;surfaces:string[];enabled:boolean;config:Record<string,unknown>;health:{status:'disabled'|'ready'|'stale'|'degraded';message:string;observedAt?:string|null}}

type ServicePluginProps={data:any}

function GitHubActionsServicePanel({data}:ServicePluginProps){
  if(!data)return <section className="record-section plugin-service-section"><div className="record-section-head"><div><p className="eyebrow">GITHUB ACTIONS</p><h2>Workflow activity</h2></div></div><div className="record-empty"><Workflow size={17}/><div><strong>Waiting for plugin data</strong><p>Ask an administrator to refresh integrations after confirming GitHub App access.</p></div></div></section>
  return <section className="record-section plugin-service-section"><div className="record-section-head"><div><p className="eyebrow">GITHUB ACTIONS</p><h2>Workflow activity</h2></div><span className="plugin-rate">{data.successRate===null?'No completed runs':`${data.successRate}% successful`}</span></div><div className="workflow-summary"><div><strong>{data.totalRuns}</strong><span>Runs in lookback window</span></div><div><strong>{data.workflows?.length||0}</strong><span>Active workflows</span></div><div><strong>{data.lastSuccessfulRunAt?new Date(data.lastSuccessfulRunAt).toLocaleDateString():'—'}</strong><span>Last successful run</span></div></div>{data.runs?.length?<div className="workflow-runs">{data.runs.slice(0,6).map((run:any)=><a href={run.url} target="_blank" rel="noopener" key={run.id}><span className={`workflow-conclusion ${run.conclusion||run.status}`}>{run.conclusion==='success'?<Check size={13}/>:run.conclusion==='failure'?<X size={13}/>:<Activity size={13}/>}</span><span><strong>{run.name}</strong><small><GitBranch size={11}/>{run.branch||'detached'} · {run.event}</small></span><em>{run.conclusion||run.status}</em><time>{new Date(run.updatedAt).toLocaleString()}</time><ExternalLink size={13}/></a>)}</div>:<div className="record-empty"><Workflow size={17}/><div><strong>No workflow runs found</strong><p>GitHub returned no Actions runs inside the configured lookback window.</p></div></div>}</section>
}

const serviceSurfaces:Record<string,ComponentType<ServicePluginProps>>={'github-actions':GitHubActionsServicePanel}

export function PluginServiceSections({plugins,enabled}:{plugins:Record<string,unknown>;enabled:PublicPlugin[]}){return <>{enabled.filter(plugin=>plugin.enabled&&plugin.surfaces.includes('service')).map(plugin=>{const Component=serviceSurfaces[plugin.id];return Component?<Component data={plugins?.[plugin.id]} key={plugin.id}/>:null})}</>}
