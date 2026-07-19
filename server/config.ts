import YAML from 'yaml'
import { z } from 'zod'
import { calculateScore, calculateScorecards, evaluateRule, valueAt } from '../src/scorecards.js'
import { pluginById, pluginManifests, validatePluginSettings } from './plugins/registry.js'

const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Must be a lowercase slug')
const riskLevel=z.enum(['unclassified','low','moderate','high','critical'])
export const tierSchema=z.object({id:slug,title:z.string().min(1),description:z.string().default('')}).strict()
export const serviceTypeSchema=z.object({id:slug,title:z.string().min(1),description:z.string().default('')}).strict()
const ruleSourceSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('metadata')}).strict(),z.object({kind:z.literal('plugin'),plugin:slug}).strict()])
const remediationSchema=z.object({guidance:z.string().min(1),docsUrl:z.string().url().optional(),suggestedValue:z.any().optional()}).strict()
export const ruleSchema=z.object({id:z.string().min(1),title:z.string().min(1),description:z.string().default(''),path:z.string().min(1),operator:z.enum(['present','equals','oneOf','minLength','contains']),value:z.any().optional(),weight:z.number().positive().default(1),severity:z.enum(['required','recommended']).default('recommended'),enabled:z.boolean().default(true),tiers:z.array(slug).min(1).optional(),types:z.array(slug).min(1).optional(),maxEvidenceAgeHours:z.number().positive().max(8760).optional(),source:ruleSourceSchema.optional(),remediation:remediationSchema.optional()}).strict()
export const scorecardSchema=z.object({id:slug,title:z.string().min(1),description:z.string().default(''),enabled:z.boolean().default(true),primary:z.boolean().default(false),risks:z.array(riskLevel).min(1).optional(),rules:z.array(ruleSchema)}).strict()
const scorecardsSchema=z.preprocess(value=>{if(value&&typeof value==='object'&&Array.isArray((value as any).rules)&&!(value as any).cards)return{cards:[{id:'metadata-quality',title:'Metadata quality',description:'Catalog metadata completeness and standards.',enabled:true,primary:true,rules:(value as any).rules}]};return value},z.object({cards:z.array(scorecardSchema).min(1)}).strict())
const configuredPluginSchema=z.object({id:slug,enabled:z.boolean().default(false),config:z.record(z.string(),z.unknown()).default({})}).strict()
export const inputSchema=z.object({id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),label:z.string().min(1),type:z.enum(['text','multiline','number','boolean','select']),required:z.boolean().default(false),options:z.array(z.string()).optional(),placeholder:z.string().optional()}).strict().refine(x=>x.type!=='select'||Boolean(x.options?.length),{message:'Select inputs require options'})
export const actionSchema=z.object({id:z.string().regex(/^[a-z0-9-]+$/),title:z.string().min(1),description:z.string().default(''),repository:z.string().regex(/^[^/\s]+\/[^/\s]+$/),workflow:z.string().min(1),confirmation:z.string().default('Run this action?'),enabled:z.boolean().default(true),published:z.boolean().default(false),inputs:z.array(inputSchema).default([]),version:z.number().int().positive().default(1)}).strict()
export const toolDestinationSchema=z.object({label:z.string().min(1),url:z.string().url()}).strict()
export const toolSchema=z.object({id:z.string().regex(/^[a-z0-9-]+$/),name:z.string().min(1),description:z.string().default(''),iconUrl:z.string().url().or(z.literal('')).default(''),destinations:z.array(toolDestinationSchema).min(1)}).strict()
export const sectionSchemas={
  general:z.object({name:z.string().min(1),logoUrl:z.string().url().or(z.literal('')),accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),supportUrl:z.string().url().or(z.literal('')),documentationUrl:z.string().url().or(z.literal(''))}).strict(),
  catalog:z.object({serviceMetadataPath:z.string().min(1),teamMetadataPath:z.string().min(1),lifecycles:z.array(z.string().min(1)).min(1),tiers:z.array(tierSchema).default([]),types:z.array(serviceTypeSchema).default([]),installationId:z.number().int().positive().nullable()}).strict(),
  scorecards:scorecardsSchema,
  actions:z.object({definitions:z.array(actionSchema)}).strict(),
  tools:z.object({items:z.array(toolSchema)}).strict(),
  integrations:z.object({plugins:z.array(configuredPluginSchema).default([])}).strict(),
  access:z.object({admins:z.array(z.string().min(1)).default([])}).strict()
} as const
const baseConfigSchema=z.object({apiVersion:z.literal('perongen.dev/v1'),general:sectionSchemas.general,catalog:sectionSchemas.catalog,scorecards:sectionSchemas.scorecards,actions:sectionSchemas.actions,tools:sectionSchemas.tools,integrations:sectionSchemas.integrations,access:sectionSchemas.access}).strict()
const compatibleConfigSchema=z.preprocess(value=>value&&typeof value==='object'&&!('integrations' in value)?{...(value as Record<string,unknown>),integrations:{plugins:[]}}:value,baseConfigSchema)
export const configSchema=compatibleConfigSchema.superRefine((config,context)=>{
  const tierIds=config.catalog.tiers.map(tier=>tier.id)
  const duplicateTier=tierIds.find((id,index)=>tierIds.indexOf(id)!==index)
  if(duplicateTier)context.addIssue({code:'custom',path:['catalog','tiers'],message:`Duplicate tier id: ${duplicateTier}`})
  const typeIds=config.catalog.types.map(type=>type.id)
  const duplicateType=typeIds.find((id,index)=>typeIds.indexOf(id)!==index)
  if(duplicateType)context.addIssue({code:'custom',path:['catalog','types'],message:`Duplicate service type id: ${duplicateType}`})
  const cardIds=config.scorecards.cards.map(card=>card.id);const duplicateCard=cardIds.find((id,index)=>cardIds.indexOf(id)!==index)
  if(duplicateCard)context.addIssue({code:'custom',path:['scorecards','cards'],message:`Duplicate scorecard id: ${duplicateCard}`})
  if(config.scorecards.cards.filter(card=>card.primary).length!==1)context.addIssue({code:'custom',path:['scorecards','cards'],message:'Exactly one scorecard must be primary'})
  if(config.scorecards.cards.some(card=>card.primary&&!card.enabled))context.addIssue({code:'custom',path:['scorecards','cards'],message:'The primary scorecard must be enabled'})
  if(config.scorecards.cards.some(card=>card.primary&&card.risks?.length))context.addIssue({code:'custom',path:['scorecards','cards'],message:'The primary scorecard must apply to every risk level'})
  config.scorecards.cards.forEach((card,cardIndex)=>{
    const ruleIds=card.rules.map(rule=>rule.id);const duplicateRule=ruleIds.find((id,index)=>ruleIds.indexOf(id)!==index)
    if(duplicateRule)context.addIssue({code:'custom',path:['scorecards','cards',cardIndex,'rules'],message:`Duplicate rule id: ${duplicateRule}`})
    card.rules.forEach((rule,index)=>{rule.tiers?.forEach(tier=>{if(!tierIds.includes(tier))context.addIssue({code:'custom',path:['scorecards','cards',cardIndex,'rules',index,'tiers'],message:`Unknown tier: ${tier}`})});rule.types?.forEach(type=>{if(!typeIds.includes(type))context.addIssue({code:'custom',path:['scorecards','cards',cardIndex,'rules',index,'types'],message:`Unknown service type: ${type}`})});if(rule.source?.kind==='plugin'&&!pluginById(rule.source.plugin))context.addIssue({code:'custom',path:['scorecards','cards',cardIndex,'rules',index,'source'],message:`Unknown plugin: ${rule.source.plugin}`});if(rule.maxEvidenceAgeHours!==undefined&&rule.source?.kind!=='plugin')context.addIssue({code:'custom',path:['scorecards','cards',cardIndex,'rules',index,'maxEvidenceAgeHours'],message:'Evidence age applies only to plugin-backed rules'})})
  })
  const pluginIds=config.integrations.plugins.map(plugin=>plugin.id);const duplicatePlugin=pluginIds.find((id,index)=>pluginIds.indexOf(id)!==index)
  if(duplicatePlugin)context.addIssue({code:'custom',path:['integrations','plugins'],message:`Duplicate plugin id: ${duplicatePlugin}`})
  config.integrations.plugins.forEach((plugin,index)=>{try{validatePluginSettings(plugin.id,plugin.config)}catch(error){context.addIssue({code:'custom',path:['integrations','plugins',index,'config'],message:(error as Error).message})}})
})
export type PortalConfig=z.infer<typeof configSchema>
export type ConfigSection=keyof typeof sectionSchemas
export const configSections=Object.keys(sectionSchemas) as ConfigSection[]

