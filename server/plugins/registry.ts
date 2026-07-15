import { z } from 'zod'
import type { PortalPlugin } from './contracts.js'

const githubActionsConfig=z.object({lookbackDays:z.number().int().min(1).max(365).default(30),maximumRuns:z.number().int().min(1).max(100).default(20)}).strict()

export const pluginManifests:PortalPlugin[]=[{
  id:'github-actions',
  title:'GitHub Actions',
  description:'Workflow activity, delivery health, and scorecard facts for catalog services.',
  version:'1.0.0',
  surfaces:['service','scorecards','health'],
  configSchema:githubActionsConfig,
  defaults:{lookbackDays:30,maximumRuns:20},
  requiredEnvironment:['GITHUB_APP_ID','GITHUB_PRIVATE_KEY']
}]

export const pluginById=(id:string)=>pluginManifests.find(plugin=>plugin.id===id)

export function validatePluginSettings(id:string,value:unknown){
  const plugin=pluginById(id)
  if(!plugin)throw new Error(`Unknown plugin: ${id}`)
  return plugin.configSchema.parse(value)
}

export function publicPluginCatalog(){return pluginManifests.map(({configSchema:_,collectService:__,registerRoutes:___,...plugin})=>plugin)}
