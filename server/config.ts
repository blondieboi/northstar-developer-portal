import YAML from 'yaml'
import { z } from 'zod'
import { calculateScore, evaluateRule, valueAt } from '../src/scorecards.js'

const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Must be a lowercase slug')
export const tierSchema=z.object({id:slug,title:z.string().min(1),description:z.string().default('')}).strict()
export const ruleSchema=z.object({id:z.string().min(1),title:z.string().min(1),description:z.string().default(''),path:z.string().min(1),operator:z.enum(['present','equals','oneOf','minLength','contains']),value:z.any().optional(),weight:z.number().positive().default(1),severity:z.enum(['required','recommended']).default('recommended'),enabled:z.boolean().default(true),tiers:z.array(slug).min(1).optional()}).strict()
export const inputSchema=z.object({id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),label:z.string().min(1),type:z.enum(['text','multiline','number','boolean','select']),required:z.boolean().default(false),options:z.array(z.string()).optional(),placeholder:z.string().optional()}).strict().refine(x=>x.type!=='select'||Boolean(x.options?.length),{message:'Select inputs require options'})
export const actionSchema=z.object({id:z.string().regex(/^[a-z0-9-]+$/),title:z.string().min(1),description:z.string().default(''),repository:z.string().regex(/^[^/\s]+\/[^/\s]+$/),workflow:z.string().min(1),confirmation:z.string().default('Run this action?'),enabled:z.boolean().default(true),published:z.boolean().default(false),inputs:z.array(inputSchema).default([]),version:z.number().int().positive().default(1)}).strict()
export const toolDestinationSchema=z.object({label:z.string().min(1),url:z.string().url()}).strict()
export const toolSchema=z.object({id:z.string().regex(/^[a-z0-9-]+$/),name:z.string().min(1),description:z.string().default(''),iconUrl:z.string().url().or(z.literal('')).default(''),destinations:z.array(toolDestinationSchema).min(1)}).strict()
export const sectionSchemas={
  general:z.object({name:z.string().min(1),logoUrl:z.string().url().or(z.literal('')),accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),supportUrl:z.string().url().or(z.literal('')),documentationUrl:z.string().url().or(z.literal(''))}).strict(),
  catalog:z.object({serviceMetadataPath:z.string().min(1),teamMetadataPath:z.string().min(1),lifecycles:z.array(z.string().min(1)).min(1),tiers:z.array(tierSchema).default([]),installationId:z.number().int().positive().nullable()}).strict(),
  scorecards:z.object({rules:z.array(ruleSchema)}).strict(),
  actions:z.object({definitions:z.array(actionSchema)}).strict(),
  tools:z.object({items:z.array(toolSchema)}).strict(),
  access:z.object({admins:z.array(z.string().min(1)).default([])}).strict()
} as const
const baseConfigSchema=z.object({apiVersion:z.literal('northstar.dev/v1'),general:sectionSchemas.general,catalog:sectionSchemas.catalog,scorecards:sectionSchemas.scorecards,actions:sectionSchemas.actions,tools:sectionSchemas.tools,access:sectionSchemas.access}).strict()
export const configSchema=baseConfigSchema.superRefine((config,context)=>{
  const tierIds=config.catalog.tiers.map(tier=>tier.id)
  const duplicateTier=tierIds.find((id,index)=>tierIds.indexOf(id)!==index)
  if(duplicateTier)context.addIssue({code:'custom',path:['catalog','tiers'],message:`Duplicate tier id: ${duplicateTier}`})
  const ruleIds=config.scorecards.rules.map(rule=>rule.id)
  const duplicateRule=ruleIds.find((id,index)=>ruleIds.indexOf(id)!==index)
  if(duplicateRule)context.addIssue({code:'custom',path:['scorecards','rules'],message:`Duplicate rule id: ${duplicateRule}`})
  config.scorecards.rules.forEach((rule,index)=>rule.tiers?.forEach(tier=>{
    if(!tierIds.includes(tier))context.addIssue({code:'custom',path:['scorecards','rules',index,'tiers'],message:`Unknown tier: ${tier}`})
  }))
})
export type PortalConfig=z.infer<typeof configSchema>
export type ConfigSection=keyof typeof sectionSchemas
export const configSections=Object.keys(sectionSchemas) as ConfigSection[]