export const defaults:PortalConfig={apiVersion:'perongen.dev/v1',general:{name:'Perongen',logoUrl:'',accentColor:'#b07a32',supportUrl:'',documentationUrl:''},catalog:{serviceMetadataPath:'.portal/service.yaml',teamMetadataPath:'.portal/team.yaml',lifecycles:['production','experimental','deprecated'],tiers:[
  {id:'critical',title:'Critical',description:'Customer-facing or business-critical services'},
  {id:'high',title:'High',description:'Important services with significant operational impact'},
  {id:'standard',title:'Standard',description:'Normal production services'},
  {id:'low',title:'Low',description:'Low-impact or internal services'}
],types:[
  {id:'frontend',title:'Frontend',description:'User-facing web or mobile interface'},
  {id:'backend',title:'Backend',description:'Server-side service or API'},
  {id:'fullstack',title:'Fullstack',description:'Combined user interface and server-side application'},
  {id:'pipeline',title:'Pipeline',description:'Data, delivery, or automation pipeline'},
  {id:'configuration',title:'Configuration',description:'Configuration or policy repository'}
],installationId:null},scorecards:{cards:[{id:'metadata-quality',title:'Metadata quality',description:'Catalog metadata completeness and standards.',enabled:true,primary:true,rules:[
  {id:'owner',title:'Service has an owner',description:'Ownership is declared',path:'spec.owner',operator:'present',weight:1,severity:'required',enabled:true,remediation:{guidance:'Assign the team accountable for operating this service in spec.owner.'}},
  {id:'lifecycle',title:'Lifecycle is declared',description:'Lifecycle is accepted',path:'spec.lifecycle',operator:'oneOf',value:['production','experimental','deprecated'],weight:1,severity:'required',enabled:true},
  {id:'description',title:'Description is complete',description:'At least 20 characters',path:'metadata.description',operator:'minLength',value:20,weight:1,severity:'recommended',enabled:true},
  {id:'system',title:'System is assigned',description:'System is declared',path:'spec.system',operator:'present',weight:1,severity:'recommended',enabled:true,remediation:{guidance:'Add the parent system identifier to spec.system so impact and ownership views stay connected.'}},
  {id:'docs',title:'Documentation link exists',description:'Links contain documentation',path:'spec.links',operator:'contains',value:'documentation',weight:1,severity:'recommended',enabled:true}
]}]},actions:{definitions:[]},tools:{items:[{id:'github',name:'GitHub',description:'Repositories, pull requests, and engineering collaboration.',iconUrl:'',destinations:[{label:'Open GitHub',url:'https://github.com'}]}]},integrations:{plugins:[]},access:{admins:[]}}

export function missingPluginScorecards(config:Pick<PortalConfig,'scorecards'|'integrations'>){
  const enabled=new Set(config.integrations.plugins.filter(plugin=>plugin.enabled).map(plugin=>plugin.id))
  const existing=new Set(config.scorecards.cards.map(card=>card.id))
  const additions=[]
  for(const manifest of pluginManifests){
    if(!enabled.has(manifest.id))continue
    for(const card of manifest.defaultScorecards||[]){
      if(!existing.has(card.id)){additions.push(structuredClone(card));existing.add(card.id)}
    }
  }
  return additions
}
let effective:PortalConfig=defaults
export const getConfig=()=>effective
export function activateConfig(value:unknown){effective=configSchema.parse(value);return effective}
export function validateSection(section:string,value:unknown){const schema=sectionSchemas[section as ConfigSection];if(!schema)throw new Error(`Unknown configuration section: ${section}`);return schema.parse(value)}
export function validateConfig(value:unknown){return configSchema.parse(value)}
export function sectionDocument(section:ConfigSection,value:unknown){return{apiVersion:'perongen.dev/v1',[section]:validateSection(section,value)}}
export function serializeSection(section:ConfigSection,value:unknown){return YAML.stringify(sectionDocument(section,value),{lineWidth:0})}
export function parseSectionDocument(section:ConfigSection,raw:string){
  let value:unknown
  try{value=YAML.parse(raw)}catch(e){throw new Error(`${section}.yaml: ${(e as Error).message}`)}
  const documentSchema=z.object({apiVersion:z.literal('perongen.dev/v1'),[section]:sectionSchemas[section]}).strict()
  const parsed=documentSchema.safeParse(value)
  if(!parsed.success)throw new Error(`${section}.yaml: ${parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  return (parsed.data as Record<string,unknown>)[section]
}
export function parseConfigDocuments(documents:Record<ConfigSection,string>){
  const value:any={apiVersion:'perongen.dev/v1'}
  for(const section of configSections)value[section]=parseSectionDocument(section,documents[section])
  return configSchema.parse(value)
}
export const getBreakGlassAdmins=()=>new Set((process.env.GITHUB_ADMIN_LOGINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))
export const isAdminLogin=(login:string,config:PortalConfig=effective)=>getBreakGlassAdmins().has(login.toLowerCase())||config.access.admins.some(admin=>admin.toLowerCase()===login.toLowerCase())
export function assertAdministratorConfigured(config:PortalConfig){if(!getBreakGlassAdmins().size&&!config.access.admins.length)throw new Error('access.yaml must configure at least one administrator when GITHUB_ADMIN_LOGINS is empty')}
export { valueAt, evaluateRule }
export function scoreWithConfig(metadata:any,plugins:Record<string,unknown>={},states:Record<string,any>={}){const primary=effective.scorecards.cards.find(card=>card.primary)!;return calculateScore(metadata,primary.rules,plugins,states)}
export function scoresWithConfig(metadata:any,plugins:Record<string,unknown>={},states:Record<string,any>={}){return calculateScorecards(metadata,effective.scorecards.cards,plugins,states)}