export const defaults:PortalConfig={apiVersion:'northstar.dev/v1',general:{name:'Perongen',logoUrl:'',accentColor:'#b07a32',supportUrl:'',documentationUrl:''},catalog:{serviceMetadataPath:'.portal/service.yaml',teamMetadataPath:'.portal/team.yaml',lifecycles:['production','experimental','deprecated'],tiers:[
  {id:'critical',title:'Critical',description:'Customer-facing or business-critical services'},
  {id:'high',title:'High',description:'Important services with significant operational impact'},
  {id:'standard',title:'Standard',description:'Normal production services'},
  {id:'low',title:'Low',description:'Low-impact or internal services'}
],installationId:null},scorecards:{rules:[
  {id:'owner',title:'Service has an owner',description:'Ownership is declared',path:'spec.owner',operator:'present',weight:1,severity:'required',enabled:true},
  {id:'lifecycle',title:'Lifecycle is declared',description:'Lifecycle is accepted',path:'spec.lifecycle',operator:'oneOf',value:['production','experimental','deprecated'],weight:1,severity:'required',enabled:true},
  {id:'description',title:'Description is complete',description:'At least 20 characters',path:'metadata.description',operator:'minLength',value:20,weight:1,severity:'recommended',enabled:true},
  {id:'system',title:'System is assigned',description:'System is declared',path:'spec.system',operator:'present',weight:1,severity:'recommended',enabled:true},
  {id:'docs',title:'Documentation link exists',description:'Links contain documentation',path:'spec.links',operator:'contains',value:'documentation',weight:1,severity:'recommended',enabled:true}
]},actions:{definitions:[]},tools:{items:[{id:'github',name:'GitHub',description:'Repositories, pull requests, and engineering collaboration.',iconUrl:'',destinations:[{label:'Open GitHub',url:'https://github.com'}]}]},access:{admins:[]}}

let effective:PortalConfig=defaults
export const getConfig=()=>effective
export function activateConfig(value:unknown){effective=configSchema.parse(value);return effective}
export function validateSection(section:string,value:unknown){const schema=sectionSchemas[section as ConfigSection];if(!schema)throw new Error(`Unknown configuration section: ${section}`);return schema.parse(value)}
export function validateConfig(value:unknown){return configSchema.parse(value)}
export function sectionDocument(section:ConfigSection,value:unknown){return{apiVersion:'northstar.dev/v1',[section]:validateSection(section,value)}}
export function serializeSection(section:ConfigSection,value:unknown){return YAML.stringify(sectionDocument(section,value),{lineWidth:0})}
export function parseSectionDocument(section:ConfigSection,raw:string){
  let value:unknown
  try{value=YAML.parse(raw)}catch(e){throw new Error(`${section}.yaml: ${(e as Error).message}`)}
  const documentSchema=z.object({apiVersion:z.literal('northstar.dev/v1'),[section]:sectionSchemas[section]}).strict()
  const parsed=documentSchema.safeParse(value)
  if(!parsed.success)throw new Error(`${section}.yaml: ${parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  return (parsed.data as Record<string,unknown>)[section]
}
export function parseConfigDocuments(documents:Record<ConfigSection,string>){
  const value:any={apiVersion:'northstar.dev/v1'}
  for(const section of configSections)value[section]=parseSectionDocument(section,documents[section])
  return configSchema.parse(value)
}
export const getBreakGlassAdmins=()=>new Set((process.env.GITHUB_ADMIN_LOGINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))
export const isAdminLogin=(login:string,config:PortalConfig=effective)=>getBreakGlassAdmins().has(login.toLowerCase())||config.access.admins.some(admin=>admin.toLowerCase()===login.toLowerCase())
export function assertAdministratorConfigured(config:PortalConfig){if(!getBreakGlassAdmins().size&&!config.access.admins.length)throw new Error('access.yaml must configure at least one administrator when GITHUB_ADMIN_LOGINS is empty')}
export { valueAt, evaluateRule }
export function scoreWithConfig(metadata:any){return calculateScore(metadata,effective.scorecards.rules)}
